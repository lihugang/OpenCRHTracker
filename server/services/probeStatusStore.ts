import '~/server/libs/database/emu';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';

export enum ProbeStatusValue {
    // The record has been persisted, but the coupling result is still pending.
    PendingCouplingDetection = 1,
    // The record has been verified as a single trainset formation.
    SingleFormationResolved = 2,
    // The record has been verified as a coupled trainset formation.
    CoupledFormationResolved = 3
}

export interface ProbeStatusRow {
    id: number;
    train_code: string;
    emu_code: string;
    start_at: number;
    status: ProbeStatusValue;
}

type ProbeStatusSqlKey =
    | 'clearProbeStatus'
    | 'deleteProbeStatusByTrainCodeAndEmuCodeAtStartAt'
    | 'deleteProbeStatusByTrainCodeInRange'
    | 'insertProbeStatus'
    | 'selectProbeStatusByEmuCode'
    | 'selectProbeStatusByEmuCodeInRange'
    | 'selectLatestResolvedProbeStatusByEmuCodeBefore'
    | 'selectProbeStatusByTrainCode'
    | 'selectProbeStatusByTrainCodeInRange'
    | 'updateProbeStatusByEmuCode'
    | 'updateProbeStatusByTrainCode'
    | 'updateProbeStatusByTrainCodeAndEmuCode';

const probeStatusSql = importSqlBatch('emu/queries') as Record<
    ProbeStatusSqlKey,
    string
>;
const probeStatusStatements = createPreparedSqlStore<ProbeStatusSqlKey>({
    dbName: 'EMUTracked',
    scope: 'emu/queries',
    sql: probeStatusSql
});
function normalizeTrainCode(trainCode: string): string {
    return normalizeCode(trainCode);
}

function normalizeEmuCode(emuCode: string): string {
    return normalizeCode(emuCode);
}

function getHighestProbeStatus(rows: ProbeStatusRow[]): ProbeStatusValue | 0 {
    return rows.reduce<ProbeStatusValue | 0>(
        (currentMax, row) =>
            row.status > currentMax ? row.status : currentMax,
        0
    );
}

export function listProbeStatusByEmuCode(
    emuCode: string,
    startAt: number
): ProbeStatusRow[] {
    const normalizedEmuCode = normalizeEmuCode(emuCode);
    if (normalizedEmuCode.length === 0) {
        return [];
    }

    return probeStatusStatements.all<ProbeStatusRow>(
        'selectProbeStatusByEmuCode',
        normalizedEmuCode,
        startAt
    );
}

export function getProbeStatusByEmuCodeValue(emuCode: string, startAt: number) {
    return getHighestProbeStatus(listProbeStatusByEmuCode(emuCode, startAt));
}

export function listProbeStatusByEmuCodeInRange(
    emuCode: string,
    startAt: number,
    endAtExclusive: number
): ProbeStatusRow[] {
    const normalizedEmuCode = normalizeEmuCode(emuCode);
    if (
        normalizedEmuCode.length === 0 ||
        !Number.isInteger(startAt) ||
        !Number.isInteger(endAtExclusive) ||
        endAtExclusive <= startAt
    ) {
        return [];
    }

    return probeStatusStatements.all<ProbeStatusRow>(
        'selectProbeStatusByEmuCodeInRange',
        normalizedEmuCode,
        startAt,
        endAtExclusive
    );
}

export function listProbeStatusByTrainCode(
    trainCode: string,
    startAt: number
): ProbeStatusRow[] {
    const normalizedTrainCode = normalizeTrainCode(trainCode);
    if (normalizedTrainCode.length === 0) {
        return [];
    }

    return probeStatusStatements.all<ProbeStatusRow>(
        'selectProbeStatusByTrainCode',
        normalizedTrainCode,
        startAt
    );
}

export function getProbeStatusByTrainCodeValue(
    trainCode: string,
    startAt: number
) {
    return getHighestProbeStatus(
        listProbeStatusByTrainCode(trainCode, startAt)
    );
}

export function listProbeStatusByTrainCodeInRange(
    trainCode: string,
    startAt: number,
    endAtExclusive: number
): ProbeStatusRow[] {
    const normalizedTrainCode = normalizeTrainCode(trainCode);
    if (
        normalizedTrainCode.length === 0 ||
        !Number.isInteger(startAt) ||
        !Number.isInteger(endAtExclusive) ||
        endAtExclusive <= startAt
    ) {
        return [];
    }

    return probeStatusStatements.all<ProbeStatusRow>(
        'selectProbeStatusByTrainCodeInRange',
        normalizedTrainCode,
        startAt,
        endAtExclusive
    );
}

export function getLatestResolvedProbeStatusByEmuCodeBefore(
    emuCode: string,
    startAtExclusive: number
): ProbeStatusRow | null {
    const normalizedEmuCode = normalizeEmuCode(emuCode);
    if (
        normalizedEmuCode.length === 0 ||
        !Number.isInteger(startAtExclusive) ||
        startAtExclusive < 0
    ) {
        return null;
    }

    return (
        probeStatusStatements.get<ProbeStatusRow>(
            'selectLatestResolvedProbeStatusByEmuCodeBefore',
            normalizedEmuCode,
            startAtExclusive
        ) ?? null
    );
}

