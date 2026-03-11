import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import { ensureEmuDatabaseSchema } from '~/server/libs/database/emu';
import { ensureTaskDatabaseSchema } from '~/server/libs/database/task';
import { estimateIdleTaskDurationMs } from '~/server/services/idleTaskEstimator';
import {
    reconcileSingletonPendingTask,
    type EnqueueTaskOptions
} from '~/server/services/taskQueue';
import {
    BUILD_SCHEDULE_TASK_EXECUTOR,
    registerBuildScheduleTaskExecutor
} from '~/server/services/taskExecutors/buildScheduleTaskExecutor';
import {
    GENERATE_ROUTE_REFRESH_TASKS_EXECUTOR,
    registerGenerateRouteRefreshTasksExecutor
} from '~/server/services/taskExecutors/generateRouteRefreshTasksExecutor';
import { registerRefreshRouteBatchTaskExecutor } from '~/server/services/taskExecutors/refreshRouteBatchTaskExecutor';
import { registerDispatchDailyProbeTasksExecutor } from '~/server/services/taskExecutors/dispatchDailyProbeTasksExecutor';
import { registerProbeTrainDepartureTaskExecutor } from '~/server/services/taskExecutors/probeTrainDepartureTaskExecutor';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

const logger = getLogger('task-schedule-bootstrap');
const STARTUP_EXECUTORS = [
    BUILD_SCHEDULE_TASK_EXECUTOR,
    GENERATE_ROUTE_REFRESH_TASKS_EXECUTOR
] as const;

function reconcileStartupTask(
    executor: string,
    executionTime: number,
    options: EnqueueTaskOptions = {}
) {
    const result = reconcileSingletonPendingTask(
        executor,
        {},
        executionTime,
        options
    );
    logger.info(
        `startup_task_reconciled executor=${executor} action=${result.action} ` +
            `taskId=${result.taskId} removedTaskIds=${JSON.stringify(result.removedTaskIds)} ` +
            `reusedExecutionTime=${result.reusedExecutionTime ?? 'null'}`
    );
    return result.taskId;
}

export default defineNitroPlugin(() => {
    try {
        ensureTaskDatabaseSchema();
        ensureEmuDatabaseSchema();

        registerBuildScheduleTaskExecutor();
        registerRefreshRouteBatchTaskExecutor();
        registerGenerateRouteRefreshTasksExecutor();
        registerDispatchDailyProbeTasksExecutor();
        registerProbeTrainDepartureTaskExecutor();

        const disabledStartupExecutors = new Set<string>(
            useConfig().task.startup.disabledExecutors
        );
        const executionTime = getNowSeconds();
        const enqueuedStartupTasks: string[] = [];
        const skippedStartupTasks = STARTUP_EXECUTORS.filter((executor) =>
            disabledStartupExecutors.has(executor)
        );
        logger.info(
            `startup_executor_filter disabled=${JSON.stringify(Array.from(disabledStartupExecutors))} skipped=${JSON.stringify(skippedStartupTasks)}`
        );

        if (!disabledStartupExecutors.has(BUILD_SCHEDULE_TASK_EXECUTOR)) {
            const buildTaskId = reconcileStartupTask(
                BUILD_SCHEDULE_TASK_EXECUTOR,
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
            const generateTaskId = reconcileStartupTask(
                GENERATE_ROUTE_REFRESH_TASKS_EXECUTOR,
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
