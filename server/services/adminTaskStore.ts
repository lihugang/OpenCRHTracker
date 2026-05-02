import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import { estimateIdleTaskDurationMs } from '~/server/services/idleTaskEstimator';
import {
    enqueueTask,
    enqueueTasks,
    type EnqueueTaskInput
} from '~/server/services/taskQueue';
import { EXPORT_DAILY_RECORDS_MANUAL_TASK_EXECUTOR } from '~/server/services/taskExecutors/exportDailyRecordsTaskExecutor';
import { REFRESH_ROUTE_BATCH_TASK_EXECUTOR } from '~/server/services/taskExecutors/refreshRouteBatchTaskExecutor';
import { loadPublishedScheduleState } from '~/server/utils/12306/scheduleProbe/stateStore';
import { splitIntoBatches } from '~/server/utils/12306/scheduleProbe/taskHelpers';
import uniqueNormalizedCodes from '~/server/utils/12306/uniqueNormalizedCodes';
import ensure from '~/server/utils/api/executor/ensure';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import type {
    AdminCreateTaskResponse,
    AdminCreateTaskRequest,
    AdminTaskOverviewResponse
} from '~/types/admin';

const logger = getLogger('admin-task-store');

type AdminTaskSqlKey = 'selectTaskOverviewCounts';

interface AdminTaskOverviewCountsRow {
    remainingTotal: number;
    remainingWithin10Minutes: number;
    remainingWithin30Minutes: number;
    remainingWithin1Hour: number;
}

const adminTaskSql = importSqlBatch('tasks/queries') as Record<
    AdminTaskSqlKey,
    string
>;
const adminTaskStatements = createPreparedSqlStore<AdminTaskSqlKey>({
    dbName: 'task',
    scope: 'admin-task-store',
    sql: adminTaskSql
});

interface CreatedTaskRecord {
    taskId: number;
    executor: string;
    executionTime: number;
}

function toCreatedTaskRecords(
    taskIds: readonly number[],
    executor: string,
    executionTime: number
): CreatedTaskRecord[] {
    return taskIds.map((taskId) => ({
        taskId,
        executor,
        executionTime
    }));
}

function estimateRefreshRouteBatchTaskDurationMs(batchSize: number): number {
    const queryMinIntervalMs = useConfig().spider.rateLimit.query.minIntervalMs;
    return estimateIdleTaskDurationMs(
        REFRESH_ROUTE_BATCH_TASK_EXECUTOR,
        batchSize * queryMinIntervalMs
    );
}

function assertPublishedScheduleReadyForRefresh(): void {
    const scheduleFilePath = useConfig().data.assets.schedule.file;
    const state = loadPublishedScheduleState(scheduleFilePath);
    ensure(
        state !== null,
        409,
        'schedule_not_ready',
        '当前没有可用的当日运行图，无法创建车次 refresh 任务'
    );

    const currentDate = getCurrentDateString();
    ensure(
        state.date === currentDate,
        409,
        'schedule_not_ready',
        '当前 published schedule 不是今天，无法创建车次 refresh 任务'
    );
}

function createRegenerateDailyExportTask(
    request: Extract<
        AdminCreateTaskRequest,
        { type: 'regenerate_daily_export' }
    >
): AdminCreateTaskResponse {
    const executionTime = getNowSeconds();
    const taskId = enqueueTask(
        EXPORT_DAILY_RECORDS_MANUAL_TASK_EXECUTOR,
        {
            date: request.payload.date
        },
        executionTime
    );

    logger.info(
        `admin_task_created type=${request.type} executor=${EXPORT_DAILY_RECORDS_MANUAL_TASK_EXECUTOR} taskId=${taskId} date=${request.payload.date}`
    );

    return {
        type: request.type,
        createdCount: 1,
        createdTasks: toCreatedTaskRecords(
            [taskId],
            EXPORT_DAILY_RECORDS_MANUAL_TASK_EXECUTOR,
            executionTime
        ),
        summary: `已创建 1 个导出重生成任务，将立即重新生成 ${request.payload.date} 的导出文件。`,
        date: request.payload.date
    };
}

function createRefreshRouteInfoNowTask(
    request: Extract<AdminCreateTaskRequest, { type: 'refresh_route_info_now' }>
): AdminCreateTaskResponse {
    assertPublishedScheduleReadyForRefresh();

    const normalizedTrainCodes = uniqueNormalizedCodes(
        request.payload.trainCodes
    );
    ensure(
        normalizedTrainCodes.length > 0,
        400,
        'invalid_param',
        '至少需要提供一个有效车次'
    );

    const batchSize = useConfig().spider.scheduleProbe.refresh.batchSize;
    const executionTime = getNowSeconds();
    const tasks: EnqueueTaskInput[] = splitIntoBatches(
        normalizedTrainCodes,
        batchSize
    ).map((codes) => ({
        executor: REFRESH_ROUTE_BATCH_TASK_EXECUTOR,
        args: {
            codes
        },
        executionTime,
        options: {
            isIdle: true,
            expectedDurationMs: estimateRefreshRouteBatchTaskDurationMs(
                codes.length
            )
        }
    }));

    const taskIds = enqueueTasks(tasks);
    logger.info(
        `admin_task_created type=${request.type} executor=${REFRESH_ROUTE_BATCH_TASK_EXECUTOR} taskIds=${taskIds.join(',')} codes=${normalizedTrainCodes.join(',')}`
    );

    return {
        type: request.type,
        createdCount: taskIds.length,
        createdTasks: toCreatedTaskRecords(
            taskIds,
            REFRESH_ROUTE_BATCH_TASK_EXECUTOR,
            executionTime
        ),
        summary:
            taskIds.length === 1
                ? `已创建 1 个 route refresh 任务，将立即刷新 ${normalizedTrainCodes.length} 个车次。`
                : `已创建 ${taskIds.length} 个 route refresh 任务，将立即分批刷新 ${normalizedTrainCodes.length} 个车次。`,
        normalizedTrainCodes
    };
}

export function createAdminTask(
    request: AdminCreateTaskRequest
): AdminCreateTaskResponse {
    switch (request.type) {
        case 'regenerate_daily_export':
            return createRegenerateDailyExportTask(request);
        case 'refresh_route_info_now':
            return createRefreshRouteInfoNowTask(request);
        default:
            request satisfies never;
            throw new Error('Unsupported admin task type');
    }
}

export function getAdminTaskOverview(
    asOf = getNowSeconds()
): AdminTaskOverviewResponse {
    const counts = adminTaskStatements.get<AdminTaskOverviewCountsRow>(
        'selectTaskOverviewCounts',
        asOf + 10 * 60,
        asOf + 30 * 60,
        asOf + 60 * 60
    ) ?? {
        remainingTotal: 0,
        remainingWithin10Minutes: 0,
        remainingWithin30Minutes: 0,
        remainingWithin1Hour: 0
    };

    return {
        asOf,
        remainingTotal: counts.remainingTotal,
        remainingWithin10Minutes: counts.remainingWithin10Minutes,
        remainingWithin30Minutes: counts.remainingWithin30Minutes,
        remainingWithin1Hour: counts.remainingWithin1Hour
    };
}
