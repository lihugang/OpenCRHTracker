import { AsyncLocalStorage } from 'node:async_hooks';
import getLogger from '~/server/libs/log4js';
import {
    finishTrainProvenanceTaskRun,
    isTrainProvenanceEnabled,
    recordCouplingScanCandidate,
    recordTrainProvenanceEvent,
    startTrainProvenanceTaskRun,
    type RecordCouplingScanCandidateInput,
    type RecordTrainProvenanceEventInput,
    type TrainProvenanceTaskRunStatus
} from '~/server/services/trainProvenanceStore';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import uniqueNormalizedCodes from '~/server/utils/12306/uniqueNormalizedCodes';
import getCurrentDateString, {
    formatShanghaiDateString
} from '~/server/utils/date/getCurrentDateString';
import type { TaskExecutionContextValue } from '~/server/services/taskExecutionContext';

interface TrainProvenanceContextValue {
    taskRunId: number;
    nextSequenceNo: number;
    finalStatus: Exclude<TrainProvenanceTaskRunStatus, 'running'>;
    errorMessage: string;
}

type TrainProvenanceEventInput = Omit<
    RecordTrainProvenanceEventInput,
    'taskRunId' | 'sequenceNo'
>;

type CouplingScanCandidateInput = Omit<
    RecordCouplingScanCandidateInput,
    'taskRunId'
>;

const logger = getLogger('train-provenance-recorder');
const trainProvenanceContext =
    new AsyncLocalStorage<TrainProvenanceContextValue>();

function extractObject(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null;
    }

    return value as Record<string, unknown>;
}

function extractPrimaryTrainCode(taskArgs: unknown): string {
    const body = extractObject(taskArgs);
    if (!body) {
        return '';
    }

    if (typeof body.trainCode === 'string') {
        return normalizeCode(body.trainCode);
    }

    if (Array.isArray(body.codes)) {
        const firstCode = body.codes.find(
            (item): item is string => typeof item === 'string'
        );
        return firstCode ? normalizeCode(firstCode) : '';
    }

    return '';
}

function extractPrimaryEmuCode(taskArgs: unknown): string {
    const body = extractObject(taskArgs);
    if (!body || typeof body.emuCode !== 'string') {
        return '';
    }

    return normalizeCode(body.emuCode);
}

function extractPrimaryStartAt(taskArgs: unknown): number | null {
    const body = extractObject(taskArgs);
    if (!body) {
        return null;
    }

    return typeof body.startAt === 'number' &&
        Number.isInteger(body.startAt) &&
        body.startAt > 0
        ? body.startAt
        : null;
}

function extractServiceDate(
    taskArgs: unknown,
    executionContext: TaskExecutionContextValue
): string {
    const body = extractObject(taskArgs);
    if (body && typeof body.date === 'string' && /^\d{8}$/.test(body.date)) {
        return body.date;
    }

    const primaryStartAt = extractPrimaryStartAt(taskArgs);
    if (primaryStartAt !== null) {
        return formatShanghaiDateString(primaryStartAt * 1000);
    }

    if (
        Number.isInteger(executionContext.executionTime) &&
        executionContext.executionTime > 0
    ) {
        return formatShanghaiDateString(executionContext.executionTime * 1000);
    }

    return getCurrentDateString();
}

function getCurrentContext() {
    return trainProvenanceContext.getStore() ?? null;
}

export function getCurrentTrainProvenanceTaskRunId() {
    return getCurrentContext()?.taskRunId ?? null;
}

export async function runWithTrainProvenanceTaskContext<T>(
    executionContext: TaskExecutionContextValue,
    taskArgs: unknown,
    callback: () => Promise<T> | T
): Promise<T> {
    if (!isTrainProvenanceEnabled()) {
        return callback();
    }

    let taskRunId = 0;
    try {
        const taskRun = startTrainProvenanceTaskRun({
            schedulerTaskId: executionContext.taskId,
            executor: executionContext.executor,
            executionTime: executionContext.executionTime,
            startedAt: Math.floor(Date.now() / 1000),
            taskArgs,
            serviceDate: extractServiceDate(taskArgs, executionContext),
            primaryTrainCode: extractPrimaryTrainCode(taskArgs),
            primaryStartAt: extractPrimaryStartAt(taskArgs),
            primaryEmuCode: extractPrimaryEmuCode(taskArgs)
        });
        taskRunId = taskRun.id;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(
            `task_run_start_failed taskId=${executionContext.taskId} executor=${executionContext.executor} error=${message}`
        );
        return callback();
    }

    const contextValue: TrainProvenanceContextValue = {
        taskRunId,
        nextSequenceNo: 1,
        finalStatus: 'success',
        errorMessage: ''
    };

    return trainProvenanceContext.run(contextValue, async () => {
        try {
            const result = await callback();
            try {
                finishTrainProvenanceTaskRun(
                    taskRunId,
                    contextValue.finalStatus,
                    contextValue.errorMessage
                );
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);
                logger.error(
                    `task_run_finish_failed taskRunId=${taskRunId} executor=${executionContext.executor} error=${message}`
                );
            }
            return result;
        } catch (error) {
            const message =
                error instanceof Error
                    ? `${error.name}: ${error.message}`
                    : String(error);
            contextValue.finalStatus = 'failed';
            contextValue.errorMessage = message;
            try {
                finishTrainProvenanceTaskRun(taskRunId, 'failed', message);
            } catch (finishError) {
                const finishMessage =
                    finishError instanceof Error
                        ? finishError.message
                        : String(finishError);
                logger.error(
                    `task_run_fail_finalize_failed taskRunId=${taskRunId} executor=${executionContext.executor} error=${finishMessage}`
                );
            }
            throw error;
        }
    });
}

export function markCurrentTrainProvenanceTaskSkipped(errorMessage = '') {
    const context = getCurrentContext();
    if (!context) {
        return;
    }

    context.finalStatus = 'skipped';
    context.errorMessage = errorMessage.trim();
}

export function markCurrentTrainProvenanceTaskFailed(errorMessage = '') {
    const context = getCurrentContext();
    if (!context) {
        return;
    }

    context.finalStatus = 'failed';
    context.errorMessage = errorMessage.trim();
}

export function recordCurrentTrainProvenanceEvent(
    input: TrainProvenanceEventInput
) {
    const context = getCurrentContext();
    if (!context) {
        return;
    }

    try {
        recordTrainProvenanceEvent({
            ...input,
            taskRunId: context.taskRunId,
            sequenceNo: context.nextSequenceNo
        });
        context.nextSequenceNo += 1;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(
            `record_event_failed taskRunId=${context.taskRunId} eventType=${input.eventType} error=${message}`
        );
    }
}

export function recordCurrentTrainProvenanceEventsForTrainCodes(
    trainCodes: string[],
    input: Omit<TrainProvenanceEventInput, 'trainCode'>
) {
    for (const trainCode of uniqueNormalizedCodes(trainCodes)) {
        recordCurrentTrainProvenanceEvent({
            ...input,
            trainCode
        });
    }
}

export function recordCurrentCouplingScanCandidate(
    input: CouplingScanCandidateInput
) {
    const context = getCurrentContext();
    if (!context) {
        return;
    }

    try {
        recordCouplingScanCandidate({
            ...input,
            taskRunId: context.taskRunId
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(
            `record_coupling_candidate_failed taskRunId=${context.taskRunId} candidateEmuCode=${normalizeCode(input.candidateEmuCode)} error=${message}`
        );
    }
}
