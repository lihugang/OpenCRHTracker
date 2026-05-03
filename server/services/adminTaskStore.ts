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
import { DETECT_COUPLED_EMU_GROUP_TASK_EXECUTOR } from '~/server/services/taskExecutors/detectCoupledEmuGroupTaskExecutor';
import { enqueueQrcodeDetectionProbeTasksForDetectedAt } from '~/server/services/taskExecutors/dispatchQrcodeDetectionTasksExecutor';
import { EXPORT_DAILY_RECORDS_MANUAL_TASK_EXECUTOR } from '~/server/services/taskExecutors/exportDailyRecordsTaskExecutor';
import { loadProbeAssets } from '~/server/services/probeAssetStore';
import { PROBE_QRCODE_DETECTION_EMU_TASK_EXECUTOR } from '~/server/services/taskExecutors/probeQrcodeDetectionEmuTaskExecutor';
import { REFRESH_ROUTE_BATCH_TASK_EXECUTOR } from '~/server/services/taskExecutors/refreshRouteBatchTaskExecutor';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import { loadPublishedScheduleState } from '~/server/utils/12306/scheduleProbe/stateStore';
import { splitIntoBatches } from '~/server/utils/12306/scheduleProbe/taskHelpers';
import uniqueNormalizedCodes from '~/server/utils/12306/uniqueNormalizedCodes';
import ensure from '~/server/utils/api/executor/ensure';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import type {
    AdminCreateTaskResponse,
    AdminCreateTaskRequest,
    AdminCouplingScanOptionGroup,
    AdminTaskOverviewResponse
} from '~/types/admin';

const logger = getLogger('admin-task-store');

type AdminTaskSqlKey = 'selectNextPendingTask' | 'selectTaskOverviewCounts';

interface AdminTaskOverviewCountsRow {
    remainingTotal: number;
    remainingWithin10Minutes: number;
    remainingWithin30Minutes: number;
    remainingWithin1Hour: number;
}

