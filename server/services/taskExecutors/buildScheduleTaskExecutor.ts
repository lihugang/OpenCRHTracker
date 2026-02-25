import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import { enqueueTask } from '~/server/services/taskQueue';
import buildTodaySchedule from '~/server/utils/12306/buildTodaySchedule';
import {
    formatShanghaiDateTime,
    getNextDayExecutionTimeInShanghaiSeconds
} from '~/server/utils/date/shanghaiDateTime';

export const BUILD_SCHEDULE_TASK_EXECUTOR = 'build_today_schedule';

const logger = getLogger('task-executor:build-schedule');

let registered = false;

function enqueueNextDailyBuildTask() {
    const dailyTimeHHmm = useConfig().spider.scheduleProbe.dailyTimeHHmm;
    const nextExecutionTime = getNextDayExecutionTimeInShanghaiSeconds(
        Date.now(),
        dailyTimeHHmm
    );
    const id = enqueueTask(BUILD_SCHEDULE_TASK_EXECUTOR, {}, nextExecutionTime);
    logger.info(
        `[task-executor:build-schedule] enqueued_next_daily_task id=${id} executor=${BUILD_SCHEDULE_TASK_EXECUTOR} executionTime=${nextExecutionTime} executionTimeAsiaShanghai=${formatShanghaiDateTime(nextExecutionTime)}`
    );
}

async function executeBuildScheduleTask() {
    let caughtError: unknown = null;
    logger.info('[task-executor:build-schedule] start');
    try {
        const result = await buildTodaySchedule();
        logger.info(
            `[task-executor:build-schedule] success ok=${result.ok} date=${result.date} uniqueItems=${result.stats.uniqueItems} failedKeywords=${result.failedKeywords.length} failedEnrichCodes=${result.failedEnrichCodes.length}`
        );
    } catch (error) {
        caughtError = error;
        const message =
            error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        logger.error(`[task-executor:build-schedule] failed error=${message}`);
    } finally {
        try {
            enqueueNextDailyBuildTask();
        } catch (error) {
            const message =
                error instanceof Error ? `${error.name}: ${error.message}` : String(error);
            logger.error(
                `[task-executor:build-schedule] enqueue_next_daily_task_failed error=${message}`
            );
            if (!caughtError) {
                caughtError = error;
            }
        }
    }

    if (caughtError) {
        throw caughtError;
    }
}

export function registerBuildScheduleTaskExecutor() {
    if (registered) {
        return;
    }

    registerTaskExecutor(BUILD_SCHEDULE_TASK_EXECUTOR, async () => {
        await executeBuildScheduleTask();
    });
    registered = true;
    logger.info(
        `[task-executor:build-schedule] registered executor=${BUILD_SCHEDULE_TASK_EXECUTOR}`
    );
}
