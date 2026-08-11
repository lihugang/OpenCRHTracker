import '~/server/libs/database/emu';
import { asEmuId, type EmuId } from '~/server/libs/database/emu';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import {
    hydrateHistoricalRouteSummary,
    resolveTimetableIdentityLink
} from '~/server/services/historicalTimetableResolver';
import type { TrainCodeParts } from '~/server/utils/12306/trainCode';
import {
    asServiceDay,
    serviceDateToDay,
    unixSecondsToServiceDay,
    type ServiceDay
} from '~/server/utils/date/serviceDay';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';
import {
    clearProbeUntrustedRecords,
    deleteProbeUntrustedRecordsByTrainCodeAndEmuCodeAtServiceDate,
    deleteProbeUntrustedRecordsByTrainCodeInRange
} from '~/server/services/probeUntrustedRecordStore';

export enum ProbeStatusValue {
    PendingCouplingDetection = 1,
    SingleFormationResolved = 2,
    CoupledFormationResolved = 3
}

interface RawProbeStatusRow {
    id: number;
    train_prefix: string;
    train_number: number;
    emu_id: number;
    service_date: number;
    timetable_id: number | null;
    status: ProbeStatusValue;
}

export interface ProbeStatusRow {
    id: number;
    train_code: TrainCodeParts;
    emu_id: EmuId;
    service_date: ServiceDay;
    timetable_id: number | null;
    status: ProbeStatusValue;
    start_at: number;
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

function normalizeServiceDateFromTimestamp(timestampSeconds: number) {
    if (
        !Number.isFinite(timestampSeconds) ||
        !Number.isInteger(timestampSeconds) ||
        timestampSeconds <= 0
    ) {
        return asServiceDay(0);
    }

    return unixSecondsToServiceDay(timestampSeconds);
}

function normalizeInclusiveServiceDateRange(
    startAt: number,
    endAt: number,
    endExclusive = false
) {
    const normalizedStartAt =
        Number.isInteger(startAt) && startAt > 0 ? startAt : 1;
    const effectiveEndAt = endExclusive ? endAt - 1 : endAt;
    const normalizedEndAt =
        !Number.isFinite(effectiveEndAt) ||
        !Number.isInteger(effectiveEndAt) ||
        effectiveEndAt <= 0 ||
        effectiveEndAt >= Number.MAX_SAFE_INTEGER / 2
            ? serviceDateToDay('99991231')
            : normalizeServiceDateFromTimestamp(effectiveEndAt);

    return {
        startServiceDate: normalizeServiceDateFromTimestamp(normalizedStartAt),
        endServiceDate: normalizedEndAt
    };
}

function toInternalRow(row: RawProbeStatusRow): ProbeStatusRow {
    const hydratedSummary = hydrateHistoricalRouteSummary(
        asServiceDay(row.service_date),
        row.timetable_id
    );

    return {
        id: row.id,
        train_code: {
            prefix: row.train_prefix,
            number: row.train_number
        },
        emu_id: asEmuId(row.emu_id),
        service_date: asServiceDay(row.service_date),
        timetable_id: row.timetable_id,
        status: row.status,
        start_at: hydratedSummary.start_at ?? 0
    };
}

function hydrateRows(rows: RawProbeStatusRow[]): ProbeStatusRow[] {
    return rows.map(toInternalRow);
}

function listRawProbeStatusByTrainCodeAndServiceDate(
    trainCode: TrainCodeParts,
    serviceDate: ServiceDay
) {
    return probeStatusStatements.all<RawProbeStatusRow>(
        'selectProbeStatusByTrainCode',
        trainCode.prefix,
        trainCode.number,
        serviceDate
    );
}

function isRowWithinRange(
    row: ProbeStatusRow,
    startAt: number,
    endAt: number,
    endExclusive = false
) {
    if (row.start_at > 0) {
        return endExclusive
            ? row.start_at >= startAt && row.start_at < endAt
            : row.start_at >= startAt && row.start_at <= endAt;
    }

    const { startServiceDate, endServiceDate } =
        normalizeInclusiveServiceDateRange(startAt, endAt, endExclusive);
    return (
        row.service_date >= startServiceDate &&
        row.service_date <= endServiceDate
    );
}

function getHighestProbeStatus(rows: ProbeStatusRow[]): ProbeStatusValue | 0 {
    return rows.reduce<ProbeStatusValue | 0>(
        (currentMax, row) =>
            row.status > currentMax ? row.status : currentMax,
        0
    );
}

function updateProbeStatusRowById(id: number, status: ProbeStatusValue) {
    return probeStatusStatements.run(
        'updateProbeStatusByTrainCodeAndEmuCode',
        status,
        id
    ).changes;
}

function replaceProbeStatusRow(
    trainCode: TrainCodeParts,
    emuId: EmuId,
    serviceDate: ServiceDay,
    timetableId: number | null,
    status: ProbeStatusValue
): number {
    probeStatusStatements.run(
        'deleteProbeStatusByTrainCodeAndEmuCodeAtStartAt',
        trainCode.prefix,
        trainCode.number,
        emuId,
        serviceDate
    );

    const result = probeStatusStatements.run(
        'insertProbeStatus',
        trainCode.prefix,
        trainCode.number,
        emuId,
        serviceDate,
        timetableId,
        status
    );
    return Number(result.lastInsertRowid);
}

export function listProbeStatusByEmuCode(
    emuId: EmuId,
    startAt: number
): ProbeStatusRow[] {
    if (!Number.isInteger(startAt) || startAt < 0) {
        return [];
    }

    const serviceDate = normalizeServiceDateFromTimestamp(startAt);
    return hydrateRows(
        probeStatusStatements.all<RawProbeStatusRow>(
            'selectProbeStatusByEmuCode',
            emuId,
            serviceDate
        )
    ).filter((row) => row.start_at === startAt);
}

export function getProbeStatusByEmuCodeValue(emuId: EmuId, startAt: number) {
    return getHighestProbeStatus(listProbeStatusByEmuCode(emuId, startAt));
}

export function listProbeStatusByEmuCodeInRange(
    emuId: EmuId,
    startAt: number,
    endAtExclusive: number
): ProbeStatusRow[] {
    if (
        !Number.isInteger(startAt) ||
        !Number.isInteger(endAtExclusive) ||
        endAtExclusive <= startAt
    ) {
        return [];
    }

    const { startServiceDate, endServiceDate } =
        normalizeInclusiveServiceDateRange(startAt, endAtExclusive, true);
    return hydrateRows(
        probeStatusStatements.all<RawProbeStatusRow>(
            'selectProbeStatusByEmuCodeInRange',
            emuId,
            startServiceDate,
            endServiceDate
        )
    ).filter((row) => isRowWithinRange(row, startAt, endAtExclusive, true));
}

export function listProbeStatusByTrainCode(
    trainCode: TrainCodeParts,
    startAt: number
): ProbeStatusRow[] {
    if (!Number.isInteger(startAt) || startAt < 0) {
        return [];
    }

    const serviceDate = normalizeServiceDateFromTimestamp(startAt);
    return hydrateRows(
        probeStatusStatements.all<RawProbeStatusRow>(
            'selectProbeStatusByTrainCode',
            trainCode.prefix,
            trainCode.number,
            serviceDate
        )
    ).filter((row) => row.start_at === startAt);
}

export function getProbeStatusByTrainCodeValue(
    trainCode: TrainCodeParts,
    startAt: number
) {
    return getHighestProbeStatus(
        listProbeStatusByTrainCode(trainCode, startAt)
    );
}

export function listProbeStatusByTrainCodeInRange(
    trainCode: TrainCodeParts,
    startAt: number,
    endAtExclusive: number
): ProbeStatusRow[] {
    if (
        !Number.isInteger(startAt) ||
        !Number.isInteger(endAtExclusive) ||
        endAtExclusive <= startAt
    ) {
        return [];
    }

    const { startServiceDate, endServiceDate } =
        normalizeInclusiveServiceDateRange(startAt, endAtExclusive, true);
    return hydrateRows(
        probeStatusStatements.all<RawProbeStatusRow>(
            'selectProbeStatusByTrainCodeInRange',
            trainCode.prefix,
            trainCode.number,
            startServiceDate,
            endServiceDate
        )
    ).filter((row) => isRowWithinRange(row, startAt, endAtExclusive, true));
}

export function getLatestResolvedProbeStatusByEmuCodeBefore(
    emuId: EmuId,
    startAtExclusive: number
): ProbeStatusRow | null {
    if (!Number.isInteger(startAtExclusive) || startAtExclusive < 0) {
        return null;
    }

    const serviceDate = normalizeServiceDateFromTimestamp(startAtExclusive);
    const candidateRows = hydrateRows(
        probeStatusStatements.all<RawProbeStatusRow>(
            'selectLatestResolvedProbeStatusByEmuCodeBefore',
            emuId,
            serviceDate
        )
    )
        .filter((row) => row.start_at > 0 && row.start_at < startAtExclusive)
        .sort((left, right) => {
            const leftStartAt = left.start_at ?? Number.MIN_SAFE_INTEGER;
            const rightStartAt = right.start_at ?? Number.MIN_SAFE_INTEGER;
            if (leftStartAt !== rightStartAt) {
                return rightStartAt - leftStartAt;
            }
            return right.id - left.id;
        });

    return candidateRows[0] ?? null;
}

export function insertProbeStatus(
    trainCode: TrainCodeParts,
    emuId: EmuId,
    startAt: number,
    status: ProbeStatusValue
): number {
    const identityLink = resolveTimetableIdentityLink(trainCode, startAt);
    return replaceProbeStatusRow(
        trainCode,
        emuId,
        identityLink.serviceDate,
        identityLink.timetableId,
        status
    );
}

export function ensureProbeStatus(
    trainCode: TrainCodeParts,
    emuId: EmuId,
    startAt: number,
    status: ProbeStatusValue
): 'created' | 'updated' | 'unchanged' {
    const identityLink = resolveTimetableIdentityLink(trainCode, startAt);

    const existingRows = listRawProbeStatusByTrainCodeAndServiceDate(
        trainCode,
        identityLink.serviceDate
    );
    const existing = existingRows.find((row) => row.emu_id === Number(emuId));
    if (!existing) {
        insertProbeStatus(trainCode, emuId, startAt, status);
        return 'created';
    }

    if (
        existing.status === status &&
        existing.timetable_id === identityLink.timetableId
    ) {
        return 'unchanged';
    }

    replaceProbeStatusRow(
        trainCode,
        emuId,
        identityLink.serviceDate,
        identityLink.timetableId,
        status
    );
    return 'updated';
}

export function updateProbeStatusByEmuCode(
    emuId: EmuId,
    startAt: number,
    status: ProbeStatusValue
): number {
    return listProbeStatusByEmuCode(emuId, startAt).reduce(
        (changes, row) => changes + updateProbeStatusRowById(row.id, status),
        0
    );
}

export function updateProbeStatusByTrainCode(
    trainCode: TrainCodeParts,
    startAt: number,
    status: ProbeStatusValue
): number {
    return listProbeStatusByTrainCode(trainCode, startAt).reduce(
        (changes, row) => changes + updateProbeStatusRowById(row.id, status),
        0
    );
}

export function updateProbeStatusByTrainCodeAndEmuCode(
    trainCode: TrainCodeParts,
    emuId: EmuId,
    startAt: number,
    status: ProbeStatusValue
): number {
    if (!Number.isInteger(startAt) || startAt < 0) {
        return 0;
    }

    const serviceDate = normalizeServiceDateFromTimestamp(startAt);
    const matchingRow = listRawProbeStatusByTrainCodeAndServiceDate(
        trainCode,
        serviceDate
    ).find((row) => row.emu_id === Number(emuId));
    if (!matchingRow) {
        return 0;
    }

    return updateProbeStatusRowById(matchingRow.id, status);
}

export function clearProbeStatus(): number {
    const result = probeStatusStatements.run('clearProbeStatus');
    clearProbeUntrustedRecords();
    return result.changes;
}

export function deleteProbeStatusByTrainCodeInRange(
    trainCode: TrainCodeParts,
    startAt: number,
    endAtExclusive: number
): number {
    if (
        !Number.isInteger(startAt) ||
        !Number.isInteger(endAtExclusive) ||
        endAtExclusive <= startAt
    ) {
        return 0;
    }

    const { startServiceDate, endServiceDate } =
        normalizeInclusiveServiceDateRange(startAt, endAtExclusive, true);
    const result = probeStatusStatements.run(
        'deleteProbeStatusByTrainCodeInRange',
        trainCode.prefix,
        trainCode.number,
        startServiceDate,
        endServiceDate
    );
    deleteProbeUntrustedRecordsByTrainCodeInRange(
        trainCode,
        startAt,
        endAtExclusive
    );
    return result.changes;
}

export function deleteProbeStatusByTrainCodeAndEmuCodeAtStartAt(
    trainCode: TrainCodeParts,
    emuId: EmuId,
    startAt: number
): number {
    if (!Number.isInteger(startAt) || startAt < 0) {
        return 0;
    }

    const serviceDate = normalizeServiceDateFromTimestamp(startAt);
    const result = probeStatusStatements.run(
        'deleteProbeStatusByTrainCodeAndEmuCodeAtStartAt',
        trainCode.prefix,
        trainCode.number,
        emuId,
        serviceDate
    );
    deleteProbeUntrustedRecordsByTrainCodeAndEmuCodeAtServiceDate(
        trainCode,
        emuId,
        serviceDate
    );
    return result.changes;
}

export function deleteProbeStatusByTrainCodeAndEmuCodeAtServiceDate(
    trainCode: TrainCodeParts,
    emuId: EmuId,
    serviceDate: ServiceDay
): number {
    const result = probeStatusStatements.run(
        'deleteProbeStatusByTrainCodeAndEmuCodeAtStartAt',
        trainCode.prefix,
        trainCode.number,
        emuId,
        serviceDate
    );
    deleteProbeUntrustedRecordsByTrainCodeAndEmuCodeAtServiceDate(
        trainCode,
        emuId,
        serviceDate
    );
    return result.changes;
}
