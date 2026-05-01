import { AsyncLocalStorage } from 'node:async_hooks';
import type { TaskRecord } from '~/server/services/taskQueue';

export interface TaskExecutionContextValue {
    taskId: number;
    executor: string;
    executionTime: number;
    isIdle: boolean;
    expectedDurationMs: number;
}

const taskExecutionContext = new AsyncLocalStorage<TaskExecutionContextValue>();

export function createTaskExecutionContext(
    task: TaskRecord
): TaskExecutionContextValue {
    return {
        taskId: task.id,
        executor: task.executor,
        executionTime: task.executionTime,
        isIdle: task.isIdle === 1,
        expectedDurationMs: task.expectedDurationMs
    };
}

export function runWithTaskExecutionContext<T>(
    task: TaskRecord,
    callback: (context: TaskExecutionContextValue) => T
): T {
    const context = createTaskExecutionContext(task);
    return taskExecutionContext.run(context, () => callback(context));
}

export function getCurrentTaskExecutionContext() {
    return taskExecutionContext.getStore() ?? null;
}
