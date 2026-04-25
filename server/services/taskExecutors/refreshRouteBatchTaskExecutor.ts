import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import {
    record12306TraceSummary,
    runWith12306TraceScope,
    with12306TraceFunction
} from '~/server/services/requestMetrics12306Trace';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import fetchRouteInfo from '~/server/utils/12306/network/fetchRouteInfo';
import queryWithRetry from '~/server/utils/12306/scheduleProbe/queryWithRetry';
import {
    buildCodeIndex,
    buildGroupIndex,
    getGroupKey
} from '~/server/utils/12306/scheduleProbe/taskHelpers';
import { toScheduleStops } from '~/server/utils/12306/scheduleProbe/mapRouteStops';
import {
    loadPublishedScheduleState,
    savePublishedScheduleState
} from '~/server/utils/12306/scheduleProbe/stateStore';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import { toShanghaiDayOffsetFromUnixSeconds } from '~/server/utils/date/shanghaiDateTime';
import type { ScheduleState } from '~/server/utils/12306/scheduleProbe/types';

export const REFRESH_ROUTE_BATCH_TASK_EXECUTOR = 'refresh_route_batch';

const logger = getLogger('task-executor:refresh-route-batch');

let registered = false;

interface RefreshRouteBatchTaskArgs {
    codes: string[];
}

