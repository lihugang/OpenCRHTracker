import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import { ensureEmuDatabaseSchema } from '~/server/libs/database/emu';
import { ensureTaskDatabaseSchema } from '~/server/libs/database/task';
import { estimateIdleTaskDurationMs } from '~/server/services/idleTaskEstimator';
import { listDailyRecordsAll } from '~/server/services/emuRoutesStore';
import { rehydrateProbeRuntimeState } from '~/server/services/probeRuntimeState';
import {
    removePendingTasksByExecutor,
    reconcileSingletonPendingTask,
    type EnqueueTaskOptions
} from '~/server/services/taskQueue';
import { loadProbeAssets } from '~/server/services/probeAssetStore';
import { warmYesterdayTrainEmuIndex } from '~/server/services/yesterdayTrainEmuIndexStore';
import {
    BUILD_SCHEDULE_TASK_EXECUTOR,
    registerBuildScheduleTaskExecutor
} from '~/server/services/taskExecutors/buildScheduleTaskExecutor';
import {
    GENERATE_ROUTE_REFRESH_TASKS_EXECUTOR,
    registerGenerateRouteRefreshTasksExecutor
} from '~/server/services/taskExecutors/generateRouteRefreshTasksExecutor';
import { registerRefreshRouteBatchTaskExecutor } from '~/server/services/taskExecutors/refreshRouteBatchTaskExecutor';
import { registerDispatchDailyProbeTasksExecutor } from '~/server/services/taskExecutors/dispatchDailyProbeTasksExecutor';
import { registerProbeTrainDepartureTaskExecutor } from '~/server/services/taskExecutors/probeTrainDepartureTaskExecutor';
import {
    CLEAR_DAILY_PROBE_STATUS_TASK_EXECUTOR,
    registerClearDailyProbeStatusTaskExecutor
} from '~/server/services/taskExecutors/clearDailyProbeStatusTaskExecutor';
import {
    CLEANUP_REVOKED_API_KEYS_TASK_EXECUTOR,
    registerCleanupRevokedApiKeysTaskExecutor
} from '~/server/services/taskExecutors/cleanupRevokedApiKeysTaskExecutor';
import {
    EXPORT_DAILY_RECORDS_TASK_EXECUTOR,
    registerExportDailyRecordsTaskExecutor
} from '~/server/services/taskExecutors/exportDailyRecordsTaskExecutor';
import { registerDetectCoupledEmuGroupTaskExecutor } from '~/server/services/taskExecutors/detectCoupledEmuGroupTaskExecutor';
import {
    REFRESH_ASSET_TASK_DEFINITIONS,
    registerRefreshAssetFileTaskExecutors
} from '~/server/services/taskExecutors/refreshAssetFileTaskExecutor';
import { getTodayScheduleProbeGroups } from '~/server/services/todayScheduleCache';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import {
    getNextExecutionTimeInShanghaiSeconds,
    getShanghaiDayStartUnixSeconds
} from '~/server/utils/date/shanghaiDateTime';

const logger = getLogger('task-schedule-bootstrap');
const STARTUP_EXECUTORS = [
    BUILD_SCHEDULE_TASK_EXECUTOR,
    GENERATE_ROUTE_REFRESH_TASKS_EXECUTOR,
    CLEAR_DAILY_PROBE_STATUS_TASK_EXECUTOR,
    CLEANUP_REVOKED_API_KEYS_TASK_EXECUTOR,
    EXPORT_DAILY_RECORDS_TASK_EXECUTOR
] as const;

function reconcileStartupTask(
    executor: string,
    executionTime: number,
    options: EnqueueTaskOptions = {}
) {
    const result = reconcileSingletonPendingTask(
        executor,
        {},
        executionTime,
        options
    );
    logger.info(
        `startup_task_reconciled executor=${executor} action=${result.action} ` +
            `taskId=${result.taskId} removedTaskIds=${JSON.stringify(result.removedTaskIds)} ` +
            `reusedExecutionTime=${result.reusedExecutionTime ?? 'null'}`
    );
    return result.taskId;
}

