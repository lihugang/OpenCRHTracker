import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import { deleteRevokedApiKeysBefore } from '~/server/services/authStore';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import { enqueueTask } from '~/server/services/taskQueue';
import {
    formatShanghaiDateTime,
    getNextDayExecutionTimeInShanghaiSeconds
} from '~/server/utils/date/shanghaiDateTime';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

export const CLEANUP_REVOKED_API_KEYS_TASK_EXECUTOR =
    'cleanup_revoked_api_keys';

const logger = getLogger('task-executor:cleanup-revoked-api-keys');

let registered = false;

function enqueueNextCleanupTask(): number {
    const dailyTimeHHmm = useConfig().task.apiKeyCleanup.dailyTimeHHmm;
    const nextExecutionTime = getNextDayExecutionTimeInShanghaiSeconds(
        Date.now(),
        dailyTimeHHmm
    );
    const taskId = enqueueTask(
        CLEANUP_REVOKED_API_KEYS_TASK_EXECUTOR,
        {},
        nextExecutionTime
    );
    logger.info(
        `enqueued_next_daily_task id=${taskId} executor=${CLEANUP_REVOKED_API_KEYS_TASK_EXECUTOR} executionTime=${nextExecutionTime} executionTimeAsiaShanghai=${formatShanghaiDateTime(nextExecutionTime)}`
    );
    return taskId;
}

async function executeCleanupRevokedApiKeysTask(): Promise<void> {
    let caughtError: unknown = null;
    try {
        const retentionDays = useConfig().task.apiKeyCleanup.retentionDays;
        const cutoffTimestamp = getNowSeconds() - retentionDays * 24 * 60 * 60;
        const deletedRows = deleteRevokedApiKeysBefore(cutoffTimestamp);
        logger.info(
            `cleaned deletedRows=${deletedRows} retentionDays=${retentionDays} cutoffTimestamp=${cutoffTimestamp}`
        );
    } catch (error) {
        caughtError = error;
        const message =
            error instanceof Error
                ? `${error.name}: ${error.message}`
                : String(error);
        logger.error(`cleanup_failed error=${message}`);
    } finally {
        try {
            enqueueNextCleanupTask();
        } catch (error) {
            const message =
                error instanceof Error
                    ? `${error.name}: ${error.message}`
                    : String(error);
            logger.error(`enqueue_next_daily_task_failed error=${message}`);
            if (!caughtError) {
                caughtError = error;
            }
        }
    }

    if (caughtError) {
        throw caughtError;
    }
}

export function registerCleanupRevokedApiKeysTaskExecutor(): void {
    if (registered) {
        return;
    }

    registerTaskExecutor(CLEANUP_REVOKED_API_KEYS_TASK_EXECUTOR, async () => {
        await executeCleanupRevokedApiKeysTask();
    });
    registered = true;
    logger.info(
        `registered executor=${CLEANUP_REVOKED_API_KEYS_TASK_EXECUTOR}`
    );
}
