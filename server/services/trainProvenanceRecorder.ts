import { AsyncLocalStorage } from 'node:async_hooks';
import getLogger from '~/server/libs/log4js';
import {
    cleanupExpiredTrainProvenance,
    finishTrainProvenanceTaskRun,
    isTrainProvenanceEnabled,
    record12306RequestHourlyStat,
    recordCouplingScanCandidate,
    recordStationBoardDispatchResult,
    recordStationBoardFetchResult,
    recordStationPlatformRefreshResult,
    recordTrainProvenanceEvent,
    startTrainProvenanceTaskRun,
    type Record12306RequestHourlyStatInput,
    type RecordCouplingScanCandidateInput,
    type RecordStationBoardDispatchResultInput,
    type RecordStationBoardFetchResultInput,
    type RecordTrainProvenanceEventInput,
    type StationPlatformRefreshStatus,
    type StationPlatformRefreshTrigger,
    type TrainProvenanceTaskRunStatus
} from '~/server/services/trainProvenanceStore';
import {
    trainCodeKey,
    type TrainCodeParts
} from '~/server/utils/12306/trainCode';
import { asEmuId, type EmuId } from '~/server/libs/database/emu';
import {
    asServiceDay,
    unixSecondsToServiceDay,
    type ServiceDay
} from '~/server/utils/date/serviceDay';
import type { TaskExecutionContextValue } from '~/server/services/taskExecutionContext';
import type {
    StationPlatformInfoRefreshEntry,
    StationPlatformInfoRefreshResult,
    StationPlatformInfoRouteReference
} from '~/server/services/stationPlatformInfoService';

interface TrainProvenanceContextValue {
    taskRunId: number;
    executor: string;
    nextSequenceNo: number;
    finalStatus: Exclude<TrainProvenanceTaskRunStatus, 'running'>;
    errorMessage: string;
    writesDisabled: boolean;
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
const GLOBAL_WRITE_FAILURE_COOLDOWN_MS = 60 * 1000;
let globalWritesDisabledUntil = 0;

function formatErrorMessage(error: unknown) {
    return error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
}

function safeWrite<T>(operation: string, callback: () => T, fallback: T): T {
    const context = getCurrentContext();
    if (context?.writesDisabled) {
        return fallback;
    }

    const now = Date.now();
    if (!context && now < globalWritesDisabledUntil) {
        return fallback;
    }

    try {
        return callback();
    } catch (error) {
        const message = formatErrorMessage(error);
        if (context) {
            context.writesDisabled = true;
            logger.error(
                `provenance_write_failed operation=${operation} taskRunId=${context.taskRunId} executor=${context.executor} error=${message}`
            );
        } else {
            globalWritesDisabledUntil = now + GLOBAL_WRITE_FAILURE_COOLDOWN_MS;
            logger.error(
                `provenance_write_failed operation=${operation} scope=global cooldownMs=${GLOBAL_WRITE_FAILURE_COOLDOWN_MS} error=${message}`
            );
        }
        return fallback;
    }
}

function finishTaskRunBestEffort(
    context: TrainProvenanceContextValue,
    status: Exclude<TrainProvenanceTaskRunStatus, 'running'>,
    errorMessage: string
) {
    try {
        finishTrainProvenanceTaskRun(context.taskRunId, status, errorMessage);
    } catch (error) {
        if (!context.writesDisabled) {
            logger.error(
                `task_run_finish_failed taskRunId=${context.taskRunId} executor=${context.executor} error=${formatErrorMessage(error)}`
            );
        }
        context.writesDisabled = true;
    }
}

function extractObject(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null;
    }

    return value as Record<string, unknown>;
}

function isTrainCodeParts(value: unknown): value is TrainCodeParts {
    return (
        !!value &&
        typeof value === 'object' &&
        typeof (value as { prefix?: unknown }).prefix === 'string' &&
        typeof (value as { number?: unknown }).number === 'number' &&
        Number.isInteger((value as { number: number }).number)
    );
}

function extractPrimaryTrainCode(taskArgs: unknown): TrainCodeParts | null {
    const body = extractObject(taskArgs);
    if (!body) {
        return null;
    }

    if (isTrainCodeParts(body.trainCode)) {
        return body.trainCode;
    }

    if (Array.isArray(body.codes)) {
        const firstCode = body.codes.find((item): item is TrainCodeParts =>
            isTrainCodeParts(item)
        );
        return firstCode ?? null;
    }

    return null;
}

