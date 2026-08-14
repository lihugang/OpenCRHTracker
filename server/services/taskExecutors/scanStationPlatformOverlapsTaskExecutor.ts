import useConfig from '~/server/config';
import getLogger from '~/server/libs/log4js';
import { estimateIdleTaskDurationMs } from '~/server/services/idleTaskEstimator';
import {
    detectStationPlatformOverlaps,
    type StationPlatformOccupation
} from '~/server/services/stationPlatformOverlapScanner';
import {
    forceRefreshStationPlatformInfoForStationTrainCodes,
    type StationPlatformInfoRefreshResult
} from '~/server/services/stationPlatformInfoService';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import {
    listPendingTasksByExecutor,
    reconcileFuturePendingTaskByExecutorAndArgs,
    removePendingTasksByExecutor,
    removePendingTasksByExecutorAndArgs,
    type EnqueueTaskOptions
} from '~/server/services/taskQueue';
import {
    markCurrentTrainProvenanceTaskSkipped,
    recordCurrentStationPlatformRefreshResults
} from '~/server/services/trainProvenanceRecorder';
import {
    getTodayStationTimetableByStationName,
    type TodayScheduleStationIndexRow
} from '~/server/services/todayScheduleCache';
import { loadPublishedScheduleStateSummary } from '~/server/utils/12306/scheduleProbe/stateStore';
import { listScheduleStationLookupRows } from '~/server/utils/12306/scheduleProbe/sqliteStore';
import {
    trainCodeKey,
    type TrainCodeParts
} from '~/server/utils/12306/trainCode';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import {
    serviceDateToDay,
    type ServiceDay
} from '~/server/utils/date/serviceDay';
import {
    formatShanghaiDateTime,
    getNextExecutionTimeByDailyTimesInShanghaiSeconds
} from '~/server/utils/date/shanghaiDateTime';
import { parseInternalJson } from '~/server/utils/internal/storageValues';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

export const SCAN_STATION_PLATFORM_OVERLAPS_TASK_EXECUTOR =
    'scan_station_platform_overlaps';

const logger = getLogger('task-executor:scan-station-platform-overlaps');

let registered = false;

interface ScanStationPlatformOverlapsTaskArgs {
    scheduledFor: number;
}

export interface SynchronizeStationPlatformOverlapTaskOptions {
    discardPending?: boolean;
}

export interface SynchronizeStationPlatformOverlapTaskResult {
    status: 'disabled' | 'scheduled';
    taskId: number | null;
    executionTime: number | null;
    removedTaskIds: number[];
}

interface RefreshStats {
    uniqueTargetCount: number;
    cacheReuseCount: number;
    requestCount: number;
    dataCount: number;
    failedTrainCount: number;
    updatedStopCount: number;
}

function parseTaskArgs(raw: unknown): ScanStationPlatformOverlapsTaskArgs {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new Error('task arguments must be an object');
    }

    const scheduledFor = (raw as { scheduledFor?: unknown }).scheduledFor;
    if (
        typeof scheduledFor !== 'number' ||
        !Number.isInteger(scheduledFor) ||
        scheduledFor < 0
    ) {
        throw new Error(
            'task arguments scheduledFor must be a non-negative integer'
        );
    }

    return { scheduledFor };
}

function isTaskDisabled() {
    return useConfig().task.startup.disabledExecutors.includes(
        SCAN_STATION_PLATFORM_OVERLAPS_TASK_EXECUTOR
    );
}

function getIdleTaskOptions(): EnqueueTaskOptions {
    const fallbackDurationMs = Math.max(
        1,
        Math.ceil(useConfig().spider.rateLimit.query.minIntervalMs)
    );
    return {
        isIdle: true,
        expectedDurationMs: estimateIdleTaskDurationMs(
            SCAN_STATION_PLATFORM_OVERLAPS_TASK_EXECUTOR,
            fallbackDurationMs
        )
    };
}

function getNextExecutionTime() {
    return getNextExecutionTimeByDailyTimesInShanghaiSeconds(
        Date.now(),
        useConfig().task.stationPlatformOverlap.dailyTimesHHmm
    );
}

