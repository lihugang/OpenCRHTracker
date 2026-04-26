import getLogger from '~/server/libs/log4js';
import {
    record12306TraceSummary,
    runWith12306TraceScope,
    with12306TraceFunction
} from '~/server/services/requestMetrics12306Trace';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import fetchRouteInfo from '../network/fetchRouteInfo';
import queryTrainCodeThroughPrefix from '../network/queryTrainCodeThroughPrefix';
import { expandKeyword } from './prefixTree';
import { normalizeTrainCodeItems, sortScheduleItems } from './filterAndSort';
import queryWithRetry from './queryWithRetry';
import { saveBuildingScheduleState } from './stateStore';
import { buildGroupIndex, getGroupKey } from './taskHelpers';
import { toScheduleStops } from './mapRouteStops';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import { toShanghaiDayOffsetFromUnixSeconds } from '~/server/utils/date/shanghaiDateTime';
import type {
    ScheduleState,
    ScheduleItem,
    ScheduleProbeRuntimeConfig
} from './types';

function pushUnique(list: string[], value: string): void {
    if (list.includes(value)) {
        return;
    }
    list.push(value);
}

function updateItemsFromMap(
    state: ScheduleState,
    itemsByCode: Map<string, ScheduleItem>,
    config: ScheduleProbeRuntimeConfig
): void {
    state.items = sortScheduleItems(
        Array.from(itemsByCode.values()),
        config.prefixRules
    );
    state.stats.uniqueItems = state.items.length;
}

function restorePreservedRouteInfo(
    item: ScheduleItem,
    preservedItem: ScheduleItem | undefined
): boolean {
    if (!preservedItem) {
        return false;
    }

    if (
        item.internalCode.length === 0 &&
        preservedItem.internalCode.length > 0
    ) {
        item.internalCode = preservedItem.internalCode;
    }

    if (preservedItem.startAt === null || preservedItem.endAt === null) {
        return false;
    }

    item.bureauCode = preservedItem.bureauCode;
    item.trainDepartment = preservedItem.trainDepartment;
    item.passengerDepartment = preservedItem.passengerDepartment;
    item.startStation = preservedItem.startStation;
    item.endStation = preservedItem.endStation;
    item.startAt = preservedItem.startAt;
    item.endAt = preservedItem.endAt;
    item.lastRouteRefreshAt = preservedItem.lastRouteRefreshAt;
    item.allCodes = [...preservedItem.allCodes];
    item.stops = preservedItem.stops.map((stop) => ({
        ...stop
    }));
    return true;
}

function buildScheduleEnrichGroupTraceKey(runId: string, item: ScheduleItem) {
    const trainIdentifier =
        normalizeCode(item.internalCode) || normalizeCode(item.code);
    const startAt = typeof item.startAt === 'number' ? item.startAt : 'unknown';
    return `schedule-enrich-group:${runId}:${trainIdentifier}:${startAt}`;
}

