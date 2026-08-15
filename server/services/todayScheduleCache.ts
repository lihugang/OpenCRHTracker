import getLogger from '~/server/libs/log4js';
import { buildTrainKey } from '~/server/services/probeRuntimeState';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import normalizeTimetableBoundaryStopTimes from '~/server/utils/12306/normalizeTimetableBoundaryStopTimes';
import { getScheduleStateVersion } from '~/server/utils/12306/scheduleProbe/stateStore';
import {
    listScheduleAliasesByStateKind,
    listScheduleItemRecordsByStateKind,
    loadScheduleItemCodeByStateKindAndAlias,
    loadScheduleItemByStateKindAndCode,
    listScheduleItemsByStateKind,
    listScheduleStopsByStateKindAndItemCode,
    listScheduleStopsByStateKindAndStationName,
    resolveActiveScheduleStateSummary,
    type ScheduleDbItemRow,
    type ScheduleDbStationStopRow,
    type ScheduleStateKind
} from '~/server/utils/12306/scheduleProbe/sqliteStore';
import { getRouteGroupDayOffsetShift } from '~/server/utils/12306/scheduleProbe/normalizeRouteDayOffsets';
import { getGroupKey } from '~/server/utils/12306/scheduleProbe/taskHelpers';
import {
    serviceDateToDay,
    serviceDayToShanghaiDayStartUnixSeconds,
    type ServiceDay
} from '~/server/utils/date/serviceDay';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import type { ScheduleStop } from '~/server/utils/12306/scheduleProbe/types';
import {
    formatExternalTrainCode,
    formatExternalServiceDate,
    parseExternalTrainCodeOrThrow
} from '~/server/utils/internal/boundaries';
import {
    trainCodeKey,
    type TrainCodeParts
} from '~/server/utils/12306/trainCode';

export interface TodayScheduleRoute {
    trainCode: TrainCodeParts;
    trainInternalCode: string;
    allCodes: TrainCodeParts[];
    bureauCode: string;
    trainStyle: string;
    trainDepartment: string;
    passengerDepartment: string;
    startAt: number;
    endAt: number;
    updatedAt: number | null;
    startStation: string;
    endStation: string;
}

export interface TodayScheduleStop {
    stationNo: number;
    stationName: string;
    stationTelecode: string;
    arriveAt: number | null;
    departAt: number | null;
    stationTrainCode: TrainCodeParts;
    wicket: string;
    distance: number | null;
    platformNo: number | null;
    isStart: boolean;
    isEnd: boolean;
}

export interface TodayScheduleTimetable extends TodayScheduleRoute {
    stops: TodayScheduleStop[];
}

export interface TodayScheduleProbeGroup extends TodayScheduleRoute {
    trainKey: string;
    allCodes: TrainCodeParts[];
}

export interface TodayScheduleStationIndexRow extends TodayScheduleRoute {
    trainKey: string;
    stationName: string;
    stationTelecode: string;
    stationNo: number;
    arriveAt: number | null;
    departAt: number | null;
    platformNo: number | null;
    isStart: boolean;
    isEnd: boolean;
    clockSortAt: number;
    sortAt: number;
    stableKey: string;
}

interface TodayScheduleCache {
    date: ServiceDay;
    activeStateKind: ScheduleStateKind | null;
    scheduleStateVersion: number;
    routesByTrainCode: Map<string, TodayScheduleRoute>;
    groupsByTrainKey: Map<string, TodayScheduleProbeGroup>;
    groupKeysByTrainCode: Map<string, string>;
    groupKeysByTrainInternalCode: Map<string, string>;
    dayOffsetShiftByItemCode: Map<string, number>;
}

let cached: TodayScheduleCache | null = null;
const logger = getLogger('today-schedule-cache');

