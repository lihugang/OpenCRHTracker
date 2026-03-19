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
    startAt: number;
    endAt: number;
    startStation: string;
    endStation: string;
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

            if (!routesByTrainCode.has(trainCode)) {
                routesByTrainCode.set(trainCode, {
                    trainCode,
                    trainInternalCode,
                    startAt,
                    endAt,
                    startStation: item.startStation.trim(),
                    endStation: item.endStation.trim()
                });
            }

            groupKeysByTrainCode.set(trainCode, trainKey);
            const existingGroup = groupsByTrainKey.get(trainKey);
            if (existingGroup) {
                if (!existingGroup.allCodes.includes(trainCode)) {
                    existingGroup.allCodes.push(trainCode);
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
                allCodes: [trainCode],
                startAt,
                endAt,
                startStation: item.startStation.trim(),
                endStation: item.endStation.trim()
            });
        }
    }

    cached = {
        date: currentDate,
        scheduleFilePath,
        scheduleMtimeMs,
        routesByTrainCode,
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
