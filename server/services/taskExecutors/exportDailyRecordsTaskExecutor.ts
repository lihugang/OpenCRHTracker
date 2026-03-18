import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import { writeDailyExportFiles } from '~/server/services/dailyExportStore';
import { listDailyRecordsAll } from '~/server/services/emuRoutesStore';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import { enqueueTask } from '~/server/services/taskQueue';
import getDayTimestampRange from '~/server/utils/date/getDayTimestampRange';
import {
    formatShanghaiDateTime,
    getNextDayExecutionTimeInShanghaiSeconds
} from '~/server/utils/date/shanghaiDateTime';
import { getRelativeDateString } from '~/server/utils/date/getCurrentDateString';

export const EXPORT_DAILY_RECORDS_TASK_EXECUTOR = 'export_daily_records';

const logger = getLogger('task-executor:export-daily-records');

let registered = false;

function enqueueNextDailyExportTask(): number {
    const dailyTimeHHmm = useConfig().task.dailyExport.dailyTimeHHmm;
    const nextExecutionTime = getNextDayExecutionTimeInShanghaiSeconds(
        Date.now(),
        dailyTimeHHmm
    );
    const taskId = enqueueTask(
        EXPORT_DAILY_RECORDS_TASK_EXECUTOR,
        {},
        nextExecutionTime
    );
    logger.info(
        `enqueued_next_daily_task id=${taskId} executor=${EXPORT_DAILY_RECORDS_TASK_EXECUTOR} executionTime=${nextExecutionTime} executionTimeAsiaShanghai=${formatShanghaiDateTime(nextExecutionTime)}`
    );
    return taskId;
}

async function executeExportDailyRecordsTask(): Promise<void> {
    let caughtError: unknown = null;

    try {
        const date = getRelativeDateString(-1);
        const dayRange = getDayTimestampRange(date);
        const rows = listDailyRecordsAll(dayRange.startAt, dayRange.endAt);
        const result = writeDailyExportFiles(date, rows);
        logger.info(
            `export_succeeded date=${date} total=${result.total} csvFilePath=${result.csvFilePath} jsonlFilePath=${result.jsonlFilePath}`
        );
    } catch (error) {
        caughtError = error;
        const message =
            error instanceof Error
                ? `${error.name}: ${error.message}`
                : String(error);
        logger.error(`export_failed error=${message}`);
    } finally {
        try {
            enqueueNextDailyExportTask();
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

export function registerExportDailyRecordsTaskExecutor(): void {
    if (registered) {
        return;
    }

    registerTaskExecutor(EXPORT_DAILY_RECORDS_TASK_EXECUTOR, async () => {
        await executeExportDailyRecordsTask();
    });
    registered = true;
    logger.info(`registered executor=${EXPORT_DAILY_RECORDS_TASK_EXECUTOR}`);
}
