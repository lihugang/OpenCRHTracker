import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import normalizeCode from '~/server/utils/12306/normalizeCode';

interface RunningEmuRecord {
    trainKey: string;
    groupKey: string;
    endAt: number;
    lastSeenAt: number;
}

interface ProbeRuntimeSnapshotRow {
    trainCode: string;
    emuCode: string;
    startAt: number;
    endAt: number;
}

interface ProbeRuntimeResolvedTrainGroup {
    trainKey: string;
    trainInternalCode: string;
}

interface RehydrateProbeRuntimeStateOptions {
    rows: ProbeRuntimeSnapshotRow[];
    nowSeconds: number;
    graceSeconds: number;
    resolveGroupByTrainCode: (
        trainCode: string
    ) => ProbeRuntimeResolvedTrainGroup | null;
}

interface RehydrateProbeRuntimeStateResult {
    routeRows: number;
    restoredRunningEmuCodes: number;
    restoredTrainKeys: number;
    expiredRows: number;
    fallbackKeys: number;
}

let currentDate = getCurrentDateString();
const queriedTodayTrainKeys = new Set<string>();
const runningEmuState = new Map<string, RunningEmuRecord>();

function resetProbeState(today: string): void {
    currentDate = today;
    queriedTodayTrainKeys.clear();
    runningEmuState.clear();
}

export function ensureProbeStateForToday(): void {
    const today = getCurrentDateString();
    if (today === currentDate) {
        return;
    }

    resetProbeState(today);
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

export function rehydrateProbeRuntimeState(
    options: RehydrateProbeRuntimeStateOptions
): RehydrateProbeRuntimeStateResult {
    const today = getCurrentDateString();
    resetProbeState(today);

    const restoredTrainKeys = new Set<string>();
    const restoredRunningEmuCodes = new Set<string>();
    let expiredRows = 0;
    let fallbackKeys = 0;

    for (const row of options.rows) {
        const normalizedTrainCode = normalizeCode(row.trainCode);
        const normalizedEmuCode = normalizeCode(row.emuCode);
        if (
            normalizedTrainCode.length === 0 ||
            normalizedEmuCode.length === 0 ||
            !Number.isInteger(row.startAt) ||
            row.startAt < 0 ||
            !Number.isInteger(row.endAt) ||
            row.endAt < 0
        ) {
            continue;
        }

        const resolvedGroup =
            options.resolveGroupByTrainCode(normalizedTrainCode);
        const trainKey =
            resolvedGroup?.trainKey ??
            buildTrainKey(normalizedTrainCode, '', row.startAt);
        const trainInternalCode = resolvedGroup?.trainInternalCode ?? '';

        if (!resolvedGroup) {
            fallbackKeys += 1;
        }

        queriedTodayTrainKeys.add(trainKey);
        restoredTrainKeys.add(trainKey);

        if (options.nowSeconds > row.endAt + options.graceSeconds) {
            expiredRows += 1;
            continue;
        }

        if (runningEmuState.has(normalizedEmuCode)) {
            continue;
        }

        runningEmuState.set(normalizedEmuCode, {
            trainKey,
            groupKey: buildRunningEmuGroupKey(
                normalizedTrainCode,
                trainInternalCode,
                row.startAt
            ),
            endAt: row.endAt,
            lastSeenAt: options.nowSeconds
        });
        restoredRunningEmuCodes.add(normalizedEmuCode);
    }

    return {
        routeRows: options.rows.length,
        restoredRunningEmuCodes: restoredRunningEmuCodes.size,
        restoredTrainKeys: restoredTrainKeys.size,
        expiredRows,
        fallbackKeys
    };
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
