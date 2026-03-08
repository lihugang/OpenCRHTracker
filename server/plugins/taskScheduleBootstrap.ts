import getLogger from '~/server/libs/log4js';
import { ensureTaskDatabaseSchema } from '~/server/libs/database/task';
import { estimateIdleTaskDurationMs } from '~/server/services/idleTaskEstimator';
import { enqueueTask } from '~/server/services/taskQueue';
import {
    BUILD_SCHEDULE_TASK_EXECUTOR,
    registerBuildScheduleTaskExecutor
} from '~/server/services/taskExecutors/buildScheduleTaskExecutor';
import {
    GENERATE_ROUTE_REFRESH_TASKS_EXECUTOR,
    registerGenerateRouteRefreshTasksExecutor
} from '~/server/services/taskExecutors/generateRouteRefreshTasksExecutor';
import { registerRefreshRouteBatchTaskExecutor } from '~/server/services/taskExecutors/refreshRouteBatchTaskExecutor';
import {
    DISPATCH_DAILY_PROBE_TASKS_EXECUTOR,
    registerDispatchDailyProbeTasksExecutor
} from '~/server/services/taskExecutors/dispatchDailyProbeTasksExecutor';
import { registerProbeTrainDepartureTaskExecutor } from '~/server/services/taskExecutors/probeTrainDepartureTaskExecutor';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

const logger = getLogger('task-schedule-bootstrap');
const DISABLE_STARTUP_EXECUTORS_ARG_PREFIX =
    '--disable-startup-executors=';
const STARTUP_EXECUTORS = [
    BUILD_SCHEDULE_TASK_EXECUTOR,
    GENERATE_ROUTE_REFRESH_TASKS_EXECUTOR,
    DISPATCH_DAILY_PROBE_TASKS_EXECUTOR
] as const;
const STARTUP_EXECUTOR_SET = new Set<string>(STARTUP_EXECUTORS);

function parseDisabledStartupExecutors(): Set<string> {
    const rawArg = process.argv.find((item) =>
        item.startsWith(DISABLE_STARTUP_EXECUTORS_ARG_PREFIX)
    );
    if (!rawArg) {
        return new Set<string>();
    }

    const rawValue = rawArg
        .slice(DISABLE_STARTUP_EXECUTORS_ARG_PREFIX.length)
        .trim();
    if (rawValue.length === 0) {
        return new Set<string>();
    }

    const disabledExecutors = new Set<string>();
    for (const rawExecutor of rawValue.split(',')) {
        const executor = rawExecutor.trim();
        if (executor.length === 0) {
            continue;
        }
        if (!STARTUP_EXECUTOR_SET.has(executor)) {
            throw new Error(
                `unsupported disabled startup executor: ${executor}; allowed: ${STARTUP_EXECUTORS.join(', ')}`
            );
        }
        disabledExecutors.add(executor);
    }

    return disabledExecutors;
}

export default defineNitroPlugin(() => {
    try {
        ensureTaskDatabaseSchema();

        registerBuildScheduleTaskExecutor();
        registerRefreshRouteBatchTaskExecutor();
        registerGenerateRouteRefreshTasksExecutor();
        registerDispatchDailyProbeTasksExecutor();
        registerProbeTrainDepartureTaskExecutor();

        const disabledStartupExecutors = parseDisabledStartupExecutors();
        const executionTime = getNowSeconds();
        const enqueuedStartupTasks: string[] = [];
        const skippedStartupTasks = STARTUP_EXECUTORS.filter((executor) =>
            disabledStartupExecutors.has(executor)
        );
        logger.info(
            `startup_executor_filter disabled=${JSON.stringify(Array.from(disabledStartupExecutors))} skipped=${JSON.stringify(skippedStartupTasks)}`
        );

        if (!disabledStartupExecutors.has(BUILD_SCHEDULE_TASK_EXECUTOR)) {
            const buildTaskId = enqueueTask(
                BUILD_SCHEDULE_TASK_EXECUTOR,
                {},
                executionTime
            );
            enqueuedStartupTasks.push(
                `${BUILD_SCHEDULE_TASK_EXECUTOR}:${buildTaskId}`
            );
        }

        if (
            !disabledStartupExecutors.has(GENERATE_ROUTE_REFRESH_TASKS_EXECUTOR)
        ) {
            const generateExpectedDurationMs = estimateIdleTaskDurationMs(
                GENERATE_ROUTE_REFRESH_TASKS_EXECUTOR,
                0
            );
            const generateTaskId = enqueueTask(
                GENERATE_ROUTE_REFRESH_TASKS_EXECUTOR,
                {},
                executionTime,
                {
                    isIdle: true,
                    expectedDurationMs: generateExpectedDurationMs
                }
            );
            enqueuedStartupTasks.push(
                `${GENERATE_ROUTE_REFRESH_TASKS_EXECUTOR}:${generateTaskId}`
            );
        }

        if (
            !disabledStartupExecutors.has(DISPATCH_DAILY_PROBE_TASKS_EXECUTOR)
        ) {
            const dispatchTaskId = enqueueTask(
                DISPATCH_DAILY_PROBE_TASKS_EXECUTOR,
                {},
                executionTime
            );
            enqueuedStartupTasks.push(
                `${DISPATCH_DAILY_PROBE_TASKS_EXECUTOR}:${dispatchTaskId}`
            );
        }

        logger.info(
            `enqueued_startup_tasks executionTime=${executionTime} enqueued=${JSON.stringify(enqueuedStartupTasks)}`
        );
    } catch (error) {
        const message =
            error instanceof Error
                ? `${error.name}: ${error.message}`
                : String(error);
        logger.error(
            `bootstrap_failed error=${message}`
        );
    }
});
