import importSqlBatch from '~/server/utils/sql/importSqlBatch';
import { useTaskDatabase } from '~/server/libs/database/task';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

const taskSql = importSqlBatch('tasks');

function ensureTaskSql(key: string): string {
    const statement = taskSql[key];
    if (!statement) {
        throw new Error(`Task SQL not found: ${key}`);
    }
    return statement;
}

export interface TaskRecord {
    id: number;
    executor: string;
    arguments: string;
    executionTime: number;
    isIdle: 0 | 1;
}

export interface EnqueueTaskOptions {
    isIdle?: boolean;
}

export function enqueueTask(
    executor: string,
    args: unknown,
    executionTime: number,
    options: EnqueueTaskOptions = {}
): number {
    const normalizedExecutor = executor.trim();
    if (normalizedExecutor.length === 0) {
        throw new Error('executor must be non-empty');
    }
    if (!Number.isInteger(executionTime) || executionTime < 0) {
        throw new Error('executionTime must be a non-negative integer timestamp in seconds');
    }
    const normalizedIsIdle = options.isIdle ? 1 : 0;

    const db = useTaskDatabase();
    const addTaskSql = ensureTaskSql('addTask');
    const result = db.prepare(addTaskSql).run(
        normalizedExecutor,
        JSON.stringify(args ?? null),
        executionTime,
        normalizedIsIdle
    );
    return Number(result.lastInsertRowid);
}

export function enqueueTaskAfterDelaySeconds(
    executor: string,
    args: unknown,
    delaySeconds: number,
    options: EnqueueTaskOptions = {}
): number {
    if (!Number.isInteger(delaySeconds) || delaySeconds < 0) {
        throw new Error('delaySeconds must be a non-negative integer');
    }
    return enqueueTask(executor, args, getNowSeconds() + delaySeconds, options);
}
