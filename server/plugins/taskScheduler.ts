import { startTaskScheduler } from '~/server/services/taskScheduler';
import { ensureTaskDatabaseSchema } from '~/server/libs/database/task';
import getLogger from '~/server/libs/log4js';

const logger = getLogger('task-scheduler-plugin');

export default defineNitroPlugin(() => {
    try {
        ensureTaskDatabaseSchema();
        startTaskScheduler();
    } catch (error) {
        const message =
            error instanceof Error
                ? `${error.name}: ${error.message}`
                : String(error);
        logger.error(`[task-scheduler-plugin] start_failed error=${message}`);
    }
});
