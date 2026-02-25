import getLogger from '~/server/libs/log4js';
import { enqueueTask } from '~/server/services/taskQueue';
import {
    BUILD_SCHEDULE_TASK_EXECUTOR,
    registerBuildScheduleTaskExecutor
} from '~/server/services/taskExecutors/buildScheduleTaskExecutor';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

const logger = getLogger('task-schedule-bootstrap');

export default defineNitroPlugin(() => {
    registerBuildScheduleTaskExecutor();

    const executionTime = getNowSeconds();
    const taskId = enqueueTask(BUILD_SCHEDULE_TASK_EXECUTOR, {}, executionTime);
    logger.info(
        `[task-schedule-bootstrap] enqueued_startup_task id=${taskId} executor=${BUILD_SCHEDULE_TASK_EXECUTOR} executionTime=${executionTime}`
    );
});
