import getLogger from '~/server/libs/log4js';
import fetchRouteInfo from '../fetchRouteInfo';
import queryTrainCodeThroughPrefix from '../queryTrainCodeThroughPrefix';
import { expandKeyword } from './prefixTree';
import { normalizeTrainCodeItems, sortScheduleItems } from './filterAndSort';
import queryWithRetry from './queryWithRetry';
import { saveScheduleState } from './stateStore';
import type { ScheduleFile, ScheduleItem, ScheduleProbeRuntimeConfig } from './types';

function pushUnique(list: string[], value: string): void {
    if (list.includes(value)) {
        return;
    }
    list.push(value);
}

function updateItemsFromMap(
    state: ScheduleFile,
    itemsByCode: Map<string, ScheduleItem>,
    config: ScheduleProbeRuntimeConfig
): void {
    state.items = sortScheduleItems(
        Array.from(itemsByCode.values()),
        config.prefixRules
    );
    state.stats.uniqueItems = state.items.length;
}

export default async function runScheduleProbe(
    scheduleFilePath: string,
    state: ScheduleFile,
    config: ScheduleProbeRuntimeConfig,
    runId: string
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
    logger.info(
        `[schedule-probe] run runId=${runId} phase=${state.progress.phase} existingItems=${state.items.length} discoverQueue=${state.progress.discoverQueue.length} discoverProcessed=${state.progress.discoverProcessed.length} enrichCursor=${state.progress.enrichCursor}`
    );

    if (state.progress.phase === 'discover') {
        logger.info(
            `[schedule-probe] discover start runId=${runId} queue=${state.progress.discoverQueue.length} processed=${state.progress.discoverProcessed.length} rawItems=${state.stats.rawItems} uniqueItems=${state.stats.uniqueItems}`
        );
        const processedSet = new Set(state.progress.discoverProcessed);
        const queuedSet = new Set(state.progress.discoverQueue);
        let processedSinceFlush = 0;

        while (state.progress.discoverQueue.length > 0) {
            const keyword = state.progress.discoverQueue.shift()!;
            queuedSet.delete(keyword);

            const searchResult = await queryWithRetry(
                () => queryTrainCodeThroughPrefix(keyword),
                config.retryAttempts
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
                        itemsByCode.set(item.code, item);
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
                    `[schedule-probe] discover failed runId=${runId} keyword=${keyword} attempts=${searchResult.attempts}`
                );
            }

            state.progress.discoverProcessed.push(keyword);
            processedSet.add(keyword);
            processedSinceFlush += 1;

            if (processedSinceFlush >= config.checkpointFlushEvery) {
                updateItemsFromMap(state, itemsByCode, config);
                saveScheduleState(scheduleFilePath, state);
                logger.info(
                    `[schedule-probe] discover checkpoint runId=${runId} processed=${state.progress.discoverProcessed.length} pending=${state.progress.discoverQueue.length} rawItems=${state.stats.rawItems} uniqueItems=${state.stats.uniqueItems} apiCalls=${state.progress.counters.apiCalls} apiRetries=${state.progress.counters.apiRetries}`
                );
                processedSinceFlush = 0;
            }
        }

        updateItemsFromMap(state, itemsByCode, config);
        state.progress.phase = 'enrich';
        state.progress.enrichCursor = Math.min(
            Math.max(0, state.progress.enrichCursor),
            state.items.length
        );
        saveScheduleState(scheduleFilePath, state);
        logger.info(
            `[schedule-probe] discover finish runId=${runId} processed=${state.progress.discoverProcessed.length} failedKeywords=${state.progress.failedKeywords.length} uniqueItems=${state.stats.uniqueItems}`
        );
    }

    if (state.progress.phase === 'enrich') {
        logger.info(
            `[schedule-probe] enrich start runId=${runId} totalItems=${state.items.length} fromCursor=${state.progress.enrichCursor}`
        );
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
            if (item.startAt !== null && item.endAt !== null) {
                state.progress.enrichCursor = index + 1;
                continue;
            }

            const routeResult = await queryWithRetry(
                () => fetchRouteInfo(item.code),
                config.retryAttempts
            );
            state.progress.counters.apiCalls += routeResult.attempts;
            state.progress.counters.apiRetries += Math.max(
                0,
                routeResult.attempts - 1
            );

            if (routeResult.ok) {
                item.startAt = routeResult.data.route.startAt;
                item.endAt = routeResult.data.route.endAt;
            } else {
                pushUnique(state.progress.failedEnrichCodes, item.code);
                logger.warn(
                    `[schedule-probe] enrich failed runId=${runId} trainCode=${item.code} attempts=${routeResult.attempts}`
                );
            }

            state.progress.enrichCursor = index + 1;
            processedSinceFlush += 1;

            if (processedSinceFlush >= config.checkpointFlushEvery) {
                saveScheduleState(scheduleFilePath, state);
                logger.info(
                    `[schedule-probe] enrich checkpoint runId=${runId} cursor=${state.progress.enrichCursor} totalItems=${state.items.length} failedEnrichCodes=${state.progress.failedEnrichCodes.length} apiCalls=${state.progress.counters.apiCalls} apiRetries=${state.progress.counters.apiRetries}`
                );
                processedSinceFlush = 0;
            }
        }

        state.progress.phase = 'done';
        logger.info(
            `[schedule-probe] enrich finish runId=${runId} cursor=${state.progress.enrichCursor} failedEnrichCodes=${state.progress.failedEnrichCodes.length}`
        );
    }

    updateItemsFromMap(state, itemsByCode, config);
    state.stats.durationMs = Math.max(0, Date.now() - state.startedAtMs);
    state.generatedAt = Math.floor(Date.now() / 1000);
    state.status =
        state.progress.failedKeywords.length > 0 ||
            state.progress.failedEnrichCodes.length > 0
            ? 'partial_failed'
            : 'done';

    saveScheduleState(scheduleFilePath, state);
    logger.info(
        `[schedule-probe] done runId=${runId} status=${state.status} durationMs=${state.stats.durationMs} rawItems=${state.stats.rawItems} uniqueItems=${state.stats.uniqueItems} failedKeywords=${state.progress.failedKeywords.length} failedEnrichCodes=${state.progress.failedEnrichCodes.length} apiCalls=${state.progress.counters.apiCalls} apiRetries=${state.progress.counters.apiRetries}`
    );
}
