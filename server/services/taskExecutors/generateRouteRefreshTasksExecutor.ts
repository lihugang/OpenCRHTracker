import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import { enqueueTask } from '~/server/services/taskQueue';
import type { ScheduleItem } from '~/server/utils/12306/scheduleProbe/types';
import { loadExistingScheduleState } from '~/server/utils/12306/scheduleProbe/stateStore';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import { REFRESH_ROUTE_BATCH_TASK_EXECUTOR } from './refreshRouteBatchTaskExecutor';

export const GENERATE_ROUTE_REFRESH_TASKS_EXECUTOR = 'generate_route_refresh_tasks';

const logger = getLogger('task-executor:generate-route-refresh');

let registered = false;

function normalizeCode(code: string) {
    return code.trim().toUpperCase();
}

function getGroupKey(item: ScheduleItem): string {
    const internalCode = item.internalCode.trim().toUpperCase();
    if (internalCode.length > 0) {
        return `internal:${internalCode}`;
    }
    return `code:${normalizeCode(item.code)}`;
}

function splitIntoBatches(list: string[], size: number): string[][] {
    const batches: string[][] = [];
    for (let index = 0; index < list.length; index += size) {
        batches.push(list.slice(index, index + size));
    }
    return batches;
}

function enqueueSelfTask(executionTime: number): number {
    return enqueueTask(
        GENERATE_ROUTE_REFRESH_TASKS_EXECUTOR,
        {},
        executionTime,
        {
            isIdle: true
        }
    );
}

async function executeGenerateRouteRefreshTasks() {
    const config = useConfig();
    const scheduleFilePath = config.data.assets.schedule.file;
    const state = loadExistingScheduleState(scheduleFilePath);
    const now = getNowSeconds();

    if (!state) {
        const selfTaskId = enqueueSelfTask(now);
        logger.warn(
            `[task-executor:generate-route-refresh] schedule_not_found file=${scheduleFilePath} selfTaskId=${selfTaskId}`
        );
        return;
    }

    const ttlSeconds = config.spider.scheduleProbe.refresh.ttlHours * 60 * 60;
    const batchSize = config.spider.scheduleProbe.refresh.batchSize;
    const groupDedup = new Set<string>();
    const staleCodes: string[] = [];

    for (const item of state.items) {
        if (!item.isRunningToday) {
            continue;
        }

        const groupKey = getGroupKey(item);
        if (groupDedup.has(groupKey)) {
            continue;
        }

        const staleByMissing = item.startAt === null || item.endAt === null;
        const staleByTime =
            item.lastRouteRefreshAt === null ||
            now - item.lastRouteRefreshAt >= ttlSeconds;
        if (!staleByMissing && !staleByTime) {
            continue;
        }

        groupDedup.add(groupKey);
        staleCodes.push(item.code);
    }

    let created = 0;
    for (const batchCodes of splitIntoBatches(staleCodes, batchSize)) {
        enqueueTask(
            REFRESH_ROUTE_BATCH_TASK_EXECUTOR,
            { codes: batchCodes },
            now,
            {
                isIdle: true
            }
        );
        created += 1;
    }

    const selfTaskId = enqueueSelfTask(now);
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