function rebuildCache(): TodayScheduleCache {
    const currentDate = serviceDateToDay(getCurrentDateString());
    const routesByTrainCode = new Map<string, TodayScheduleRoute>();
    const groupsByTrainKey = new Map<string, TodayScheduleProbeGroup>();
    const groupKeysByTrainCode = new Map<string, string>();
    const groupKeysByTrainInternalCode = new Map<string, string>();
    const dayOffsetShiftByItemCode = new Map<string, number>();
    let activeStateKind: ScheduleStateKind | null = null;
    let activeDate: ServiceDay = currentDate;

    const activeSummary = resolveActiveScheduleStateSummary(
        formatExternalServiceDate(currentDate)
    );
    activeStateKind = activeSummary?.kind ?? null;
    activeDate = activeSummary?.date ?? currentDate;

    if (activeStateKind) {
        const items = listScheduleItemsByStateKind(activeStateKind);
        const itemGroups = new Map<string, ScheduleItem[]>();
        for (const record of listScheduleItemRecordsByStateKind(
            activeStateKind
        )) {
            const groupKey = getGroupKey(record.item);
            const groupItems = itemGroups.get(groupKey) ?? [];
            groupItems.push(record.item);
            itemGroups.set(groupKey, groupItems);
        }
        for (const [groupKey, groupItems] of itemGroups) {
            const shiftSeconds = getRouteGroupDayOffsetShift(groupItems);
            if (shiftSeconds > 0) {
                logger.warn(
                    `normalize_stored_route_day_offsets stateKind=${activeStateKind} groupKey=${groupKey} trainCode=${groupItems[0] ? trainCodeKey(groupItems[0].code) : 'unknown'} shiftSeconds=${shiftSeconds} groupSize=${groupItems.length}`
                );
            }
            for (const groupItem of groupItems) {
                dayOffsetShiftByItemCode.set(
                    trainCodeKey(groupItem.code),
                    shiftSeconds
                );
            }
        }
        const aliasesByItemCode =
            listScheduleAliasesByStateKind(activeStateKind);
        const scheduleItemIdentityIndex = buildScheduleItemIdentityIndex(items);

        for (const item of items) {
            const trainCode = parseExternalTrainCodeOrThrow(
                item.itemCode,
                'itemCode'
            );
            const trainCodeKeyValue = trainCodeKey(trainCode);
            if (trainCodeKeyValue.length === 0) {
                continue;
            }

            const aliases = [
                trainCode,
                ...(aliasesByItemCode.get(trainCodeKeyValue) ?? []).map(
                    (aliasCode) =>
                        parseExternalTrainCodeOrThrow(aliasCode, 'aliasCode')
                )
            ];
            const allCodes = normalizeAliasCodes(
                item,
                trainCode,
                aliases,
                scheduleItemIdentityIndex
            );
            const timetable = buildTimetableRouteFromItemRow(
                activeDate,
                item,
                allCodes,
                dayOffsetShiftByItemCode.get(trainCodeKeyValue) ?? 0
            );
            if (!timetable) {
                continue;
            }

            const trainKey = buildTrainKey(
                timetable.trainCode,
                timetable.trainInternalCode,
                timetable.startAt
            );
            upsertProbeGroup(groupsByTrainKey, trainKey, timetable);

            for (const aliasCode of timetable.allCodes) {
                const aliasKey = trainCodeKey(aliasCode);
                if (!routesByTrainCode.has(aliasKey)) {
                    routesByTrainCode.set(aliasKey, {
                        trainCode: timetable.trainCode,
                        trainInternalCode: timetable.trainInternalCode,
                        allCodes: timetable.allCodes,
                        bureauCode: timetable.bureauCode,
                        trainStyle: timetable.trainStyle,
                        trainDepartment: timetable.trainDepartment,
                        passengerDepartment: timetable.passengerDepartment,
                        startAt: timetable.startAt,
                        endAt: timetable.endAt,
                        updatedAt: timetable.updatedAt,
                        startStation: timetable.startStation,
                        endStation: timetable.endStation
                    });
                }

                groupKeysByTrainCode.set(aliasKey, trainKey);
            }

            if (
                timetable.trainInternalCode &&
                !groupKeysByTrainInternalCode.has(
                    normalizeCode(timetable.trainInternalCode)
                )
            ) {
                groupKeysByTrainInternalCode.set(
                    normalizeCode(timetable.trainInternalCode),
                    trainKey
                );
            }
        }
    }

    cached = {
        date: activeDate,
        activeStateKind,
        scheduleStateVersion: getScheduleStateVersion(),
        routesByTrainCode,
        groupsByTrainKey,
        groupKeysByTrainCode,
        groupKeysByTrainInternalCode,
        dayOffsetShiftByItemCode
    };
    return cached;
}

