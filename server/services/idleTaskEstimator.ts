import useConfig from '~/server/config';

interface IdleTaskEstimateState {
    emaMs: number;
    sampleCount: number;
}

const estimateStateByExecutor = new Map<string, IdleTaskEstimateState>();

function normalizeExecutorName(executorName: string): string {
    return executorName.trim();
}

function normalizeDurationMs(value: number, label: string): number {
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${label} must be a finite non-negative number`);
    }
    return Math.floor(value);
}

export function estimateIdleTaskDurationMs(
    executorName: string,
    coldStartDurationMs: number
): number {
    const normalizedExecutorName = normalizeExecutorName(executorName);
    if (normalizedExecutorName.length === 0) {
        throw new Error('executorName must be non-empty');
    }

    const normalizedColdStartDurationMs = normalizeDurationMs(
        coldStartDurationMs,
        'coldStartDurationMs'
    );
    const currentState = estimateStateByExecutor.get(normalizedExecutorName);
    if (!currentState) {
        return normalizedColdStartDurationMs;
    }

    return normalizeDurationMs(currentState.emaMs, 'estimatedDurationMs');
}

export function observeIdleTaskDurationMs(
    executorName: string,
    actualDurationMs: number
): void {
    const normalizedExecutorName = normalizeExecutorName(executorName);
    if (normalizedExecutorName.length === 0) {
        return;
    }

    const normalizedActualDurationMs = normalizeDurationMs(
        actualDurationMs,
        'actualDurationMs'
    );
    const alpha = useConfig().task.scheduler.idle.emaAlpha;
    const currentState = estimateStateByExecutor.get(normalizedExecutorName);
    if (!currentState) {
        estimateStateByExecutor.set(normalizedExecutorName, {
            emaMs: normalizedActualDurationMs,
            sampleCount: 1
        });
        return;
    }

    currentState.emaMs =
        alpha * normalizedActualDurationMs + (1 - alpha) * currentState.emaMs;
    currentState.sampleCount += 1;
}
