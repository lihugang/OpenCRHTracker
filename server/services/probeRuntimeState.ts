import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import normalizeCode from '~/server/utils/12306/normalizeCode';

interface RunningEmuRecord {
    trainKey: string;
    groupKey: string;
    endAt: number;
    lastSeenAt: number;
}

let currentDate = getCurrentDateString();
const queriedTodayTrainKeys = new Set<string>();
const runningEmuState = new Map<string, RunningEmuRecord>();

export function ensureProbeStateForToday(): void {
    const today = getCurrentDateString();
    if (today === currentDate) {
        return;
    }

    currentDate = today;
    queriedTodayTrainKeys.clear();
    runningEmuState.clear();
}

export function buildTrainKey(
    trainCode: string,
    trainInternalCode: string,
    startAt: number
): string {
    const normalizedInternalCode = normalizeCode(trainInternalCode);
    if (normalizedInternalCode.length > 0) {
        return `internal:${normalizedInternalCode}`;
    }

    return `fallback:${normalizeCode(trainCode)}@${startAt}`;
}

export function buildRunningEmuGroupKey(
    trainCode: string,
    trainInternalCode: string,
    startAt: number
): string {
    const normalizedInternalCode = normalizeCode(trainInternalCode);
    if (normalizedInternalCode.length > 0) {
        return `internal:${normalizedInternalCode}@${startAt}`;
    }

    return `fallback:${normalizeCode(trainCode)}@${startAt}`;
}

export function hasQueriedTrainKey(trainKey: string): boolean {
    return queriedTodayTrainKeys.has(trainKey);
}

export function markQueriedTrainKey(trainKey: string): void {
    queriedTodayTrainKeys.add(trainKey);
}

export function clearQueriedTrainKey(trainKey: string): void {
    queriedTodayTrainKeys.delete(trainKey);
}

export function cleanupRunningEmuState(
    nowSeconds: number,
    graceSeconds: number
): void {
    for (const [emuCode, record] of runningEmuState.entries()) {
        if (nowSeconds > record.endAt + graceSeconds) {
            runningEmuState.delete(emuCode);
        }
    }
}

export function isEmuRunning(
    emuCode: string,
    nowSeconds: number,
    graceSeconds: number
): boolean {
    const normalizedEmuCode = normalizeCode(emuCode);
    const record = runningEmuState.get(normalizedEmuCode);
    if (!record) {
        return false;
    }

    if (nowSeconds > record.endAt + graceSeconds) {
        runningEmuState.delete(normalizedEmuCode);
        return false;
    }

    return true;
}

export function markRunningEmuCodes(
    emuCodes: string[],
    trainKey: string,
    groupKey: string,
    endAt: number,
    nowSeconds: number
): void {
    for (const rawCode of emuCodes) {
        const normalizedCode = normalizeCode(rawCode);
        if (normalizedCode.length === 0) {
            continue;
        }

        runningEmuState.set(normalizedCode, {
            trainKey,
            groupKey,
            endAt,
            lastSeenAt: nowSeconds
        });
    }
}

export function listActiveRunningEmuCodesByGroupKey(
    groupKey: string,
    nowSeconds: number,
    graceSeconds: number
): string[] {
    const normalizedGroupKey = groupKey.trim();
    if (normalizedGroupKey.length === 0) {
        return [];
    }

    const emuCodes: string[] = [];
    for (const [emuCode, record] of runningEmuState.entries()) {
        if (nowSeconds > record.endAt + graceSeconds) {
            runningEmuState.delete(emuCode);
            continue;
        }

        if (record.groupKey !== normalizedGroupKey) {
            continue;
        }

        emuCodes.push(emuCode);
    }

    return emuCodes;
}

export function clearRunningEmuStateByTrainKey(trainKey: string): string[] {
    const removedEmuCodes: string[] = [];
    for (const [emuCode, record] of runningEmuState.entries()) {
        if (record.trainKey !== trainKey) {
            continue;
        }

        runningEmuState.delete(emuCode);
        removedEmuCodes.push(emuCode);
    }

    return removedEmuCodes;
}
