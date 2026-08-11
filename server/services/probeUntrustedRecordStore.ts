import '~/server/libs/database/emu';
import {
    asServiceDay,
    serviceDateToDay,
    unixSecondsToServiceDay,
    type ServiceDay
} from '~/server/utils/date/serviceDay';
import type { TrainCodeParts } from '~/server/utils/12306/trainCode';
import type { EmuId } from '~/server/libs/database/emu';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';

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

export function markProbeUntrustedRecord(
    trainCode: TrainCodeParts,
    emuId: EmuId,
    serviceDate: ServiceDay,
    reason: string,
    detail = ''
): boolean {
    const normalizedReason = reason.trim();
    if (normalizedReason.length === 0) {
        return false;
    }

    const result = probeUntrustedStatements.run(
        'insertProbeUntrustedRecord',
        trainCode.prefix,
        trainCode.number,
        emuId,
        serviceDate,
        normalizedReason,
        detail.trim(),
        Math.floor(Date.now() / 1000)
    );
    return result.changes > 0;
}

export function isProbeUntrustedRecord(
    trainCode: TrainCodeParts,
    emuId: EmuId,
    serviceDate: ServiceDay
): boolean {
    const row = probeUntrustedStatements.get<{ 1: number }>(
        'selectProbeUntrustedRecord',
        trainCode.prefix,
        trainCode.number,
        emuId,
        serviceDate
    );
    return row !== undefined;
}

export function deleteProbeUntrustedRecordsByTrainCodeAndEmuCodeAtServiceDate(
    trainCode: TrainCodeParts,
    emuId: EmuId,
    serviceDate: ServiceDay
): number {
    const result = probeUntrustedStatements.run(
        'deleteProbeUntrustedRecordsByTrainCodeAndEmuCodeAtServiceDate',
        trainCode.prefix,
        trainCode.number,
        emuId,
        serviceDate
    );
    return result.changes;
}

export function deleteProbeUntrustedRecordsByTrainCodeInRange(
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
    const result = probeUntrustedStatements.run(
        'deleteProbeUntrustedRecordsByTrainCodeInRange',
        trainCode.prefix,
        trainCode.number,
        startServiceDate,
        endServiceDate
    );
    return result.changes;
}

export function clearProbeUntrustedRecords(): number {
    const result = probeUntrustedStatements.run('clearProbeUntrustedRecords');
    return result.changes;
}
