import getLogger from '~/server/libs/log4js';
import {
    enqueueTasks,
    listPendingTasksByExecutor,
    reconcileFuturePendingTaskByExecutorAndArgs,
    removePendingTasksByExecutor,
    removePendingTasksByExecutorAndArgs,
    type EnqueueTaskInput,
    type TaskRecord
} from '~/server/services/taskQueue';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import { loadQrcodeDetectionConfig } from '~/server/services/qrcodeDetectionConfigStore';
import {
    getNextDayExecutionTimeInShanghaiSeconds,
    getNextExecutionTimeInShanghaiSeconds,
    parseDailyTimeHHmm
} from '~/server/utils/date/shanghaiDateTime';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import { PROBE_QRCODE_DETECTION_EMU_TASK_EXECUTOR } from '~/server/services/taskExecutors/probeQrcodeDetectionEmuTaskExecutor';
import {
    markCurrentTrainProvenanceTaskSkipped,
    recordCurrentTrainProvenanceEvent
} from '~/server/services/trainProvenanceRecorder';

export const DISPATCH_QRCODE_DETECTION_TASKS_EXECUTOR =
    'dispatch_qrcode_detection_tasks';

interface DispatchQrcodeDetectionTasksTaskArgs {
    detectedAt: string;
}

const logger = getLogger('task-executor:dispatch-qrcode-detection-tasks');

let registered = false;

function parseDispatchTaskArgs(
    raw: unknown
): DispatchQrcodeDetectionTasksTaskArgs {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new Error('task arguments must be an object');
    }

    const body = raw as {
        detectedAt?: unknown;
    };
    const detectedAt =
        typeof body.detectedAt === 'string' ? body.detectedAt.trim() : '';
    parseDailyTimeHHmm(detectedAt);
    return {
        detectedAt
    };
}

function parseDispatchDetectedAt(task: TaskRecord): string | null {
    try {
        const args = JSON.parse(task.arguments) as unknown;
        return parseDispatchTaskArgs(args).detectedAt;
    } catch {
        return null;
    }
}

export async function enqueueQrcodeDetectionProbeTasksForDetectedAt(
    detectedAt: string,
    executionTime = getNowSeconds(),
    manualNow = false
): Promise<number[]> {
    parseDailyTimeHHmm(detectedAt);
    const config = await loadQrcodeDetectionConfig();
    const tasks: EnqueueTaskInput[] = config.emu.map((emuCode) => ({
        executor: PROBE_QRCODE_DETECTION_EMU_TASK_EXECUTOR,
        args: {
            detectedAt,
            emuCode,
            manualNow
        },
        executionTime
    }));

    return enqueueTasks(tasks);
}

export async function synchronizeQrcodeDetectionDispatchTasks(): Promise<void> {
    const config = await loadQrcodeDetectionConfig();
    const configuredTimes = new Set(config.detectedAt);
    const existingTasks = listPendingTasksByExecutor(
        DISPATCH_QRCODE_DETECTION_TASKS_EXECUTOR
    );

    for (const task of existingTasks) {
        const detectedAt = parseDispatchDetectedAt(task);
        if (detectedAt === null || configuredTimes.has(detectedAt)) {
            continue;
        }

        removePendingTasksByExecutorAndArgs(
            DISPATCH_QRCODE_DETECTION_TASKS_EXECUTOR,
            { detectedAt }
        );
        logger.info(`removed_obsolete_dispatch_task detectedAt=${detectedAt}`);
    }

    if (config.detectedAt.length === 0) {
        removePendingTasksByExecutor(DISPATCH_QRCODE_DETECTION_TASKS_EXECUTOR);
        return;
    }

    for (const detectedAt of config.detectedAt) {
        const executionTime = getNextExecutionTimeInShanghaiSeconds(
            Date.now(),
            detectedAt
        );
        const result = reconcileFuturePendingTaskByExecutorAndArgs(
            DISPATCH_QRCODE_DETECTION_TASKS_EXECUTOR,
            { detectedAt },
            executionTime
        );
        logger.info(
            `dispatch_task_reconciled detectedAt=${detectedAt} action=${result.action} taskId=${result.taskId} removedTaskIds=${JSON.stringify(result.removedTaskIds)} reusedExecutionTime=${result.reusedExecutionTime ?? 'null'}`
        );
    }
}

async function executeDispatchQrcodeDetectionTasks(rawArgs: unknown) {
    const args = parseDispatchTaskArgs(rawArgs);
    const config = await loadQrcodeDetectionConfig();
    if (!config.detectedAt.includes(args.detectedAt)) {
        markCurrentTrainProvenanceTaskSkipped('qrcode_detection_time_removed');
        logger.info(`skip_time_removed detectedAt=${args.detectedAt}`);
        return;
    }

    const createdTaskIds = await enqueueQrcodeDetectionProbeTasksForDetectedAt(
        args.detectedAt
    );
    const nextExecutionTime = getNextDayExecutionTimeInShanghaiSeconds(
        Date.now(),
        args.detectedAt
    );
    reconcileFuturePendingTaskByExecutorAndArgs(
        DISPATCH_QRCODE_DETECTION_TASKS_EXECUTOR,
        { detectedAt: args.detectedAt },
        nextExecutionTime
    );
    recordCurrentTrainProvenanceEvent({
        serviceDate: getCurrentDateString(),
        eventType: 'qrcode_detection_dispatch_completed',
        result: 'queued',
        payload: {
            detectedAt: args.detectedAt,
            createdCount: createdTaskIds.length,
            createdTaskIds
        }
    });
    logger.info(
        `done detectedAt=${args.detectedAt} createdTasks=${createdTaskIds.length}`
    );
}

export function registerDispatchQrcodeDetectionTasksExecutor(): void {
    if (registered) {
        return;
    }

    registerTaskExecutor(
        DISPATCH_QRCODE_DETECTION_TASKS_EXECUTOR,
        async (args) => {
            await executeDispatchQrcodeDetectionTasks(args);
        }
    );
    registered = true;
    logger.info(
        `registered executor=${DISPATCH_QRCODE_DETECTION_TASKS_EXECUTOR}`
    );
}