export function getTodayScheduleCache(): Map<string, TodayScheduleRoute> {
    if (cached && cached.scheduleStateVersion === getScheduleStateVersion()) {
        return cached.routesByTrainCode;
    }

    return rebuildCache().routesByTrainCode;
}

export function getTodayScheduleServiceDay(): ServiceDay {
    return getActiveCache().date;
}

export function getTodayScheduleProbeGroups(): Map<
    string,
    TodayScheduleProbeGroup
> {
    const activeCache = getActiveCache();
    return activeCache.groupsByTrainKey;
}

export function getTodayScheduleTimetableByTrainCode(
    trainCode: TrainCodeParts
): TodayScheduleTimetable | null {
    const activeCache = getActiveCache();
    const normalizedTrainCode = trainCodeKey(trainCode);
    if (activeCache.activeStateKind === null) {
        return null;
    }

    const route = activeCache.routesByTrainCode.get(normalizedTrainCode);
    if (!route) {
        return null;
    }

    const itemCode =
        loadScheduleItemCodeByStateKindAndAlias(
            activeCache.activeStateKind,
            trainCode
        ) ?? route.trainCode;
    const item = loadScheduleItemByStateKindAndCode(
        activeCache.activeStateKind,
        itemCode
    );
    if (!item) {
        return null;
    }

    const stops = normalizeTimetableBoundaryStopTimes(
        listScheduleStopsByStateKindAndItemCode(
            activeCache.activeStateKind,
            parseExternalTrainCodeOrThrow(item.itemCode, 'itemCode')
        )
    ).map((stop) =>
        toTodayScheduleStop(
            activeCache.date,
            stop,
            activeCache.dayOffsetShiftByItemCode.get(trainCodeKey(itemCode)) ??
                0
        )
    );

    return {
        ...route,
        stops
    };
}

export function getTodayStationTimetableByStationName(
    stationName: string
): TodayScheduleStationIndexRow[] {
    const activeCache = getActiveCache();
    const normalizedStationName = stationName.trim();
    if (
        normalizedStationName.length === 0 ||
        activeCache.activeStateKind === null
    ) {
        return [];
    }

    const stationRowsByStationName = new Map<
        string,
        TodayScheduleStationIndexRow[]
    >();
    const stationRowIndexesByStationName = new Map<
        string,
        Map<string, TodayScheduleStationIndexRow>
    >();

    for (const row of listScheduleStopsByStateKindAndStationName(
        activeCache.activeStateKind,
        normalizedStationName
    )) {
        const route = activeCache.routesByTrainCode.get(
            trainCodeKey(
                parseExternalTrainCodeOrThrow(row.itemCode, 'itemCode')
            )
        );
        if (!route) {
            continue;
        }

        const trainKey = buildTrainKey(
            route.trainCode,
            route.trainInternalCode,
            route.startAt
        );
        const group = activeCache.groupsByTrainKey.get(trainKey);
        if (!group) {
            continue;
        }

        upsertStationRow(
            stationRowsByStationName,
            stationRowIndexesByStationName,
            activeCache.date,
            normalizedStationName,
            group,
            {
                ...route,
                stops: []
            },
            toTodayScheduleStopFromStationRow(
                activeCache.date,
                row,
                activeCache.dayOffsetShiftByItemCode.get(
                    trainCodeKey(
                        parseExternalTrainCodeOrThrow(row.itemCode, 'itemCode')
                    )
                ) ?? 0
            )
        );
    }

    const rows = stationRowsByStationName.get(normalizedStationName) ?? [];
    for (const row of rows) {
        const activeGroup = activeCache.groupsByTrainKey.get(row.trainKey);
        if (activeGroup) {
            applyGroupToStationRow(row, activeGroup);
        }
    }

    rows.sort(compareStationRows);
    return rows;
}

