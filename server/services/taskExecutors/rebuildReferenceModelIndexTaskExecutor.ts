import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import { rebuildReferenceModelIndex } from '~/server/services/referenceModelIndexStore';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import { enqueueTask } from '~/server/services/taskQueue';
import {
    formatShanghaiDateTime,
    getNextDayExecutionTimeInShanghaiSeconds
} from '~/server/utils/date/shanghaiDateTime';

export const REBUILD_REFERENCE_MODEL_INDEX_TASK_EXECUTOR =
    'rebuild_reference_model_index';

const logger = getLogger('task-executor:rebuild-reference-model-index');

let registered = false;

function enqueueNextDailyReferenceModelTask() {
    const dailyTimeHHmm = useConfig().task.referenceModel.dailyTimeHHmm;
    const nextExecutionTime = getNextDayExecutionTimeInShanghaiSeconds(
        Date.now(),
        dailyTimeHHmm
    );
    const taskId = enqueueTask(
        REBUILD_REFERENCE_MODEL_INDEX_TASK_EXECUTOR,
        {},
        nextExecutionTime
    );
    logger.info(
        `enqueued_next_daily_task id=${taskId} executor=${REBUILD_REFERENCE_MODEL_INDEX_TASK_EXECUTOR} executionTime=${nextExecutionTime} executionTimeAsiaShanghai=${formatShanghaiDateTime(nextExecutionTime)}`
    );
}

async function executeRebuildReferenceModelIndexTask() {
    let caughtError: unknown = null;

    try {
        const cache = rebuildReferenceModelIndex();
        logger.info(
            `rebuild_succeeded currentDate=${cache.currentDate} windowDays=${cache.windowDays} trainCodes=${cache.runsByTrainCode.size}`
        );
    } catch (error) {
        caughtError = error;
        const message =
            error instanceof Error
                ? `${error.name}: ${error.message}`
                : String(error);
        logger.error(`rebuild_failed error=${message}`);
    } finally {
        try {
            enqueueNextDailyReferenceModelTask();
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

export function registerRebuildReferenceModelIndexTaskExecutor() {
    if (registered) {
        return;
    }

    registerTaskExecutor(
        REBUILD_REFERENCE_MODEL_INDEX_TASK_EXECUTOR,
        async () => {
            await executeRebuildReferenceModelIndexTask();
        }
    );
    registered = true;
    logger.info(
        `registered executor=${REBUILD_REFERENCE_MODEL_INDEX_TASK_EXECUTOR}`
    );
}
