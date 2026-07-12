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

export const REBUILD_TRAIN_CIRCULATION_INDEX_TASK_EXECUTOR =
    'rebuild_train_circulation_index';

const logger = getLogger('task-executor:rebuild-train-circulation-index');

let registered = false;

function enqueueNextDailyCirculationTask() {
    const dailyTimesHHmm = useConfig().task.circulation.dailyTimesHHmm;
    const nextExecutionTime = getNextExecutionTimeByDailyTimesInShanghaiSeconds(
        Date.now(),
        dailyTimesHHmm
    );
    const taskId = enqueueTask(
        REBUILD_TRAIN_CIRCULATION_INDEX_TASK_EXECUTOR,
        {},
        nextExecutionTime
    );
    logger.info(
        `enqueued_next_daily_task id=${taskId} executor=${REBUILD_TRAIN_CIRCULATION_INDEX_TASK_EXECUTOR} executionTime=${nextExecutionTime} executionTimeAsiaShanghai=${formatShanghaiDateTime(nextExecutionTime)}`
    );
}

async function executeRebuildTrainCirculationIndexTask() {
    let caughtError: unknown = null;
    const executionRecordId = startIndexRebuildExecution(
        REBUILD_TRAIN_CIRCULATION_INDEX_TASK_EXECUTOR,
        getCurrentTaskExecutionContext()?.taskId ?? null
    );

    try {
        await runIndexRebuild(REBUILD_TRAIN_CIRCULATION_INDEX_TASK_EXECUTOR);
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
            enqueueNextDailyCirculationTask();
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

export function registerRebuildTrainCirculationIndexTaskExecutor() {
    if (registered) {
        return;
    }

    registerTaskExecutor(
        REBUILD_TRAIN_CIRCULATION_INDEX_TASK_EXECUTOR,
        async () => {
            await executeRebuildTrainCirculationIndexTask();
        }
    );
    registered = true;
    logger.info(
        `registered executor=${REBUILD_TRAIN_CIRCULATION_INDEX_TASK_EXECUTOR}`
    );
}