interface RefreshRouteGroupUpdate {
    codes: string[];
    allCodes: string[];
    bureauCode: string;
    trainDepartment: string;
    passengerDepartment: string;
    startStation: string;
    endStation: string;
    startAt: number;
    endAt: number;
    lastRouteRefreshAt: number;
    internalCode: string;
    stops: ScheduleState['items'][number]['stops'];
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
    const codes: string[] = [];
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

function applyGroupUpdate(
    state: ScheduleState,
    update: RefreshRouteGroupUpdate
): boolean {
    const codeIndex = buildCodeIndex(state.items);
    let applied = false;
    for (const code of update.codes) {
        const itemIndex = codeIndex.get(code);
        if (itemIndex === undefined) {
            continue;
        }

        const item = state.items[itemIndex]!;
        item.allCodes = [...update.allCodes];
        item.bureauCode = update.bureauCode;
        item.trainDepartment = update.trainDepartment;
        item.passengerDepartment = update.passengerDepartment;
        item.startStation = update.startStation;
        item.endStation = update.endStation;
        item.startAt = update.startAt;
        item.endAt = update.endAt;
        item.lastRouteRefreshAt = update.lastRouteRefreshAt;
        item.stops = update.stops.map((stop) => ({
            ...stop
        }));
        if (item.internalCode.length === 0 && update.internalCode.length > 0) {
            item.internalCode = update.internalCode;
        }
        applied = true;
    }

    return applied;
}

async function executeRefreshRouteBatchTaskInternal(rawArgs: unknown) {
    const config = useConfig();
    const batchSize = config.spider.scheduleProbe.refresh.batchSize;
    const retryAttempts = config.spider.scheduleProbe.retryAttempts;
    const args = parseTaskArgs(rawArgs, batchSize);
    if (args.codes.length === 0) {
        logger.info('skip empty_codes');
        return;
    }

    const scheduleFilePath = config.data.assets.schedule.file;
    const state = loadPublishedScheduleState(scheduleFilePath);
    if (!state) {
        logger.warn(`skip schedule_not_found file=${scheduleFilePath}`);
        return;
    }
    const currentDate = getCurrentDateString();
    if (state.date !== currentDate) {
        logger.warn(
            `skip_non_current_schedule scheduleDate=${state.date} currentDate=${currentDate} file=${scheduleFilePath}`
        );
        return;
    }

    const groupIndex = buildGroupIndex(state.items);
    const codeIndex = buildCodeIndex(state.items);
    const processedGroups = new Set<string>();
    const groupUpdates: RefreshRouteGroupUpdate[] = [];
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
        const routeResult = await runWith12306TraceScope(
            {
                primaryTrainCode: item.code,
                allTrainCodes: groupItemIndexes.map(
                    (index) => state.items[index]!.code
                ),
                trainInternalCode: item.internalCode,
                startAt: item.startAt,
                traceSubtitle: 'refresh route batch'
            },
            () =>
                queryWithRetry(
                    () => fetchRouteInfo(item.code),
                    retryAttempts,
                    (result) => result.status === 'request_failed',
                    {
                        title: '批量刷新 route 信息',
                        context: {
                            trainCode: item.code,
                            groupSize: groupItemIndexes.length
                        }
                    }
                )
        );
        totalAttempts += routeResult.attempts;

        if (!routeResult.ok || routeResult.data.status !== 'running') {
            failed += 1;
            logger.debug(
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
        const nextStartStation = routeResult.data.route.startStation.trim();
        const nextEndStation = routeResult.data.route.endStation.trim();
        const refreshedAt = getNowSeconds();
        const refreshedInternalCode =
            routeResult.data.route.internalCode.trim();
        const nextAllCodes = [...routeResult.data.route.allCodes];
        const nextBureauCode = routeResult.data.route.bureauCode.trim();
        const nextTrainDepartment =
            routeResult.data.route.trainDepartment.trim();
        const nextPassengerDepartment =
            routeResult.data.route.passengerDepartment.trim();
        const nextStops = toScheduleStops(
            state.date,
            routeResult.data.route.stops
        );
        let groupChanged = false;
        for (const index of groupItemIndexes) {
            const groupItem = state.items[index]!;
            if (
                groupItem.allCodes.join('/') !== nextAllCodes.join('/') ||
                groupItem.bureauCode !== nextBureauCode ||
                groupItem.trainDepartment !== nextTrainDepartment ||
                groupItem.passengerDepartment !== nextPassengerDepartment ||
                groupItem.startStation !== nextStartStation ||
                groupItem.endStation !== nextEndStation ||
                groupItem.startAt !== nextStartAt ||
                groupItem.endAt !== nextEndAt ||
                JSON.stringify(groupItem.stops) !== JSON.stringify(nextStops)
            ) {
                groupChanged = true;
            }
            groupItem.allCodes = [...nextAllCodes];
            groupItem.bureauCode = nextBureauCode;
            groupItem.trainDepartment = nextTrainDepartment;
            groupItem.passengerDepartment = nextPassengerDepartment;
            groupItem.startStation = nextStartStation;
            groupItem.endStation = nextEndStation;
            groupItem.startAt = nextStartAt;
            groupItem.endAt = nextEndAt;
            groupItem.lastRouteRefreshAt = refreshedAt;
            groupItem.stops = nextStops.map((stop) => ({
                ...stop
            }));
            if (
                groupItem.internalCode.length === 0 &&
                refreshedInternalCode.length > 0
            ) {
                groupItem.internalCode = refreshedInternalCode;
            }
        }

        success += 1;
        mutated = true;
        groupUpdates.push({
            codes: groupItemIndexes.map((index) =>
                normalizeCode(state.items[index]!.code)
            ),
            allCodes: nextAllCodes,
            bureauCode: nextBureauCode,
            trainDepartment: nextTrainDepartment,
            passengerDepartment: nextPassengerDepartment,
            startStation: nextStartStation,
            endStation: nextEndStation,
            startAt: nextStartAt,
            endAt: nextEndAt,
            lastRouteRefreshAt: refreshedAt,
            internalCode: refreshedInternalCode,
            stops: nextStops
        });
        if (groupChanged) {
            changed += 1;
        }
    }

    if (mutated) {
        const latestState = loadPublishedScheduleState(scheduleFilePath);
        if (!latestState) {
            logger.warn(
                `skip_save schedule_not_found_after_refresh file=${scheduleFilePath}`
            );
        } else if (latestState.date !== state.date) {
            logger.warn(
                `skip_save schedule_date_changed oldDate=${state.date} newDate=${latestState.date} file=${scheduleFilePath}`
            );
        } else {
            let appliedGroups = 0;
            for (const update of groupUpdates) {
                if (applyGroupUpdate(latestState, update)) {
                    appliedGroups += 1;
                }
            }
            if (appliedGroups > 0) {
                savePublishedScheduleState(scheduleFilePath, latestState);
            }
        }
    }
    logger.info(
        `done processed=${processed} success=${success} failed=${failed} changed=${changed} apiCalls=${totalAttempts} file=${scheduleFilePath}`
    );
}

async function executeRefreshRouteBatchTask(rawArgs: unknown) {
    const traceStartedAtMs = Date.now();
    return with12306TraceFunction<void>(
        {
            title: '批量刷新 route 信息任务',
            functionName: 'executeRefreshRouteBatchTask',
            subject: {
                traceKey: `refresh-route-batch:${Date.now()}`
            },
            context: {
                rawArgs: JSON.stringify(rawArgs ?? null)
            }
        },
        async () => {
            await executeRefreshRouteBatchTaskInternal(rawArgs);
            record12306TraceSummary({
                title: '批量刷新 route 信息任务完成',
                status: 'success',
                level: 'INFO',
                durationMs: Date.now() - traceStartedAtMs,
                message: '完成 refresh_route_batch 执行'
            });
        }
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
    logger.info(`registered executor=${REFRESH_ROUTE_BATCH_TASK_EXECUTOR}`);
}
