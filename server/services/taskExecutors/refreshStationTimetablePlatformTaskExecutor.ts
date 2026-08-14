import useConfig from '~/server/config';
import getLogger from '~/server/libs/log4js';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import {
    markCurrentTrainProvenanceTaskSkipped,
    recordCurrentStationPlatformRefreshResults
} from '~/server/services/trainProvenanceRecorder';
import { refreshMissingOrExpiredStationPlatformInfoForStationTrainCodes } from '~/server/services/stationPlatformInfoService';
import {
    formatTrainCode,
    trainCodeKey,
    type TrainCodeParts
} from '~/server/utils/12306/trainCode';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import { loadPublishedScheduleStateSummary } from '~/server/utils/12306/scheduleProbe/stateStore';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import {
    asServiceDay,
    serviceDateToDay,
    type ServiceDay
} from '~/server/utils/date/serviceDay';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

export const REFRESH_STATION_TIMETABLE_PLATFORM_TASK_EXECUTOR =
    'refresh_station_timetable_platform';

const logger = getLogger('task-executor:refresh-station-timetable-platform');
const HOUR_SECONDS = 60 * 60;

let registered = false;
let nextCleanupAt = 0;
const lastAttemptAtByKey = new Map<string, number>();

export interface RefreshStationTimetablePlatformTaskArgs {
    serviceDate: ServiceDay;
    stationName: string;
    stationTelecode: string;
    trainCodes: TrainCodeParts[];
}

function parseTrainCode(value: unknown): TrainCodeParts | null {
    if (
        typeof value !== 'object' ||
        value === null ||
        Array.isArray(value) ||
        typeof (value as { prefix?: unknown }).prefix !== 'string' ||
        typeof (value as { number?: unknown }).number !== 'number'
    ) {
        return null;
    }

    const trainCode = value as TrainCodeParts;
    try {
        formatTrainCode(trainCode);
        return trainCode;
    } catch {
        return null;
    }
}

function normalizeTrainCodes(values: readonly unknown[]) {
    const trainCodesByKey = new Map<string, TrainCodeParts>();
    for (const value of values) {
        const trainCode = parseTrainCode(value);
        if (!trainCode) {
            throw new Error(
                'task arguments trainCodes must contain valid train codes'
            );
        }
        trainCodesByKey.set(trainCodeKey(trainCode), trainCode);
    }

    return [...trainCodesByKey.values()].sort((left, right) =>
        trainCodeKey(left).localeCompare(trainCodeKey(right))
    );
}

export function parseRefreshStationTimetablePlatformTaskArgs(
    raw: unknown
): RefreshStationTimetablePlatformTaskArgs {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new Error('task arguments must be an object');
    }

    const body = raw as {
        serviceDate?: unknown;
        stationName?: unknown;
        stationTelecode?: unknown;
        trainCodes?: unknown;
    };
    const serviceDate =
        typeof body.serviceDate === 'number'
            ? asServiceDay(body.serviceDate)
            : null;
    const stationName =
        typeof body.stationName === 'string' ? body.stationName.trim() : '';
    const stationTelecode =
        typeof body.stationTelecode === 'string'
            ? normalizeCode(body.stationTelecode)
            : '';
    const trainCodes = Array.isArray(body.trainCodes)
        ? normalizeTrainCodes(body.trainCodes)
        : [];

    if (serviceDate === null) {
        throw new Error('task arguments serviceDate must be a service day');
    }
    if (stationName.length === 0) {
        throw new Error('task arguments stationName must be non-empty');
    }
    if (stationTelecode.length === 0) {
        throw new Error('task arguments stationTelecode must be non-empty');
    }
    if (trainCodes.length === 0) {
        throw new Error('task arguments trainCodes must be non-empty');
    }

    return {
        serviceDate,
        stationName,
        stationTelecode,
        trainCodes
    };
}

function getCooldownKey(args: RefreshStationTimetablePlatformTaskArgs) {
    return [
        args.serviceDate,
        args.stationTelecode,
        args.trainCodes.map(trainCodeKey).sort().join(',')
    ].join(':');
}

function cleanupCooldownStates(now: number, cooldownSeconds: number) {
    if (now < nextCleanupAt) {
        return;
    }

    const expiresAt = now - cooldownSeconds;
    for (const [key, lastAttemptAt] of lastAttemptAtByKey) {
        if (cooldownSeconds <= 0 || lastAttemptAt <= expiresAt) {
            lastAttemptAtByKey.delete(key);
        }
    }
    nextCleanupAt = now + Math.max(HOUR_SECONDS, cooldownSeconds);
}

async function executeRefreshStationTimetablePlatformTask(
    args: RefreshStationTimetablePlatformTaskArgs
) {
    const published = loadPublishedScheduleStateSummary();
    const currentDate = serviceDateToDay(getCurrentDateString());
    if (
        !published ||
        published.date !== currentDate ||
        published.date !== args.serviceDate
    ) {
        markCurrentTrainProvenanceTaskSkipped('schedule_not_current');
        logger.info(
            `skip_schedule_not_current serviceDate=${args.serviceDate} publishedDate=${published?.date ?? 'null'} currentDate=${currentDate} stationName=${args.stationName} stationTelecode=${args.stationTelecode}`
        );
        return;
    }

    const now = getNowSeconds();
    const cooldownSeconds =
        useConfig().spider.stationPlatformInfo.stationOnDemandCooldownHours *
        HOUR_SECONDS;
    cleanupCooldownStates(now, cooldownSeconds);

    const cooldownKey = getCooldownKey(args);
    const lastAttemptAt = lastAttemptAtByKey.get(cooldownKey);
    if (
        lastAttemptAt !== undefined &&
        cooldownSeconds > 0 &&
        now - lastAttemptAt < cooldownSeconds
    ) {
        markCurrentTrainProvenanceTaskSkipped('station_timetable_cooldown');
        logger.info(
            `skip_cooldown serviceDate=${args.serviceDate} stationName=${args.stationName} stationTelecode=${args.stationTelecode} trainCodes=${args.trainCodes.length} lastAttemptAt=${lastAttemptAt} cooldownSeconds=${cooldownSeconds}`
        );
        return;
    }

    const result =
        await refreshMissingOrExpiredStationPlatformInfoForStationTrainCodes(
            args
        );
    if (result.candidateCount > 0 && cooldownSeconds > 0) {
        lastAttemptAtByKey.set(cooldownKey, now);
    }

    recordCurrentStationPlatformRefreshResults({
        serviceDate: args.serviceDate,
        trigger: 'scheduled_task',
        result,
        fallbackRouteReferences: [
            {
                trainCodes: args.trainCodes,
                startAt: null
            }
        ]
    });
    logger.info(
        `done serviceDate=${args.serviceDate} stationName=${args.stationName} stationTelecode=${args.stationTelecode} trainCodes=${args.trainCodes.length} localRows=${result.localRowCount} candidates=${result.candidateCount} cacheHits=${result.cacheHitCount} requests=${result.requestCount} data=${result.dataCount} failedTrains=${result.failedTrainCount} updatedStops=${result.updatedStopCount}`
    );
}

export function registerRefreshStationTimetablePlatformTaskExecutor() {
    if (registered) {
        return;
    }

    registerTaskExecutor(REFRESH_STATION_TIMETABLE_PLATFORM_TASK_EXECUTOR, {
        parse: parseRefreshStationTimetablePlatformTaskArgs,
        execute: executeRefreshStationTimetablePlatformTask
    });
    registered = true;
    logger.info(
        `registered executor=${REFRESH_STATION_TIMETABLE_PLATFORM_TASK_EXECUTOR}`
    );
}
