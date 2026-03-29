import fs from 'fs';
import path from 'path';
import useConfig from '~/server/config';
import { buildTrainKey } from '~/server/services/probeRuntimeState';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import { loadActiveScheduleState } from '~/server/utils/12306/scheduleProbe/stateStore';
import {
    toShanghaiDayOffsetFromUnixSeconds,
    toUnixSecondsFromShanghaiDayOffset
} from '~/server/utils/date/shanghaiDateTime';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';

export interface TodayScheduleRoute {
    trainCode: string;
    trainInternalCode: string;
    allCodes: string[];
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
    scheduleFilePath: string;
    scheduleMtimeMs: number;
    routesByTrainCode: Map<string, TodayScheduleRoute>;
    timetablesByTrainCode: Map<string, TodayScheduleTimetable>;
    groupsByTrainKey: Map<string, TodayScheduleProbeGroup>;
    groupKeysByTrainCode: Map<string, string>;
    stationRowsByStationName: Map<string, TodayScheduleStationIndexRow[]>;
}

let cached: TodayScheduleCache | null = null;

function resolveAssetPath(filePath: string): string {
    return path.resolve(filePath);
}

function getFileMtimeMs(filePath: string): number {
    try {
        return fs.statSync(resolveAssetPath(filePath)).mtimeMs;
    } catch {
        return -1;
    }
}

function rebuildCache(): TodayScheduleCache {
    const config = useConfig();
    const currentDate = getCurrentDateString();
    const scheduleFilePath = config.data.assets.schedule.file;
    const scheduleMtimeMs = getFileMtimeMs(scheduleFilePath);
    const state = loadActiveScheduleState(scheduleFilePath);
    const routesByTrainCode = new Map<string, TodayScheduleRoute>();
    const timetablesByTrainCode = new Map<string, TodayScheduleTimetable>();
    const groupsByTrainKey = new Map<string, TodayScheduleProbeGroup>();
    const groupKeysByTrainCode = new Map<string, string>();
    const stationRowsByStationName = new Map<
        string,
        TodayScheduleStationIndexRow[]
    >();
    const stationRowIndexesByStationName = new Map<
        string,
        Map<string, TodayScheduleStationIndexRow>
    >();

    if (state) {
        for (const item of state.items) {
            if (item.startAt === null || item.endAt === null) {
                continue;
            }

            const trainCode = normalizeCode(item.code);
            if (trainCode.length === 0) {
                continue;
            }

            const trainInternalCode = normalizeCode(item.internalCode);
            const startAt = toUnixSecondsFromShanghaiDayOffset(
                state.date,
                item.startAt
            );
            const endAt = toUnixSecondsFromShanghaiDayOffset(
                state.date,
                item.endAt
            );
            const trainKey = buildTrainKey(
                trainCode,
                trainInternalCode,
                startAt
            );
            const allCodes = normalizeAliasCodes(item.allCodes, trainCode);
            const timetable: TodayScheduleTimetable = {
                trainCode,
                trainInternalCode,
                allCodes,
                startAt,
                endAt,
                updatedAt: item.lastRouteRefreshAt,
                startStation: item.startStation.trim(),
                endStation: item.endStation.trim(),
                stops: item.stops.map((stop) => ({
                    stationNo: stop.stationNo,
                    stationName: stop.stationName.trim(),
                    arriveAt:
                        stop.arriveAt === null
                            ? null
                            : toUnixSecondsFromShanghaiDayOffset(
                                  state.date,
                                  stop.arriveAt
                              ),
                    departAt:
                        stop.departAt === null
                            ? null
                            : toUnixSecondsFromShanghaiDayOffset(
                                  state.date,
                                  stop.departAt
                              ),
                    stationTrainCode: stop.stationTrainCode.trim(),
                    wicket: stop.wicket.trim(),
                    isStart: stop.isStart,
                    isEnd: stop.isEnd
                }))
            };

            const activeGroup = upsertProbeGroup(
                groupsByTrainKey,
                trainKey,
                timetable
            );

            for (const stop of timetable.stops) {
                const stationName = stop.stationName.trim();
                if (stationName.length === 0) {
                    continue;
                }

                upsertStationRow(
                    stationRowsByStationName,
                    stationRowIndexesByStationName,
                    state.date,
                    stationName,
                    activeGroup,
                    timetable,
                    stop
                );
            }

            for (const aliasCode of timetable.allCodes) {
                if (!routesByTrainCode.has(aliasCode)) {
                    routesByTrainCode.set(aliasCode, {
                        trainCode,
                        trainInternalCode,
                        allCodes: timetable.allCodes,
                        startAt,
                        endAt,
                        updatedAt: timetable.updatedAt,
                        startStation: timetable.startStation,
                        endStation: timetable.endStation
                    });
                }

                if (!timetablesByTrainCode.has(aliasCode)) {
                    timetablesByTrainCode.set(aliasCode, timetable);
                }
            }

            for (const aliasCode of timetable.allCodes) {
                groupKeysByTrainCode.set(aliasCode, trainKey);
            }
        }
    }

    for (const rows of stationRowsByStationName.values()) {
        for (const row of rows) {
            const activeGroup = groupsByTrainKey.get(row.trainKey);
            if (activeGroup) {
                applyGroupToStationRow(row, activeGroup);
            }
        }

        rows.sort(compareStationRows);
    }

    cached = {
        date: currentDate,
        scheduleFilePath,
        scheduleMtimeMs,
        routesByTrainCode,
        timetablesByTrainCode,
        groupsByTrainKey,
        groupKeysByTrainCode,
        stationRowsByStationName
    };
    return cached;
}

export function getTodayScheduleCache(): Map<string, TodayScheduleRoute> {
    const config = useConfig();
    const currentDate = getCurrentDateString();
    const scheduleFilePath = config.data.assets.schedule.file;
    const scheduleMtimeMs = getFileMtimeMs(scheduleFilePath);

    if (
        cached &&
        cached.date === currentDate &&
        cached.scheduleFilePath === scheduleFilePath &&
        cached.scheduleMtimeMs === scheduleMtimeMs
    ) {
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
    if (normalizedTrainCode.length === 0) {
        return null;
    }

    return activeCache.timetablesByTrainCode.get(normalizedTrainCode) ?? null;
}

export function getTodayStationTimetableByStationName(
    stationName: string
): TodayScheduleStationIndexRow[] {
    const activeCache = getActiveCache();
    const normalizedStationName = stationName.trim();
    if (normalizedStationName.length === 0) {
        return [];
    }

    return (
        activeCache.stationRowsByStationName.get(normalizedStationName) ?? []
    );
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

function getActiveCache(): TodayScheduleCache {
    const config = useConfig();
    const currentDate = getCurrentDateString();
    const scheduleFilePath = config.data.assets.schedule.file;
    const scheduleMtimeMs = getFileMtimeMs(scheduleFilePath);

    if (
        cached &&
        cached.date === currentDate &&
        cached.scheduleFilePath === scheduleFilePath &&
        cached.scheduleMtimeMs === scheduleMtimeMs
    ) {
        return cached;
    }

    return rebuildCache();
}

function normalizeAliasCodes(allCodes: string[], trainCode: string): string[] {
    const codes = new Set<string>();
    codes.add(trainCode);

    for (const value of allCodes) {
        const normalized = normalizeCode(value);
        if (normalized.length > 0) {
            codes.add(normalized);
        }
    }

    return [...codes];
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
