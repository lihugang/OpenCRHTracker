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

export default defineNitroPlugin(() => {
    try {
        ensureTaskDatabaseSchema();

        registerBuildScheduleTaskExecutor();
        registerRefreshRouteBatchTaskExecutor();
        registerGenerateRouteRefreshTasksExecutor();
        registerDispatchDailyProbeTasksExecutor();
        registerProbeTrainDepartureTaskExecutor();

        const executionTime = getNowSeconds();
        const buildTaskId = enqueueTask(
            BUILD_SCHEDULE_TASK_EXECUTOR,
            {},
            executionTime
        );
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
        const dispatchTaskId = enqueueTask(
            DISPATCH_DAILY_PROBE_TASKS_EXECUTOR,
            {},
            executionTime
        );
        logger.info(
            `[task-schedule-bootstrap] enqueued_startup_tasks buildTaskId=${buildTaskId} buildExecutor=${BUILD_SCHEDULE_TASK_EXECUTOR} generateTaskId=${generateTaskId} generateExecutor=${GENERATE_ROUTE_REFRESH_TASKS_EXECUTOR} dispatchTaskId=${dispatchTaskId} dispatchExecutor=${DISPATCH_DAILY_PROBE_TASKS_EXECUTOR} executionTime=${executionTime}`
        );
    } catch (error) {
        const message =
            error instanceof Error
                ? `${error.name}: ${error.message}`
                : String(error);
        logger.error(
            `[task-schedule-bootstrap] bootstrap_failed error=${message}`
        );
    }
});
