import getLogger from '~/server/libs/log4js';
import { reconcilePendingTaskByExecutorAndArgs } from '~/server/services/taskQueue';
import {
    REFRESH_STATION_TIMETABLE_PLATFORM_TASK_EXECUTOR,
    type RefreshStationTimetablePlatformTaskArgs
} from '~/server/services/taskExecutors/refreshStationTimetablePlatformTaskExecutor';
import type { TodayScheduleStationIndexRow } from '~/server/services/todayScheduleCache';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import {
    trainCodeKey,
    type TrainCodeParts
} from '~/server/utils/12306/trainCode';
import type { ServiceDay } from '~/server/utils/date/serviceDay';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

const logger = getLogger('station-timetable-platform-task-scheduling');

interface TaskGroup {
    stationName: string;
    stationTelecode: string;
    trainCodesByKey: Map<string, TrainCodeParts>;
}

export interface EnqueueStationTimetablePlatformTasksResult {
    createdTaskIds: number[];
    reusedTaskIds: number[];
    skippedRowCount: number;
}

export function enqueueStationTimetablePlatformTasks(
    serviceDate: ServiceDay,
    rows: readonly TodayScheduleStationIndexRow[]
): EnqueueStationTimetablePlatformTasksResult {
    const groups = new Map<string, TaskGroup>();
    let skippedRowCount = 0;

    for (const row of rows) {
        const stationName = row.stationName.trim();
        const stationTelecode = normalizeCode(row.stationTelecode);
        if (stationName.length === 0 || stationTelecode.length === 0) {
            skippedRowCount += 1;
            continue;
        }

        const key = `${stationName}:${stationTelecode}`;
        const group = groups.get(key) ?? {
            stationName,
            stationTelecode,
            trainCodesByKey: new Map<string, TrainCodeParts>()
        };
        for (const trainCode of row.allCodes) {
            const codeKey = trainCodeKey(trainCode);
            if (codeKey.length > 0) {
                group.trainCodesByKey.set(codeKey, trainCode);
            }
        }
        groups.set(key, group);
    }

    const createdTaskIds: number[] = [];
    const reusedTaskIds: number[] = [];
    const executionTime = getNowSeconds();
    for (const group of groups.values()) {
        const trainCodes = [...group.trainCodesByKey.values()].sort(
            (left, right) =>
                trainCodeKey(left).localeCompare(trainCodeKey(right))
        );
        if (trainCodes.length === 0) {
            continue;
        }

        const args: RefreshStationTimetablePlatformTaskArgs = {
            serviceDate,
            stationName: group.stationName,
            stationTelecode: group.stationTelecode,
            trainCodes
        };
        const result = reconcilePendingTaskByExecutorAndArgs(
            REFRESH_STATION_TIMETABLE_PLATFORM_TASK_EXECUTOR,
            args,
            executionTime
        );
        if (result.action === 'created') {
            createdTaskIds.push(result.taskId);
        } else {
            reusedTaskIds.push(result.taskId);
        }
    }

    logger.info(
        `enqueued serviceDate=${serviceDate} rows=${rows.length} groups=${groups.size} created=${createdTaskIds.length} reused=${reusedTaskIds.length} skippedRows=${skippedRowCount}`
    );
    return {
        createdTaskIds,
        reusedTaskIds,
        skippedRowCount
    };
}
