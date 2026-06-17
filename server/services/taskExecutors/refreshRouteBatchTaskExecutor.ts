import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import { syncCurrentDayTimetableIdsForTrainCodes } from '~/server/services/currentDayTimetableIdSync';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import { syncConfirmedTimetableHistoryForPublishedState } from '~/server/services/timetableHistoryStore';
import {
    markCurrentTrainProvenanceTaskSkipped,
    recordCurrentTrainProvenanceEventsForTrainCodes
} from '~/server/services/trainProvenanceRecorder';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import fetchRouteInfo from '~/server/utils/12306/network/fetchRouteInfo';
import queryWithRetry from '~/server/utils/12306/scheduleProbe/queryWithRetry';
import {
    buildCodeIndex,
    buildGroupIndex,
    getGroupKey
} from '~/server/utils/12306/scheduleProbe/taskHelpers';
import {
    toScheduleStationMap,
    toScheduleStops
} from '~/server/utils/12306/scheduleProbe/mapRouteStops';
import {
    appendRouteRefreshQueueTrainCodes,
    loadPublishedScheduleState,
    savePublishedScheduleState
} from '~/server/utils/12306/scheduleProbe/stateStore';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import {
    toShanghaiDayOffsetFromUnixSeconds,
    toUnixSecondsFromShanghaiDayOffset
} from '~/server/utils/date/shanghaiDateTime';
import type {
    ScheduleState,
    ScheduleStationMap
} from '~/server/utils/12306/scheduleProbe/types';

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

        return {
            ...stop,
            ...(distance !== null ? { distance } : {}),
            ...(platformNo !== null ? { platformNo } : {})
        };
    });
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

