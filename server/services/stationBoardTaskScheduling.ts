import useConfig from '~/server/config';
import { estimateIdleTaskDurationMs } from '~/server/services/idleTaskEstimator';
import type { EnqueueTaskOptions } from '~/server/services/taskQueue';

export function getStationBoardIdleExpectedDurationMs(
    executorName: string
): number {
    return estimateIdleTaskDurationMs(
        executorName,
        useConfig().spider.rateLimit.stationBoard.minIntervalMs
    );
}

export function getStationBoardIdleTaskOptions(
    executorName: string
): EnqueueTaskOptions {
    return {
        isIdle: true,
        expectedDurationMs: getStationBoardIdleExpectedDurationMs(executorName)
    };
}
