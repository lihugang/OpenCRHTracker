import '~/server/libs/database/emu';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import { formatShanghaiDateString } from '~/server/utils/date/getCurrentDateString';

type ProbeUntrustedSqlKey =
    | 'clearProbeUntrustedRecords'
    | 'deleteProbeUntrustedRecordsByTrainCodeAndEmuCodeAtServiceDate'
    | 'deleteProbeUntrustedRecordsByTrainCodeInRange'
    | 'insertProbeUntrustedRecord'
    | 'selectProbeUntrustedRecord';

const probeUntrustedSql = importSqlBatch('emu/queries') as Record<
    ProbeUntrustedSqlKey,
    string
>;
const probeUntrustedStatements = createPreparedSqlStore<ProbeUntrustedSqlKey>({
    dbName: 'EMUTracked',
    scope: 'emu/queries',
    sql: probeUntrustedSql
});

function normalizeServiceDate(value: string): string {
    return /^\d{8}$/.test(value) ? value : '';
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

export function markProbeUntrustedRecord(
    trainCode: string,
    emuCode: string,
    serviceDate: string,
    reason: string,
    detail = ''
): boolean {
    const normalizedTrainCode = normalizeCode(trainCode);
    const normalizedEmuCode = normalizeCode(emuCode);
    const normalizedServiceDate = normalizeServiceDate(serviceDate);
    const normalizedReason = reason.trim();
    if (
        normalizedTrainCode.length === 0 ||
        normalizedEmuCode.length === 0 ||
        normalizedServiceDate.length === 0 ||
        normalizedReason.length === 0
    ) {
        return false;
    }

    const result = probeUntrustedStatements.run(
        'insertProbeUntrustedRecord',
        normalizedTrainCode,
        normalizedEmuCode,
        normalizedServiceDate,
        normalizedReason,
        detail.trim(),
        Math.floor(Date.now() / 1000)
    );
    return result.changes > 0;
}

export function isProbeUntrustedRecord(
    trainCode: string,
    emuCode: string,
    serviceDate: string
): boolean {
    const normalizedTrainCode = normalizeCode(trainCode);
    const normalizedEmuCode = normalizeCode(emuCode);
    const normalizedServiceDate = normalizeServiceDate(serviceDate);
    if (
        normalizedTrainCode.length === 0 ||
        normalizedEmuCode.length === 0 ||
        normalizedServiceDate.length === 0
    ) {
        return false;
    }

    const row = probeUntrustedStatements.get<{ 1: number }>(
        'selectProbeUntrustedRecord',
        normalizedTrainCode,
        normalizedEmuCode,
        normalizedServiceDate
    );
    return row !== undefined;
}

export function deleteProbeUntrustedRecordsByTrainCodeAndEmuCodeAtServiceDate(
    trainCode: string,
    emuCode: string,
    serviceDate: string
): number {
    const normalizedTrainCode = normalizeCode(trainCode);
    const normalizedEmuCode = normalizeCode(emuCode);
    const normalizedServiceDate = normalizeServiceDate(serviceDate);
    if (
        normalizedTrainCode.length === 0 ||
        normalizedEmuCode.length === 0 ||
        normalizedServiceDate.length === 0
    ) {
        return 0;
    }

    const result = probeUntrustedStatements.run(
        'deleteProbeUntrustedRecordsByTrainCodeAndEmuCodeAtServiceDate',
        normalizedTrainCode,
        normalizedEmuCode,
        normalizedServiceDate
    );
    return result.changes;
}

export function deleteProbeUntrustedRecordsByTrainCodeInRange(
    trainCode: string,
    startAt: number,
    endAtExclusive: number
): number {
    const normalizedTrainCode = normalizeCode(trainCode);
    if (
        normalizedTrainCode.length === 0 ||
        !Number.isInteger(startAt) ||
        !Number.isInteger(endAtExclusive) ||
        endAtExclusive <= startAt
    ) {
        return 0;
    }

    const { startServiceDate, endServiceDate } =
        normalizeInclusiveServiceDateRange(startAt, endAtExclusive, true);
    const result = probeUntrustedStatements.run(
        'deleteProbeUntrustedRecordsByTrainCodeInRange',
        normalizedTrainCode,
        startServiceDate,
        endServiceDate
    );
    return result.changes;
}

export function clearProbeUntrustedRecords(): number {
    const result = probeUntrustedStatements.run('clearProbeUntrustedRecords');
    return result.changes;
}
