import { AsyncLocalStorage } from 'node:async_hooks';
import getLogger from '~/server/libs/log4js';
import {
    finishTrainProvenanceTaskRun,
    isTrainProvenanceEnabled,
    recordCouplingScanCandidate,
    recordStationPlatformRefreshResult,
    recordTrainProvenanceEvent,
    startTrainProvenanceTaskRun,
    type RecordCouplingScanCandidateInput,
    type RecordTrainProvenanceEventInput,
    type StationPlatformRefreshStatus,
    type StationPlatformRefreshTrigger,
    type TrainProvenanceTaskRunStatus
} from '~/server/services/trainProvenanceStore';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import uniqueNormalizedCodes from '~/server/utils/12306/uniqueNormalizedCodes';
import getCurrentDateString, {
    formatShanghaiDateString
} from '~/server/utils/date/getCurrentDateString';
import type { TaskExecutionContextValue } from '~/server/services/taskExecutionContext';
import type {
    StationPlatformInfoRefreshEntry,
    StationPlatformInfoRefreshResult,
    StationPlatformInfoRouteReference
} from '~/server/services/stationPlatformInfoService';

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

interface StationPlatformRefreshGroup {
    trainCodes: string[];
    startAt: number | null;
    entries: StationPlatformInfoRefreshEntry[];
}

function getStationPlatformRefreshGroupKey(
    reference: StationPlatformInfoRouteReference
) {
    return `${reference.startAt ?? 'null'}:${[...reference.trainCodes]
        .sort()
        .join('/')}`;
}

function getStationPlatformRefreshStatus(
    entries: StationPlatformInfoRefreshEntry[],
    persistenceErrorMessage: string
): StationPlatformRefreshStatus {
    if (persistenceErrorMessage.length > 0) {
        return 'failed';
    }
    if (entries.length === 0) {
        return 'skipped';
    }

    const successfulCount = entries.filter(
        (entry) => entry.status === 'updated' || entry.status === 'cache_hit'
    ).length;
    const fallbackCount = entries.filter(
        (entry) => entry.status === 'cache_fallback'
    ).length;
    const degradedCount = entries.length - successfulCount;
    if (successfulCount === entries.length) {
        return 'success';
    }
    if (successfulCount > 0 || fallbackCount > 0) {
        return 'partial';
    }
    return degradedCount > 0 ? 'failed' : 'skipped';
}

function getStationPlatformRefreshEventType(
    status: StationPlatformRefreshStatus
) {
    switch (status) {
        case 'success':
            return 'station_platform_refresh_succeeded';
        case 'partial':
            return 'station_platform_refresh_partial';
        case 'failed':
            return 'station_platform_refresh_failed';
        default:
            return 'station_platform_refresh_skipped';
    }
}

export function recordCurrentStationPlatformRefreshResults(input: {
    serviceDate: string;
    trigger: StationPlatformRefreshTrigger;
    result: StationPlatformInfoRefreshResult;
    fallbackRouteReferences?: StationPlatformInfoRouteReference[];
    errorMessage?: string;
}) {
    const context = getCurrentContext();
    if (!context) {
        return;
    }

    const groups = new Map<string, StationPlatformRefreshGroup>();
    const ensureGroup = (reference: StationPlatformInfoRouteReference) => {
        const trainCodes = uniqueNormalizedCodes(reference.trainCodes);
        if (trainCodes.length === 0) {
            return null;
        }
        const normalizedReference = {
            trainCodes,
            startAt: reference.startAt
        };
        const key = getStationPlatformRefreshGroupKey(normalizedReference);
        const existing = groups.get(key);
        if (existing) {
            return existing;
        }
        const group: StationPlatformRefreshGroup = {
            ...normalizedReference,
            entries: []
        };
        groups.set(key, group);
        return group;
    };

    for (const entry of input.result.entries) {
        for (const reference of entry.routeReferences) {
            const group = ensureGroup(reference);
            if (group && !group.entries.includes(entry)) {
                group.entries.push(entry);
            }
        }
    }
    for (const reference of input.fallbackRouteReferences ?? []) {
        ensureGroup(reference);
    }

    const persistenceErrorMessage = (
        input.errorMessage || input.result.persistenceErrorMessage
    )
        .trim()
        .slice(0, 500);
    for (const group of groups.values()) {
        const status = getStationPlatformRefreshStatus(
            group.entries,
            persistenceErrorMessage
        );
        try {
            const resultId = recordStationPlatformRefreshResult({
                taskRunId: context.taskRunId,
                serviceDate: input.serviceDate,
                startAt: group.startAt,
                primaryTrainCode: group.trainCodes[0] ?? '',
                trainCodes: group.trainCodes,
                trigger: input.trigger,
                status,
                entries: group.entries.map((entry) => ({
                    stationOrder: entry.stationOrder,
                    lookupType: entry.lookupType,
                    stationName: entry.stationName,
                    stationTelecode: entry.stationTelecode,
                    stationNo: entry.stationNo,
                    trainDate: entry.trainDate,
                    stationTrainCodes: entry.stationTrainCodes,
                    attemptedTrainCodes: entry.attemptedTrainCodes,
                    status: entry.status,
                    platformNo: entry.platformNo,
                    wicket: entry.wicket,
                    fetchedAt: entry.fetchedAt,
                    errorMessage: entry.errorMessage
                })),
                errorMessage: persistenceErrorMessage
            });
            const updatedCount = group.entries.filter(
                (entry) => entry.status === 'updated'
            ).length;
            const cacheHitCount = group.entries.filter(
                (entry) => entry.status === 'cache_hit'
            ).length;
            const cacheFallbackCount = group.entries.filter(
                (entry) => entry.status === 'cache_fallback'
            ).length;
            const noDataCount = group.entries.filter(
                (entry) => entry.status === 'no_data'
            ).length;
            const failedCount = group.entries.filter(
                (entry) =>
                    entry.status === 'request_failed' ||
                    entry.status === 'persist_failed'
            ).length;
            recordCurrentTrainProvenanceEventsForTrainCodes(group.trainCodes, {
                serviceDate: input.serviceDate,
                startAt: group.startAt,
                eventType: getStationPlatformRefreshEventType(status),
                result: status,
                payload: {
                    resultId,
                    trigger: input.trigger,
                    candidateCount: group.entries.length,
                    updatedCount,
                    cacheHitCount,
                    cacheFallbackCount,
                    noDataCount,
                    failedCount
                }
            });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            logger.warn(
                `record_station_platform_refresh_failed taskRunId=${context.taskRunId} trainCodes=${group.trainCodes.join('/')} error=${message}`
            );
        }
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
