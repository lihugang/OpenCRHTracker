import fs from 'fs';
import path from 'path';
import useConfig from '~/server/config';
import { buildTrainKey } from '~/server/services/probeRuntimeState';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import { loadPublishedScheduleState } from '~/server/utils/12306/scheduleProbe/stateStore';
import { toUnixSecondsFromShanghaiDayOffset } from '~/server/utils/date/shanghaiDateTime';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';

export interface TodayScheduleRoute {
    trainCode: string;
    trainInternalCode: string;
    allCodes: string[];
    startAt: number;
    endAt: number;
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

interface TodayScheduleCache {
    date: string;
    scheduleFilePath: string;
    scheduleMtimeMs: number;
    routesByTrainCode: Map<string, TodayScheduleRoute>;
    timetablesByTrainCode: Map<string, TodayScheduleTimetable>;
    groupsByTrainKey: Map<string, TodayScheduleProbeGroup>;
    groupKeysByTrainCode: Map<string, string>;
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
    const state = loadPublishedScheduleState(scheduleFilePath);
    const routesByTrainCode = new Map<string, TodayScheduleRoute>();
    const timetablesByTrainCode = new Map<string, TodayScheduleTimetable>();
    const groupsByTrainKey = new Map<string, TodayScheduleProbeGroup>();
    const groupKeysByTrainCode = new Map<string, string>();

    if (state?.date === currentDate) {
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

            for (const aliasCode of timetable.allCodes) {
                if (!routesByTrainCode.has(aliasCode)) {
                    routesByTrainCode.set(aliasCode, {
                        trainCode,
                        trainInternalCode,
                        allCodes: timetable.allCodes,
                        startAt,
                        endAt,
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
            const existingGroup = groupsByTrainKey.get(trainKey);
            if (existingGroup) {
                for (const aliasCode of timetable.allCodes) {
                    if (!existingGroup.allCodes.includes(aliasCode)) {
                        existingGroup.allCodes.push(aliasCode);
                    }
                }
                existingGroup.startAt = Math.min(
                    existingGroup.startAt,
                    startAt
                );
                existingGroup.endAt = Math.max(existingGroup.endAt, endAt);
                if (
                    existingGroup.startStation.length === 0 &&
                    item.startStation.trim().length > 0
                ) {
                    existingGroup.startStation = item.startStation.trim();
                }
                if (
                    existingGroup.endStation.length === 0 &&
                    item.endStation.trim().length > 0
                ) {
                    existingGroup.endStation = item.endStation.trim();
                }
                continue;
            }

            groupsByTrainKey.set(trainKey, {
                trainKey,
                trainCode,
                trainInternalCode,
                allCodes: [...timetable.allCodes],
                startAt,
                endAt,
                startStation: timetable.startStation,
                endStation: timetable.endStation
            });
        }
    }

    cached = {
        date: currentDate,
        scheduleFilePath,
        scheduleMtimeMs,
        routesByTrainCode,
        timetablesByTrainCode,
        groupsByTrainKey,
        groupKeysByTrainCode
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
