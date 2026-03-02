import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import { enqueueTask } from '~/server/services/taskQueue';
import { loadExistingScheduleState } from '~/server/utils/12306/scheduleProbe/stateStore';
import {
    formatShanghaiDateTime,
    getNextDayExecutionTimeInShanghaiSeconds
} from '~/server/utils/date/shanghaiDateTime';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import { PROBE_TRAIN_DEPARTURE_TASK_EXECUTOR } from '~/server/services/taskExecutors/probeTrainDepartureTaskExecutor';

export const DISPATCH_DAILY_PROBE_TASKS_EXECUTOR = 'dispatch_daily_probe_tasks';

const logger = getLogger('task-executor:dispatch-daily-probe');
const MAX_CODES_PER_GROUP = 8;

interface ProbeTaskArgs {
    trainCode: string;
    trainInternalCode: string;
    allCodes: string[];
    startAt: number;
    endAt: number;
    retry: number;
}

interface ProbeTaskGroup {
    trainCode: string;
    trainInternalCode: string;
    allCodes: Set<string>;
    startAt: number;
    endAt: number;
}

let registered = false;

function buildProbeTaskGroupKey(
    trainCode: string,
    trainInternalCode: string,
    startAt: number
): string {
    const normalizedInternalCode = normalizeCode(trainInternalCode);
    if (normalizedInternalCode.length > 0) {
        return `internal:${normalizedInternalCode}`;
    }
    return `fallback:${normalizeCode(trainCode)}@${startAt}`;
}

function enqueueNextDailyDispatchTask(): number {
    const dailyTimeHHmm = useConfig().spider.scheduleProbe.dailyTimeHHmm;
    const nextExecutionTime = getNextDayExecutionTimeInShanghaiSeconds(
        Date.now(),
        dailyTimeHHmm
    );
    const taskId = enqueueTask(
        DISPATCH_DAILY_PROBE_TASKS_EXECUTOR,
        {},
        nextExecutionTime
    );
    logger.info(
        `[task-executor:dispatch-daily-probe] enqueued_next_daily_task id=${taskId} executionTime=${nextExecutionTime} executionTimeAsiaShanghai=${formatShanghaiDateTime(nextExecutionTime)}`
    );
    return taskId;
}

async function executeDispatchDailyProbeTasks(): Promise<void> {
    const config = useConfig();
    const scheduleState = loadExistingScheduleState(
        config.data.assets.schedule.file
    );
    const now = getNowSeconds();

    if (!scheduleState) {
        logger.warn(
            `[task-executor:dispatch-daily-probe] schedule_not_found file=${config.data.assets.schedule.file}`
        );
        enqueueNextDailyDispatchTask();
        return;
    }

    const groupsByKey = new Map<string, ProbeTaskGroup>();
    for (const item of scheduleState.items) {
        if (item.startAt === null || item.endAt === null) {
            continue;
        }

        const groupKey = buildProbeTaskGroupKey(
            item.code,
            item.internalCode,
            item.startAt
        );
        const existing = groupsByKey.get(groupKey);
        if (existing) {
            existing.allCodes.add(normalizeCode(item.code));
            existing.startAt = Math.min(existing.startAt, item.startAt);
            existing.endAt = Math.max(existing.endAt, item.endAt);
            continue;
        }

        groupsByKey.set(groupKey, {
            trainCode: normalizeCode(item.code),
            trainInternalCode: normalizeCode(item.internalCode),
            allCodes: new Set([normalizeCode(item.code)]),
            startAt: item.startAt,
            endAt: item.endAt
        });
    }

    const defaultRetry = config.spider.scheduleProbe.probe.defaultRetry;
    let createdTaskCount = 0;
    for (const group of groupsByKey.values()) {
        const allCodes = Array.from(group.allCodes).slice(
            0,
            MAX_CODES_PER_GROUP
        );
        const args: ProbeTaskArgs = {
            trainCode: group.trainCode,
            trainInternalCode: group.trainInternalCode,
            allCodes,
            startAt: group.startAt,
            endAt: group.endAt,
            retry: defaultRetry
        };
        const executionTime = group.startAt > now ? group.startAt : now;
        enqueueTask(PROBE_TRAIN_DEPARTURE_TASK_EXECUTOR, args, executionTime);
        createdTaskCount += 1;
    }

    const nextDailyTaskId = enqueueNextDailyDispatchTask();
    logger.info(
        `[task-executor:dispatch-daily-probe] done date=${scheduleState.date} groups=${groupsByKey.size} createdTasks=${createdTaskCount} defaultRetry=${defaultRetry} nextDailyTaskId=${nextDailyTaskId}`
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
    logger.info(
        `[task-executor:dispatch-daily-probe] registered executor=${DISPATCH_DAILY_PROBE_TASKS_EXECUTOR}`
    );
}
