export type TaskExecutor = (argumentsValue: unknown) => Promise<void>;

const executors = new Map<string, TaskExecutor>();

function normalizeExecutorName(name: string): string {
    return name.trim();
}

export function registerTaskExecutor(
    executorName: string,
    handler: TaskExecutor
): () => void {
    const normalizedName = normalizeExecutorName(executorName);
    if (normalizedName.length === 0) {
        throw new Error('executorName must be non-empty');
    }
    if (executors.has(normalizedName)) {
        throw new Error(`Task executor already registered: ${normalizedName}`);
    }

    executors.set(normalizedName, handler);
    return () => {
        const current = executors.get(normalizedName);
        if (current === handler) {
            executors.delete(normalizedName);
        }
    };
}

export function getTaskExecutor(executorName: string): TaskExecutor | null {
    const normalizedName = normalizeExecutorName(executorName);
    return executors.get(normalizedName) ?? null;
}
