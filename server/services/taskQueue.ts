import '~/server/libs/database/task';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

type TaskSqlKey = 'addTask';

const taskSql = importSqlBatch('tasks') as Record<TaskSqlKey, string>;
const taskStatements = createPreparedSqlStore<TaskSqlKey>({
    dbName: 'task',
    scope: 'tasks',
    sql: taskSql
});

export interface TaskRecord {
    id: number;
    executor: string;
    arguments: string;
    executionTime: number;
    isIdle: 0 | 1;
    expectedDurationMs: number;
}

export interface EnqueueTaskOptions {
    isIdle?: boolean;
    expectedDurationMs?: number;
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
        throw new Error(
            'executionTime must be a non-negative integer timestamp in seconds'
        );
    }
    const normalizedIsIdle = options.isIdle ? 1 : 0;
    if (
        normalizedIsIdle === 1 &&
        typeof options.expectedDurationMs === 'undefined'
    ) {
        throw new Error('expectedDurationMs must be provided for idle tasks');
    }
    const normalizedExpectedDurationMs = options.expectedDurationMs ?? 0;
    if (
        !Number.isInteger(normalizedExpectedDurationMs) ||
        normalizedExpectedDurationMs < 0
    ) {
        throw new Error('expectedDurationMs must be a non-negative integer');
    }

    const result = taskStatements.run(
        'addTask',
        normalizedExecutor,
        JSON.stringify(args ?? null),
        executionTime,
        normalizedIsIdle,
        normalizedExpectedDurationMs
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