async function runScheduleProbeInternal(
    scheduleFilePath: string,
    state: ScheduleState,
    config: ScheduleProbeRuntimeConfig,
    runId: string,
    preservedItemsByCode?: Map<string, ScheduleItem>
): Promise<void> {
    const logger = getLogger('schedule-probe');
    const itemsByCode = new Map<string, ScheduleItem>();
    for (const item of state.items) {
        itemsByCode.set(item.code, item);
    }

    if (!Number.isFinite(state.startedAtMs) || state.startedAtMs <= 0) {
        state.startedAtMs = Date.now();
    }
    state.status = 'running';

    let newlyAddedCount = 0;
    let enrichedCount = 0;
    let reusedRouteInfoCount = 0;
    logger.info(
        `run runId=${runId} phase=${state.progress.phase} existingItems=${state.items.length} discoverQueue=${state.progress.discoverQueue.length} discoverProcessed=${state.progress.discoverProcessed.length} enrichCursor=${state.progress.enrichCursor}`
    );

    if (state.progress.phase === 'discover') {
        logger.info(
            `discover start runId=${runId} mode=${state.progress.discoverMode} queue=${state.progress.discoverQueue.length} processed=${state.progress.discoverProcessed.length} rawItems=${state.stats.rawItems} uniqueItems=${state.stats.uniqueItems}`
        );
        const processedSet = new Set(state.progress.discoverProcessed);
        const queuedSet = new Set(state.progress.discoverQueue);
        let processedSinceFlush = 0;

        while (state.progress.discoverQueue.length > 0) {
            const keyword = state.progress.discoverQueue.shift()!;
            queuedSet.delete(keyword);

            const searchResult = await runWith12306TraceScope(
                {
                    traceKey: `schedule-probe:discover:${runId}:${keyword}`,
                    traceTitle: `运行图关键词 ${keyword}`,
                    traceSubtitle: 'schedule discover'
                },
                () =>
                    queryWithRetry(
                        () => queryTrainCodeThroughPrefix(keyword),
                        config.retryAttempts,
                        undefined,
                        {
                            title: '运行图 discover 查询',
                            context: {
                                keyword,
                                runId
                            }
                        }
                    )
            );
            state.progress.counters.apiCalls += searchResult.attempts;
            state.progress.counters.apiRetries += Math.max(
                0,
                searchResult.attempts - 1
            );

            if (searchResult.ok) {
                const normalizedItems = normalizeTrainCodeItems(
                    searchResult.data,
                    config.prefixRules
                );
                state.stats.rawItems += normalizedItems.length;
                for (const item of normalizedItems) {
                    const existed = itemsByCode.get(item.code);
                    if (!existed) {
                        if (
                            restorePreservedRouteInfo(
                                item,
                                preservedItemsByCode?.get(
                                    normalizeCode(item.code)
                                )
                            )
                        ) {
                            reusedRouteInfoCount += 1;
                        }
                        itemsByCode.set(item.code, item);
                        newlyAddedCount += 1;
                    } else if (
                        existed.internalCode.length === 0 &&
                        item.internalCode.length > 0
                    ) {
                        existed.internalCode = item.internalCode;
                    }
                }

                if (searchResult.data.length >= config.maxBatchSize) {
                    const children = expandKeyword(keyword, config.prefixRules);
                    for (const child of children) {
                        if (processedSet.has(child) || queuedSet.has(child)) {
                            continue;
                        }
                        state.progress.discoverQueue.push(child);
                        queuedSet.add(child);
                    }
                }
            } else {
                pushUnique(state.progress.failedKeywords, keyword);
                logger.warn(
                    `discover failed runId=${runId} keyword=${keyword} attempts=${searchResult.attempts}`
                );
            }

            state.progress.discoverProcessed.push(keyword);
            processedSet.add(keyword);
            processedSinceFlush += 1;

            if (processedSinceFlush >= config.checkpointFlushEvery) {
                updateItemsFromMap(state, itemsByCode, config);
                saveBuildingScheduleState(scheduleFilePath, state);
                logger.info(
                    `discover checkpoint runId=${runId} processed=${state.progress.discoverProcessed.length} pending=${state.progress.discoverQueue.length} rawItems=${state.stats.rawItems} uniqueItems=${state.stats.uniqueItems} newlyAdded=${newlyAddedCount} reusedRouteInfo=${reusedRouteInfoCount} apiCalls=${state.progress.counters.apiCalls} apiRetries=${state.progress.counters.apiRetries}`
                );
                processedSinceFlush = 0;
            }
        }

        updateItemsFromMap(state, itemsByCode, config);
        state.progress.phase = 'enrich';
        state.progress.discoverMode = 'retry';
        state.progress.enrichCursor = Math.min(
            Math.max(0, state.progress.enrichCursor),
            state.items.length
        );
        saveBuildingScheduleState(scheduleFilePath, state);
        logger.info(
            `discover finish runId=${runId} processed=${state.progress.discoverProcessed.length} failedKeywords=${state.progress.failedKeywords.length} uniqueItems=${state.stats.uniqueItems} newlyAdded=${newlyAddedCount} reusedRouteInfo=${reusedRouteInfoCount}`
        );
    }

    if (state.progress.phase === 'enrich') {
        logger.info(
            `enrich start runId=${runId} totalItems=${state.items.length} fromCursor=${state.progress.enrichCursor}`
        );
        const pendingRetrySet = new Set(
            state.progress.failedEnrichCodes.map((code) => normalizeCode(code))
        );
        state.progress.failedEnrichCodes = [];
        const groupIndexByKey = buildGroupIndex(state.items);
        const processedGroupKeys = new Set<string>();

        let processedSinceFlush = 0;
        state.progress.enrichCursor = Math.min(
            Math.max(0, state.progress.enrichCursor),
            state.items.length
        );

        for (
            let index = state.progress.enrichCursor;
            index < state.items.length;
            index += 1
        ) {
            const item = state.items[index]!;
            const itemCodeKey = normalizeCode(item.code);
            const groupKey = getGroupKey(item);
            if (processedGroupKeys.has(groupKey)) {
                state.progress.enrichCursor = index + 1;
                continue;
            }

            const groupIndexes = groupIndexByKey.get(groupKey) ?? [index];
            const groupItems = groupIndexes.map(
                (itemIndex) => state.items[itemIndex]!
            );
            const shouldRetryFailed = pendingRetrySet.has(itemCodeKey);
            const shouldRetryFailedGroup = groupItems.some((groupItem) =>
                pendingRetrySet.has(normalizeCode(groupItem.code))
            );
            const shouldBackfillMissing = groupItems.some(
                (groupItem) =>
                    groupItem.startAt === null || groupItem.endAt === null
            );

            if (
                !shouldRetryFailed &&
                !shouldRetryFailedGroup &&
                !shouldBackfillMissing
            ) {
                processedGroupKeys.add(groupKey);
                state.progress.enrichCursor = index + 1;
                continue;
            }

            const routeResult = await runWith12306TraceScope(
                {
                    traceKey: buildScheduleEnrichGroupTraceKey(runId, item),
                    primaryTrainCode: item.code,
                    allTrainCodes: groupItems.map(
                        (groupItem) => groupItem.code
                    ),
                    trainInternalCode: item.internalCode,
                    startAt: item.startAt,
                    traceSubtitle: 'schedule enrich'
                },
                () =>
                    queryWithRetry(
                        () => fetchRouteInfo(item.code),
                        config.retryAttempts,
                        (result) => result.status === 'request_failed',
                        {
                            title: '运行图 enrich 查询',
                            context: {
                                runId,
                                trainCode: item.code,
                                groupSize: groupItems.length
                            }
                        }
                    )
            );
            state.progress.counters.apiCalls += routeResult.attempts;
            state.progress.counters.apiRetries += Math.max(
                0,
                routeResult.attempts - 1
            );

            if (routeResult.ok && routeResult.data.status === 'running') {
                const nextStartAt = toShanghaiDayOffsetFromUnixSeconds(
                    state.date,
                    routeResult.data.route.startAt
                );
                const nextEndAt = toShanghaiDayOffsetFromUnixSeconds(
                    state.date,
                    routeResult.data.route.endAt
                );
                const refreshedAt = getNowSeconds();
                const nextStops = toScheduleStops(
                    state.date,
                    routeResult.data.route.stops
                );
                for (const groupItem of groupItems) {
                    groupItem.bureauCode = routeResult.data.route.bureauCode;
                    groupItem.trainDepartment =
                        routeResult.data.route.trainDepartment;
                    groupItem.passengerDepartment =
                        routeResult.data.route.passengerDepartment;
                    groupItem.startStation =
                        routeResult.data.route.startStation.trim();
                    groupItem.endStation =
                        routeResult.data.route.endStation.trim();
                    groupItem.allCodes = [...routeResult.data.route.allCodes];
                    groupItem.startAt = nextStartAt;
                    groupItem.endAt = nextEndAt;
                    groupItem.lastRouteRefreshAt = refreshedAt;
                    groupItem.stops = nextStops.map((stop) => ({
                        ...stop
                    }));
                }
                enrichedCount += 1;
            } else {
                for (const groupItem of groupItems) {
                    pushUnique(
                        state.progress.failedEnrichCodes,
                        groupItem.code
                    );
                }
                logger.debug(
                    `enrich failed runId=${runId} trainCode=${item.code} attempts=${routeResult.attempts} groupSize=${groupItems.length}`
                );
            }

            processedGroupKeys.add(groupKey);
            state.progress.enrichCursor = index + 1;
            processedSinceFlush += 1;

            if (processedSinceFlush >= config.checkpointFlushEvery) {
                saveBuildingScheduleState(scheduleFilePath, state);
                logger.info(
                    `enrich checkpoint runId=${runId} cursor=${state.progress.enrichCursor} totalItems=${state.items.length} failedEnrichCodes=${state.progress.failedEnrichCodes.length} enriched=${enrichedCount} apiCalls=${state.progress.counters.apiCalls} apiRetries=${state.progress.counters.apiRetries}`
                );
                processedSinceFlush = 0;
            }
        }

        state.progress.phase = 'done';
        logger.info(
            `enrich finish runId=${runId} cursor=${state.progress.enrichCursor} failedEnrichCodes=${state.progress.failedEnrichCodes.length} enriched=${enrichedCount}`
        );
    }

    updateItemsFromMap(state, itemsByCode, config);
    state.stats.durationMs = Math.max(0, Date.now() - state.startedAtMs);
    state.generatedAt = getNowSeconds();
    state.lastBuildDate = state.date;
    state.status =
        state.progress.failedKeywords.length > 0 ||
        state.progress.failedEnrichCodes.length > 0
            ? 'partial_failed'
            : 'done';

    saveBuildingScheduleState(scheduleFilePath, state);
    logger.info(
        `done runId=${runId} status=${state.status} durationMs=${state.stats.durationMs} rawItems=${state.stats.rawItems} uniqueItems=${state.stats.uniqueItems} newlyAdded=${newlyAddedCount} reusedRouteInfo=${reusedRouteInfoCount} enriched=${enrichedCount} failedKeywords=${state.progress.failedKeywords.length} failedEnrichCodes=${state.progress.failedEnrichCodes.length} apiCalls=${state.progress.counters.apiCalls} apiRetries=${state.progress.counters.apiRetries}`
    );
}

