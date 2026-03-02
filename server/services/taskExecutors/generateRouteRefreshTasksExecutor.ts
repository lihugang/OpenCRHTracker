import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import { estimateIdleTaskDurationMs } from '~/server/services/idleTaskEstimator';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import { enqueueTask } from '~/server/services/taskQueue';
import { loadExistingScheduleState } from '~/server/utils/12306/scheduleProbe/stateStore';
import {
    getGroupKey,
    splitIntoBatches
} from '~/server/utils/12306/scheduleProbe/taskHelpers';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import { REFRESH_ROUTE_BATCH_TASK_EXECUTOR } from './refreshRouteBatchTaskExecutor';

export const GENERATE_ROUTE_REFRESH_TASKS_EXECUTOR =
    'generate_route_refresh_tasks';

const logger = getLogger('task-executor:generate-route-refresh');

let registered = false;

function estimateGenerateRouteRefreshTaskDurationMs(): number {
    return estimateIdleTaskDurationMs(GENERATE_ROUTE_REFRESH_TASKS_EXECUTOR, 0);
}

function estimateRefreshRouteBatchTaskDurationMs(batchSize: number): number {
    const queryMinIntervalMs = useConfig().spider.rateLimit.query.minIntervalMs;
    return estimateIdleTaskDurationMs(
        REFRESH_ROUTE_BATCH_TASK_EXECUTOR,
        batchSize * queryMinIntervalMs
    );
}

function enqueueSelfTask(
    executionTime: number,
    expectedDurationMs: number
): number {
    return enqueueTask(
        GENERATE_ROUTE_REFRESH_TASKS_EXECUTOR,
        {},
        executionTime,
        {
            isIdle: true,
            expectedDurationMs
        }
    );
}

async function executeGenerateRouteRefreshTasks() {
    const config = useConfig();
    const scheduleFilePath = config.data.assets.schedule.file;
    const state = loadExistingScheduleState(scheduleFilePath);
    const now = getNowSeconds();
    const selfExpectedDurationMs = estimateGenerateRouteRefreshTaskDurationMs();

    if (!state) {
        const selfTaskId = enqueueSelfTask(now, selfExpectedDurationMs);
        logger.warn(
            `[task-executor:generate-route-refresh] schedule_not_found file=${scheduleFilePath} selfTaskId=${selfTaskId}`
        );
        return;
    }

    const ttlSeconds = config.spider.scheduleProbe.refresh.ttlHours * 60 * 60;
    const batchSize = config.spider.scheduleProbe.refresh.batchSize;
    const groupDeduplication = new Set<string>();
    const staleCodes: string[] = [];

    for (const item of state.items) {
        const groupKey = getGroupKey(item);
        if (groupDeduplication.has(groupKey)) {
            continue;
        }

        const staleByMissing = item.startAt === null || item.endAt === null;
        const staleByTime =
            item.lastRouteRefreshAt === null ||
            now - item.lastRouteRefreshAt >= ttlSeconds;
        if (!staleByMissing && !staleByTime) {
            continue;
        }

        groupDeduplication.add(groupKey);
        staleCodes.push(item.code);
    }

    let created = 0;
    for (const batchCodes of splitIntoBatches(staleCodes, batchSize)) {
        enqueueTask(
            REFRESH_ROUTE_BATCH_TASK_EXECUTOR,
            { codes: batchCodes },
            now,
            {
                isIdle: true,
                expectedDurationMs: estimateRefreshRouteBatchTaskDurationMs(
                    batchCodes.length
                )
            }
        );
        created += 1;
    }

    const selfTaskId = enqueueSelfTask(now, selfExpectedDurationMs);
    logger.info(
        `[task-executor:generate-route-refresh] done staleCodes=${staleCodes.length} createdTasks=${created} batchSize=${batchSize} ttlHours=${config.spider.scheduleProbe.refresh.ttlHours} selfTaskId=${selfTaskId}`
    );
}

export function registerGenerateRouteRefreshTasksExecutor() {
    if (registered) {
        return;
    }

    registerTaskExecutor(GENERATE_ROUTE_REFRESH_TASKS_EXECUTOR, async () => {
        await executeGenerateRouteRefreshTasks();
    });
    registered = true;
    logger.info(
        `[task-executor:generate-route-refresh] registered executor=${GENERATE_ROUTE_REFRESH_TASKS_EXECUTOR}`
    );
}
