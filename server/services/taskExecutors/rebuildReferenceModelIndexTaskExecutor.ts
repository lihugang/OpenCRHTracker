import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import { runIndexRebuild } from '~/server/services/indexRebuildWorker';
import {
    finishIndexRebuildExecution,
    startIndexRebuildExecution
} from '~/server/services/indexRebuildExecutionStore';
import { getCurrentTaskExecutionContext } from '~/server/services/taskExecutionContext';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import { enqueueTask } from '~/server/services/taskQueue';
import {
    formatShanghaiDateTime,
    getNextExecutionTimeByDailyTimesInShanghaiSeconds
} from '~/server/utils/date/shanghaiDateTime';

export const REBUILD_REFERENCE_MODEL_INDEX_TASK_EXECUTOR =
    'rebuild_reference_model_index';

const logger = getLogger('task-executor:rebuild-reference-model-index');

let registered = false;

function enqueueNextDailyReferenceModelTask() {
    const dailyTimesHHmm = useConfig().task.referenceModel.dailyTimesHHmm;
    const nextExecutionTime = getNextExecutionTimeByDailyTimesInShanghaiSeconds(
        Date.now(),
        dailyTimesHHmm
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
    const executionRecordId = startIndexRebuildExecution(
        REBUILD_REFERENCE_MODEL_INDEX_TASK_EXECUTOR,
        getCurrentTaskExecutionContext()?.taskId ?? null
    );

    try {
        await runIndexRebuild(REBUILD_REFERENCE_MODEL_INDEX_TASK_EXECUTOR);
        finishIndexRebuildExecution(executionRecordId, 'success');
        logger.info('rebuild_succeeded worker=true');
    } catch (error) {
        caughtError = error;
        const message =
            error instanceof Error
                ? `${error.name}: ${error.message}`
                : String(error);
        finishIndexRebuildExecution(executionRecordId, 'failed', message);
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