export function getTodayScheduleProbeGroupByTrainCode(
    trainCode: TrainCodeParts
): TodayScheduleProbeGroup | null {
    const activeCache = getActiveCache();
    const normalizedTrainCode = trainCodeKey(trainCode);

    const trainKey = activeCache.groupKeysByTrainCode.get(normalizedTrainCode);
    if (!trainKey) {
        return null;
    }

    return activeCache.groupsByTrainKey.get(trainKey) ?? null;
}

export function getTodayScheduleProbeGroupByTrainInternalCode(
    trainInternalCode: string
): TodayScheduleProbeGroup | null {
    const activeCache = getActiveCache();
    const trainKey = activeCache.groupKeysByTrainInternalCode.get(
        normalizeCode(trainInternalCode)
    );
    if (!trainKey) {
        return null;
    }

    return activeCache.groupsByTrainKey.get(trainKey) ?? null;
}

export function getSafeTodayScheduleProbeTrainCodes(
    group: Pick<TodayScheduleProbeGroup, 'trainCode' | 'allCodes'>
): TrainCodeParts[] {
    const seen = new Set<string>();
    const result: TrainCodeParts[] = [];
    for (const code of [group.trainCode, ...group.allCodes]) {
        const key = trainCodeKey(code);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(code);
    }
    return result;
}

export function invalidateTodayScheduleCache(): void {
    cached = null;
}

function getActiveCache(): TodayScheduleCache {
    if (cached && cached.scheduleStateVersion === getScheduleStateVersion()) {
        return cached;
    }

    return rebuildCache();
}

interface ScheduleItemIdentityIndex {
    itemsByCode: Map<string, ScheduleDbItemRow>;
}

function buildScheduleItemIdentityIndex(
    items: ScheduleDbItemRow[]
): ScheduleItemIdentityIndex {
    const itemsByCode = new Map<string, ScheduleDbItemRow>();
    for (const item of items) {
        const trainCode = normalizeCode(item.itemCode);
        if (trainCode.length > 0 && !itemsByCode.has(trainCode)) {
            itemsByCode.set(trainCode, item);
        }
    }

    return {
        itemsByCode
    };
}

function hasMatchingFallbackRouteIdentity(
    sourceItem: ScheduleDbItemRow,
    aliasItem: ScheduleDbItemRow
): boolean {
    return (
        sourceItem.startAt !== null &&
        sourceItem.endAt !== null &&
        sourceItem.startAt === aliasItem.startAt &&
        sourceItem.endAt === aliasItem.endAt &&
        sourceItem.startStation.trim() === aliasItem.startStation.trim() &&
        sourceItem.endStation.trim() === aliasItem.endStation.trim()
    );
}

function isSafeScheduleAlias(
    sourceItem: ScheduleDbItemRow,
    aliasCode: TrainCodeParts,
    index: ScheduleItemIdentityIndex
): boolean {
    const sourceCode = trainCodeKey(
        parseExternalTrainCodeOrThrow(sourceItem.itemCode, 'itemCode')
    );
    const aliasCodeKey = trainCodeKey(aliasCode);
    if (aliasCodeKey === sourceCode) {
        return true;
    }

    const aliasItem = index.itemsByCode.get(aliasCodeKey);
    if (!aliasItem) {
        return true;
    }

    const sourceInternalCode = normalizeCode(sourceItem.internalCode);
    const aliasInternalCode = normalizeCode(aliasItem.internalCode);
    if (sourceInternalCode.length > 0 || aliasInternalCode.length > 0) {
        return (
            sourceInternalCode.length > 0 &&
            sourceInternalCode === aliasInternalCode
        );
    }

    return hasMatchingFallbackRouteIdentity(sourceItem, aliasItem);
}

