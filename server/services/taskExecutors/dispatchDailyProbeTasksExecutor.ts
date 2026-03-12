import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import {
    enqueueTasks,
    type EnqueueTaskInput
} from '~/server/services/taskQueue';
import { loadPublishedScheduleState } from '~/server/utils/12306/scheduleProbe/stateStore';
import { toUnixSecondsFromShanghaiDayOffset } from '~/server/utils/date/shanghaiDateTime';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
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
    startAtOffset: number;
    endAtOffset: number;
}

let registered = false;

function buildProbeTaskGroupKey(
    trainCode: string,
    trainInternalCode: string,
    startAtOffset: number
): string {
    const normalizedInternalCode = normalizeCode(trainInternalCode);
    if (normalizedInternalCode.length > 0) {
        return `internal:${normalizedInternalCode}`;
    }
    return `fallback:${normalizeCode(trainCode)}@${startAtOffset}`;
}

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
            existing.startAtOffset = Math.min(
                existing.startAtOffset,
                item.startAt
            );
            existing.endAtOffset = Math.max(existing.endAtOffset, item.endAt);
            continue;
        }

        groupsByKey.set(groupKey, {
            trainCode: normalizeCode(item.code),
            trainInternalCode: normalizeCode(item.internalCode),
            allCodes: new Set([normalizeCode(item.code)]),
            startAtOffset: item.startAt,
            endAtOffset: item.endAt
        });
    }

    const defaultRetry = config.spider.scheduleProbe.probe.defaultRetry;
    const tasksToEnqueue: EnqueueTaskInput[] = [];
    for (const group of groupsByKey.values()) {
        const startAt = toUnixSecondsFromShanghaiDayOffset(
            scheduleState.date,
            group.startAtOffset
        );
        const endAt = toUnixSecondsFromShanghaiDayOffset(
            scheduleState.date,
            group.endAtOffset
        );
        const allCodes = Array.from(group.allCodes).slice(
            0,
            MAX_CODES_PER_GROUP
        );
        const args: ProbeTaskArgs = {
            trainCode: group.trainCode,
            trainInternalCode: group.trainInternalCode,
            allCodes,
            startAt,
            endAt,
            retry: defaultRetry
        };
        const executionTime = startAt > now ? startAt : now;
        tasksToEnqueue.push({
            executor: PROBE_TRAIN_DEPARTURE_TASK_EXECUTOR,
            args,
            executionTime
        });
    }

    const taskIds = enqueueTasks(tasksToEnqueue);
    logger.info(
        `done date=${scheduleState.date} groups=${groupsByKey.size} createdTasks=${tasksToEnqueue.length} defaultRetry=${defaultRetry} firstTaskId=${taskIds[0] ?? 'null'}`
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
