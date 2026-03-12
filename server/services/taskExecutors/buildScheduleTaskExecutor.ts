import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import { enqueueTask } from '~/server/services/taskQueue';
import buildTodaySchedule from '~/server/utils/12306/buildTodaySchedule';
import {
    formatShanghaiDateTime,
    getNextDayExecutionTimeInShanghaiSeconds
} from '~/server/utils/date/shanghaiDateTime';
import { DISPATCH_DAILY_PROBE_TASKS_EXECUTOR } from '~/server/services/taskExecutors/dispatchDailyProbeTasksExecutor';

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
        `enqueued_next_daily_task id=${id} executor=${BUILD_SCHEDULE_TASK_EXECUTOR} executionTime=${nextExecutionTime} executionTimeAsiaShanghai=${formatShanghaiDateTime(nextExecutionTime)}`
    );
}

async function executeBuildScheduleTask() {
    let caughtError: unknown = null;
    let buildSucceeded = false;
    logger.info('start');
    try {
        const result = await buildTodaySchedule();
        buildSucceeded = true;
        logger.info(
            `success ok=${result.ok} date=${result.date} uniqueItems=${result.stats.uniqueItems} failedKeywords=${result.failedKeywords.length} failedEnrichCodes=${result.failedEnrichCodes.length}`
        );
    } catch (error) {
        caughtError = error;
        const message =
            error instanceof Error
                ? `${error.name}: ${error.message}`
                : String(error);
        logger.error(`failed error=${message}`);
    } finally {
        try {
            if (buildSucceeded) {
                const dispatchTaskId = enqueueTask(
                    DISPATCH_DAILY_PROBE_TASKS_EXECUTOR,
                    {},
                    Math.floor(Date.now() / 1000)
                );
                logger.info(
                    `enqueued_dispatch_daily_probe_task id=${dispatchTaskId} executor=${DISPATCH_DAILY_PROBE_TASKS_EXECUTOR}`
                );
            }
            enqueueNextDailyBuildTask();
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

export function registerBuildScheduleTaskExecutor() {
    if (registered) {
        return;
    }

    registerTaskExecutor(BUILD_SCHEDULE_TASK_EXECUTOR, async () => {
        await executeBuildScheduleTask();
    });
    registered = true;
    logger.info(`registered executor=${BUILD_SCHEDULE_TASK_EXECUTOR}`);
}
