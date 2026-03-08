import { startTaskScheduler } from '~/server/services/taskScheduler';
import { ensureTaskDatabaseSchema } from '~/server/libs/database/task';
import { ensureEmuDatabaseSchema } from '~/server/libs/database/emu';
import getLogger from '~/server/libs/log4js';

const logger = getLogger('task-scheduler-plugin');

export default defineNitroPlugin(() => {
    try {
        ensureTaskDatabaseSchema();
        ensureEmuDatabaseSchema();
        startTaskScheduler();
    } catch (error) {
        const message =
            error instanceof Error
                ? `${error.name}: ${error.message}`
                : String(error);
        logger.error(`start_failed error=${message}`);
    }
});
