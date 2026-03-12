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
    status: ProbeStatusValue;
}

type ProbeStatusSqlKey =
    | 'clearProbeStatus'
    | 'insertProbeStatus'
    | 'selectProbeStatusByEmuCode'
    | 'selectProbeStatusByTrainCode'
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

export function listProbeStatusByEmuCode(emuCode: string): ProbeStatusRow[] {
    const normalizedEmuCode = normalizeEmuCode(emuCode);
    if (normalizedEmuCode.length === 0) {
        return [];
    }

    return probeStatusStatements.all<ProbeStatusRow>(
        'selectProbeStatusByEmuCode',
        normalizedEmuCode
    );
}

export function listProbeStatusByTrainCode(
    trainCode: string
): ProbeStatusRow[] {
    const normalizedTrainCode = normalizeTrainCode(trainCode);
    if (normalizedTrainCode.length === 0) {
        return [];
    }

    return probeStatusStatements.all<ProbeStatusRow>(
        'selectProbeStatusByTrainCode',
        normalizedTrainCode
    );
}

export function insertProbeStatus(
    trainCode: string,
    emuCode: string,
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
        status
    );
    return Number(result.lastInsertRowid);
}

export function ensureProbeStatus(
    trainCode: string,
    emuCode: string,
    status: ProbeStatusValue
): 'created' | 'updated' | 'unchanged' {
    const normalizedTrainCode = normalizeTrainCode(trainCode);
    const normalizedEmuCode = normalizeEmuCode(emuCode);
    if (normalizedTrainCode.length === 0 || normalizedEmuCode.length === 0) {
        return 'unchanged';
    }

    const existingRows = listProbeStatusByTrainCode(normalizedTrainCode);
    const existing = existingRows.find(
        (row) => row.emu_code === normalizedEmuCode
    );
    if (!existing) {
        insertProbeStatus(normalizedTrainCode, normalizedEmuCode, status);
        return 'created';
    }

    if (existing.status === status) {
        return 'unchanged';
    }

    updateProbeStatusByTrainCodeAndEmuCode(
        normalizedTrainCode,
        normalizedEmuCode,
        status
    );
    return 'updated';
}

export function updateProbeStatusByEmuCode(
    emuCode: string,
    status: ProbeStatusValue
): number {
    const normalizedEmuCode = normalizeEmuCode(emuCode);
    if (normalizedEmuCode.length === 0) {
        return 0;
    }

    const result = probeStatusStatements.run(
        'updateProbeStatusByEmuCode',
        status,
        normalizedEmuCode
    );
    return result.changes;
}

export function updateProbeStatusByTrainCode(
    trainCode: string,
    status: ProbeStatusValue
): number {
    const normalizedTrainCode = normalizeTrainCode(trainCode);
    if (normalizedTrainCode.length === 0) {
        return 0;
    }

    const result = probeStatusStatements.run(
        'updateProbeStatusByTrainCode',
        status,
        normalizedTrainCode
    );
    return result.changes;
}

export function updateProbeStatusByTrainCodeAndEmuCode(
    trainCode: string,
    emuCode: string,
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
        normalizedEmuCode
    );
    return result.changes;
}

export function clearProbeStatus(): number {
    const result = probeStatusStatements.run('clearProbeStatus');
    return result.changes;
}
