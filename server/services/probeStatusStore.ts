import '~/server/libs/database/emu';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import {
    hydrateHistoricalRouteSummary,
    resolveTimetableIdentityLink
} from '~/server/services/historicalTimetableResolver';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import { formatShanghaiDateString } from '~/server/utils/date/getCurrentDateString';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';

export enum ProbeStatusValue {
    PendingCouplingDetection = 1,
    SingleFormationResolved = 2,
    CoupledFormationResolved = 3
}

interface RawProbeStatusRow {
    id: number;
    train_code: string;
    emu_code: string;
    service_date: string;
    timetable_id: number | null;
    status: ProbeStatusValue;
}

export interface ProbeStatusRow extends RawProbeStatusRow {
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

function normalizeTrainCode(trainCode: string): string {
    return normalizeCode(trainCode);
}

function normalizeEmuCode(emuCode: string): string {
    return normalizeCode(emuCode);
}

function normalizeServiceDateFromTimestamp(timestampSeconds: number) {
    if (
        !Number.isFinite(timestampSeconds) ||
        !Number.isInteger(timestampSeconds) ||
        timestampSeconds <= 0
    ) {
        return '19700101';
    }

    return formatShanghaiDateString(timestampSeconds * 1000);
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
            ? '99991231'
            : normalizeServiceDateFromTimestamp(effectiveEndAt);

    return {
        startServiceDate: normalizeServiceDateFromTimestamp(normalizedStartAt),
        endServiceDate: normalizedEndAt
    };
}

function hydrateRow(row: RawProbeStatusRow): ProbeStatusRow {
    const hydratedSummary = hydrateHistoricalRouteSummary(
        row.service_date,
        row.timetable_id
    );

    return {
        ...row,
        start_at: hydratedSummary.start_at ?? 0
    };
}

function hydrateRows(rows: RawProbeStatusRow[]) {
    return rows.map(hydrateRow);
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

    const { startServiceDate, endServiceDate } = normalizeInclusiveServiceDateRange(
        startAt,
        endAt,
        endExclusive
    );
    return row.service_date >= startServiceDate && row.service_date <= endServiceDate;
}

function getHighestProbeStatus(rows: ProbeStatusRow[]): ProbeStatusValue | 0 {
    return rows.reduce<ProbeStatusValue | 0>(
        (currentMax, row) =>
            row.status > currentMax ? row.status : currentMax,
        0
    );
}

function updateProbeStatusRowById(id: number, status: ProbeStatusValue) {
    return probeStatusStatements.run('updateProbeStatusByTrainCodeAndEmuCode', status, id)
        .changes;
}

export function listProbeStatusByEmuCode(
    emuCode: string,
    startAt: number
): ProbeStatusRow[] {
    const normalizedEmuCode = normalizeEmuCode(emuCode);
    if (normalizedEmuCode.length === 0 || !Number.isInteger(startAt) || startAt < 0) {
        return [];
    }

    const serviceDate = normalizeServiceDateFromTimestamp(startAt);
    return hydrateRows(
        probeStatusStatements.all<RawProbeStatusRow>(
            'selectProbeStatusByEmuCode',
            normalizedEmuCode,
            serviceDate
        )
    ).filter((row) => row.start_at === startAt);
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

    const { startServiceDate, endServiceDate } = normalizeInclusiveServiceDateRange(
        startAt,
        endAtExclusive,
        true
    );
    return hydrateRows(
        probeStatusStatements.all<RawProbeStatusRow>(
            'selectProbeStatusByEmuCodeInRange',
            normalizedEmuCode,
            startServiceDate,
            endServiceDate
        )
    ).filter((row) => isRowWithinRange(row, startAt, endAtExclusive, true));
}

export function listProbeStatusByTrainCode(
    trainCode: string,
    startAt: number
): ProbeStatusRow[] {
    const normalizedTrainCode = normalizeTrainCode(trainCode);
    if (normalizedTrainCode.length === 0 || !Number.isInteger(startAt) || startAt < 0) {
        return [];
    }

    const serviceDate = normalizeServiceDateFromTimestamp(startAt);
    return hydrateRows(
        probeStatusStatements.all<RawProbeStatusRow>(
            'selectProbeStatusByTrainCode',
            normalizedTrainCode,
            serviceDate
        )
    ).filter((row) => row.start_at === startAt);
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

    const { startServiceDate, endServiceDate } = normalizeInclusiveServiceDateRange(
        startAt,
        endAtExclusive,
        true
    );
    return hydrateRows(
        probeStatusStatements.all<RawProbeStatusRow>(
            'selectProbeStatusByTrainCodeInRange',
            normalizedTrainCode,
            startServiceDate,
            endServiceDate
        )
    ).filter((row) => isRowWithinRange(row, startAt, endAtExclusive, true));
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

    const serviceDate = normalizeServiceDateFromTimestamp(startAtExclusive);
    const candidateRows = hydrateRows(
        probeStatusStatements.all<RawProbeStatusRow>(
            'selectLatestResolvedProbeStatusByEmuCodeBefore',
            normalizedEmuCode,
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

    const identityLink = resolveTimetableIdentityLink(normalizedTrainCode, startAt);
    if (identityLink.timetableId !== null) {
        probeStatusStatements.run(
            'deleteProbeStatusByTrainCodeAndEmuCodeAtStartAt',
            normalizedTrainCode,
            normalizedEmuCode,
            identityLink.serviceDate,
            null,
            null
        );
    }

    const result = probeStatusStatements.run(
        'insertProbeStatus',
        normalizedTrainCode,
        normalizedEmuCode,
        identityLink.serviceDate,
        identityLink.timetableId,
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

    updateProbeStatusRowById(existing.id, status);
    return 'updated';
}

export function updateProbeStatusByEmuCode(
    emuCode: string,
    startAt: number,
    status: ProbeStatusValue
): number {
    return listProbeStatusByEmuCode(emuCode, startAt).reduce(
        (changes, row) => changes + updateProbeStatusRowById(row.id, status),
        0
    );
}

export function updateProbeStatusByTrainCode(
    trainCode: string,
    startAt: number,
    status: ProbeStatusValue
): number {
    return listProbeStatusByTrainCode(trainCode, startAt).reduce(
        (changes, row) => changes + updateProbeStatusRowById(row.id, status),
        0
    );
}

export function updateProbeStatusByTrainCodeAndEmuCode(
    trainCode: string,
    emuCode: string,
    startAt: number,
    status: ProbeStatusValue
): number {
    const matchingRow = listProbeStatusByTrainCode(trainCode, startAt).find(
        (row) => row.emu_code === normalizeEmuCode(emuCode)
    );
    if (!matchingRow) {
        return 0;
    }

    return updateProbeStatusRowById(matchingRow.id, status);
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

    const { startServiceDate, endServiceDate } = normalizeInclusiveServiceDateRange(
        startAt,
        endAtExclusive,
        true
    );
    const result = probeStatusStatements.run(
        'deleteProbeStatusByTrainCodeInRange',
        normalizedTrainCode,
        startServiceDate,
        endServiceDate
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

    const identityLink = resolveTimetableIdentityLink(normalizedTrainCode, startAt);
    const result = probeStatusStatements.run(
        'deleteProbeStatusByTrainCodeAndEmuCodeAtStartAt',
        normalizedTrainCode,
        normalizedEmuCode,
        identityLink.serviceDate,
        identityLink.timetableId,
        identityLink.timetableId
    );
    return result.changes;
}
