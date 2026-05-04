import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import { getTodayScheduleProbeGroups } from '~/server/services/todayScheduleCache';
import {
    enqueueTasks,
    type EnqueueTaskInput
} from '~/server/services/taskQueue';
import {
    markCurrentTrainProvenanceTaskSkipped,
    recordCurrentTrainProvenanceEventsForTrainCodes
} from '~/server/services/trainProvenanceRecorder';
import { loadPublishedScheduleState } from '~/server/utils/12306/scheduleProbe/stateStore';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import { getShanghaiUnixSecondsFromDateAndTime } from '~/server/utils/date/shanghaiDateTime';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import { PROBE_TRAIN_DEPARTURE_TASK_EXECUTOR } from '~/server/services/taskExecutors/probeTrainDepartureTaskExecutor';

export const DISPATCH_DAILY_PROBE_TASKS_EXECUTOR = 'dispatch_daily_probe_tasks';

const logger = getLogger('task-executor:dispatch-daily-probe');
const MAX_CODES_PER_GROUP = 8;
const DISABLED_LATEST_EXECUTION_TIME_HHMM = '0000';

let registered = false;

function resolveProbeTaskExecutionTime(
    startAt: number,
    now: number,
    serviceDate: string,
    latestExecutionTimeHHmm: string
): number {
    let plannedExecutionTime = startAt;

    if (latestExecutionTimeHHmm !== DISABLED_LATEST_EXECUTION_TIME_HHMM) {
        const latestExecutionTime = getShanghaiUnixSecondsFromDateAndTime(
            serviceDate,
            latestExecutionTimeHHmm
        );
        if (startAt > latestExecutionTime) {
            plannedExecutionTime = latestExecutionTime;
        }
    }

    return plannedExecutionTime > now ? plannedExecutionTime : now;
}

async function executeDispatchDailyProbeTasks(): Promise<void> {
    const config = useConfig();
    const scheduleState = loadPublishedScheduleState(
        config.data.assets.schedule.file
    );
    const now = getNowSeconds();

    if (!scheduleState) {
        markCurrentTrainProvenanceTaskSkipped('schedule_not_found');
        logger.warn(
            `schedule_not_found file=${config.data.assets.schedule.file}`
        );
        return;
    }

    const currentDate = getCurrentDateString();
    if (scheduleState.date !== currentDate) {
        markCurrentTrainProvenanceTaskSkipped('schedule_not_current');
        logger.warn(
            `skip_non_current_schedule scheduleDate=${scheduleState.date} currentDate=${currentDate} file=${config.data.assets.schedule.file}`
        );
        return;
    }

    const defaultRetry = config.spider.scheduleProbe.probe.defaultRetry;
    const latestExecutionTimeHHmm =
        config.spider.scheduleProbe.probe.latestExecutionTimeHHmm;
    const tasksToEnqueue: EnqueueTaskInput[] = [];
    for (const group of getTodayScheduleProbeGroups().values()) {
        const args = {
            trainCode: group.trainCode,
            trainInternalCode: group.trainInternalCode,
            allCodes: group.allCodes.slice(0, MAX_CODES_PER_GROUP),
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
    for (const [index, group] of Array.from(
        getTodayScheduleProbeGroups().values()
    ).entries()) {
        const createdTaskId = taskIds[index];
        if (!createdTaskId) {
            continue;
        }

        recordCurrentTrainProvenanceEventsForTrainCodes(
            [group.trainCode, ...group.allCodes],
            {
                serviceDate: scheduleState.date,
                startAt: group.startAt,
                eventType: 'probe_task_dispatched',
                result: 'queued',
                linkedSchedulerTaskId: createdTaskId,
                payload: {
                    executor: PROBE_TRAIN_DEPARTURE_TASK_EXECUTOR,
                    executionTime: tasksToEnqueue[index]?.executionTime ?? now,
                    allTrainCodes: [group.trainCode, ...group.allCodes],
                    startStation: group.startStation,
                    endStation: group.endStation,
                    retry: defaultRetry
                }
            }
        );
    }
    logger.info(
        `done date=${scheduleState.date} groups=${getTodayScheduleProbeGroups().size} createdTasks=${tasksToEnqueue.length} defaultRetry=${defaultRetry} latestExecutionTimeHHmm=${latestExecutionTimeHHmm} firstTaskId=${taskIds[0] ?? 'null'}`
    );
}

export function registerDispatchDailyProbeTasksExecutor(): void {
    if (registered) {
        return;
    }

    registerTaskExecutor(DISPATCH_DAILY_PROBE_TASKS_EXECUTOR, async () => {
        await executeDispatchDailyProbeTasks();
    });
    registered = true;
    logger.info(`registered executor=${DISPATCH_DAILY_PROBE_TASKS_EXECUTOR}`);
}
