import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import { dispatchDailyProbeTasks } from '~/server/services/taskExecutors/dispatchDailyProbeTasksExecutor';
import { PROBE_TRAIN_DEPARTURE_TASK_EXECUTOR } from '~/server/services/taskExecutors/probeTrainDepartureTaskExecutor';
import {
    refreshRouteBatchForCodes,
    type RefreshRouteBatchResult
} from '~/server/services/taskExecutors/refreshRouteBatchTaskExecutor';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import { removePendingTasksByExecutor } from '~/server/services/taskQueue';
import {
    getScheduleDatabaseFilePath,
    listScheduleItemsByStateKind,
    loadScheduleStateSummaryByKind
} from '~/server/utils/12306/scheduleProbe/sqliteStore';
import {
    getGroupKey,
    splitIntoBatches
} from '~/server/utils/12306/scheduleProbe/taskHelpers';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import { enqueueStationBoardDispatchTask } from './dispatchStationBoardTasksExecutor';

export const REFRESH_ALL_ROUTES_AND_REQUEUE_PROBE_TASK_EXECUTOR =
    'refresh_routes_requeue_probe';

const logger = getLogger('task-executor:refresh-all-routes-requeue-probe');

let registered = false;

function mergeBatchResult(
    total: RefreshRouteBatchResult,
    next: RefreshRouteBatchResult
): RefreshRouteBatchResult {
    return {
        processed: total.processed + next.processed,
        success: total.success + next.success,
        failed: total.failed + next.failed,
        changed: total.changed + next.changed,
        totalAttempts: total.totalAttempts + next.totalAttempts,
        stationBoardQueueAppendedCount:
            total.stationBoardQueueAppendedCount +
            next.stationBoardQueueAppendedCount
    };
}

function collectRouteRefreshTrainCodes(): {
    date: string;
    trainCodes: string[];
} {
    const scheduleFilePath = getScheduleDatabaseFilePath();
    const published = loadScheduleStateSummaryByKind('published');
    if (!published) {
        throw new Error(`published schedule not found: ${scheduleFilePath}`);
    }

    const currentDate = getCurrentDateString();
    if (published.date !== currentDate) {
        throw new Error(
            `published schedule is not current: scheduleDate=${published.date} currentDate=${currentDate}`
        );
    }

    const visitedGroups = new Set<string>();
    const trainCodes: string[] = [];
    for (const item of listScheduleItemsByStateKind('published')) {
        const groupKey = getGroupKey({
            code: item.itemCode,
            internalCode: item.internalCode
        });
        if (visitedGroups.has(groupKey)) {
            continue;
        }

        visitedGroups.add(groupKey);
        trainCodes.push(item.itemCode);
    }

    return {
        date: published.date,
        trainCodes
    };
}

async function executeRefreshAllRoutesAndRequeueProbeTask(): Promise<void> {
    const batchSize = useConfig().spider.scheduleProbe.refresh.batchSize;
    const { date, trainCodes } = collectRouteRefreshTrainCodes();
    const batches = splitIntoBatches(trainCodes, batchSize);
    let total: RefreshRouteBatchResult = {
        processed: 0,
        success: 0,
        failed: 0,
        changed: 0,
        totalAttempts: 0,
        stationBoardQueueAppendedCount: 0
    };

    logger.info(
        `start date=${date} routeGroups=${trainCodes.length} batches=${batches.length} batchSize=${batchSize}`
    );

    for (const [index, batchCodes] of batches.entries()) {
        const result = await refreshRouteBatchForCodes(batchCodes);
        total = mergeBatchResult(total, result);
        logger.info(
            `batch_done date=${date} batch=${index + 1}/${batches.length} codes=${batchCodes.length} processed=${result.processed} success=${result.success} failed=${result.failed} changed=${result.changed} apiCalls=${result.totalAttempts}`
        );
    }

    const stationBoardTaskId =
        total.stationBoardQueueAppendedCount > 0
            ? enqueueStationBoardDispatchTask('auto')
            : null;

    const removed = removePendingTasksByExecutor(
        PROBE_TRAIN_DEPARTURE_TASK_EXECUTOR
    );
    const dispatchResult = await dispatchDailyProbeTasks();

    logger.info(
        `done date=${date} routeGroups=${trainCodes.length} batches=${batches.length} processed=${total.processed} success=${total.success} failed=${total.failed} changed=${total.changed} apiCalls=${total.totalAttempts} stationBoardQueueAppended=${total.stationBoardQueueAppendedCount} stationBoardTaskId=${stationBoardTaskId ?? 'null'} removedProbeTasks=${removed.removedTaskIds.length} createdProbeTasks=${dispatchResult.createdTaskIds.length} dispatchDate=${dispatchResult.date ?? 'null'} dispatchGroups=${dispatchResult.groupCount}`
    );
}

export function registerRefreshAllRoutesAndRequeueProbeTaskExecutor(): void {
    if (registered) {
        return;
    }

    registerTaskExecutor(
        REFRESH_ALL_ROUTES_AND_REQUEUE_PROBE_TASK_EXECUTOR,
        async () => {
            await executeRefreshAllRoutesAndRequeueProbeTask();
        }
    );
    registered = true;
    logger.info(
        `registered executor=${REFRESH_ALL_ROUTES_AND_REQUEUE_PROBE_TASK_EXECUTOR}`
    );
}
