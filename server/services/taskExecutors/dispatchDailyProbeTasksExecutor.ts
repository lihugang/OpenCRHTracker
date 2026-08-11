import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import {
    parseEmptyTaskArgs,
    registerTaskExecutor
} from '~/server/services/taskExecutorRegistry';
import {
    getSafeTodayScheduleProbeTrainCodes,
    getTodayScheduleProbeGroups,
    type TodayScheduleProbeGroup
} from '~/server/services/todayScheduleCache';
import {
    enqueueTasks,
    type EnqueueTaskInput
} from '~/server/services/taskQueue';
import {
    markCurrentTrainProvenanceTaskSkipped,
    recordCurrentTrainProvenanceEventsForTrainCodes
} from '~/server/services/trainProvenanceRecorder';
import { isScheduleProbeTrackingEnabled } from '~/server/utils/12306/scheduleProbe/rules';
import { loadPublishedScheduleStateSummary } from '~/server/utils/12306/scheduleProbe/stateStore';
import { getScheduleDatabaseFilePath } from '~/server/utils/12306/scheduleProbe/sqliteStore';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import {
    serviceDateToDay,
    serviceDayToShanghaiDayStartUnixSeconds,
    type ServiceDay
} from '~/server/utils/date/serviceDay';
import parseTimeAsTimestamp from '~/server/utils/date/parseTimeAsTimestamp';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import { PROBE_TRAIN_DEPARTURE_TASK_EXECUTOR } from '~/server/services/taskExecutors/probeTrainDepartureTaskExecutor';
import type { TrainCodeParts } from '~/server/utils/12306/trainCode';
import { formatTrainCode } from '~/server/utils/12306/trainCode';

export const DISPATCH_DAILY_PROBE_TASKS_EXECUTOR = 'dispatch_daily_probe_tasks';

const logger = getLogger('task-executor:dispatch-daily-probe');
const MAX_CODES_PER_GROUP = 8;
const DISABLED_LATEST_EXECUTION_TIME_HHMM = '0000';

let registered = false;

export interface DispatchDailyProbeTasksResult {
    date: ServiceDay | null;
    groupCount: number;
    createdTaskIds: number[];
}

interface TrackableProbeGroup {
    trainCodes: TrainCodeParts[];
    group: TodayScheduleProbeGroup;
}

function resolveProbeTaskExecutionTime(
    startAt: number,
    now: number,
    serviceDate: ServiceDay,
    latestExecutionTimeHHmm: string
): number {
    let plannedExecutionTime = startAt;

    if (latestExecutionTimeHHmm !== DISABLED_LATEST_EXECUTION_TIME_HHMM) {
        const latestExecutionTimeForServiceDate =
            serviceDayToShanghaiDayStartUnixSeconds(serviceDate) +
            parseTimeAsTimestamp(latestExecutionTimeHHmm);
        if (startAt > latestExecutionTimeForServiceDate) {
            plannedExecutionTime = latestExecutionTimeForServiceDate;
        }
    }

    return plannedExecutionTime > now ? plannedExecutionTime : now;
}

export async function dispatchDailyProbeTasks(): Promise<DispatchDailyProbeTasksResult> {
    const config = useConfig();
    const scheduleState = loadPublishedScheduleStateSummary();
    const scheduleFilePath = getScheduleDatabaseFilePath();
    const now = getNowSeconds();

    if (!scheduleState) {
        markCurrentTrainProvenanceTaskSkipped('schedule_not_found');
        logger.warn(`schedule_not_found file=${scheduleFilePath}`);
        return {
            date: null,
            groupCount: 0,
            createdTaskIds: []
        };
    }

    const currentDate = serviceDateToDay(getCurrentDateString());
    if (scheduleState.date !== currentDate) {
        markCurrentTrainProvenanceTaskSkipped('schedule_not_current');
        logger.warn(
            `skip_non_current_schedule scheduleDate=${scheduleState.date} currentDate=${currentDate} file=${scheduleFilePath}`
        );
        return {
            date: scheduleState.date,
            groupCount: 0,
            createdTaskIds: []
        };
    }

    const defaultRetry = config.spider.scheduleProbe.probe.defaultRetry;
    const latestExecutionTimeHHmm =
        config.spider.scheduleProbe.probe.latestExecutionTimeHHmm;
    const tasksToEnqueue: EnqueueTaskInput[] = [];
    const probeGroups = Array.from(getTodayScheduleProbeGroups().values());
    const trackableProbeGroups: TrackableProbeGroup[] = [];
    for (const group of probeGroups) {
        const trainCodes = getSafeTodayScheduleProbeTrainCodes(group);
        if (
            !trainCodes.some((trainCode) =>
                isScheduleProbeTrackingEnabled(
                    trainCode,
                    config.spider.scheduleProbe.prefixRules
                )
            )
        ) {
            continue;
        }

        trackableProbeGroups.push({ group, trainCodes });
        const args = {
            trainCode: group.trainCode,
            trainInternalCode: group.trainInternalCode,
            allCodes: trainCodes.slice(0, MAX_CODES_PER_GROUP),
            startStation: group.startStation,
            endStation: group.endStation,
            startAt: group.startAt,
            endAt: group.endAt,
            retry: defaultRetry
        };
        const executionTime = resolveProbeTaskExecutionTime(
            group.startAt,
            now,
            scheduleState.date,
            latestExecutionTimeHHmm
        );
        tasksToEnqueue.push({
            executor: PROBE_TRAIN_DEPARTURE_TASK_EXECUTOR,
            args,
            executionTime
        });
    }

    const taskIds = enqueueTasks(tasksToEnqueue);
    for (const [index, entry] of trackableProbeGroups.entries()) {
        const createdTaskId = taskIds[index];
        if (!createdTaskId) {
            continue;
        }

        recordCurrentTrainProvenanceEventsForTrainCodes(entry.trainCodes, {
            serviceDate: scheduleState.date,
            startAt: entry.group.startAt,
            eventType: 'probe_task_dispatched',
            result: 'queued',
            linkedSchedulerTaskId: createdTaskId,
            payload: {
                executor: PROBE_TRAIN_DEPARTURE_TASK_EXECUTOR,
                executionTime: tasksToEnqueue[index]?.executionTime ?? now,
                allTrainCodes: entry.trainCodes,
                startStation: entry.group.startStation,
                endStation: entry.group.endStation,
                retry: defaultRetry
            }
        });
    }
    logger.info(
        `done date=${scheduleState.date} candidateGroups=${probeGroups.length} trackedGroups=${trackableProbeGroups.length} skippedGroups=${probeGroups.length - trackableProbeGroups.length} createdTasks=${tasksToEnqueue.length} defaultRetry=${defaultRetry} latestExecutionTimeHHmm=${latestExecutionTimeHHmm} firstTaskId=${taskIds[0] ?? 'null'}`
    );
    return {
        date: scheduleState.date,
        groupCount: trackableProbeGroups.length,
        createdTaskIds: taskIds
    };
}

export function registerDispatchDailyProbeTasksExecutor(): void {
    if (registered) {
        return;
    }

    registerTaskExecutor(DISPATCH_DAILY_PROBE_TASKS_EXECUTOR, {
        parse: parseEmptyTaskArgs,
        execute: async () => {
            await dispatchDailyProbeTasks();
        }
    });
    registered = true;
    logger.info(`registered executor=${DISPATCH_DAILY_PROBE_TASKS_EXECUTOR}`);
}