function reconcileRefreshAssetTasks(): string[] {
    const config = useConfig();
    const taskSummaries: string[] = [];

    for (const definition of REFRESH_ASSET_TASK_DEFINITIONS) {
        const assetConfig = config.data.assets[definition.key];
        if (!assetConfig.refresh.enabled) {
            const result = removePendingTasksByExecutor(definition.executor);
            logger.info(
                `refresh_asset_task_removed asset=${definition.key} executor=${definition.executor} removedTaskIds=${JSON.stringify(result.removedTaskIds)}`
            );
            continue;
        }

        const executionTime = getNextExecutionTimeInShanghaiSeconds(
            Date.now(),
            assetConfig.refresh.refreshAt
        );
        const taskId = reconcileStartupTask(definition.executor, executionTime);
        taskSummaries.push(`${definition.executor}:${taskId}`);
    }

    return taskSummaries;
}

function rehydrateProbeRuntimeCache(): void {
    const config = useConfig();
    const currentDate = getCurrentDateString();
    const dayStart = getShanghaiDayStartUnixSeconds(currentDate);
    const nextDayStart = dayStart + 24 * 60 * 60;
    const rows = listDailyRecordsAll(dayStart, nextDayStart - 1);
    const scheduleGroupsByTrainCode = new Map<
        string,
        { trainKey: string; trainInternalCode: string }
    >();

    for (const group of getTodayScheduleProbeGroups().values()) {
        for (const trainCode of new Set([group.trainCode, ...group.allCodes])) {
            scheduleGroupsByTrainCode.set(trainCode, {
                trainKey: group.trainKey,
                trainInternalCode: group.trainInternalCode
            });
        }
    }

    const summary = rehydrateProbeRuntimeState({
        rows: rows.map((row) => ({
            trainCode: row.train_code,
            emuCode: row.emu_code,
            startAt: row.start_at,
            endAt: row.end_at
        })),
        nowSeconds: getNowSeconds(),
        graceSeconds: config.spider.scheduleProbe.coupling.runningGraceSeconds,
        resolveGroupByTrainCode: (trainCode) =>
            scheduleGroupsByTrainCode.get(trainCode) ?? null
    });

    logger.info(
        `rehydrate_probe_runtime done routeRows=${summary.routeRows} restoredRunningEmuCodes=${summary.restoredRunningEmuCodes} restoredTrainKeys=${summary.restoredTrainKeys} expiredRows=${summary.expiredRows} fallbackKeys=${summary.fallbackKeys}`
    );
}

