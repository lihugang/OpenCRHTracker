import getLogger from '~/server/libs/log4js';
import { buildTrainKey } from '~/server/services/probeRuntimeState';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import normalizeTimetableBoundaryStopTimes from '~/server/utils/12306/normalizeTimetableBoundaryStopTimes';
import {
    ensureScheduleDocumentMigrated,
    getScheduleStateVersion
} from '~/server/utils/12306/scheduleProbe/stateStore';
import {
    listScheduleAliasesByStateKind,
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
import {
    toShanghaiDayOffsetFromUnixSeconds,
    toUnixSecondsFromShanghaiDayOffset
} from '~/server/utils/date/shanghaiDateTime';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import type { ScheduleStop } from '~/server/utils/12306/scheduleProbe/types';

export interface TodayScheduleRoute {
    trainCode: string;
    trainInternalCode: string;
    allCodes: string[];
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
    arriveAt: number | null;
    departAt: number | null;
    stationTrainCode: string;
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
    allCodes: string[];
}

export interface TodayScheduleStationIndexRow extends TodayScheduleRoute {
    trainKey: string;
    stationName: string;
    stationNo: number;
    arriveAt: number | null;
    departAt: number | null;
    clockSortAt: number;
    sortAt: number;
    stableKey: string;
}

interface TodayScheduleCache {
    date: string;
    activeStateKind: ScheduleStateKind | null;
    scheduleStateVersion: number;
    routesByTrainCode: Map<string, TodayScheduleRoute>;
    groupsByTrainKey: Map<string, TodayScheduleProbeGroup>;
    groupKeysByTrainCode: Map<string, string>;
    groupKeysByTrainInternalCode: Map<string, string>;
}

let cached: TodayScheduleCache | null = null;
const logger = getLogger('today-schedule-cache');

function rebuildCache(): TodayScheduleCache {
    const currentDate = getCurrentDateString();
    const routesByTrainCode = new Map<string, TodayScheduleRoute>();
    const groupsByTrainKey = new Map<string, TodayScheduleProbeGroup>();
    const groupKeysByTrainCode = new Map<string, string>();
    const groupKeysByTrainInternalCode = new Map<string, string>();
    let activeStateKind: ScheduleStateKind | null = null;
    let activeDate = currentDate;

    if (ensureScheduleDocumentMigrated()) {
        const activeSummary = resolveActiveScheduleStateSummary(currentDate);
        activeStateKind = activeSummary?.kind ?? null;
        activeDate = activeSummary?.date ?? currentDate;
    }

    if (activeStateKind) {
        const items = listScheduleItemsByStateKind(activeStateKind);
        const aliasesByItemCode =
            listScheduleAliasesByStateKind(activeStateKind);
        const scheduleItemIdentityIndex = buildScheduleItemIdentityIndex(items);

        for (const item of items) {
            const trainCode = normalizeCode(item.itemCode);
            if (trainCode.length === 0) {
                continue;
            }

            const aliases = aliasesByItemCode.get(trainCode) ?? [trainCode];
            const allCodes = normalizeAliasCodes(
                item,
                trainCode,
                aliases,
                scheduleItemIdentityIndex
            );
            const timetable = buildTimetableRouteFromItemRow(
                activeDate,
                item,
                allCodes
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
                if (!routesByTrainCode.has(aliasCode)) {
                    routesByTrainCode.set(aliasCode, {
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

                groupKeysByTrainCode.set(aliasCode, trainKey);
            }

            if (
                timetable.trainInternalCode.length > 0 &&
                !groupKeysByTrainInternalCode.has(timetable.trainInternalCode)
            ) {
                groupKeysByTrainInternalCode.set(
                    timetable.trainInternalCode,
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
        groupKeysByTrainInternalCode
    };
    return cached;
}

export function getTodayScheduleCache(): Map<string, TodayScheduleRoute> {
    if (cached && cached.scheduleStateVersion === getScheduleStateVersion()) {
        return cached.routesByTrainCode;
    }

    return rebuildCache().routesByTrainCode;
}

export function getTodayScheduleProbeGroups(): Map<
    string,
    TodayScheduleProbeGroup
> {
    const activeCache = getActiveCache();
    return activeCache.groupsByTrainKey;
}

export function getTodayScheduleTimetableByTrainCode(
    trainCode: string
): TodayScheduleTimetable | null {
    const activeCache = getActiveCache();
    const normalizedTrainCode = normalizeCode(trainCode);
    if (
        normalizedTrainCode.length === 0 ||
        activeCache.activeStateKind === null
    ) {
        return null;
    }

    const route = activeCache.routesByTrainCode.get(normalizedTrainCode);
    if (!route) {
        return null;
    }

    const itemCode =
        loadScheduleItemCodeByStateKindAndAlias(
            activeCache.activeStateKind,
            normalizedTrainCode
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
            item.itemCode
        )
    ).map((stop) => toTodayScheduleStop(activeCache.date, stop));

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
            normalizeCode(row.itemCode)
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
            toTodayScheduleStopFromStationRow(activeCache.date, row)
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
    trainCode: string
): TodayScheduleProbeGroup | null {
    const activeCache = getActiveCache();
    const normalizedTrainCode = normalizeCode(trainCode);
    if (normalizedTrainCode.length === 0) {
        return null;
    }

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
    const normalizedTrainInternalCode = normalizeCode(trainInternalCode);
    if (normalizedTrainInternalCode.length === 0) {
        return null;
    }

    const trainKey = activeCache.groupKeysByTrainInternalCode.get(
        normalizedTrainInternalCode
    );
    if (!trainKey) {
        return null;
    }

    return activeCache.groupsByTrainKey.get(trainKey) ?? null;
}

export function getSafeTodayScheduleProbeTrainCodes(
    group: Pick<TodayScheduleProbeGroup, 'trainCode' | 'allCodes'>
): string[] {
    return uniqueNormalizedScheduleCodes([group.trainCode, ...group.allCodes]);
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
    aliasCode: string,
    index: ScheduleItemIdentityIndex
): boolean {
    const sourceCode = normalizeCode(sourceItem.itemCode);
    if (aliasCode === sourceCode) {
        return true;
    }

    const aliasItem = index.itemsByCode.get(aliasCode);
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
    aliasCode: string,
    index: ScheduleItemIdentityIndex
): void {
    const aliasItem = index.itemsByCode.get(aliasCode);
    logger.warn(
        `drop_unsafe_schedule_alias sourceCode=${normalizeCode(sourceItem.itemCode)} aliasCode=${aliasCode} sourceInternalCode=${normalizeCode(sourceItem.internalCode)} aliasInternalCode=${normalizeCode(aliasItem?.internalCode ?? '')} sourceStartAt=${sourceItem.startAt ?? 'null'} aliasStartAt=${aliasItem?.startAt ?? 'null'} sourceRoute=${sourceItem.startStation.trim()}-${sourceItem.endStation.trim()} aliasRoute=${aliasItem ? `${aliasItem.startStation.trim()}-${aliasItem.endStation.trim()}` : 'unknown'}`
    );
}

function normalizeAliasCodes(
    item: ScheduleDbItemRow,
    trainCode: string,
    aliases: string[],
    index: ScheduleItemIdentityIndex
): string[] {
    const codes = new Set<string>();
    codes.add(trainCode);

    for (const value of aliases) {
        const normalized = normalizeCode(value);
        if (normalized.length === 0) {
            continue;
        }

        if (!isSafeScheduleAlias(item, normalized, index)) {
            logUnsafeScheduleAlias(item, normalized, index);
            continue;
        }

        codes.add(normalized);
    }

    return [...codes];
}

function buildTimetableRouteFromItemRow(
    date: string,
    item: ScheduleDbItemRow,
    allCodes: string[]
): TodayScheduleTimetable | null {
    if (item.startAt === null || item.endAt === null) {
        return null;
    }

    const trainCode = normalizeCode(item.itemCode);
    if (trainCode.length === 0) {
        return null;
    }

    return {
        trainCode,
        trainInternalCode: normalizeCode(item.internalCode),
        allCodes,
        bureauCode: item.bureauCode.trim(),
        trainStyle: item.trainStyle.trim(),
        trainDepartment: item.trainDepartment.trim(),
        passengerDepartment: item.passengerDepartment.trim(),
        startAt: toUnixSecondsFromShanghaiDayOffset(date, item.startAt),
        endAt: toUnixSecondsFromShanghaiDayOffset(date, item.endAt),
        updatedAt: item.lastRouteRefreshAt,
        startStation: item.startStation.trim(),
        endStation: item.endStation.trim(),
        stops: []
    };
}

function toTodayScheduleStop(
    date: string,
    stop: ScheduleStop
): TodayScheduleStop {
    return {
        stationNo: stop.stationNo,
        stationName: stop.stationName.trim(),
        arriveAt:
            stop.arriveAt === null
                ? null
                : toUnixSecondsFromShanghaiDayOffset(date, stop.arriveAt),
        departAt:
            stop.departAt === null
                ? null
                : toUnixSecondsFromShanghaiDayOffset(date, stop.departAt),
        stationTrainCode: stop.stationTrainCode.trim(),
        wicket: stop.wicket.trim(),
        distance: stop.distance ?? null,
        platformNo: stop.platformNo ?? null,
        isStart: stop.isStart,
        isEnd: stop.isEnd
    };
}

function toTodayScheduleStopFromStationRow(
    date: string,
    row: ScheduleDbStationStopRow
): TodayScheduleStop {
    const isStart = row.isStart === 1;
    const isEnd = row.isEnd === 1;

    return {
        stationNo: row.stationNo,
        stationName: row.stationName.trim(),
        arriveAt:
            isStart || row.arriveAt === null
                ? null
                : toUnixSecondsFromShanghaiDayOffset(date, row.arriveAt),
        departAt:
            isEnd || row.departAt === null
                ? null
                : toUnixSecondsFromShanghaiDayOffset(date, row.departAt),
        stationTrainCode: row.stationTrainCode.trim(),
        wicket: row.wicket.trim(),
        distance: row.distance ?? null,
        platformNo: row.platformNo ?? null,
        isStart,
        isEnd
    };
}

function uniqueNormalizedScheduleCodes(codes: string[]): string[] {
    const normalizedCodes = new Set<string>();

    for (const code of codes) {
        const normalized = normalizeCode(code);
        if (normalized.length > 0) {
            normalizedCodes.add(normalized);
        }
    }

    return [...normalizedCodes];
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
    existingGroup.trainInternalCode = pickPreferredText(
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
    date: string,
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
        stationNo: stop.stationNo,
        arriveAt: stop.arriveAt,
        departAt: stop.departAt,
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
    date: string,
    group: TodayScheduleProbeGroup,
    timetable: TodayScheduleTimetable,
    stop: TodayScheduleStop
) {
    applyGroupToStationRow(row, group);

    const normalizedStopTrainCode = normalizeCode(stop.stationTrainCode);
    if (
        normalizedStopTrainCode.length > 0 &&
        row.trainCode === group.trainCode
    ) {
        row.trainCode = normalizedStopTrainCode;
    }

    row.stationNo = Math.min(row.stationNo, stop.stationNo);
    row.arriveAt = mergeNullableMin(row.arriveAt, stop.arriveAt);
    row.departAt = mergeNullableMax(row.departAt, stop.departAt);
    row.sortAt = row.arriveAt ?? row.departAt ?? timetable.startAt;
    row.clockSortAt = buildStationClockSortAt(date, row.sortAt);
}

function applyGroupToStationRow(
    row: TodayScheduleStationIndexRow,
    group: TodayScheduleProbeGroup
) {
    row.trainInternalCode = pickPreferredText(
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

    if (row.trainCode.length === 0) {
        row.trainCode = group.trainCode;
    }
}

function resolveStationDisplayTrainCode(
    stationTrainCode: string,
    fallbackTrainCode: string
) {
    const normalizedStationTrainCode = normalizeCode(stationTrainCode);
    if (normalizedStationTrainCode.length > 0) {
        return normalizedStationTrainCode;
    }

    return normalizeCode(fallbackTrainCode);
}

function pickPreferredText(currentValue: string, nextValue: string) {
    return currentValue.length > 0 ? currentValue : nextValue.trim();
}

function mergeCodeLists(leftCodes: string[], rightCodes: string[]) {
    const mergedCodes = new Set<string>();

    for (const code of leftCodes) {
        const normalizedCode = normalizeCode(code);
        if (normalizedCode.length > 0) {
            mergedCodes.add(normalizedCode);
        }
    }

    for (const code of rightCodes) {
        const normalizedCode = normalizeCode(code);
        if (normalizedCode.length > 0) {
            mergedCodes.add(normalizedCode);
        }
    }

    return [...mergedCodes];
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

function buildStationClockSortAt(date: string, sortAt: number) {
    const dayOffset = toShanghaiDayOffsetFromUnixSeconds(date, sortAt);
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

    const trainCodeDiff = left.trainCode.localeCompare(
        right.trainCode,
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