export function insertProbeStatus(
    trainCode: string,
    emuCode: string,
    startAt: number,
    status: ProbeStatusValue
): number {
    const normalizedTrainCode = normalizeTrainCode(trainCode);
    const normalizedEmuCode = normalizeEmuCode(emuCode);
    if (normalizedTrainCode.length === 0 || normalizedEmuCode.length === 0) {
        return 0;
    }

    const result = probeStatusStatements.run(
        'insertProbeStatus',
        normalizedTrainCode,
        normalizedEmuCode,
        startAt,
        status
    );
    return Number(result.lastInsertRowid);
}

export function ensureProbeStatus(
    trainCode: string,
    emuCode: string,
    startAt: number,
    status: ProbeStatusValue
): 'created' | 'updated' | 'unchanged' {
    const normalizedTrainCode = normalizeTrainCode(trainCode);
    const normalizedEmuCode = normalizeEmuCode(emuCode);
    if (normalizedTrainCode.length === 0 || normalizedEmuCode.length === 0) {
        return 'unchanged';
    }

    const existingRows = listProbeStatusByTrainCode(
        normalizedTrainCode,
        startAt
    );
    const existing = existingRows.find(
        (row) => row.emu_code === normalizedEmuCode
    );
    if (!existing) {
        insertProbeStatus(
            normalizedTrainCode,
            normalizedEmuCode,
            startAt,
            status
        );
        return 'created';
    }

    if (existing.status === status) {
        return 'unchanged';
    }

    updateProbeStatusByTrainCodeAndEmuCode(
        normalizedTrainCode,
        normalizedEmuCode,
        startAt,
        status
    );
    return 'updated';
}

export function updateProbeStatusByEmuCode(
    emuCode: string,
    startAt: number,
    status: ProbeStatusValue
): number {
    const normalizedEmuCode = normalizeEmuCode(emuCode);
    if (normalizedEmuCode.length === 0) {
        return 0;
    }

    const result = probeStatusStatements.run(
        'updateProbeStatusByEmuCode',
        status,
        normalizedEmuCode,
        startAt
    );
    return result.changes;
}

export function updateProbeStatusByTrainCode(
    trainCode: string,
    startAt: number,
    status: ProbeStatusValue
): number {
    const normalizedTrainCode = normalizeTrainCode(trainCode);
    if (normalizedTrainCode.length === 0) {
        return 0;
    }

    const result = probeStatusStatements.run(
        'updateProbeStatusByTrainCode',
        status,
        normalizedTrainCode,
        startAt
    );
    return result.changes;
}

export function updateProbeStatusByTrainCodeAndEmuCode(
    trainCode: string,
    emuCode: string,
    startAt: number,
    status: ProbeStatusValue
): number {
    const normalizedTrainCode = normalizeTrainCode(trainCode);
    const normalizedEmuCode = normalizeEmuCode(emuCode);
    if (normalizedTrainCode.length === 0 || normalizedEmuCode.length === 0) {
        return 0;
    }

    const result = probeStatusStatements.run(
        'updateProbeStatusByTrainCodeAndEmuCode',
        status,
        normalizedTrainCode,
        normalizedEmuCode,
        startAt
    );
    return result.changes;
}

export function clearProbeStatus(): number {
    const result = probeStatusStatements.run('clearProbeStatus');
    return result.changes;
}

export function deleteProbeStatusByTrainCodeInRange(
    trainCode: string,
    startAt: number,
    endAtExclusive: number
): number {
    const normalizedTrainCode = normalizeTrainCode(trainCode);
    if (
        normalizedTrainCode.length === 0 ||
        !Number.isInteger(startAt) ||
        !Number.isInteger(endAtExclusive) ||
        endAtExclusive <= startAt
    ) {
        return 0;
    }

    const result = probeStatusStatements.run(
        'deleteProbeStatusByTrainCodeInRange',
        normalizedTrainCode,
        startAt,
        endAtExclusive
    );
    return result.changes;
}

export function deleteProbeStatusByTrainCodeAndEmuCodeAtStartAt(
    trainCode: string,
    emuCode: string,
    startAt: number
): number {
    const normalizedTrainCode = normalizeTrainCode(trainCode);
    const normalizedEmuCode = normalizeEmuCode(emuCode);
    if (
        normalizedTrainCode.length === 0 ||
        normalizedEmuCode.length === 0 ||
        !Number.isInteger(startAt) ||
        startAt < 0
    ) {
        return 0;
    }

    const result = probeStatusStatements.run(
        'deleteProbeStatusByTrainCodeAndEmuCodeAtStartAt',
        normalizedTrainCode,
        normalizedEmuCode,
        startAt
    );
    return result.changes;
}
