import { useTaskDatabase } from '~/server/libs/database/task';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

type TaskSqlKey = 'addTask' | 'completeTask' | 'selectPendingTasksByExecutor';

const taskSql = importSqlBatch('tasks/queries') as Record<TaskSqlKey, string>;
const taskStatements = createPreparedSqlStore<TaskSqlKey>({
    dbName: 'task',
    scope: 'tasks/queries',
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

export interface EnqueueTaskInput {
    executor: string;
    args: unknown;
    executionTime: number;
    options?: EnqueueTaskOptions;
}

export interface ReconcileSingletonTaskResult {
    action: 'created' | 'replaced_overdue' | 'reused_future';
    taskId: number;
    removedTaskIds: number[];
    reusedExecutionTime: number | null;
}

export interface RemovePendingTasksByExecutorResult {
    removedTaskIds: number[];
}

export interface RemovePendingTasksByExecutorAndArgsResult {
    removedTaskIds: number[];
}

interface NormalizedTaskInsert {
    executor: string;
    argumentsJson: string;
    executionTime: number;
    isIdle: 0 | 1;
    expectedDurationMs: number;
}

let enqueueTasksTransaction:
    | ((tasks: readonly NormalizedTaskInsert[]) => number[])
    | null = null;
let reconcileSingletonTaskTransaction:
    | ((
          task: NormalizedTaskInsert,
          nowSeconds: number
      ) => ReconcileSingletonTaskResult)
    | null = null;
let removePendingTasksByExecutorTransaction:
    | ((executor: string) => RemovePendingTasksByExecutorResult)
    | null = null;
let removePendingTasksByExecutorAndArgsTransaction:
    | ((
          executor: string,
          argumentsJson: string
      ) => RemovePendingTasksByExecutorAndArgsResult)
    | null = null;

type EnqueueTasksTransaction = (
    tasks: readonly NormalizedTaskInsert[]
) => number[];
type ReconcileSingletonTaskTransaction = (
    task: NormalizedTaskInsert,
    nowSeconds: number
) => ReconcileSingletonTaskResult;
type RemovePendingTasksByExecutorTransaction = (
    executor: string
) => RemovePendingTasksByExecutorResult;
type RemovePendingTasksByExecutorAndArgsTransaction = (
    executor: string,
    argumentsJson: string
) => RemovePendingTasksByExecutorAndArgsResult;

function normalizeTaskInsert(
    executor: string,
    args: unknown,
    executionTime: number,
    options: EnqueueTaskOptions = {}
): NormalizedTaskInsert {
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

    return {
        executor: normalizedExecutor,
        argumentsJson: JSON.stringify(args ?? null),
        executionTime,
        isIdle: normalizedIsIdle,
        expectedDurationMs: normalizedExpectedDurationMs
    };
}

function getEnqueueTasksTransaction(): EnqueueTasksTransaction {
    if (enqueueTasksTransaction) {
        return enqueueTasksTransaction;
    }

    const addTaskStatement = taskStatements.getStatement('addTask');
    enqueueTasksTransaction = useTaskDatabase().transaction(
        (tasks: readonly NormalizedTaskInsert[]): number[] => {
            const insertedIds: number[] = [];
            for (const task of tasks) {
                const result = addTaskStatement.run(
                    task.executor,
                    task.argumentsJson,
                    task.executionTime,
                    task.isIdle,
                    task.expectedDurationMs
                );
                insertedIds.push(Number(result.lastInsertRowid));
            }
            return insertedIds;
        }
    );

    return enqueueTasksTransaction;
}

function getReconcileSingletonTaskTransaction(): ReconcileSingletonTaskTransaction {
    if (reconcileSingletonTaskTransaction) {
        return reconcileSingletonTaskTransaction;
    }

    const addTaskStatement = taskStatements.getStatement('addTask');
    const completeTaskStatement = taskStatements.getStatement('completeTask');
    const selectPendingTasksByExecutorStatement = taskStatements.getStatement(
        'selectPendingTasksByExecutor'
    );

    reconcileSingletonTaskTransaction = useTaskDatabase().transaction(
        (
            task: NormalizedTaskInsert,
            nowSeconds: number
        ): ReconcileSingletonTaskResult => {
            const existingTasks = selectPendingTasksByExecutorStatement.all(
                task.executor
            ) as TaskRecord[];

            if (existingTasks.length === 0) {
                const inserted = addTaskStatement.run(
                    task.executor,
                    task.argumentsJson,
                    task.executionTime,
                    task.isIdle,
                    task.expectedDurationMs
                );
                return {
                    action: 'created',
                    taskId: Number(inserted.lastInsertRowid),
                    removedTaskIds: [],
                    reusedExecutionTime: null
                };
            }

            const earliestTask = existingTasks[0]!;
            if (earliestTask.executionTime <= nowSeconds) {
                for (const existingTask of existingTasks) {
                    completeTaskStatement.run(existingTask.id);
                }
                const inserted = addTaskStatement.run(
                    task.executor,
                    task.argumentsJson,
                    task.executionTime,
                    task.isIdle,
                    task.expectedDurationMs
                );
                return {
                    action: 'replaced_overdue',
                    taskId: Number(inserted.lastInsertRowid),
                    removedTaskIds: existingTasks.map(
                        (existingTask) => existingTask.id
                    ),
                    reusedExecutionTime: null
                };
            }

            const removedTaskIds: number[] = [];
            for (const existingTask of existingTasks.slice(1)) {
                completeTaskStatement.run(existingTask.id);
                removedTaskIds.push(existingTask.id);
            }
            return {
                action: 'reused_future',
                taskId: earliestTask.id,
                removedTaskIds,
                reusedExecutionTime: earliestTask.executionTime
            };
        }
    );

    return reconcileSingletonTaskTransaction;
}

function getRemovePendingTasksByExecutorTransaction(): RemovePendingTasksByExecutorTransaction {
    if (removePendingTasksByExecutorTransaction) {
        return removePendingTasksByExecutorTransaction;
    }

    const completeTaskStatement = taskStatements.getStatement('completeTask');
    const selectPendingTasksByExecutorStatement = taskStatements.getStatement(
        'selectPendingTasksByExecutor'
    );

    removePendingTasksByExecutorTransaction = useTaskDatabase().transaction(
        (executor: string): RemovePendingTasksByExecutorResult => {
            const normalizedExecutor = executor.trim();
            if (normalizedExecutor.length === 0) {
                throw new Error('executor must be non-empty');
            }

            const existingTasks = selectPendingTasksByExecutorStatement.all(
                normalizedExecutor
            ) as TaskRecord[];
            const removedTaskIds: number[] = [];
            for (const existingTask of existingTasks) {
                completeTaskStatement.run(existingTask.id);
                removedTaskIds.push(existingTask.id);
            }

            return {
                removedTaskIds
            };
        }
    );

    return removePendingTasksByExecutorTransaction;
}

function getRemovePendingTasksByExecutorAndArgsTransaction(): RemovePendingTasksByExecutorAndArgsTransaction {
    if (removePendingTasksByExecutorAndArgsTransaction) {
        return removePendingTasksByExecutorAndArgsTransaction;
    }

    const completeTaskStatement = taskStatements.getStatement('completeTask');
    const selectPendingTasksByExecutorStatement = taskStatements.getStatement(
        'selectPendingTasksByExecutor'
    );

    removePendingTasksByExecutorAndArgsTransaction = useTaskDatabase().transaction(
        (
            executor: string,
            argumentsJson: string
        ): RemovePendingTasksByExecutorAndArgsResult => {
            const normalizedExecutor = executor.trim();
            if (normalizedExecutor.length === 0) {
                throw new Error('executor must be non-empty');
            }

            const existingTasks = selectPendingTasksByExecutorStatement.all(
                normalizedExecutor
            ) as TaskRecord[];
            const removedTaskIds: number[] = [];

            for (const existingTask of existingTasks) {
                if (existingTask.arguments !== argumentsJson) {
                    continue;
                }

                completeTaskStatement.run(existingTask.id);
                removedTaskIds.push(existingTask.id);
            }

            return {
                removedTaskIds
            };
        }
    );

    return removePendingTasksByExecutorAndArgsTransaction;
}

function getPendingTasksByExecutor(executor: string): TaskRecord[] {
    const normalizedExecutor = executor.trim();
    if (normalizedExecutor.length === 0) {
        throw new Error('executor must be non-empty');
    }

    return taskStatements.all<TaskRecord>(
        'selectPendingTasksByExecutor',
        normalizedExecutor
    );
}

export function enqueueTask(
    executor: string,
    args: unknown,
    executionTime: number,
    options: EnqueueTaskOptions = {}
): number {
    const normalizedTask = normalizeTaskInsert(
        executor,
        args,
        executionTime,
        options
    );

    const result = taskStatements.run(
        'addTask',
        normalizedTask.executor,
        normalizedTask.argumentsJson,
        normalizedTask.executionTime,
        normalizedTask.isIdle,
        normalizedTask.expectedDurationMs
    );
    return Number(result.lastInsertRowid);
}

export function enqueueTasks(tasks: readonly EnqueueTaskInput[]): number[] {
    if (tasks.length === 0) {
        return [];
    }

    const normalizedTasks = tasks.map((task) =>
        normalizeTaskInsert(
            task.executor,
            task.args,
            task.executionTime,
            task.options
        )
    );
    return getEnqueueTasksTransaction()(normalizedTasks);
}

export function reconcileSingletonPendingTask(
    executor: string,
    args: unknown,
    executionTime: number,
    options: EnqueueTaskOptions = {}
): ReconcileSingletonTaskResult {
    const normalizedTask = normalizeTaskInsert(
        executor,
        args,
        executionTime,
        options
    );
    return getReconcileSingletonTaskTransaction()(
        normalizedTask,
        getNowSeconds()
    );
}

export function removePendingTasksByExecutor(
    executor: string
): RemovePendingTasksByExecutorResult {
    return getRemovePendingTasksByExecutorTransaction()(executor);
}

export function listPendingTasksByExecutor(executor: string): TaskRecord[] {
    return getPendingTasksByExecutor(executor);
}

export function removePendingTasksByExecutorAndArgs(
    executor: string,
    args: unknown
): RemovePendingTasksByExecutorAndArgsResult {
    const normalizedTask = normalizeTaskInsert(executor, args, 0);
    return getRemovePendingTasksByExecutorAndArgsTransaction()(
        normalizedTask.executor,
        normalizedTask.argumentsJson
    );
}

export function reconcileFuturePendingTaskByExecutorAndArgs(
    executor: string,
    args: unknown,
    executionTime: number,
    options: EnqueueTaskOptions = {}
): ReconcileSingletonTaskResult {
    const normalizedTask = normalizeTaskInsert(
        executor,
        args,
        executionTime,
        options
    );
    const nowSeconds = getNowSeconds();
    const matchingTasks = getPendingTasksByExecutor(normalizedTask.executor)
        .filter((task) => task.arguments === normalizedTask.argumentsJson)
        .sort((left, right) => {
            if (left.executionTime !== right.executionTime) {
                return left.executionTime - right.executionTime;
            }

            return left.id - right.id;
        });

    if (matchingTasks.length === 0) {
        const taskId = enqueueTask(
            normalizedTask.executor,
            args,
            executionTime,
            options
        );
        return {
            action: 'created',
            taskId,
            removedTaskIds: [],
            reusedExecutionTime: null
        };
    }

    if (matchingTasks[0]!.executionTime <= nowSeconds) {
        const removed = removePendingTasksByExecutorAndArgs(
            normalizedTask.executor,
            args
        );
        const taskId = enqueueTask(
            normalizedTask.executor,
            args,
            executionTime,
            options
        );
        return {
            action: 'replaced_overdue',
            taskId,
            removedTaskIds: removed.removedTaskIds,
            reusedExecutionTime: null
        };
    }

    const removedTaskIds: number[] = [];
    for (const duplicateTask of matchingTasks.slice(1)) {
        taskStatements.run('completeTask', duplicateTask.id);
        removedTaskIds.push(duplicateTask.id);
    }

    return {
        action: 'reused_future',
        taskId: matchingTasks[0]!.id,
        removedTaskIds,
        reusedExecutionTime: matchingTasks[0]!.executionTime
    };
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
