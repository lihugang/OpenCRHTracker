import getLogger from '~/server/libs/log4js';
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
import getNowSeconds from '~/server/utils/time/getNowSeconds';

const logger = getLogger('task-schedule-bootstrap');

export default defineNitroPlugin(() => {
    registerBuildScheduleTaskExecutor();
    registerRefreshRouteBatchTaskExecutor();
    registerGenerateRouteRefreshTasksExecutor();

    const executionTime = getNowSeconds();
    const buildTaskId = enqueueTask(BUILD_SCHEDULE_TASK_EXECUTOR, {}, executionTime);
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
    logger.info(
        `[task-schedule-bootstrap] enqueued_startup_tasks buildTaskId=${buildTaskId} buildExecutor=${BUILD_SCHEDULE_TASK_EXECUTOR} generateTaskId=${generateTaskId} generateExecutor=${GENERATE_ROUTE_REFRESH_TASKS_EXECUTOR} executionTime=${executionTime}`
    );
});
