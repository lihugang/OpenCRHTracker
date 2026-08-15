import getLogger from '~/server/libs/log4js';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import {
    markCurrentTrainProvenanceTaskSkipped,
    recordCurrentStationPlatformRefreshResults
} from '~/server/services/trainProvenanceRecorder';
import {
    createEmptyStationPlatformInfoRefreshResult,
    refreshMissingOrExpiredStationPlatformInfoForTrainCodes,
    refreshStationPlatformInfoForTrainCodes
} from '~/server/services/stationPlatformInfoService';
import {
    getSafeTodayScheduleProbeTrainCodes,
    getTodayScheduleProbeGroupByTrainCode,
    getTodayScheduleProbeGroupByTrainInternalCode
} from '~/server/services/todayScheduleCache';
import {
    formatTrainCode,
    type TrainCodeParts
} from '~/server/utils/12306/trainCode';
import { loadPublishedScheduleStateSummary } from '~/server/utils/12306/scheduleProbe/stateStore';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import {
    asServiceDay,
    serviceDateToDay,
    type ServiceDay
} from '~/server/utils/date/serviceDay';

export const REFRESH_TRAIN_STATION_PLATFORM_TASK_EXECUTOR =
    'refresh_train_station_platform';

const logger = getLogger('task-executor:refresh-train-station-platform');

let registered = false;

export interface RefreshTrainStationPlatformTaskArgs {
    serviceDate: ServiceDay;
    trainCode: TrainCodeParts;
    trainInternalCode: string;
    refreshMode?: 'missing_or_expired';
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

export function parseRefreshTrainStationPlatformTaskArgs(
    raw: unknown
): RefreshTrainStationPlatformTaskArgs {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new Error('task arguments must be an object');
    }

    const body = raw as {
        serviceDate?: unknown;
        trainCode?: unknown;
        trainInternalCode?: unknown;
        refreshMode?: unknown;
    };
    const serviceDate =
        typeof body.serviceDate === 'number'
            ? asServiceDay(body.serviceDate)
            : null;
    const trainCode = parseTrainCode(body.trainCode);
    const trainInternalCode =
        typeof body.trainInternalCode === 'string'
            ? body.trainInternalCode.trim()
            : '';
    const refreshMode =
        body.refreshMode === undefined
            ? undefined
            : body.refreshMode === 'missing_or_expired'
              ? body.refreshMode
              : null;

    if (serviceDate === null) {
        throw new Error('task arguments serviceDate must be a service day');
    }
    if (trainCode === null) {
        throw new Error('task arguments trainCode must be valid');
    }
    if (refreshMode === null) {
        throw new Error(
            'task arguments refreshMode must be missing_or_expired when provided'
        );
    }

    return {
        serviceDate,
        trainCode,
        trainInternalCode,
        ...(refreshMode === undefined ? {} : { refreshMode })
    };
}

async function executeRefreshTrainStationPlatformTask(
    args: RefreshTrainStationPlatformTaskArgs
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
            `skip_schedule_not_current serviceDate=${args.serviceDate} publishedDate=${published?.date ?? 'null'} currentDate=${currentDate} trainCode=${formatTrainCode(args.trainCode)}`
        );
        return;
    }

    const group =
        (args.trainInternalCode
            ? getTodayScheduleProbeGroupByTrainInternalCode(
                  args.trainInternalCode
              )
            : null) ?? getTodayScheduleProbeGroupByTrainCode(args.trainCode);
    if (!group) {
        markCurrentTrainProvenanceTaskSkipped('train_group_not_found');
        logger.info(
            `skip_train_group_not_found serviceDate=${args.serviceDate} trainCode=${formatTrainCode(args.trainCode)} trainInternalCode=${args.trainInternalCode}`
        );
        return;
    }

    const trainCodes = getSafeTodayScheduleProbeTrainCodes(group);
    const fallbackRouteReferences = [
        {
            trainCodes,
            startAt: group.startAt
        }
    ];

    try {
        const result =
            args.refreshMode === 'missing_or_expired'
                ? await refreshMissingOrExpiredStationPlatformInfoForTrainCodes(
                      {
                          serviceDate: args.serviceDate,
                          trainCodes
                      }
                  )
                : await refreshStationPlatformInfoForTrainCodes({
                      serviceDate: args.serviceDate,
                      trainCodes
                  });
        recordCurrentStationPlatformRefreshResults({
            serviceDate: args.serviceDate,
            trigger: 'scheduled_task',
            result,
            fallbackRouteReferences
        });
        logger.info(
            `done serviceDate=${args.serviceDate} trainCode=${formatTrainCode(group.trainCode)} trainCodes=${trainCodes.length} localRows=${result.localRowCount} candidates=${result.candidateCount} cacheHits=${result.cacheHitCount} requests=${result.requestCount} data=${result.dataCount} failedTrains=${result.failedTrainCount} cacheFallbacks=${result.cacheFallbackCount} updatedCacheEntries=${result.updatedCacheEntryCount} updatedStops=${result.updatedStopCount}`
        );
    } catch (error) {
        const message =
            error instanceof Error
                ? `${error.name}: ${error.message}`
                : String(error);
        recordCurrentStationPlatformRefreshResults({
            serviceDate: args.serviceDate,
            trigger: 'scheduled_task',
            result: createEmptyStationPlatformInfoRefreshResult(),
            fallbackRouteReferences,
            errorMessage: message
        });
        logger.warn(
            `failed serviceDate=${args.serviceDate} trainCode=${formatTrainCode(group.trainCode)} error=${message}`
        );
    }
}

export function registerRefreshTrainStationPlatformTaskExecutor() {
    if (registered) {
        return;
    }

    registerTaskExecutor(REFRESH_TRAIN_STATION_PLATFORM_TASK_EXECUTOR, {
        parse: parseRefreshTrainStationPlatformTaskArgs,
        execute: executeRefreshTrainStationPlatformTask
    });
    registered = true;
    logger.info(
        `registered executor=${REFRESH_TRAIN_STATION_PLATFORM_TASK_EXECUTOR}`
    );
}
