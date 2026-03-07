import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import { enqueueTask } from '~/server/services/taskQueue';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import fetchRouteInfo from '~/server/utils/12306/network/fetchRouteInfo';
import queryWithRetry from '~/server/utils/12306/scheduleProbe/queryWithRetry';
import {
    loadExistingScheduleState,
    saveScheduleState
} from '~/server/utils/12306/scheduleProbe/stateStore';
import { getGroupKey } from '~/server/utils/12306/scheduleProbe/taskHelpers';
import type { ScheduleItem } from '~/server/utils/12306/scheduleProbe/types';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import { toShanghaiDayOffsetFromUnixSeconds } from '~/server/utils/date/shanghaiDateTime';
import { DISPATCH_DAILY_PROBE_TASKS_EXECUTOR } from './dispatchDailyProbeTasksExecutor';

export const REFRESH_ROUTE_BATCH_TASK_EXECUTOR = 'refresh_route_batch';

const logger = getLogger('task-executor:refresh-route-batch');

let registered = false;

interface RefreshRouteBatchTaskArgs {
    codes: string[];
}

function parseTaskArgs(
    raw: unknown,
    maxBatchSize: number
): RefreshRouteBatchTaskArgs {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new Error('task arguments must be an object');
    }

    const maybeCodes = (raw as { codes?: unknown }).codes;
    if (!Array.isArray(maybeCodes)) {
        throw new Error('task arguments codes must be an array');
    }

    const deduplication = new Set<string>();
    const codes: string = [];
    for (const value of maybeCodes) {
        if (typeof value !== 'string') {
            continue;
        }
        const normalized = normalizeCode(value);
        if (normalized.length === 0 || deduplication.has(normalized)) {
            continue;
        }
        deduplication.add(normalized);
        codes.push(normalized);
        if (codes.length >= maxBatchSize) {
            break;
        }
    }

    return { codes };
}

function buildGroupIndex(items: ScheduleItem[]): Map<string, number[]> {
    const map = new Map<string, number[]>();
    for (const of items.entries()) {
        const key = getGroupKey(item);
        const indices = map.get(key);
        if (indices) {
            indices.push(index);
        } else {
            map.set(key, [index]);
        }
    }
    return map;
}

function buildCodeIndex(items: ScheduleItem[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const of items.entries()) {
        map.set(normalizeCode(item.code), index);
    }
    return map;
}

async function executeRefreshRouteBatchTask(rawArgs: unknown) {
    const config = useConfig();
    const batchSize = config.spider.scheduleProbe.refresh.batchSize;
    const retryAttempts = config.spider.scheduleProbe.retryAttempts;
    const args = parseTaskArgs(rawArgs, batchSize);
    if (args.codes.length === 0) {
        logger.info('skip empty_codes');
        return;
    }

    const scheduleFilePath = config.data.assets.schedule.file;
    const state = loadExistingScheduleState(scheduleFilePath);
    if (!state) {
        logger.warn(
            `skip schedule_not_found file=${scheduleFilePath}`
        );
        return;
    }

    const groupIndex = buildGroupIndex(state.items);
    const codeIndex = buildCodeIndex(state.items);
    const processedGroups = new Set<string>();
    let processed = 0;
    let success = 0;
    let failed = 0;
    let changed = 0;
    let totalAttempts = 0;
    let mutated = false;

    for (const code of args.codes) {
        const itemIndex = codeIndex.get(code);
        if (itemIndex === undefined) {
            continue;
        }

        const item = state.items[itemIndex]!;
        const groupKey = getGroupKey(item);
        if (processedGroups.has(groupKey)) {
            continue;
        }
        processedGroups.add(groupKey);
        processed += 1;

        const groupItemIndexes = groupIndex.get(groupKey) ?? [itemIndex];
        const routeResult = await queryWithRetry(
            () => fetchRouteInfo(item.code),
            retryAttempts
        );
        totalAttempts += routeResult.attempts;

        if (!routeResult.ok) {
            failed += 1;
            logger.warn(
                `refresh_failed code=${item.code} attempts=${routeResult.attempts} groupSize=${groupItemIndexes.length}`
            );
            continue;
        }

        const nextStartAt = toShanghaiDayOffsetFromUnixSeconds(
            state.date,
            routeResult.data.route.startAt
        );
        const nextEndAt = toShanghaiDayOffsetFromUnixSeconds(
            state.date,
            routeResult.data.route.endAt
        );
        const refreshedAt = getNowSeconds();
        const refreshedInternalCode =
            routeResult.data.route.internalCode.trim();
        let groupChanged = false;
        for (const index of groupItemIndexes) {
            const groupItem = state.items[index]!;
            if (
                groupItem.startAt !== nextStartAt ||
                groupItem.endAt !== nextEndAt
            ) {
                groupChanged = true;
            }
            groupItem.startAt = nextStartAt;
            groupItem.endAt = nextEndAt;
            groupItem.lastRouteRefreshAt = refreshedAt;
            if (
                groupItem.internalCode.length === 0 &&
                refreshedInternalCode.length > 0
            ) {
                groupItem.internalCode = refreshedInternalCode;
            }
        }

        success += 1;
        mutated = true;
        if (groupChanged) {
            changed += 1;
        }
    }

    if (mutated) {
        saveScheduleState(scheduleFilePath, state);
    }
    logger.info(
        `done processed=${processed} success=${success} failed=${failed} changed=${changed} apiCalls=${totalAttempts} file=${scheduleFilePath}`
    );
}

export function registerRefreshRouteBatchTaskExecutor() {
    if (registered) {
        return;
    }

    registerTaskExecutor(REFRESH_ROUTE_BATCH_TASK_EXECUTOR, async (args) => {
        await executeRefreshRouteBatchTask(args);
    });
    registered = true;
    logger.info(
        `registered executor=${REFRESH_ROUTE_BATCH_TASK_EXECUTOR}`
    );
}
