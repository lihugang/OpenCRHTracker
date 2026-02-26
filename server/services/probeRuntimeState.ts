import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import normalizeCode from '~/server/utils/12306/normalizeCode';

export interface LastObservationRecord {
    endAt: number;
    coupledEmuCodes: string[];
}

interface RunningEmuRecord {
    trainKey: string;
    endAt: number;
    lastSeenAt: number;
}

let currentDate = getCurrentDateString();
const queriedTodayTrainKeys = new Set<string>();
const runningEmuState = new Map<string, RunningEmuRecord>();
const lastObservationByMainEmu = new Map<string, LastObservationRecord>();

export function ensureProbeStateForToday(): void {
    const today = getCurrentDateString();
    if (today === currentDate) {
        return;
    }

    currentDate = today;
    queriedTodayTrainKeys.clear();
    runningEmuState.clear();
    lastObservationByMainEmu.clear();
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

export function hasQueriedTrainKey(trainKey: string): boolean {
    return queriedTodayTrainKeys.has(trainKey);
}

export function markQueriedTrainKey(trainKey: string): void {
    queriedTodayTrainKeys.add(trainKey);
}

export function cleanupRunningEmuState(nowSeconds: number, graceSeconds: number): void {
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
            endAt,
            lastSeenAt: nowSeconds
        });
    }
}

export function getLastObservationByMainEmu(
    emuCode: string
): LastObservationRecord | null {
    return lastObservationByMainEmu.get(normalizeCode(emuCode)) ?? null;
}

export function setLastObservationByMainEmu(
    emuCode: string,
    record: LastObservationRecord
): void {
    lastObservationByMainEmu.set(normalizeCode(emuCode), {
        endAt: record.endAt,
        coupledEmuCodes: Array.from(
            new Set(record.coupledEmuCodes.map((item) => normalizeCode(item)).filter((item) => item.length > 0))
        )
    });
}