function scheduleNextTask() {
    if (isTaskDisabled()) {
        return null;
    }

    const executionTime = getNextExecutionTime();
    const result = reconcileFuturePendingTaskByExecutorAndArgs(
        SCAN_STATION_PLATFORM_OVERLAPS_TASK_EXECUTOR,
        { scheduledFor: executionTime },
        executionTime,
        getIdleTaskOptions()
    );
    logger.info(
        `next_task_reconciled action=${result.action} taskId=${result.taskId} executionTime=${executionTime} executionTimeAsiaShanghai=${formatShanghaiDateTime(executionTime)} removedTaskIds=${JSON.stringify(result.removedTaskIds)}`
    );
    return result;
}

export function synchronizeStationPlatformOverlapTask(
    options: SynchronizeStationPlatformOverlapTaskOptions = {}
): SynchronizeStationPlatformOverlapTaskResult {
    if (isTaskDisabled()) {
        const removed = removePendingTasksByExecutor(
            SCAN_STATION_PLATFORM_OVERLAPS_TASK_EXECUTOR
        );
        return {
            status: 'disabled',
            taskId: null,
            executionTime: null,
            removedTaskIds: removed.removedTaskIds
        };
    }

    const removedTaskIds = new Set<number>();
    if (options.discardPending) {
        const removed = removePendingTasksByExecutor(
            SCAN_STATION_PLATFORM_OVERLAPS_TASK_EXECUTOR
        );
        for (const taskId of removed.removedTaskIds) {
            removedTaskIds.add(taskId);
        }
    } else {
        const now = getNowSeconds();
        for (const task of listPendingTasksByExecutor(
            SCAN_STATION_PLATFORM_OVERLAPS_TASK_EXECUTOR
        )) {
            if (task.executionTime <= now) {
                continue;
            }
            const removed = removePendingTasksByExecutorAndArgs(
                SCAN_STATION_PLATFORM_OVERLAPS_TASK_EXECUTOR,
                parseInternalJson(task.arguments)
            );
            for (const taskId of removed.removedTaskIds) {
                removedTaskIds.add(taskId);
            }
        }
    }

    const executionTime = getNextExecutionTime();
    const result = reconcileFuturePendingTaskByExecutorAndArgs(
        SCAN_STATION_PLATFORM_OVERLAPS_TASK_EXECUTOR,
        { scheduledFor: executionTime },
        executionTime,
        getIdleTaskOptions()
    );
    for (const taskId of result.removedTaskIds) {
        removedTaskIds.add(taskId);
    }

    logger.info(
        `task_synchronized action=${result.action} taskId=${result.taskId} executionTime=${executionTime} executionTimeAsiaShanghai=${formatShanghaiDateTime(executionTime)} removedTaskIds=${JSON.stringify([...removedTaskIds])}`
    );
    return {
        status: 'scheduled',
        taskId: result.taskId,
        executionTime,
        removedTaskIds: [...removedTaskIds]
    };
}

function getTrainCodes(row: TodayScheduleStationIndexRow) {
    const trainCodesByKey = new Map<string, TrainCodeParts>();
    for (const trainCode of [row.trainCode, ...row.allCodes]) {
        trainCodesByKey.set(trainCodeKey(trainCode), trainCode);
    }
    return [...trainCodesByKey.values()];
}

function buildRefreshKey(
    serviceDate: ServiceDay,
    occupation: StationPlatformOccupation
) {
    return [
        serviceDate,
        occupation.row.trainKey,
        occupation.row.stationTelecode.trim().toUpperCase()
    ].join(':');
}

