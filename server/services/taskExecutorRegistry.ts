export interface TypedTaskExecutor<TArgs> {
    parse(argumentsValue: unknown): TArgs;
    execute(argumentsValue: TArgs): Promise<void>;
}

const executors = new Map<string, TypedTaskExecutor<unknown>>();

export function parseEmptyTaskArgs(value: unknown): Record<never, never> {
    if (
        typeof value !== 'object' ||
        value === null ||
        Array.isArray(value) ||
        Object.keys(value).length > 0
    ) {
        throw new Error('task arguments must be an empty object');
    }
    return {};
}

function normalizeExecutorName(name: string): string {
    return name.trim();
}

export function registerTaskExecutor<TArgs>(
    executorName: string,
    handler: TypedTaskExecutor<TArgs>
): () => void {
    const normalizedName = normalizeExecutorName(executorName);
    if (normalizedName.length === 0) {
        throw new Error('executorName must be non-empty');
    }
    if (executors.has(normalizedName)) {
        throw new Error(`Task executor already registered: ${normalizedName}`);
    }

    executors.set(
        normalizedName,
        handler as unknown as TypedTaskExecutor<unknown>
    );
    return () => {
        const current = executors.get(normalizedName);
        if (current === handler) {
            executors.delete(normalizedName);
        }
    };
}

export function getTaskExecutor(
    executorName: string
): ((argumentsValue: unknown) => Promise<void>) | null {
    const normalizedName = normalizeExecutorName(executorName);
    const registered = executors.get(normalizedName);
    if (!registered) {
        return null;
    }
    return (argumentsValue: unknown) =>
        registered.execute(registered.parse(argumentsValue));
}

export function getTaskExecutorDefinition(
    executorName: string
): TypedTaskExecutor<unknown> | null {
    const normalizedName = normalizeExecutorName(executorName);
    const registered = executors.get(normalizedName);
    return registered ?? null;
}
