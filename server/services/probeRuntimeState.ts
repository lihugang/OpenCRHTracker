import {
    formatTrainCode,
    type TrainCodeParts
} from '~/server/utils/12306/trainCode';
import type { EmuId } from '~/server/libs/database/emu';
import {
    serviceDateToDay,
    type ServiceDay
} from '~/server/utils/date/serviceDay';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';

interface RunningEmuRecord {
    trainKey: string;
    groupKey: string;
    startAt: number;
    lastSeenAt: number;
}

export interface AssignedEmuStateRecord extends RunningEmuRecord {}

interface ProbeRuntimeSnapshotRow {
    trainCode: TrainCodeParts;
    emuId: EmuId;
    startAt: number;
}

interface ProbeRuntimeResolvedTrainGroup {
    trainKey: string;
    trainInternalCode: string | null;
}

interface RehydrateProbeRuntimeStateOptions {
    rows: ProbeRuntimeSnapshotRow[];
    resolveGroupByTrainCode: (
        trainCode: TrainCodeParts
    ) => ProbeRuntimeResolvedTrainGroup | null;
}

interface RehydrateProbeRuntimeStateResult {
    routeRows: number;
    restoredAssignedEmuCodes: number;
    restoredTrainKeys: number;
    skippedOlderRows: number;
    fallbackKeys: number;
}

let currentDate: ServiceDay = serviceDateToDay(getCurrentDateString());
const queriedTodayTrainKeys = new Set<string>();
const assignedTodayEmuState = new Map<number, RunningEmuRecord>();

function resetProbeState(today: ServiceDay): void {
    currentDate = today;
    queriedTodayTrainKeys.clear();
    assignedTodayEmuState.clear();
}

export function ensureProbeStateForToday(): void {
    const today = serviceDateToDay(getCurrentDateString());
    if (today === currentDate) {
        return;
    }

    resetProbeState(today);
}

export function buildTrainKey(
    trainCode: TrainCodeParts,
    trainInternalCode: string | null,
    startAt: number
): string {
    if (trainInternalCode) {
        return `internal:${trainInternalCode.trim().toUpperCase()}`;
    }

    return `fallback:${formatTrainCode(trainCode)}@${startAt}`;
}

export function buildRunningEmuGroupKey(
    trainCode: TrainCodeParts,
    trainInternalCode: string | null,
    startAt: number
): string {
    if (trainInternalCode) {
        return `internal:${trainInternalCode.trim().toUpperCase()}@${startAt}`;
    }

    return `fallback:${formatTrainCode(trainCode)}@${startAt}`;
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
    const today = serviceDateToDay(getCurrentDateString());
    resetProbeState(today);

    const restoredTrainKeys = new Set<string>();
    const restoredAssignedEmuCodes = new Set<number>();
    let skippedOlderRows = 0;
    let fallbackKeys = 0;

    for (const row of options.rows) {
        if (!Number.isInteger(row.startAt) || row.startAt < 0) {
            continue;
        }

        const resolvedGroup = options.resolveGroupByTrainCode(row.trainCode);
        const trainKey =
            resolvedGroup?.trainKey ??
            buildTrainKey(row.trainCode, null, row.startAt);
        const trainInternalCode = resolvedGroup?.trainInternalCode ?? null;

        if (!resolvedGroup) {
            fallbackKeys += 1;
        }

        queriedTodayTrainKeys.add(trainKey);
        restoredTrainKeys.add(trainKey);

        if (assignedTodayEmuState.has(Number(row.emuId))) {
            skippedOlderRows += 1;
            continue;
        }

        assignedTodayEmuState.set(Number(row.emuId), {
            trainKey,
            groupKey: buildRunningEmuGroupKey(
                row.trainCode,
                trainInternalCode,
                row.startAt
            ),
            startAt: row.startAt,
            lastSeenAt: row.startAt
        });
        restoredAssignedEmuCodes.add(Number(row.emuId));
    }

    return {
        routeRows: options.rows.length,
        restoredAssignedEmuCodes: restoredAssignedEmuCodes.size,
        restoredTrainKeys: restoredTrainKeys.size,
        skippedOlderRows,
        fallbackKeys
    };
}

export function isEmuAssignedToday(emuId: EmuId): boolean {
    return assignedTodayEmuState.has(Number(emuId));
}

export function getAssignedEmuState(
    emuId: EmuId
): AssignedEmuStateRecord | null {
    const record = assignedTodayEmuState.get(Number(emuId));
    return record ? { ...record } : null;
}

export function listAssignedEmuCodesByTrainKey(trainKey: string): EmuId[] {
    const normalizedTrainKey = trainKey.trim();
    if (normalizedTrainKey.length === 0) {
        return [];
    }

    const emuIds: EmuId[] = [];
    for (const [emuId, record] of assignedTodayEmuState.entries()) {
        if (record.trainKey !== normalizedTrainKey) {
            continue;
        }

        emuIds.push(emuId as EmuId);
    }

    return emuIds;
}

export function markEmuCodesAssignedToday(
    emuIds: EmuId[],
    trainKey: string,
    groupKey: string,
    startAt: number,
    nowSeconds: number
): void {
    for (const emuId of emuIds) {
        assignedTodayEmuState.set(Number(emuId), {
            trainKey,
            groupKey,
            startAt,
            lastSeenAt: nowSeconds
        });
    }
}

export function listAssignedEmuCodesByGroupKey(groupKey: string): EmuId[] {
    const normalizedGroupKey = groupKey.trim();
    if (normalizedGroupKey.length === 0) {
        return [];
    }

    const emuIds: EmuId[] = [];
    for (const [emuId, record] of assignedTodayEmuState.entries()) {
        if (record.groupKey !== normalizedGroupKey) {
            continue;
        }

        emuIds.push(emuId as EmuId);
    }

    return emuIds;
}

export function clearAssignedEmuCodeByGroupKey(
    groupKey: string,
    emuId: EmuId
): boolean {
    const normalizedGroupKey = groupKey.trim();
    if (normalizedGroupKey.length === 0) {
        return false;
    }

    const record = assignedTodayEmuState.get(Number(emuId));
    if (!record || record.groupKey !== normalizedGroupKey) {
        return false;
    }

    assignedTodayEmuState.delete(Number(emuId));
    return true;
}

export function clearRunningEmuStateByTrainKey(trainKey: string): EmuId[] {
    const removedEmuIds: EmuId[] = [];
    for (const [emuId, record] of assignedTodayEmuState.entries()) {
        if (record.trainKey !== trainKey) {
            continue;
        }

        assignedTodayEmuState.delete(emuId);
        removedEmuIds.push(emuId as EmuId);
    }

    return removedEmuIds;
}
