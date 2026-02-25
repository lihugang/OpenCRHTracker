import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';
import { useTaskDatabase } from '~/server/libs/database/task';
import { getTaskExecutor } from '~/server/services/taskExecutorRegistry';
import type { TaskRecord } from '~/server/services/taskQueue';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

const logger = getLogger('task-scheduler');
const taskSql = importSqlBatch('tasks');

let started = false;
let isChecking = false;
let timer: NodeJS.Timeout | null = null;

function ensureTaskSql(key: string): string {
    const statement = taskSql[key];
    if (!statement) {
        throw new Error(`Task SQL not found: ${key}`);
    }
    return statement;
}

function parseTaskArguments(rawArguments: string): {
    ok: true;
    argumentsValue: unknown;
} | {
    ok: false;
    message: string;
} {
    try {
        return {
            ok: true,
            argumentsValue: JSON.parse(rawArguments)
        };
    } catch (error) {
        return {
            ok: false,
            message: error instanceof Error ? error.message : String(error)
        };
    }
}

async function runSingleTask(task: TaskRecord): Promise<void> {
    const db = useTaskDatabase();
    const completeTaskSql = ensureTaskSql('completeTask');

    const parsedArguments = parseTaskArguments(task.arguments);
    if (!parsedArguments.ok) {
        logger.error(
            `[task-scheduler] invalid_task_arguments id=${task.id} executor=${task.executor} error=${parsedArguments.message}`
        );
        db.prepare(completeTaskSql).run(task.id);
        return;
    }

    const executor = getTaskExecutor(task.executor);
    if (!executor) {
        logger.error(
            `[task-scheduler] executor_not_registered id=${task.id} executor=${task.executor}`
        );
        db.prepare(completeTaskSql).run(task.id);
        return;
    }

    try {
        await executor(parsedArguments.argumentsValue);
    } catch (error) {
        const message =
            error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        logger.error(
            `[task-scheduler] task_failed id=${task.id} executor=${task.executor} error=${message}`
        );
    } finally {
        db.prepare(completeTaskSql).run(task.id);
    }
}

async function tick(): Promise<void> {
    if (isChecking) {
        logger.info('[task-scheduler] skip_overlapped_tick');
        return;
    }

    isChecking = true;
    const startedAt = Date.now();
    try {
        const db = useTaskDatabase();
        const selectTasksSql = ensureTaskSql('selectTasks');
        const dueTasks = db
            .prepare(selectTasksSql)
            .all(getNowSeconds()) as TaskRecord[];

        logger.info(
            `[task-scheduler] tick_start dueTasks=${dueTasks.length}`
        );
        for (const task of dueTasks) {
            await runSingleTask(task);
        }

        logger.info(
            `[task-scheduler] tick_finish dueTasks=${dueTasks.length} durationMs=${Date.now() - startedAt}`
        );
    } catch (error) {
        const message =
            error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        logger.error(`[task-scheduler] tick_error error=${message}`);
    } finally {
        isChecking = false;
    }
}

export function startTaskScheduler() {
    if (started) {
        logger.info('[task-scheduler] already_started');
        return;
    }

    const pollIntervalMs = useConfig().task.scheduler.pollIntervalMs;
    timer = setInterval(() => {
        void tick();
    }, pollIntervalMs);
    started = true;

    logger.info(
        `[task-scheduler] started pollIntervalMs=${pollIntervalMs} autoStart=true`
    );
    void tick();
}

export function stopTaskScheduler() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
    started = false;
    isChecking = false;
    logger.info('[task-scheduler] stopped');
}
