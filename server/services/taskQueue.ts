import importSqlBatch from '~/server/utils/sql/importSqlBatch';
import { useTaskDatabase } from '~/server/libs/database/task';

const taskSql = importSqlBatch('tasks');

function ensureTaskSql(key: string): string {
    const statement = taskSql[key];
    if (!statement) {
        throw new Error(`Task SQL not found: ${key}`);
    }
    return statement;
}

function nowSeconds() {
    return Math.floor(Date.now() / 1000);
}

export interface TaskRecord {
    id: number;
    executor: string;
    arguments: string;
    executionTime: number;
}

export function enqueueTask(
    executor: string,
    args: unknown,
    executionTime: number
): number {
    const normalizedExecutor = executor.trim();
    if (normalizedExecutor.length === 0) {
        throw new Error('executor must be non-empty');
    }
    if (!Number.isInteger(executionTime) || executionTime < 0) {
        throw new Error('executionTime must be a non-negative integer timestamp in seconds');
    }

    const db = useTaskDatabase();
    const addTaskSql = ensureTaskSql('addTask');
    const result = db.prepare(addTaskSql).run(
        normalizedExecutor,
        JSON.stringify(args ?? null),
        executionTime
    );
    return Number(result.lastInsertRowid);
}

export function enqueueTaskAfterDelaySeconds(
    executor: string,
    args: unknown,
    delaySeconds: number
): number {
    if (!Number.isInteger(delaySeconds) || delaySeconds < 0) {
        throw new Error('delaySeconds must be a non-negative integer');
    }
    return enqueueTask(executor, args, nowSeconds() + delaySeconds);
}