function logUnsafeScheduleAlias(
    sourceItem: ScheduleDbItemRow,
    aliasCode: TrainCodeParts,
    index: ScheduleItemIdentityIndex
): void {
    const aliasCodeKey = trainCodeKey(aliasCode);
    const aliasItem = index.itemsByCode.get(aliasCodeKey);
    logger.warn(
        `drop_unsafe_schedule_alias sourceCode=${sourceItem.itemCode} aliasCode=${aliasCodeKey} sourceInternalCode=${sourceItem.internalCode} aliasInternalCode=${aliasItem?.internalCode ?? ''} sourceStartAt=${sourceItem.startAt ?? 'null'} aliasStartAt=${aliasItem?.startAt ?? 'null'} sourceRoute=${sourceItem.startStation.trim()}-${sourceItem.endStation.trim()} aliasRoute=${aliasItem ? `${aliasItem.startStation.trim()}-${aliasItem.endStation.trim()}` : 'unknown'}`
    );
}

function normalizeAliasCodes(
    item: ScheduleDbItemRow,
    trainCode: TrainCodeParts,
    aliases: TrainCodeParts[],
    index: ScheduleItemIdentityIndex
): TrainCodeParts[] {
    const codes = new Map<string, TrainCodeParts>();
    codes.set(trainCodeKey(trainCode), trainCode);

    for (const value of aliases) {
        const normalizedKey = trainCodeKey(value);
        if (normalizedKey.length === 0) {
            continue;
        }

        if (!isSafeScheduleAlias(item, value, index)) {
            logUnsafeScheduleAlias(item, value, index);
            continue;
        }

        codes.set(normalizedKey, value);
    }

    return [...codes.values()];
}

function buildTimetableRouteFromItemRow(
    date: ServiceDay,
    item: ScheduleDbItemRow,
    allCodes: TrainCodeParts[],
    shiftSeconds: number
): TodayScheduleTimetable | null {
    if (item.startAt === null || item.endAt === null) {
        return null;
    }

    const trainCode = parseExternalTrainCodeOrThrow(item.itemCode, 'itemCode');
    if (trainCodeKey(trainCode).length === 0) {
        return null;
    }
    const dayStartAt = serviceDayToShanghaiDayStartUnixSeconds(date);

    return {
        trainCode,
        trainInternalCode: item.internalCode,
        allCodes,
        bureauCode: item.bureauCode.trim(),
        trainStyle: item.trainStyle.trim(),
        trainDepartment: item.trainDepartment.trim(),
        passengerDepartment: item.passengerDepartment.trim(),
        startAt: dayStartAt + item.startAt + shiftSeconds,
        endAt: dayStartAt + item.endAt + shiftSeconds,
        updatedAt: item.lastRouteRefreshAt,
        startStation: item.startStation.trim(),
        endStation: item.endStation.trim(),
        stops: []
    };
}

function toTodayScheduleStop(
    date: ServiceDay,
    stop: ScheduleStop,
    shiftSeconds = 0
): TodayScheduleStop {
    const dayStartAt = serviceDayToShanghaiDayStartUnixSeconds(date);
    return {
        stationNo: stop.stationNo,
        stationName: stop.stationName.trim(),
        stationTelecode: normalizeCode(stop.stationTelecode),
        arriveAt:
            stop.arriveAt === null
                ? null
                : dayStartAt + stop.arriveAt + shiftSeconds,
        departAt:
            stop.departAt === null
                ? null
                : dayStartAt + stop.departAt + shiftSeconds,
        stationTrainCode: stop.stationTrainCode,
        wicket: stop.wicket.trim(),
        distance: stop.distance ?? null,
        platformNo: stop.platformNo ?? null,
        isStart: stop.isStart,
        isEnd: stop.isEnd
    };
}

