import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import { syncCurrentDayTimetableIdsForTrainCodes } from '~/server/services/currentDayTimetableIdSync';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import { syncConfirmedTimetableHistoryForScheduleStateKind } from '~/server/services/timetableHistoryStore';
import {
    markCurrentTrainProvenanceTaskSkipped,
    recordCurrentStationPlatformRefreshResults,
    recordCurrentTrainProvenanceEventsForTrainCodes
} from '~/server/services/trainProvenanceRecorder';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import fetchRouteInfo from '~/server/utils/12306/network/fetchRouteInfo';
import queryWithRetry from '~/server/utils/12306/scheduleProbe/queryWithRetry';
import { normalizeRouteGroupDayOffsets } from '~/server/utils/12306/scheduleProbe/normalizeRouteDayOffsets';
import {
    buildCodeIndex,
    buildGroupIndex,
    getGroupKey
} from '~/server/utils/12306/scheduleProbe/taskHelpers';
import {
    toScheduleStationMap,
    toScheduleStops
} from '~/server/utils/12306/scheduleProbe/mapRouteStops';
import uniqueNormalizedCodes from '~/server/utils/12306/uniqueNormalizedCodes';
import { appendRouteRefreshQueueTrainCodes } from '~/server/utils/12306/scheduleProbe/stateStore';
import { LEGACY_SCHEDULE_JSON_PATH } from '~/server/utils/12306/scheduleProbe/constants';
import {
    getScheduleDatabaseFilePath,
    listScheduleCandidateItemRecordsForCodes,
    loadScheduleStateSummaryByKind,
    savePublishedScheduleItemsIncrementally,
    type ScheduleItemRecord
} from '~/server/utils/12306/scheduleProbe/sqliteStore';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import {
    createEmptyStationPlatformInfoRefreshResult,
    forceRefreshStationPlatformInfoForTrainCodes,
    refreshStationPlatformInfoForTrainCodes
} from '~/server/services/stationPlatformInfoService';
import {
    toShanghaiDayOffsetFromUnixSeconds,
    toUnixSecondsFromShanghaiDayOffset
} from '~/server/utils/date/shanghaiDateTime';
import type {
    ScheduleItem,
    ScheduleState,
    ScheduleStationMap
} from '~/server/utils/12306/scheduleProbe/types';

export const REFRESH_ROUTE_BATCH_TASK_EXECUTOR = 'refresh_route_batch';

const logger = getLogger('task-executor:refresh-route-batch');

let registered = false;

interface RefreshRouteBatchTaskArgs {
    codes: string[];
}

export interface RefreshRouteBatchResult {
    processed: number;
    success: number;
    failed: number;
    changed: number;
    totalAttempts: number;
}