export default async function runScheduleProbe(
    scheduleFilePath: string,
    state: ScheduleState,
    config: ScheduleProbeRuntimeConfig,
    runId: string,
    preservedItemsByCode?: Map<string, ScheduleItem>
): Promise<void> {
    return runWith12306TraceScope(
        {
            traceKey: `build-schedule:${runId}`,
            traceTitle: `运行图探测 ${state.date}`,
            traceSubtitle: 'runScheduleProbe'
        },
        async () =>
            with12306TraceFunction<void>(
                {
                    title: '运行图探测',
                    functionName: 'runScheduleProbe',
                    context: {
                        runId,
                        date: state.date,
                        file: scheduleFilePath,
                        phase: state.progress.phase
                    }
                },
                async () => {
                    await runScheduleProbeInternal(
                        scheduleFilePath,
                        state,
                        config,
                        runId,
                        preservedItemsByCode
                    );
                    record12306TraceSummary({
                        title: '运行图探测完成',
                        status: state.status === 'done' ? 'success' : 'warning',
                        level: state.status === 'done' ? 'INFO' : 'WARN',
                        message: '完成 runScheduleProbe',
                        context: {
                            runId,
                            status: state.status,
                            rawItems: state.stats.rawItems,
                            uniqueItems: state.stats.uniqueItems,
                            failedKeywords:
                                state.progress.failedKeywords.length,
                            failedEnrichCodes:
                                state.progress.failedEnrichCodes.length,
                            apiCalls: state.progress.counters.apiCalls,
                            apiRetries: state.progress.counters.apiRetries
                        }
                    });
                }
            )
    );
}