interface NextPendingTaskRow {
    id: number;
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

interface NormalizedCouplingScanTarget {
    bureau: string;
    model: string;
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

function buildBureauAndModelKey(bureau: string, model: string): string {
    return `${bureau.trim()}#${normalizeCode(model)}`;
}

function compareByZhCnLocale(left: string, right: string): number {
    return left.localeCompare(right, 'zh-CN');
}

function getCurrentShanghaiHHmm(): string {
    const formatter = new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    const parts = formatter.formatToParts(new Date());
    const hour = parts.find((part) => part.type === 'hour')?.value ?? '';
    const minute = parts.find((part) => part.type === 'minute')?.value ?? '';
    const detectedAt = `${hour}${minute}`;
    if (!/^\d{4}$/.test(detectedAt)) {
        throw new Error('failed to format current Shanghai HHmm');
    }
    return detectedAt;
}

async function listAdminCouplingScanOptions(): Promise<
    AdminCouplingScanOptionGroup[]
> {
    const assets = await loadProbeAssets();
    const modelsByBureau = new Map<string, Set<string>>();

    for (const record of assets.emuList) {
        const bureau = record.bureau.trim();
        const model = normalizeCode(record.model);
        if (bureau.length === 0 || model.length === 0) {
            continue;
        }

        const currentModels = modelsByBureau.get(bureau);
        if (currentModels) {
            currentModels.add(model);
            continue;
        }

        modelsByBureau.set(bureau, new Set([model]));
    }

    return Array.from(modelsByBureau.entries())
        .sort(([leftBureau], [rightBureau]) =>
            compareByZhCnLocale(leftBureau, rightBureau)
        )
        .map(([bureau, models]) => ({
            bureau,
            models: Array.from(models).sort(compareByZhCnLocale)
        }));
}

async function normalizeCouplingScanTarget(
    bureau: string,
    model: string
): Promise<NormalizedCouplingScanTarget> {
    const normalizedBureau = bureau.trim();
    const normalizedModel = normalizeCode(model);
    ensure(normalizedBureau.length > 0, 400, 'invalid_param', '路局不能为空');
    ensure(normalizedModel.length > 0, 400, 'invalid_param', '车型不能为空');

    const assets = await loadProbeAssets();
    const groupKey = buildBureauAndModelKey(normalizedBureau, normalizedModel);
    ensure(
        assets.emuListByBureauAndModel.has(groupKey),
        400,
        'invalid_param',
        '当前资产中不存在该路局和车型组合'
    );

    return {
        bureau: normalizedBureau,
        model: normalizedModel
    };
}

function assertPublishedScheduleReadyForRefresh(): void {
    const scheduleFilePath = useConfig().data.assets.schedule.file;
    const state = loadPublishedScheduleState(scheduleFilePath);
    ensure(
        state !== null,
        409,
        'schedule_not_ready',
        '当日已发布时刻表暂不可用'
    );

    const currentDate = getCurrentDateString();
    ensure(
        state.date === currentDate,
        409,
        'schedule_not_ready',
        '当日已发布时刻表尚未更新到今天'
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
        summary: `已创建 1 条 ${request.payload.date} 的每日导出重建任务。`,
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
                ? `已为 ${normalizedTrainCodes.length} 个车次创建 1 条线路刷新任务。`
                : `已为 ${normalizedTrainCodes.length} 个车次创建 ${taskIds.length} 条线路刷新任务。`,
        normalizedTrainCodes
    };
}

async function createDetectCoupledEmuGroupNowTask(
    request: Extract<
        AdminCreateTaskRequest,
        { type: 'detect_coupled_emu_group_now' }
    >
): Promise<AdminCreateTaskResponse> {
    const target = await normalizeCouplingScanTarget(
        request.payload.bureau,
        request.payload.model
    );
    const executionTime = getNowSeconds();
    const taskId = enqueueTask(
        DETECT_COUPLED_EMU_GROUP_TASK_EXECUTOR,
        target,
        executionTime
    );

    logger.info(
        `admin_task_created type=${request.type} executor=${DETECT_COUPLED_EMU_GROUP_TASK_EXECUTOR} taskId=${taskId} bureau=${target.bureau} model=${target.model}`
    );

    return {
        type: request.type,
        createdCount: 1,
        createdTasks: toCreatedTaskRecords(
            [taskId],
            DETECT_COUPLED_EMU_GROUP_TASK_EXECUTOR,
            executionTime
        ),
        summary: `已为 ${target.bureau} / ${target.model} 创建 1 条重联扫描任务。`
    };
}

async function createRunQrcodeDetectionNowTask(
    request: Extract<
        AdminCreateTaskRequest,
        { type: 'run_qrcode_detection_now' }
    >
): Promise<AdminCreateTaskResponse> {
    const detectedAt = getCurrentShanghaiHHmm();
    const executionTime = getNowSeconds();
    const taskIds = await enqueueQrcodeDetectionProbeTasksForDetectedAt(
        detectedAt,
        executionTime,
        true
    );

    logger.info(
        `admin_task_created type=${request.type} executor=${PROBE_QRCODE_DETECTION_EMU_TASK_EXECUTOR} taskIds=${taskIds.join(',')} detectedAt=${detectedAt} manualNow=true`
    );

    return {
        type: request.type,
        createdCount: taskIds.length,
        createdTasks: toCreatedTaskRecords(
            taskIds,
            PROBE_QRCODE_DETECTION_EMU_TASK_EXECUTOR,
            executionTime
        ),
        summary: `已按当前时间 ${detectedAt} 创建 ${taskIds.length} 条固定车组畅行码检测任务。`
    };
}

export async function createAdminTask(
    request: AdminCreateTaskRequest
): Promise<AdminCreateTaskResponse> {
    switch (request.type) {
        case 'regenerate_daily_export':
            return createRegenerateDailyExportTask(request);
        case 'refresh_route_info_now':
            return createRefreshRouteInfoNowTask(request);
        case 'detect_coupled_emu_group_now':
            return await createDetectCoupledEmuGroupNowTask(request);
        case 'run_qrcode_detection_now':
            return await createRunQrcodeDetectionNowTask(request);
        default:
            request satisfies never;
            throw new Error('Unsupported admin task type');
    }
}

export async function getAdminTaskOverview(
    asOf = getNowSeconds()
): Promise<AdminTaskOverviewResponse> {
    const nextPendingTask = adminTaskStatements.get<NextPendingTaskRow>(
        'selectNextPendingTask'
    );
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
    const couplingScanOptions = await listAdminCouplingScanOptions();

    return {
        asOf,
        nextTaskId: nextPendingTask?.id ?? null,
        remainingTotal: counts.remainingTotal,
        remainingWithin10Minutes: counts.remainingWithin10Minutes,
        remainingWithin30Minutes: counts.remainingWithin30Minutes,
        remainingWithin1Hour: counts.remainingWithin1Hour,
        couplingScanOptions
    };
}
