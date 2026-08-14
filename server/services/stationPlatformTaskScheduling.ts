import useConfig from '~/server/config';
import {
    reconcileFuturePendingTaskByExecutorAndArgs,
    type ReconcileSingletonTaskResult
} from '~/server/services/taskQueue';
import {
    REFRESH_TRAIN_STATION_PLATFORM_TASK_EXECUTOR,
    type RefreshTrainStationPlatformTaskArgs
} from '~/server/services/taskExecutors/refreshTrainStationPlatformTaskExecutor';
import {
    serviceDayToShanghaiDayStartUnixSeconds,
    type ServiceDay
} from '~/server/utils/date/serviceDay';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import type { BuildScheduleStationPlatformTaskCandidate } from '~/server/utils/12306/scheduleProbe/types';

const TEN_AM_SECONDS = 10 * 60 * 60;
const THIRTY_MINUTES_SECONDS = 30 * 60;

export interface ScheduleStationPlatformTasksResult {
    createdTaskIds: number[];
    reusedTaskIds: number[];
}

export function resolveStationPlatformTaskExecutionTime(
    serviceDate: ServiceDay,
    startAt: number,
    now = getNowSeconds()
) {
    const tenAm =
        serviceDayToShanghaiDayStartUnixSeconds(serviceDate) + TEN_AM_SECONDS;
    const plannedExecutionTime = Math.min(
        tenAm,
        startAt - THIRTY_MINUTES_SECONDS
    );
    return Math.max(now, plannedExecutionTime);
}

function getExpectedDurationMs(stopCount: number) {
    const requestIntervalMs = useConfig().spider.rateLimit.query.minIntervalMs;
    return Math.max(1, stopCount) * requestIntervalMs;
}

function toTaskArgs(
    serviceDate: ServiceDay,
    candidate: BuildScheduleStationPlatformTaskCandidate
): RefreshTrainStationPlatformTaskArgs {
    return {
        serviceDate,
        trainCode: candidate.trainCode,
        trainInternalCode: candidate.trainInternalCode
    };
}

export function scheduleStationPlatformTasksForEnrichedTrains(
    serviceDate: ServiceDay,
    candidates: readonly BuildScheduleStationPlatformTaskCandidate[]
): ScheduleStationPlatformTasksResult {
    const createdTaskIds: number[] = [];
    const reusedTaskIds: number[] = [];

    for (const candidate of candidates) {
        const args = toTaskArgs(serviceDate, candidate);
        const result: ReconcileSingletonTaskResult =
            reconcileFuturePendingTaskByExecutorAndArgs(
                REFRESH_TRAIN_STATION_PLATFORM_TASK_EXECUTOR,
                args,
                resolveStationPlatformTaskExecutionTime(
                    serviceDate,
                    candidate.startAt
                ),
                {
                    isIdle: true,
                    expectedDurationMs: getExpectedDurationMs(
                        candidate.stopCount
                    )
                }
            );

        if (result.action === 'reused_future') {
            reusedTaskIds.push(result.taskId);
        } else {
            createdTaskIds.push(result.taskId);
        }
    }

    return {
        createdTaskIds,
        reusedTaskIds
    };
}