function toTodayScheduleStopFromStationRow(
    date: ServiceDay,
    row: ScheduleDbStationStopRow,
    shiftSeconds: number
): TodayScheduleStop {
    const isStart = row.isStart === 1;
    const isEnd = row.isEnd === 1;
    const dayStartAt = serviceDayToShanghaiDayStartUnixSeconds(date);

    return {
        stationNo: row.stationNo,
        stationName: row.stationName.trim(),
        stationTelecode: normalizeCode(row.stationTelecode),
        arriveAt:
            isStart || row.arriveAt === null
                ? null
                : dayStartAt + row.arriveAt + shiftSeconds,
        departAt:
            isEnd || row.departAt === null
                ? null
                : dayStartAt + row.departAt + shiftSeconds,
        stationTrainCode: parseExternalTrainCodeOrThrow(
            row.stationTrainCode,
            'stationTrainCode'
        ),
        wicket: row.wicket.trim(),
        distance: row.distance ?? null,
        platformNo: row.platformNo ?? null,
        isStart,
        isEnd
    };
}

function upsertProbeGroup(
    groupsByTrainKey: Map<string, TodayScheduleProbeGroup>,
    trainKey: string,
    timetable: TodayScheduleTimetable
): TodayScheduleProbeGroup {
    const existingGroup = groupsByTrainKey.get(trainKey);
    if (!existingGroup) {
        const nextGroup: TodayScheduleProbeGroup = {
            trainKey,
            trainCode: timetable.trainCode,
            trainInternalCode: timetable.trainInternalCode,
            allCodes: [...timetable.allCodes],
            bureauCode: timetable.bureauCode,
            trainStyle: timetable.trainStyle,
            trainDepartment: timetable.trainDepartment,
            passengerDepartment: timetable.passengerDepartment,
            startAt: timetable.startAt,
            endAt: timetable.endAt,
            updatedAt: timetable.updatedAt,
            startStation: timetable.startStation,
            endStation: timetable.endStation
        };
        groupsByTrainKey.set(trainKey, nextGroup);
        return nextGroup;
    }

    existingGroup.allCodes = mergeCodeLists(
        existingGroup.allCodes,
        timetable.allCodes
    );
    existingGroup.startAt = Math.min(existingGroup.startAt, timetable.startAt);
    existingGroup.endAt = Math.max(existingGroup.endAt, timetable.endAt);
    existingGroup.updatedAt = mergeNullableMax(
        existingGroup.updatedAt,
        timetable.updatedAt
    );
    existingGroup.bureauCode = pickPreferredText(
        existingGroup.bureauCode,
        timetable.bureauCode
    );
    existingGroup.trainStyle = pickPreferredText(
        existingGroup.trainStyle,
        timetable.trainStyle
    );
    existingGroup.trainDepartment = pickPreferredText(
        existingGroup.trainDepartment,
        timetable.trainDepartment
    );
    existingGroup.passengerDepartment = pickPreferredText(
        existingGroup.passengerDepartment,
        timetable.passengerDepartment
    );
    existingGroup.trainInternalCode = pickPreferredTrainCode(
        existingGroup.trainInternalCode,
        timetable.trainInternalCode
    );
    existingGroup.startStation = pickPreferredText(
        existingGroup.startStation,
        timetable.startStation
    );
    existingGroup.endStation = pickPreferredText(
        existingGroup.endStation,
        timetable.endStation
    );

    return existingGroup;
}