export default defineNitroPlugin(async () => {
    try {
        ensureTaskDatabaseSchema();
        ensureEmuDatabaseSchema();
        await loadProbeAssets();
        try {
            warmYesterdayTrainEmuIndex();
        } catch (error) {
            const message =
                error instanceof Error
                    ? `${error.name}: ${error.message}`
                    : String(error);
            logger.warn(
                `warm_yesterday_train_emu_index_failed error=${message}`
            );
        }

        registerBuildScheduleTaskExecutor();
        registerRefreshRouteBatchTaskExecutor();
        registerGenerateRouteRefreshTasksExecutor();
        registerDispatchDailyProbeTasksExecutor();
        registerProbeTrainDepartureTaskExecutor();
        registerClearDailyProbeStatusTaskExecutor();
        registerCleanupRevokedApiKeysTaskExecutor();
        registerExportDailyRecordsTaskExecutor();
        registerDetectCoupledEmuGroupTaskExecutor();
        registerRefreshAssetFileTaskExecutors();

        try {
            rehydrateProbeRuntimeCache();
        } catch (error) {
            const message =
                error instanceof Error
                    ? `${error.name}: ${error.message}`
                    : String(error);
            logger.warn(`rehydrate_probe_runtime_failed error=${message}`);
        }

        const disabledStartupExecutors = new Set<string>(
            useConfig().task.startup.disabledExecutors
        );
        const executionTime = getNowSeconds();
        const enqueuedStartupTasks: string[] = [];
        const skippedStartupTasks = STARTUP_EXECUTORS.filter((executor) =>
            disabledStartupExecutors.has(executor)
        );
        logger.info(
            `startup_executor_filter disabled=${JSON.stringify(Array.from(disabledStartupExecutors))} skipped=${JSON.stringify(skippedStartupTasks)}`
        );

        if (!disabledStartupExecutors.has(BUILD_SCHEDULE_TASK_EXECUTOR)) {
            const buildTaskId = reconcileStartupTask(
                BUILD_SCHEDULE_TASK_EXECUTOR,
                executionTime
            );
            enqueuedStartupTasks.push(
                `${BUILD_SCHEDULE_TASK_EXECUTOR}:${buildTaskId}`
            );
        }

        if (!disabledStartupExecutors.has(EXPORT_DAILY_RECORDS_TASK_EXECUTOR)) {
            const exportTaskId = reconcileStartupTask(
                EXPORT_DAILY_RECORDS_TASK_EXECUTOR,
                executionTime
            );
            enqueuedStartupTasks.push(
                `${EXPORT_DAILY_RECORDS_TASK_EXECUTOR}:${exportTaskId}`
            );
        }

        if (
            !disabledStartupExecutors.has(GENERATE_ROUTE_REFRESH_TASKS_EXECUTOR)
        ) {
            const generateExpectedDurationMs = estimateIdleTaskDurationMs(
                GENERATE_ROUTE_REFRESH_TASKS_EXECUTOR,
                0
            );
            const generateTaskId = reconcileStartupTask(
                GENERATE_ROUTE_REFRESH_TASKS_EXECUTOR,
                executionTime,
                {
                    isIdle: true,
                    expectedDurationMs: generateExpectedDurationMs
                }
            );
            enqueuedStartupTasks.push(
                `${GENERATE_ROUTE_REFRESH_TASKS_EXECUTOR}:${generateTaskId}`
            );
        }

        if (
            !disabledStartupExecutors.has(
                CLEAR_DAILY_PROBE_STATUS_TASK_EXECUTOR
            )
        ) {
            const clearExecutionTime = getNextExecutionTimeInShanghaiSeconds(
                Date.now(),
                useConfig().spider.scheduleProbe.coupling.statusResetTimeHHmm
            );
            const clearTaskId = reconcileStartupTask(
                CLEAR_DAILY_PROBE_STATUS_TASK_EXECUTOR,
                clearExecutionTime
            );
            enqueuedStartupTasks.push(
                `${CLEAR_DAILY_PROBE_STATUS_TASK_EXECUTOR}:${clearTaskId}`
            );
        }

        if (
            !disabledStartupExecutors.has(
                CLEANUP_REVOKED_API_KEYS_TASK_EXECUTOR
            )
        ) {
            const cleanupExecutionTime = getNextExecutionTimeInShanghaiSeconds(
                Date.now(),
                useConfig().task.apiKeyCleanup.dailyTimeHHmm
            );
            const cleanupTaskId = reconcileStartupTask(
                CLEANUP_REVOKED_API_KEYS_TASK_EXECUTOR,
                cleanupExecutionTime
            );
            enqueuedStartupTasks.push(
                `${CLEANUP_REVOKED_API_KEYS_TASK_EXECUTOR}:${cleanupTaskId}`
            );
        }

        enqueuedStartupTasks.push(...reconcileRefreshAssetTasks());

        logger.info(
            `enqueued_startup_tasks executionTime=${executionTime} enqueued=${JSON.stringify(enqueuedStartupTasks)}`
        );
    } catch (error) {
        const message =
            error instanceof Error
                ? `${error.name}: ${error.message}`
                : String(error);
        logger.error(`bootstrap_failed error=${message}`);
        throw error;
    }
});
