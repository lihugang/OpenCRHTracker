import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import { getTodayScheduleProbeGroups } from '~/server/services/todayScheduleCache';
import {
    enqueueTasks,
    type EnqueueTaskInput
} from '~/server/services/taskQueue';
import { loadPublishedScheduleState } from '~/server/utils/12306/scheduleProbe/stateStore';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import { PROBE_TRAIN_DEPARTURE_TASK_EXECUTOR } from '~/server/services/taskExecutors/probeTrainDepartureTaskExecutor';

export const DISPATCH_DAILY_PROBE_TASKS_EXECUTOR = 'dispatch_daily_probe_tasks';

const logger = getLogger('task-executor:dispatch-daily-probe');
const MAX_CODES_PER_GROUP = 8;

let registered = false;

async function executeDispatchDailyProbeTasks(): Promise<void> {
    const config = useConfig();
    const scheduleState = loadPublishedScheduleState(
        config.data.assets.schedule.file
    );
    const now = getNowSeconds();

    if (!scheduleState) {
        logger.warn(
            `schedule_not_found file=${config.data.assets.schedule.file}`
        );
        return;
    }

    const currentDate = getCurrentDateString();
    if (scheduleState.date !== currentDate) {
        logger.warn(
            `skip_non_current_schedule scheduleDate=${scheduleState.date} currentDate=${currentDate} file=${config.data.assets.schedule.file}`
        );
        return;
    }

    const defaultRetry = config.spider.scheduleProbe.probe.defaultRetry;
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
        const executionTime = group.startAt > now ? group.startAt : now;
        tasksToEnqueue.push({
            executor: PROBE_TRAIN_DEPARTURE_TASK_EXECUTOR,
            args,
            executionTime
        });
    }

    const taskIds = enqueueTasks(tasksToEnqueue);
    logger.info(
        `done date=${scheduleState.date} groups=${getTodayScheduleProbeGroups().size} createdTasks=${tasksToEnqueue.length} defaultRetry=${defaultRetry} firstTaskId=${taskIds[0] ?? 'null'}`
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