function upsertStationRow(
    stationRowsByStationName: Map<string, TodayScheduleStationIndexRow[]>,
    stationRowIndexesByStationName: Map<
        string,
        Map<string, TodayScheduleStationIndexRow>
    >,
    date: ServiceDay,
    stationName: string,
    group: TodayScheduleProbeGroup,
    timetable: TodayScheduleTimetable,
    stop: TodayScheduleStop
) {
    const sortAt = stop.arriveAt ?? stop.departAt ?? timetable.startAt;
    const clockSortAt = buildStationClockSortAt(date, sortAt);
    const aggregationKey = buildStationRowAggregationKey(
        group.trainKey,
        stop.stationNo,
        sortAt,
        timetable.startAt
    );
    const rowIndex =
        stationRowIndexesByStationName.get(stationName) ??
        new Map<string, TodayScheduleStationIndexRow>();
    const existingRow = rowIndex.get(aggregationKey);

    if (existingRow) {
        mergeStationRow(existingRow, date, group, timetable, stop);
        if (!stationRowIndexesByStationName.has(stationName)) {
            stationRowIndexesByStationName.set(stationName, rowIndex);
        }
        return;
    }

    const nextRow: TodayScheduleStationIndexRow = {
        trainKey: group.trainKey,
        trainCode: resolveStationDisplayTrainCode(
            stop.stationTrainCode,
            group.trainCode
        ),
        trainInternalCode: group.trainInternalCode,
        allCodes: [...group.allCodes],
        bureauCode: group.bureauCode,
        trainStyle: group.trainStyle,
        trainDepartment: group.trainDepartment,
        passengerDepartment: group.passengerDepartment,
        startAt: group.startAt,
        endAt: group.endAt,
        updatedAt: group.updatedAt,
        startStation: group.startStation,
        endStation: group.endStation,
        stationName,
        stationTelecode: normalizeCode(stop.stationTelecode),
        stationNo: stop.stationNo,
        arriveAt: stop.arriveAt,
        departAt: stop.departAt,
        platformNo: normalizePlatformNo(stop.platformNo),
        isStart: stop.isStart,
        isEnd: stop.isEnd,
        clockSortAt,
        sortAt,
        stableKey: aggregationKey
    };

    rowIndex.set(aggregationKey, nextRow);
    stationRowIndexesByStationName.set(stationName, rowIndex);

    const rows = stationRowsByStationName.get(stationName) ?? [];
    rows.push(nextRow);
    stationRowsByStationName.set(stationName, rows);
}

function buildStationRowAggregationKey(
    trainKey: string,
    stationNo: number,
    sortAt: number,
    startAt: number
) {
    return [trainKey, stationNo, sortAt, startAt].join(':');
}

function mergeStationRow(
    row: TodayScheduleStationIndexRow,
    date: ServiceDay,
    group: TodayScheduleProbeGroup,
    timetable: TodayScheduleTimetable,
    stop: TodayScheduleStop
) {
    applyGroupToStationRow(row, group);

    const normalizedStopTrainCode = stop.stationTrainCode;
    if (
        normalizedStopTrainCode.prefix.length > 0 ||
        normalizedStopTrainCode.number > 0
    ) {
        row.trainCode = normalizedStopTrainCode;
    }

    row.stationNo = Math.min(row.stationNo, stop.stationNo);
    row.stationTelecode =
        row.stationTelecode || normalizeCode(stop.stationTelecode);
    row.arriveAt = mergeNullableMin(row.arriveAt, stop.arriveAt);
    row.departAt = mergeNullableMax(row.departAt, stop.departAt);
    row.platformNo = row.platformNo ?? normalizePlatformNo(stop.platformNo);
    row.isStart = row.isStart || stop.isStart;
    row.isEnd = row.isEnd || stop.isEnd;
    row.sortAt = row.arriveAt ?? row.departAt ?? timetable.startAt;
    row.clockSortAt = buildStationClockSortAt(date, row.sortAt);
}

function normalizePlatformNo(platformNo: number | null): number | null {
    if (
        typeof platformNo !== 'number' ||
        !Number.isInteger(platformNo) ||
        platformNo <= 0
    ) {
        return null;
    }

    return platformNo;
}

