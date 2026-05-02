import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import normalizeCode from '~/server/utils/12306/normalizeCode';

interface RunningEmuRecord {
    trainKey: string;
    groupKey: string;
    startAt: number;
    lastSeenAt: number;
}

export interface AssignedEmuStateRecord extends RunningEmuRecord {}

interface ProbeRuntimeSnapshotRow {
    trainCode: string;
    emuCode: string;
    startAt: number;
}

interface ProbeRuntimeResolvedTrainGroup {
    trainKey: string;
    trainInternalCode: string;
}

interface RehydrateProbeRuntimeStateOptions {
    rows: ProbeRuntimeSnapshotRow[];
    resolveGroupByTrainCode: (
        trainCode: string
    ) => ProbeRuntimeResolvedTrainGroup | null;
}

interface RehydrateProbeRuntimeStateResult {
    routeRows: number;
    restoredAssignedEmuCodes: number;
    restoredTrainKeys: number;
    skippedOlderRows: number;
    fallbackKeys: number;
}

let currentDate = getCurrentDateString();
const queriedTodayTrainKeys = new Set<string>();
const assignedTodayEmuState = new Map<string, RunningEmuRecord>();

function resetProbeState(today: string): void {
    currentDate = today;
    queriedTodayTrainKeys.clear();
    assignedTodayEmuState.clear();
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
    const restoredAssignedEmuCodes = new Set<string>();
    let skippedOlderRows = 0;
    let fallbackKeys = 0;

    for (const row of options.rows) {
        const normalizedTrainCode = normalizeCode(row.trainCode);
        const normalizedEmuCode = normalizeCode(row.emuCode);
        if (
            normalizedTrainCode.length === 0 ||
            normalizedEmuCode.length === 0 ||
            !Number.isInteger(row.startAt) ||
            row.startAt < 0
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

        if (assignedTodayEmuState.has(normalizedEmuCode)) {
            skippedOlderRows += 1;
            continue;
        }

        assignedTodayEmuState.set(normalizedEmuCode, {
            trainKey,
            groupKey: buildRunningEmuGroupKey(
                normalizedTrainCode,
                trainInternalCode,
                row.startAt
            ),
            startAt: row.startAt,
            lastSeenAt: row.startAt
        });
        restoredAssignedEmuCodes.add(normalizedEmuCode);
    }

    return {
        routeRows: options.rows.length,
        restoredAssignedEmuCodes: restoredAssignedEmuCodes.size,
        restoredTrainKeys: restoredTrainKeys.size,
        skippedOlderRows,
        fallbackKeys
    };
}

export function isEmuAssignedToday(emuCode: string): boolean {
    const normalizedEmuCode = normalizeCode(emuCode);
    return assignedTodayEmuState.has(normalizedEmuCode);
}

export function getAssignedEmuState(
    emuCode: string
): AssignedEmuStateRecord | null {
    const normalizedEmuCode = normalizeCode(emuCode);
    if (normalizedEmuCode.length === 0) {
        return null;
    }

    const record = assignedTodayEmuState.get(normalizedEmuCode);
    return record ? { ...record } : null;
}

export function listAssignedEmuCodesByTrainKey(trainKey: string): string[] {
    const normalizedTrainKey = trainKey.trim();
    if (normalizedTrainKey.length === 0) {
        return [];
    }

    const emuCodes: string[] = [];
    for (const [emuCode, record] of assignedTodayEmuState.entries()) {
        if (record.trainKey !== normalizedTrainKey) {
            continue;
        }

        emuCodes.push(emuCode);
    }

    return emuCodes;
}

export function markEmuCodesAssignedToday(
    emuCodes: string[],
    trainKey: string,
    groupKey: string,
    startAt: number,
    nowSeconds: number
): void {
    for (const rawCode of emuCodes) {
        const normalizedCode = normalizeCode(rawCode);
        if (normalizedCode.length === 0) {
            continue;
        }

        assignedTodayEmuState.set(normalizedCode, {
            trainKey,
            groupKey,
            startAt,
            lastSeenAt: nowSeconds
        });
    }
}

export function listAssignedEmuCodesByGroupKey(groupKey: string): string[] {
    const normalizedGroupKey = groupKey.trim();
    if (normalizedGroupKey.length === 0) {
        return [];
    }

    const emuCodes: string[] = [];
    for (const [emuCode, record] of assignedTodayEmuState.entries()) {
        if (record.groupKey !== normalizedGroupKey) {
            continue;
        }

        emuCodes.push(emuCode);
    }

    return emuCodes;
}

export function clearAssignedEmuCodeByGroupKey(
    groupKey: string,
    emuCode: string
): boolean {
    const normalizedGroupKey = groupKey.trim();
    const normalizedEmuCode = normalizeCode(emuCode);
    if (normalizedGroupKey.length === 0 || normalizedEmuCode.length === 0) {
        return false;
    }

    const record = assignedTodayEmuState.get(normalizedEmuCode);
    if (!record || record.groupKey !== normalizedGroupKey) {
        return false;
    }

    assignedTodayEmuState.delete(normalizedEmuCode);
    return true;
}

export function clearRunningEmuStateByTrainKey(trainKey: string): string[] {
    const removedEmuCodes: string[] = [];
    for (const [emuCode, record] of assignedTodayEmuState.entries()) {
        if (record.trainKey !== trainKey) {
            continue;
        }

        assignedTodayEmuState.delete(emuCode);
        removedEmuCodes.push(emuCode);
    }

    return removedEmuCodes;
}