function extractPrimaryEmuId(taskArgs: unknown): EmuId | null {
    const body = extractObject(taskArgs);
    if (!body) {
        return null;
    }

    const emuId = body.emuId ?? body.primaryEmuId;
    if (typeof emuId === 'number' && Number.isInteger(emuId) && emuId > 0) {
        return asEmuId(emuId);
    }

    return null;
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
): ServiceDay {
    const body = extractObject(taskArgs);
    const rawServiceDate = body?.serviceDate ?? body?.date;
    if (
        typeof rawServiceDate === 'number' &&
        Number.isInteger(rawServiceDate)
    ) {
        return asServiceDay(rawServiceDate);
    }

    const primaryStartAt = extractPrimaryStartAt(taskArgs);
    if (primaryStartAt !== null) {
        return unixSecondsToServiceDay(primaryStartAt);
    }

    if (
        Number.isInteger(executionContext.executionTime) &&
        executionContext.executionTime > 0
    ) {
        return unixSecondsToServiceDay(executionContext.executionTime);
    }

    throw new Error('train_provenance_service_date_missing');
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
    let enabled = false;
    try {
        enabled = isTrainProvenanceEnabled();
    } catch (error) {
        logger.error(
            `provenance_enablement_check_failed executor=${executionContext.executor} error=${formatErrorMessage(error)}`
        );
        return callback();
    }
    if (!enabled) {
        return callback();
    }

    const taskRun = safeWrite(
        'start_task_run',
        () =>
            startTrainProvenanceTaskRun({
                schedulerTaskId: executionContext.taskId,
                executor: executionContext.executor,
                executionTime: executionContext.executionTime,
                startedAt: Math.floor(Date.now() / 1000),
                taskArgs,
                serviceDate: extractServiceDate(taskArgs, executionContext),
                primaryTrainCode: extractPrimaryTrainCode(taskArgs),
                primaryStartAt: extractPrimaryStartAt(taskArgs),
                primaryEmuId: extractPrimaryEmuId(taskArgs)
            }),
        null
    );
    if (taskRun === null) {
        return callback();
    }
    const taskRunId = taskRun.id;

    const contextValue: TrainProvenanceContextValue = {
        taskRunId,
        executor: executionContext.executor,
        nextSequenceNo: 1,
        finalStatus: 'success',
        errorMessage: '',
        writesDisabled: false
    };

    return trainProvenanceContext.run(contextValue, async () => {
        try {
            const result = await callback();
            finishTaskRunBestEffort(
                contextValue,
                contextValue.finalStatus,
                contextValue.errorMessage
            );
            return result;
        } catch (error) {
            const message = formatErrorMessage(error);
            contextValue.finalStatus = 'failed';
            contextValue.errorMessage = message;
            finishTaskRunBestEffort(contextValue, 'failed', message);
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

    context.nextSequenceNo += 1;
    safeWrite(
        'record_event',
        () =>
            recordTrainProvenanceEvent({
                ...input,
                taskRunId: context.taskRunId,
                sequenceNo: context.nextSequenceNo - 1
            }),
        undefined
    );
}

export function recordCurrentTrainProvenanceEventsForTrainCodes(
    trainCodes: TrainCodeParts[],
    input: Omit<TrainProvenanceEventInput, 'trainCode'>
) {
    const seen = new Set<string>();
    for (const trainCode of trainCodes) {
        const key = trainCodeKey(trainCode);
        if (seen.has(key)) continue;
        seen.add(key);
        recordCurrentTrainProvenanceEvent({
            ...input,
            trainCode
        });
    }
}

interface StationPlatformRefreshGroup {
    trainCodes: TrainCodeParts[];
    startAt: number | null;
    entries: StationPlatformInfoRefreshEntry[];
}

function getStationPlatformRefreshGroupKey(
    reference: StationPlatformInfoRouteReference
) {
    return `${reference.startAt ?? 'null'}:${reference.trainCodes
        .map(trainCodeKey)
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
    serviceDate: ServiceDay;
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
        const trainCodes = [
            ...new Map(
                reference.trainCodes.map((code) => [trainCodeKey(code), code])
            ).values()
        ];
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
        const resultId = safeWrite(
            'record_station_platform_refresh',
            () =>
                recordStationPlatformRefreshResult({
                    taskRunId: context.taskRunId,
                    serviceDate: input.serviceDate,
                    startAt: group.startAt,
                    primaryTrainCode: group.trainCodes[0]!,
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
                }),
            null
        );
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
    }
}

export function recordCurrentCouplingScanCandidate(
    input: CouplingScanCandidateInput
) {
    const context = getCurrentContext();
    if (!context) {
        return;
    }

    safeWrite(
        'record_coupling_scan_candidate',
        () =>
            recordCouplingScanCandidate({
                ...input,
                taskRunId: context.taskRunId
            }),
        undefined
    );
}

export function record12306RequestHourlyStatSafely(
    input: Record12306RequestHourlyStatInput
) {
    safeWrite(
        'record_12306_request_hourly_stat',
        () => record12306RequestHourlyStat(input),
        undefined
    );
}

export function recordStationBoardDispatchResultSafely(
    input: RecordStationBoardDispatchResultInput
) {
    safeWrite(
        'record_station_board_dispatch_result',
        () => recordStationBoardDispatchResult(input),
        undefined
    );
}

export function recordStationBoardFetchResultSafely(
    input: RecordStationBoardFetchResultInput
) {
    safeWrite(
        'record_station_board_fetch_result',
        () => recordStationBoardFetchResult(input),
        undefined
    );
}

export function cleanupExpiredTrainProvenanceSafely() {
    return safeWrite(
        'cleanup_expired_provenance',
        () => cleanupExpiredTrainProvenance(),
        0
    );
}