interface RefreshRouteGroupUpdate {
    changed: boolean;
    attempts: number;
    codes: string[];
    allCodes: string[];
    bureauCode: string;
    trainStyle: string;
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

type ScheduleStop = ScheduleState['items'][number]['stops'][number];

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

function getStopPrimaryMetadataKey(stop: ScheduleStop) {
    const stationTelecode = normalizeCode(stop.stationTelecode);
    const stationTrainCode = normalizeCode(stop.stationTrainCode);
    if (stationTelecode.length === 0 || stationTrainCode.length === 0) {
        return '';
    }

    return `${stationTelecode}:${stationTrainCode}`;
}

function getStopFallbackMetadataKey(stop: ScheduleStop) {
    const stationName = stop.stationName.trim();
    if (stationName.length === 0) {
        return '';
    }

    return `${stop.stationNo}:${stationName}`;
}

function indexStopsByMetadataKey(stops: readonly ScheduleStop[]) {
    const primary = new Map<string, ScheduleStop>();
    const fallback = new Map<string, ScheduleStop>();

    for (const stop of stops) {
        const primaryKey = getStopPrimaryMetadataKey(stop);
        if (primaryKey.length > 0 && !primary.has(primaryKey)) {
            primary.set(primaryKey, stop);
        }

        const fallbackKey = getStopFallbackMetadataKey(stop);
        if (fallbackKey.length > 0 && !fallback.has(fallbackKey)) {
            fallback.set(fallbackKey, stop);
        }
    }

    return { primary, fallback };
}

function findExistingStopMetadata(
    indexes: ReturnType<typeof indexStopsByMetadataKey>,
    stop: ScheduleStop
) {
    const primaryKey = getStopPrimaryMetadataKey(stop);
    if (primaryKey.length > 0) {
        const existingStop = indexes.primary.get(primaryKey);
        if (existingStop) {
            return existingStop;
        }
    }

    const fallbackKey = getStopFallbackMetadataKey(stop);
    return fallbackKey.length > 0
        ? (indexes.fallback.get(fallbackKey) ?? null)
        : null;
}

function mergeStopMetadata(
    nextStops: readonly ScheduleStop[],
    existingStops: readonly ScheduleStop[]
): ScheduleStop[] {
    const indexes = indexStopsByMetadataKey(existingStops);

    return nextStops.map((stop) => {
        const existingStop = findExistingStopMetadata(indexes, stop);
        const distance = stop.distance ?? existingStop?.distance ?? null;
        const platformNo = stop.platformNo ?? existingStop?.platformNo ?? null;
        const stationPlatformInfoFetchedAt =
            stop.stationPlatformInfoFetchedAt ??
            existingStop?.stationPlatformInfoFetchedAt ??
            null;

        return {
            ...stop,
            ...(distance !== null ? { distance } : {}),
            ...(platformNo !== null ? { platformNo } : {}),
            ...(stationPlatformInfoFetchedAt !== null
                ? { stationPlatformInfoFetchedAt }
                : {})
        };
    });
}

function applyGroupUpdate(
    items: ScheduleState['items'],
    update: RefreshRouteGroupUpdate
): boolean {
    const codeIndex = buildCodeIndex(items);
    let applied = false;
    for (const code of update.codes) {
        const itemIndex = codeIndex.get(code);
        if (itemIndex === undefined) {
            continue;
        }

        const item = items[itemIndex]!;
        item.allCodes = [...update.allCodes];
        item.bureauCode = update.bureauCode;
        item.trainStyle = update.trainStyle;
        item.trainDepartment = update.trainDepartment;
        item.passengerDepartment = update.passengerDepartment;
        item.startStation = update.startStation;
        item.endStation = update.endStation;
        item.startAt = update.startAt;
        item.endAt = update.endAt;
        item.lastRouteRefreshAt = update.lastRouteRefreshAt;
        item.stops = mergeStopMetadata(update.stops, item.stops);
        if (item.internalCode.length === 0 && update.internalCode.length > 0) {
            item.internalCode = update.internalCode;
        }
        applied = true;
    }

    return applied;
}

function getRefreshRouteGroupTrainCodes(update: RefreshRouteGroupUpdate) {
    return uniqueNormalizedCodes([...update.codes, ...update.allCodes]);
}

function recordRefreshRouteGroupSucceeded(
    serviceDate: string,
    requestedCodes: string[],
    update: RefreshRouteGroupUpdate
) {
    const trainCodes = getRefreshRouteGroupTrainCodes(update);
    recordCurrentTrainProvenanceEventsForTrainCodes(trainCodes, {
        serviceDate,
        startAt: toUnixSecondsFromShanghaiDayOffset(
            serviceDate,
            update.startAt
        ),
        eventType: 'route_refresh_succeeded',
        result: update.changed ? 'changed' : 'unchanged',
        payload: {
            requestedCodes,
            attempts: update.attempts,
            startStation: update.startStation,
            endStation: update.endStation,
            endAt: toUnixSecondsFromShanghaiDayOffset(
                serviceDate,
                update.endAt
            ),
            allTrainCodes: trainCodes,
            bureauCode: update.bureauCode,
            internalCode: update.internalCode
        }
    });
}

function recordRefreshRouteGroupFailed(
    serviceDate: string,
    requestedCodes: string[],
    update: RefreshRouteGroupUpdate,
    result: string,
    errorMessage = ''
) {
    recordCurrentTrainProvenanceEventsForTrainCodes(
        getRefreshRouteGroupTrainCodes(update),
        {
            serviceDate,
            startAt: toUnixSecondsFromShanghaiDayOffset(
                serviceDate,
                update.startAt
            ),
            eventType: 'route_refresh_failed',
            result,
            payload: {
                requestedCodes,
                attempts: update.attempts,
                allTrainCodes: getRefreshRouteGroupTrainCodes(update),
                internalCode: update.internalCode,
                errorMessage: errorMessage.trim().slice(0, 500)
            }
        }
    );
}

export async function refreshRouteBatchForCodes(
    codes: readonly string[]
): Promise<RefreshRouteBatchResult> {
    const config = useConfig();
    const retryAttempts = config.spider.scheduleProbe.retryAttempts;
    const requestedCodes = uniqueNormalizedCodes([...codes]);
    if (requestedCodes.length === 0) {
        markCurrentTrainProvenanceTaskSkipped('empty_codes');
        logger.info('skip empty_codes');
        return {
            processed: 0,
            success: 0,
            failed: 0,
            changed: 0,
            totalAttempts: 0
        };
    }

    const scheduleStorePath = LEGACY_SCHEDULE_JSON_PATH;
    const scheduleFilePath = getScheduleDatabaseFilePath();
    const published = loadScheduleStateSummaryByKind('published');
    if (!published) {
        markCurrentTrainProvenanceTaskSkipped('schedule_not_found');
        logger.warn(`skip schedule_not_found file=${scheduleFilePath}`);
        return {
            processed: 0,
            success: 0,
            failed: 0,
            changed: 0,
            totalAttempts: 0
        };
    }
    const currentDate = getCurrentDateString();
    if (published.date !== currentDate) {
        markCurrentTrainProvenanceTaskSkipped('schedule_not_current');
        logger.warn(
            `skip_non_current_schedule scheduleDate=${published.date} currentDate=${currentDate} file=${scheduleFilePath}`
        );
        return {
            processed: 0,
            success: 0,
            failed: 0,
            changed: 0,
            totalAttempts: 0
        };
    }

    const initialRecords = listScheduleCandidateItemRecordsForCodes(
        'published',
        { aliasCodes: requestedCodes }
    );
    const groupInternalCodes = uniqueNormalizedCodes(
        initialRecords.map((record) => record.item.internalCode)
    );
    const targetRecords = listScheduleCandidateItemRecordsForCodes(
        'published',
        {
            aliasCodes: requestedCodes,
            internalCodes: groupInternalCodes
        }
    );
    const targetItems = targetRecords.map((record) => record.item);
    const groupIndex = buildGroupIndex(targetItems);
    const codeIndex = buildCodeIndex(targetItems);
    const processedGroups = new Set<string>();
    const groupUpdates: RefreshRouteGroupUpdate[] = [];
    let processed = 0;
    let success = 0;
    let failed = 0;
    let changed = 0;
    let totalAttempts = 0;
    let mutated = false;
    let stationUpdates: ScheduleStationMap = {};

    for (const code of requestedCodes) {
        const itemIndex = codeIndex.get(code);
        if (itemIndex === undefined) {
            continue;
        }

        const item = targetItems[itemIndex]!;
        const groupKey = getGroupKey(item);
        if (processedGroups.has(groupKey)) {
            continue;
        }
        processedGroups.add(groupKey);
        processed += 1;

        const groupItemIndexes = groupIndex.get(groupKey) ?? [itemIndex];
        const routeResult = await queryWithRetry(
            () => fetchRouteInfo(item.code),
            retryAttempts,
            (result) => result.status === 'request_failed'
        );
        totalAttempts += routeResult.attempts;

        if (!routeResult.ok || routeResult.data.status !== 'running') {
            failed += 1;
            recordCurrentTrainProvenanceEventsForTrainCodes(
                [item.code, ...item.allCodes],
                {
                    serviceDate: published.date,
                    startAt:
                        item.startAt === null
                            ? null
                            : toUnixSecondsFromShanghaiDayOffset(
                                  published.date,
                                  item.startAt
                              ),
                    eventType: 'route_refresh_failed',
                    result: routeResult.ok
                        ? routeResult.data.status
                        : 'request_failed',
                    payload: {
                        requestedCodes,
                        attempts: routeResult.attempts,
                        groupCodes: [item.code, ...item.allCodes]
                    }
                }
            );
            logger.debug(
                `refresh_failed code=${item.code} attempts=${routeResult.attempts} groupSize=${groupItemIndexes.length}`
            );
            continue;
        }

        const nextStartAt = toShanghaiDayOffsetFromUnixSeconds(
            published.date,
            routeResult.data.route.startAt
        );
        const nextEndAt = toShanghaiDayOffsetFromUnixSeconds(
            published.date,
            routeResult.data.route.endAt
        );
        const nextStartStation = routeResult.data.route.startStation.trim();
        const nextEndStation = routeResult.data.route.endStation.trim();
        const refreshedAt = getNowSeconds();
        const refreshedInternalCode =
            routeResult.data.route.internalCode.trim();
        const nextAllCodes = [...routeResult.data.route.allCodes];
        const nextBureauCode = routeResult.data.route.bureauCode.trim();
        const nextTrainStyle = routeResult.data.route.trainStyle.trim();
        const nextTrainDepartment =
            routeResult.data.route.trainDepartment.trim();
        const nextPassengerDepartment =
            routeResult.data.route.passengerDepartment.trim();
        const nextStops = toScheduleStops(
            published.date,
            routeResult.data.route.stops
        );
        const normalizedRoute: ScheduleItem = {
            ...item,
            startAt: nextStartAt,
            endAt: nextEndAt,
            stops: nextStops.map((stop) => ({ ...stop }))
        };
        const shiftSeconds = normalizeRouteGroupDayOffsets([normalizedRoute]);
        if (shiftSeconds > 0) {
            logger.info(
                `normalize_route_day_offsets groupKey=${groupKey} trainCode=${item.code} shiftSeconds=${shiftSeconds} groupSize=${groupItemIndexes.length}`
            );
        }
        const normalizedStartAt = normalizedRoute.startAt;
        const normalizedEndAt = normalizedRoute.endAt;
        const normalizedStops = normalizedRoute.stops;
        if (normalizedStartAt === null || normalizedEndAt === null) {
            throw new Error('refreshed route must have start and end times');
        }
        stationUpdates = {
            ...stationUpdates,
            ...(await toScheduleStationMap(routeResult.data.route.stops))
        };
        let groupChanged = false;
        const appliedGroupStops = new Map<number, ScheduleStop[]>();
        for (const index of groupItemIndexes) {
            const groupItem = targetItems[index]!;
            const mergedStops = mergeStopMetadata(
                normalizedStops,
                groupItem.stops
            );
            appliedGroupStops.set(index, mergedStops);
            if (
                groupItem.allCodes.join('/') !== nextAllCodes.join('/') ||
                groupItem.bureauCode !== nextBureauCode ||
                groupItem.trainStyle !== nextTrainStyle ||
                groupItem.trainDepartment !== nextTrainDepartment ||
                groupItem.passengerDepartment !== nextPassengerDepartment ||
                groupItem.startStation !== nextStartStation ||
                groupItem.endStation !== nextEndStation ||
                groupItem.startAt !== normalizedStartAt ||
                groupItem.endAt !== normalizedEndAt ||
                JSON.stringify(groupItem.stops) !== JSON.stringify(mergedStops)
            ) {
                groupChanged = true;
            }
            groupItem.allCodes = [...nextAllCodes];
            groupItem.bureauCode = nextBureauCode;
            groupItem.trainStyle = nextTrainStyle;
            groupItem.trainDepartment = nextTrainDepartment;
            groupItem.passengerDepartment = nextPassengerDepartment;
            groupItem.startStation = nextStartStation;
            groupItem.endStation = nextEndStation;
            groupItem.startAt = normalizedStartAt;
            groupItem.endAt = normalizedEndAt;
            groupItem.lastRouteRefreshAt = refreshedAt;
            groupItem.stops = mergedStops.map((stop) => ({
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
            changed: groupChanged,
            attempts: routeResult.attempts,
            codes: groupItemIndexes.map((index) =>
                normalizeCode(targetItems[index]!.code)
            ),
            allCodes: nextAllCodes,
            bureauCode: nextBureauCode,
            trainStyle: nextTrainStyle,
            trainDepartment: nextTrainDepartment,
            passengerDepartment: nextPassengerDepartment,
            startStation: nextStartStation,
            endStation: nextEndStation,
            startAt: normalizedStartAt,
            endAt: normalizedEndAt,
            lastRouteRefreshAt: refreshedAt,
            internalCode: refreshedInternalCode,
            stops:
                appliedGroupStops.get(groupItemIndexes[0]!) ??
                nextStops.map((stop) => ({
                    ...stop
                }))
        });
        if (groupChanged) {
            changed += 1;
        }
    }

    if (mutated) {
        const updatedCodes = uniqueNormalizedCodes(
            groupUpdates.flatMap((update) => update.codes)
        );
        const latestRecords = listScheduleCandidateItemRecordsForCodes(
            'published',
            { aliasCodes: updatedCodes }
        );
        const latestItems = latestRecords.map((record) => record.item);
        const appliedGroupUpdates: RefreshRouteGroupUpdate[] = [];
        const appliedChangedGroupUpdates: RefreshRouteGroupUpdate[] = [];
        const appliedConfirmedTrainCodes: string[] = [];
        for (const update of groupUpdates) {
            if (applyGroupUpdate(latestItems, update)) {
                appliedGroupUpdates.push(update);
                appliedConfirmedTrainCodes.push(...update.codes);
                if (update.changed) {
                    appliedChangedGroupUpdates.push(update);
                }
            } else {
                recordRefreshRouteGroupFailed(
                    published.date,
                    requestedCodes,
                    update,
                    'schedule_target_missing'
                );
            }
        }
        if (appliedGroupUpdates.length > 0) {
            const itemIndexByCode = new Map(
                latestRecords.map((record) => [
                    normalizeCode(record.item.code),
                    record.itemIndex
                ])
            );
            const recordsToSave: ScheduleItemRecord[] = latestItems.map(
                (item) => ({
                    itemIndex: itemIndexByCode.get(normalizeCode(item.code))!,
                    item
                })
            );
            const persistStartedAtMs = Date.now();
            let persistResult;
            try {
                persistResult = savePublishedScheduleItemsIncrementally(
                    published.date,
                    recordsToSave,
                    stationUpdates
                );
            } catch (error) {
                const message =
                    error instanceof Error
                        ? `${error.name}: ${error.message}`
                        : String(error);
                for (const update of appliedGroupUpdates) {
                    recordRefreshRouteGroupFailed(
                        published.date,
                        requestedCodes,
                        update,
                        'persist_failed',
                        message
                    );
                }
                throw error;
            }
            const persistDurationMs = Date.now() - persistStartedAtMs;
            logger.info(
                `incremental_save status=${persistResult.status} expectedDate=${published.date} currentDate=${persistResult.currentDate ?? 'null'} items=${persistResult.itemCount} aliases=${persistResult.aliasCount} stops=${persistResult.stopCount} stations=${persistResult.stationCount} durationMs=${persistDurationMs}`
            );

            if (persistResult.status === 'saved') {
                for (const update of appliedGroupUpdates) {
                    recordRefreshRouteGroupSucceeded(
                        published.date,
                        requestedCodes,
                        update
                    );
                }
                const stationPlatformRefreshBatches = [
                    {
                        reason: 'route_changed',
                        updates: appliedChangedGroupUpdates,
                        refresh: forceRefreshStationPlatformInfoForTrainCodes
                    },
                    {
                        reason: 'cache_expired',
                        updates: appliedGroupUpdates.filter(
                            (update) => !update.changed
                        ),
                        refresh: refreshStationPlatformInfoForTrainCodes
                    }
                ];
                for (const batch of stationPlatformRefreshBatches) {
                    const trainCodes = uniqueNormalizedCodes(
                        batch.updates.flatMap((update) => update.codes)
                    );
                    if (trainCodes.length === 0) {
                        continue;
                    }

                    const fallbackRouteReferences = batch.updates.map(
                        (update) => ({
                            trainCodes: getRefreshRouteGroupTrainCodes(update),
                            startAt: toUnixSecondsFromShanghaiDayOffset(
                                published.date,
                                update.startAt
                            )
                        })
                    );
                    try {
                        const stationPlatformResult = await batch.refresh({
                            serviceDate: published.date,
                            trainCodes
                        });
                        recordCurrentStationPlatformRefreshResults({
                            serviceDate: published.date,
                            trigger: 'route_refresh',
                            result: stationPlatformResult,
                            fallbackRouteReferences
                        });
                        logger.info(
                            `station_platform_info_refresh date=${published.date} reason=${batch.reason} trainCodes=${trainCodes.length} localRows=${stationPlatformResult.localRowCount} candidates=${stationPlatformResult.candidateCount} cacheHits=${stationPlatformResult.cacheHitCount} requests=${stationPlatformResult.requestCount} data=${stationPlatformResult.dataCount} failedTrains=${stationPlatformResult.failedTrainCount} cacheFallbacks=${stationPlatformResult.cacheFallbackCount} updatedCacheEntries=${stationPlatformResult.updatedCacheEntryCount} updatedStops=${stationPlatformResult.updatedStopCount}`
                        );
                    } catch (error) {
                        const message =
                            error instanceof Error
                                ? `${error.name}: ${error.message}`
                                : String(error);
                        recordCurrentStationPlatformRefreshResults({
                            serviceDate: published.date,
                            trigger: 'route_refresh',
                            result: createEmptyStationPlatformInfoRefreshResult(),
                            fallbackRouteReferences,
                            errorMessage: message
                        });
                        logger.warn(
                            `station_platform_info_refresh_failed date=${published.date} reason=${batch.reason} trainCodes=${trainCodes.length} error=${message}`
                        );
                    }
                }

                const syncResult =
                    syncConfirmedTimetableHistoryForScheduleStateKind(
                        'published',
                        published.date,
                        appliedConfirmedTrainCodes,
                        getNowSeconds()
                    );
                logger.info(
                    `history_sync date=${published.date} confirmedGroups=${syncResult.confirmedGroups} confirmedTrainCodes=${syncResult.confirmedTrainCodes} skippedGroups=${syncResult.skippedGroups} createdContents=${syncResult.createdContents} insertedCoverages=${syncResult.insertedCoverages} updatedCoverages=${syncResult.updatedCoverages} deletedCoverages=${syncResult.deletedCoverages} noopedCoverages=${syncResult.noopedCoverages}`
                );
                const appendedQueueEntries = appendRouteRefreshQueueTrainCodes(
                    scheduleStorePath,
                    published.date,
                    syncResult.routeRefreshTrainCodes,
                    getNowSeconds()
                );
                logger.info(
                    `route_refresh_queue_sync date=${published.date} candidates=${syncResult.routeRefreshTrainCodes.length} appended=${appendedQueueEntries.length}`
                );
                const timetableIdSyncResult =
                    syncCurrentDayTimetableIdsForTrainCodes(
                        published.date,
                        appliedConfirmedTrainCodes
                    );
                logger.info(
                    `timetable_id_sync date=${published.date} scannedTrainCodes=${timetableIdSyncResult.scannedTrainCodes} changedTrainCodes=${timetableIdSyncResult.changedTrainCodes} updatedDailyRows=${timetableIdSyncResult.updatedDailyRows} deletedDailyRows=${timetableIdSyncResult.deletedDailyRows} updatedProbeRows=${timetableIdSyncResult.updatedProbeRows} deletedProbeRows=${timetableIdSyncResult.deletedProbeRows}`
                );
            } else {
                for (const update of appliedGroupUpdates) {
                    recordRefreshRouteGroupFailed(
                        published.date,
                        requestedCodes,
                        update,
                        `persist_${persistResult.status}`
                    );
                }
                markCurrentTrainProvenanceTaskSkipped(
                    `incremental_save_${persistResult.status}`
                );
            }
        }
    }
    logger.info(
        `done processed=${processed} success=${success} failed=${failed} changed=${changed} apiCalls=${totalAttempts} file=${scheduleFilePath}`
    );
    return {
        processed,
        success,
        failed,
        changed,
        totalAttempts
    };
}

async function executeRefreshRouteBatchTaskInternal(rawArgs: unknown) {
    const batchSize = useConfig().spider.scheduleProbe.refresh.batchSize;
    const args = parseTaskArgs(rawArgs, batchSize);
    await refreshRouteBatchForCodes(args.codes);
}

async function executeRefreshRouteBatchTask(rawArgs: unknown) {
    await executeRefreshRouteBatchTaskInternal(rawArgs);
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
