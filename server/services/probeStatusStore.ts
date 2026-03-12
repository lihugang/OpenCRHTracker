import '~/server/libs/database/emu';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import parseEmuCode from '~/server/utils/12306/parseEmuCode';
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
    emu_train_set_no: string;
    status: ProbeStatusValue;
}

type ProbeStatusSqlKey =
    | 'clearProbeStatus'
    | 'insertProbeStatus'
    | 'selectProbeStatusByEmuTrainSetNo'
    | 'selectProbeStatusByTrainCode'
    | 'updateProbeStatusByEmuTrainSetNo'
    | 'updateProbeStatusByTrainCode'
    | 'updateProbeStatusByTrainCodeAndEmuTrainSetNo';

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

function normalizeTrainSetNo(emuTrainSetNo: string): string {
    return normalizeCode(emuTrainSetNo);
}

export function getTrainSetNoFromEmuCode(emuCode: string): string {
    const parsed = parseEmuCode(emuCode);
    return parsed?.trainSetNo ?? '';
}

export function listProbeStatusByEmuTrainSetNo(
    emuTrainSetNo: string
): ProbeStatusRow[] {
    const normalizedTrainSetNo = normalizeTrainSetNo(emuTrainSetNo);
    if (normalizedTrainSetNo.length === 0) {
        return [];
    }

    return probeStatusStatements.all<ProbeStatusRow>(
        'selectProbeStatusByEmuTrainSetNo',
        normalizedTrainSetNo
    );
}

export function listProbeStatusByTrainCode(trainCode: string): ProbeStatusRow[] {
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
    emuTrainSetNo: string,
    status: ProbeStatusValue
): number {
    const normalizedTrainCode = normalizeTrainCode(trainCode);
    const normalizedTrainSetNo = normalizeTrainSetNo(emuTrainSetNo);
    if (normalizedTrainCode.length === 0 || normalizedTrainSetNo.length === 0) {
        return 0;
    }

    const result = probeStatusStatements.run(
        'insertProbeStatus',
        normalizedTrainCode,
        normalizedTrainSetNo,
        status
    );
    return Number(result.lastInsertRowid);
}

export function insertProbeStatusIfMissing(
    trainCode: string,
    emuTrainSetNo: string,
    status: ProbeStatusValue
): 'created' | 'existing' {
    const normalizedTrainCode = normalizeTrainCode(trainCode);
    const normalizedTrainSetNo = normalizeTrainSetNo(emuTrainSetNo);
    if (normalizedTrainCode.length === 0 || normalizedTrainSetNo.length === 0) {
        return 'existing';
    }

    const existingRows = listProbeStatusByTrainCode(normalizedTrainCode);
    const existing = existingRows.find(
        (row) => row.emu_train_set_no === normalizedTrainSetNo
    );
    if (existing) {
        return 'existing';
    }

    insertProbeStatus(normalizedTrainCode, normalizedTrainSetNo, status);
    return 'created';
}

export function ensureProbeStatus(
    trainCode: string,
    emuTrainSetNo: string,
    status: ProbeStatusValue
): 'created' | 'updated' | 'unchanged' {
    const normalizedTrainCode = normalizeTrainCode(trainCode);
    const normalizedTrainSetNo = normalizeTrainSetNo(emuTrainSetNo);
    if (normalizedTrainCode.length === 0 || normalizedTrainSetNo.length === 0) {
        return 'unchanged';
    }

    const existingRows = listProbeStatusByTrainCode(normalizedTrainCode);
    const existing = existingRows.find(
        (row) => row.emu_train_set_no === normalizedTrainSetNo
    );
    if (!existing) {
        insertProbeStatus(normalizedTrainCode, normalizedTrainSetNo, status);
        return 'created';
    }

    if (existing.status === status) {
        return 'unchanged';
    }

    updateProbeStatusByTrainCodeAndEmuTrainSetNo(
        normalizedTrainCode,
        normalizedTrainSetNo,
        status
    );
    return 'updated';
}

export function updateProbeStatusByEmuTrainSetNo(
    emuTrainSetNo: string,
    status: ProbeStatusValue
): number {
    const normalizedTrainSetNo = normalizeTrainSetNo(emuTrainSetNo);
    if (normalizedTrainSetNo.length === 0) {
        return 0;
    }

    const result = probeStatusStatements.run(
        'updateProbeStatusByEmuTrainSetNo',
        status,
        normalizedTrainSetNo
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

export function updateProbeStatusByTrainCodeAndEmuTrainSetNo(
    trainCode: string,
    emuTrainSetNo: string,
    status: ProbeStatusValue
): number {
    const normalizedTrainCode = normalizeTrainCode(trainCode);
    const normalizedTrainSetNo = normalizeTrainSetNo(emuTrainSetNo);
    if (normalizedTrainCode.length === 0 || normalizedTrainSetNo.length === 0) {
        return 0;
    }

    const result = probeStatusStatements.run(
        'updateProbeStatusByTrainCodeAndEmuTrainSetNo',
        status,
        normalizedTrainCode,
        normalizedTrainSetNo
    );
    return result.changes;
}

export function clearProbeStatus(): number {
    const result = probeStatusStatements.run('clearProbeStatus');
    return result.changes;
}