async function executeScanStationPlatformOverlapsTask() {
    const published = loadPublishedScheduleStateSummary();
    const currentDate = serviceDateToDay(getCurrentDateString());
    if (!published || published.date !== currentDate) {
        markCurrentTrainProvenanceTaskSkipped('schedule_not_current');
        logger.info(
            `skip_schedule_not_current publishedDate=${published?.date ?? 'null'} currentDate=${currentDate}`
        );
        return;
    }

    const serviceDate = published.date;
    const stationRows = listScheduleStationLookupRows('published');
    const refreshCache = new Map<
        string,
        Promise<StationPlatformInfoRefreshResult>
    >();
    const refreshStats: RefreshStats = {
        uniqueTargetCount: 0,
        cacheReuseCount: 0,
        requestCount: 0,
        dataCount: 0,
        failedTrainCount: 0,
        updatedStopCount: 0
    };
    let stationCount = 0;
    let timetableRowCount = 0;
    let validOccupationCount = 0;
    let skippedRowCount = 0;
    let conflictStationCount = 0;
    let conflictPlatformCount = 0;
    let conflictPairCount = 0;

    const refreshOccupation = async (occupation: StationPlatformOccupation) => {
        const row = occupation.row;
        const stationName = row.stationName.trim();
        const stationTelecode = row.stationTelecode.trim().toUpperCase();
        const trainCodes = getTrainCodes(row);
        if (
            stationName.length === 0 ||
            stationTelecode.length === 0 ||
            trainCodes.length === 0
        ) {
            skippedRowCount += 1;
            return;
        }

        const cacheKey = buildRefreshKey(serviceDate, occupation);
        const cached = refreshCache.get(cacheKey);
        if (cached) {
            refreshStats.cacheReuseCount += 1;
            await cached;
            return;
        }

        const refresh = forceRefreshStationPlatformInfoForStationTrainCodes({
            serviceDate,
            stationName,
            stationTelecode,
            trainCodes
        });
        refreshCache.set(cacheKey, refresh);
        refreshStats.uniqueTargetCount += 1;
        const result = await refresh;
        refreshStats.requestCount += result.requestCount;
        refreshStats.dataCount += result.dataCount;
        refreshStats.failedTrainCount += result.failedTrainCount;
        refreshStats.updatedStopCount += result.updatedStopCount;
        recordCurrentStationPlatformRefreshResults({
            serviceDate,
            trigger: 'scheduled_task',
            result,
            fallbackRouteReferences: [
                {
                    trainCodes,
                    startAt: row.startAt
                }
            ]
        });
    };

    for (const station of stationRows) {
        const stationName = station.stationName.trim();
        if (stationName.length === 0) {
            continue;
        }

        stationCount += 1;
        const rows = getTodayStationTimetableByStationName(stationName);
        timetableRowCount += rows.length;
        const detected = detectStationPlatformOverlaps(rows);
        validOccupationCount += detected.validOccupationCount;
        skippedRowCount += detected.skippedRowCount;
        if (detected.pairs.length === 0) {
            continue;
        }

        conflictStationCount += 1;
        conflictPairCount += detected.pairs.length;
        conflictPlatformCount += new Set(
            detected.pairs.map((pair) => pair.left.platformNo)
        ).size;

        for (const pair of detected.pairs) {
            await refreshOccupation(pair.left);
            await refreshOccupation(pair.right);
        }
    }

    logger.info(
        `done serviceDate=${serviceDate} stations=${stationCount} timetableRows=${timetableRowCount} validOccupations=${validOccupationCount} skippedRows=${skippedRowCount} conflictStations=${conflictStationCount} conflictPlatforms=${conflictPlatformCount} conflictPairs=${conflictPairCount} uniqueRefreshTargets=${refreshStats.uniqueTargetCount} cacheReuses=${refreshStats.cacheReuseCount} requests=${refreshStats.requestCount} data=${refreshStats.dataCount} failedTrains=${refreshStats.failedTrainCount} updatedStops=${refreshStats.updatedStopCount}`
    );
}

async function executeTask() {
    let caughtError: unknown = null;
    try {
        await executeScanStationPlatformOverlapsTask();
    } catch (error) {
        caughtError = error;
    } finally {
        try {
            scheduleNextTask();
        } catch (error) {
            if (!caughtError) {
                caughtError = error;
            } else {
                const message =
                    error instanceof Error
                        ? `${error.name}: ${error.message}`
                        : String(error);
                logger.error(`enqueue_next_task_failed error=${message}`);
            }
        }
    }

    if (caughtError) {
        throw caughtError;
    }
}

export function registerScanStationPlatformOverlapsTaskExecutor() {
    if (registered) {
        return;
    }

    registerTaskExecutor(SCAN_STATION_PLATFORM_OVERLAPS_TASK_EXECUTOR, {
        parse: parseTaskArgs,
        execute: async () => executeTask()
    });
    registered = true;
    logger.info(
        `registered executor=${SCAN_STATION_PLATFORM_OVERLAPS_TASK_EXECUTOR}`
    );
}