function applyGroupToStationRow(
    row: TodayScheduleStationIndexRow,
    group: TodayScheduleProbeGroup
) {
    row.trainInternalCode = pickPreferredTrainCode(
        row.trainInternalCode,
        group.trainInternalCode
    );
    row.allCodes = mergeCodeLists(row.allCodes, group.allCodes);
    row.bureauCode = pickPreferredText(row.bureauCode, group.bureauCode);
    row.trainStyle = pickPreferredText(row.trainStyle, group.trainStyle);
    row.trainDepartment = pickPreferredText(
        row.trainDepartment,
        group.trainDepartment
    );
    row.passengerDepartment = pickPreferredText(
        row.passengerDepartment,
        group.passengerDepartment
    );
    row.startAt = Math.min(row.startAt, group.startAt);
    row.endAt = Math.max(row.endAt, group.endAt);
    row.updatedAt = mergeNullableMax(row.updatedAt, group.updatedAt);
    row.startStation = pickPreferredText(row.startStation, group.startStation);
    row.endStation = pickPreferredText(row.endStation, group.endStation);

    if (trainCodeKey(row.trainCode).length === 0) {
        row.trainCode = group.trainCode;
    }
}

function resolveStationDisplayTrainCode(
    stationTrainCode: TrainCodeParts,
    fallbackTrainCode: TrainCodeParts
): TrainCodeParts {
    if (stationTrainCode.prefix.length > 0 || stationTrainCode.number > 0) {
        return stationTrainCode;
    }

    return fallbackTrainCode;
}

function pickPreferredText(currentValue: string, nextValue: string) {
    return currentValue.length > 0 ? currentValue : nextValue.trim();
}

function pickPreferredTrainCode(
    currentValue: string,
    nextValue: string
): string {
    return currentValue.length > 0 ? currentValue : nextValue.trim();
}

function mergeCodeLists(
    leftCodes: TrainCodeParts[],
    rightCodes: TrainCodeParts[]
): TrainCodeParts[] {
    const mergedCodes = new Map<string, TrainCodeParts>();

    for (const code of leftCodes) {
        const key = trainCodeKey(code);
        if (key.length > 0) {
            mergedCodes.set(key, code);
        }
    }

    for (const code of rightCodes) {
        const key = trainCodeKey(code);
        if (key.length > 0) {
            mergedCodes.set(key, code);
        }
    }

    return [...mergedCodes.values()];
}

function mergeNullableMax(
    leftValue: number | null,
    rightValue: number | null
): number | null {
    if (leftValue === null) {
        return rightValue;
    }
    if (rightValue === null) {
        return leftValue;
    }

    return Math.max(leftValue, rightValue);
}

function mergeNullableMin(
    leftValue: number | null,
    rightValue: number | null
): number | null {
    if (leftValue === null) {
        return rightValue;
    }
    if (rightValue === null) {
        return leftValue;
    }

    return Math.min(leftValue, rightValue);
}

function buildStationClockSortAt(date: ServiceDay, sortAt: number) {
    const dayOffset = sortAt - serviceDayToShanghaiDayStartUnixSeconds(date);
    return ((dayOffset % 86400) + 86400) % 86400;
}

function compareStationRows(
    left: TodayScheduleStationIndexRow,
    right: TodayScheduleStationIndexRow
): number {
    if (left.clockSortAt !== right.clockSortAt) {
        return left.clockSortAt - right.clockSortAt;
    }

    if (left.sortAt !== right.sortAt) {
        return left.sortAt - right.sortAt;
    }

    const trainCodeDiff = formatExternalTrainCode(left.trainCode).localeCompare(
        formatExternalTrainCode(right.trainCode),
        'zh-Hans-CN'
    );
    if (trainCodeDiff !== 0) {
        return trainCodeDiff;
    }

    if (left.stationNo !== right.stationNo) {
        return left.stationNo - right.stationNo;
    }

    if (left.startAt !== right.startAt) {
        return left.startAt - right.startAt;
    }

    return left.stableKey.localeCompare(right.stableKey, 'zh-Hans-CN');
}
