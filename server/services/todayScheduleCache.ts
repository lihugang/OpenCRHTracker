import fs from 'fs';
import path from 'path';
import useConfig from '~/server/config';
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

interface TodayScheduleCache {
    date: string;
    scheduleFilePath: string;
    scheduleMtimeMs: number;
    routesByTrainCode: Map<string, TodayScheduleRoute>;
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

    if (state?.date === currentDate) {
        for (const item of state.items) {
            if (item.startAt === null || item.endAt === null) {
                continue;
            }

            const trainCode = normalizeCode(item.code);
            if (trainCode.length === 0 || routesByTrainCode.has(trainCode)) {
                continue;
            }

            routesByTrainCode.set(trainCode, {
                trainCode,
                trainInternalCode: normalizeCode(item.internalCode),
                startAt: toUnixSecondsFromShanghaiDayOffset(
                    state.date,
                    item.startAt
                ),
                endAt: toUnixSecondsFromShanghaiDayOffset(
                    state.date,
                    item.endAt
                ),
                startStation: item.startStation.trim(),
                endStation: item.endStation.trim()
            });
        }
    }

    cached = {
        date: currentDate,
        scheduleFilePath,
        scheduleMtimeMs,
        routesByTrainCode
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