async function executeRefreshRouteBatchTaskInternal(rawArgs: unknown) {
    const config = useConfig();
    const batchSize = config.spider.scheduleProbe.refresh.batchSize;
    const retryAttempts = config.spider.scheduleProbe.retryAttempts;
    const args = parseTaskArgs(rawArgs, batchSize);
    if (args.codes.length === 0) {
        markCurrentTrainProvenanceTaskSkipped('empty_codes');
        logger.info('skip empty_codes');
        return;
    }

    const scheduleFilePath = config.data.assets.schedule.file;
    const state = loadPublishedScheduleState(scheduleFilePath);
    if (!state) {
        markCurrentTrainProvenanceTaskSkipped('schedule_not_found');
        logger.warn(`skip schedule_not_found file=${scheduleFilePath}`);
        return;
    }
    const currentDate = getCurrentDateString();
    if (state.date !== currentDate) {
        markCurrentTrainProvenanceTaskSkipped('schedule_not_current');
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
    let stationUpdates: ScheduleStationMap = {};

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
            retryAttempts,
            (result) => result.status === 'request_failed'
        );
        totalAttempts += routeResult.attempts;

        if (!routeResult.ok || routeResult.data.status !== 'running') {
            failed += 1;
            recordCurrentTrainProvenanceEventsForTrainCodes(
                [item.code, ...item.allCodes],
                {
                    serviceDate: state.date,
                    startAt:
                        item.startAt === null
                            ? null
                            : toUnixSecondsFromShanghaiDayOffset(
                                  state.date,
                                  item.startAt
                              ),
                    eventType: 'route_refresh_failed',
                    result: routeResult.ok
                        ? routeResult.data.status
                        : 'request_failed',
                    payload: {
                        requestedCodes: args.codes,
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
        const nextTrainStyle = routeResult.data.route.trainStyle.trim();
        const nextTrainDepartment =
            routeResult.data.route.trainDepartment.trim();
        const nextPassengerDepartment =
            routeResult.data.route.passengerDepartment.trim();
        const nextStops = toScheduleStops(
            state.date,
            routeResult.data.route.stops
        );
        stationUpdates = {
            ...stationUpdates,
            ...(await toScheduleStationMap(routeResult.data.route.stops))
        };
        let groupChanged = false;
        const appliedGroupStops = new Map<number, ScheduleStop[]>();
        for (const index of groupItemIndexes) {
            const groupItem = state.items[index]!;
            const mergedStops = mergeStopMetadata(nextStops, groupItem.stops);
            appliedGroupStops.set(index, mergedStops);
            if (
                groupItem.allCodes.join('/') !== nextAllCodes.join('/') ||
                groupItem.bureauCode !== nextBureauCode ||
                groupItem.trainStyle !== nextTrainStyle ||
                groupItem.trainDepartment !== nextTrainDepartment ||
                groupItem.passengerDepartment !== nextPassengerDepartment ||
                groupItem.startStation !== nextStartStation ||
                groupItem.endStation !== nextEndStation ||
                groupItem.startAt !== nextStartAt ||
                groupItem.endAt !== nextEndAt ||
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
            groupItem.startAt = nextStartAt;
            groupItem.endAt = nextEndAt;
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
            codes: groupItemIndexes.map((index) =>
                normalizeCode(state.items[index]!.code)
            ),
            allCodes: nextAllCodes,
            bureauCode: nextBureauCode,
            trainStyle: nextTrainStyle,
            trainDepartment: nextTrainDepartment,
            passengerDepartment: nextPassengerDepartment,
            startStation: nextStartStation,
            endStation: nextEndStation,
            startAt: nextStartAt,
            endAt: nextEndAt,
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

        recordCurrentTrainProvenanceEventsForTrainCodes(nextAllCodes, {
            serviceDate: state.date,
            startAt: routeResult.data.route.startAt,
            eventType: 'route_refresh_succeeded',
            result: groupChanged ? 'changed' : 'unchanged',
            payload: {
                requestedCodes: args.codes,
                attempts: routeResult.attempts,
                startStation: nextStartStation,
                endStation: nextEndStation,
                endAt: routeResult.data.route.endAt,
                allTrainCodes: nextAllCodes,
                bureauCode: nextBureauCode,
                internalCode: refreshedInternalCode
            }
        });
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
            const appliedConfirmedTrainCodes: string[] = [];
            for (const update of groupUpdates) {
                if (applyGroupUpdate(latestState, update)) {
                    appliedGroups += 1;
                    appliedConfirmedTrainCodes.push(...update.codes);
                }
            }
            if (appliedGroups > 0) {
                savePublishedScheduleState(
                    scheduleFilePath,
                    latestState,
                    stationUpdates
                );
                const syncResult =
                    syncConfirmedTimetableHistoryForPublishedState(
                        latestState,
                        appliedConfirmedTrainCodes,
                        getNowSeconds()
                    );
                logger.info(
                    `history_sync date=${latestState.date} confirmedGroups=${syncResult.confirmedGroups} confirmedTrainCodes=${syncResult.confirmedTrainCodes} skippedGroups=${syncResult.skippedGroups} createdContents=${syncResult.createdContents} insertedCoverages=${syncResult.insertedCoverages} updatedCoverages=${syncResult.updatedCoverages} deletedCoverages=${syncResult.deletedCoverages} noopedCoverages=${syncResult.noopedCoverages}`
                );
                const appendedQueueEntries = appendRouteRefreshQueueTrainCodes(
                    scheduleFilePath,
                    latestState.date,
                    syncResult.routeRefreshTrainCodes,
                    getNowSeconds()
                );
                logger.info(
                    `route_refresh_queue_sync date=${latestState.date} candidates=${syncResult.routeRefreshTrainCodes.length} appended=${appendedQueueEntries.length}`
                );
                const timetableIdSyncResult =
                    syncCurrentDayTimetableIdsForTrainCodes(
                        latestState.date,
                        appliedConfirmedTrainCodes
                    );
                logger.info(
                    `timetable_id_sync date=${latestState.date} scannedTrainCodes=${timetableIdSyncResult.scannedTrainCodes} changedTrainCodes=${timetableIdSyncResult.changedTrainCodes} updatedDailyRows=${timetableIdSyncResult.updatedDailyRows} deletedDailyRows=${timetableIdSyncResult.deletedDailyRows} updatedProbeRows=${timetableIdSyncResult.updatedProbeRows} deletedProbeRows=${timetableIdSyncResult.deletedProbeRows}`
                );
            }
        }
    }
    logger.info(
        `done processed=${processed} success=${success} failed=${failed} changed=${changed} apiCalls=${totalAttempts} file=${scheduleFilePath}`
    );
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
