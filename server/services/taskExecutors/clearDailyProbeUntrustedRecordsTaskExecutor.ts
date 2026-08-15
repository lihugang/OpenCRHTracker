import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import { clearProbeUntrustedRecords } from '~/server/services/probeUntrustedRecordStore';
import {
    parseEmptyTaskArgs,
    registerTaskExecutor
} from '~/server/services/taskExecutorRegistry';
import { enqueueTask } from '~/server/services/taskQueue';
import {
    formatShanghaiDateTime,
    getNextDayExecutionTimeInShanghaiSeconds
} from '~/server/utils/date/shanghaiDateTime';

export const CLEAR_DAILY_PROBE_UNTRUSTED_RECORDS_TASK_EXECUTOR =
    'clear_daily_probe_untrusted_records';

const logger = getLogger('task-executor:clear-daily-probe-untrusted-records');

let registered = false;

function enqueueNextClearTask(): number {
    const dailyTimeHHmm =
        useConfig().spider.scheduleProbe.coupling.statusResetTimeHHmm;
    const nextExecutionTime = getNextDayExecutionTimeInShanghaiSeconds(
        Date.now(),
        dailyTimeHHmm
    );
    const taskId = enqueueTask(
        CLEAR_DAILY_PROBE_UNTRUSTED_RECORDS_TASK_EXECUTOR,
        {},
        nextExecutionTime
    );
    logger.info(
        `enqueued_next_daily_task id=${taskId} executor=${CLEAR_DAILY_PROBE_UNTRUSTED_RECORDS_TASK_EXECUTOR} executionTime=${nextExecutionTime} executionTimeAsiaShanghai=${formatShanghaiDateTime(nextExecutionTime)}`
    );
    return taskId;
}

async function executeClearDailyProbeUntrustedRecordsTask(): Promise<void> {
    let caughtError: unknown = null;
    try {
        const clearedRows = clearProbeUntrustedRecords();
        logger.info(`cleared_probe_untrusted_records rows=${clearedRows}`);
    } catch (error) {
        caughtError = error;
        const message =
            error instanceof Error
                ? `${error.name}: ${error.message}`
                : String(error);
        logger.error(`clear_failed error=${message}`);
    } finally {
        try {
            enqueueNextClearTask();
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

export function registerClearDailyProbeUntrustedRecordsTaskExecutor(): void {
    if (registered) {
        return;
    }

    registerTaskExecutor(CLEAR_DAILY_PROBE_UNTRUSTED_RECORDS_TASK_EXECUTOR, {
        parse: parseEmptyTaskArgs,
        execute: async () => executeClearDailyProbeUntrustedRecordsTask()
    });
    registered = true;
    logger.info(
        `registered executor=${CLEAR_DAILY_PROBE_UNTRUSTED_RECORDS_TASK_EXECUTOR}`
    );
}
