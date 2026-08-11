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
    dayToServiceDate,
    serviceDateToDay,
    unixSecondsToServiceDay,
    type ServiceDay
} from '~/server/utils/date/serviceDay';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';

export interface CursorPoint {
    serviceDate: ServiceDay;
    id: number;
}

interface RawDailyEmuRouteRow {
    id: number;
    train_prefix: string;
    train_number: number;
    emu_id: number;
    service_date: number;
    timetable_id: number | null;
}

export interface DailyEmuRouteLightRow {
    id: number;
    train_code: TrainCodeParts;
    emu_id: EmuId;
    service_date: ServiceDay;
    timetable_id: number | null;
}

export interface DailyEmuRouteRow extends DailyEmuRouteLightRow {
    start_station_name: string;
    end_station_name: string;
    start_at: number;
    end_at: number;
}

function toInternalRow(row: RawDailyEmuRouteRow): DailyEmuRouteLightRow {
    return {
        id: row.id,
        train_code: {
            prefix: row.train_prefix,
            number: row.train_number
        },
        emu_id: asEmuId(row.emu_id),
        service_date: asServiceDay(row.service_date),
        timetable_id: row.timetable_id
    };
}

function toInternalRows(rows: RawDailyEmuRouteRow[]): DailyEmuRouteLightRow[] {
    return rows.map(toInternalRow);
}

type EmuRouteSqlKey =
    | 'deleteDailyRouteById'
    | 'deleteDailyRouteByTrainCodeAndEmuCodeAtServiceDate'
    | 'deleteDailyRouteByTrainCodeAndEmuCodeAtStartAt'
    | 'deleteDailyRoutesByTrainCodeInRange'
    | 'insertDailyEmuRoute'
    | 'insertDailyEmuRouteWithIdentity'
    | 'selectDailyRecordById'
    | 'selectDailyRoutesByEmuCodeInRange'
    | 'selectDailyRoutesByTrainCodeInRange'
    | 'selectLatestDailyRoutesByTrainCode'
    | 'selectHistoryByEmuPaged'
    | 'selectHistoryByTrainPaged'
    | 'selectDailyRecordsPaged'
    | 'selectDailyRecordsAll';

const emuRouteSql = importSqlBatch('emu/queries') as Record<
    EmuRouteSqlKey,
    string
>;
const emuRouteStatements = createPreparedSqlStore<EmuRouteSqlKey>({
    dbName: 'EMUTracked',
    scope: 'emu/queries',
    sql: emuRouteSql
});

const DEFAULT_CURSOR_POINT: CursorPoint = {
    serviceDate: serviceDateToDay('99991231'),
    id: Number.MAX_SAFE_INTEGER
};

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

function hydrateRow(rawRow: RawDailyEmuRouteRow): DailyEmuRouteRow {
    const row = toInternalRow(rawRow);
    const hydratedSummary = hydrateHistoricalRouteSummary(
        row.service_date,
        row.timetable_id
    );

    return {
        ...row,
        start_station_name: hydratedSummary.start_station_name ?? '',
        end_station_name: hydratedSummary.end_station_name ?? '',
        start_at: hydratedSummary.start_at ?? 0,
        end_at: hydratedSummary.end_at ?? 0
    };
}

function hydrateRows(rows: RawDailyEmuRouteRow[]) {
    return rows.map(hydrateRow);
}

function isRowWithinRange(
    row: DailyEmuRouteRow,
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

function sortRowsAscendingByStartAt(
    left: DailyEmuRouteRow,
    right: DailyEmuRouteRow
) {
    const leftStartAt = left.start_at ?? Number.MAX_SAFE_INTEGER;
    const rightStartAt = right.start_at ?? Number.MAX_SAFE_INTEGER;

    if (leftStartAt !== rightStartAt) {
        return leftStartAt - rightStartAt;
    }

    if (left.service_date !== right.service_date) {
        return Number(left.service_date) - Number(right.service_date);
    }

    return left.id - right.id;
}

function selectRawHistoryByTrainPaged(
    trainCode: TrainCodeParts,
    startAt: number,
    endAt: number,
    cursor: CursorPoint | null,
    limit: number
) {
    const cursorPoint = cursor ?? DEFAULT_CURSOR_POINT;
    const { startServiceDate, endServiceDate } =
        normalizeInclusiveServiceDateRange(startAt, endAt);

    return emuRouteStatements.all<RawDailyEmuRouteRow>(
        'selectHistoryByTrainPaged',
        trainCode.prefix,
        trainCode.number,
        startServiceDate,
        endServiceDate,
        cursorPoint.serviceDate,
        cursorPoint.serviceDate,
        cursorPoint.id,
        limit
    );
}

function selectRawHistoryByEmuPaged(
    emuId: EmuId,
    startAt: number,
    endAt: number,
    cursor: CursorPoint | null,
    limit: number
) {
    const cursorPoint = cursor ?? DEFAULT_CURSOR_POINT;
    const { startServiceDate, endServiceDate } =
        normalizeInclusiveServiceDateRange(startAt, endAt);

    return emuRouteStatements.all<RawDailyEmuRouteRow>(
        'selectHistoryByEmuPaged',
        emuId,
        startServiceDate,
        endServiceDate,
        cursorPoint.serviceDate,
        cursorPoint.serviceDate,
        cursorPoint.id,
        limit
    );
}

export function listHistoryByTrainPaged(
    trainCode: TrainCodeParts,
    startAt: number,
    endAt: number,
    cursor: CursorPoint | null,
    limit: number
): DailyEmuRouteRow[] {
    return hydrateRows(
        selectRawHistoryByTrainPaged(trainCode, startAt, endAt, cursor, limit)
    ).filter((row) => isRowWithinRange(row, startAt, endAt));
}

export function listHistoryLightByTrainPaged(
    trainCode: TrainCodeParts,
    startAt: number,
    endAt: number,
    cursor: CursorPoint | null,
    limit: number
): DailyEmuRouteLightRow[] {
    return toInternalRows(
        selectRawHistoryByTrainPaged(trainCode, startAt, endAt, cursor, limit)
    );
}

export function listDailyRoutesByEmuCodeInRange(
    emuId: EmuId,
    startAt: number,
    endAtExclusive: number
): DailyEmuRouteRow[] {
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
        emuRouteStatements.all<RawDailyEmuRouteRow>(
            'selectDailyRoutesByEmuCodeInRange',
            emuId,
            startServiceDate,
            endServiceDate
        )
    )
        .filter((row) => isRowWithinRange(row, startAt, endAtExclusive, true))
        .sort(sortRowsAscendingByStartAt);
}

export function listDailyRoutesByTrainCodeInRange(
    trainCode: TrainCodeParts,
    startAt: number,
    endAtExclusive: number
): DailyEmuRouteRow[] {
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
        emuRouteStatements.all<RawDailyEmuRouteRow>(
            'selectDailyRoutesByTrainCodeInRange',
            trainCode.prefix,
            trainCode.number,
            startServiceDate,
            endServiceDate
        )
    )
        .filter((row) => isRowWithinRange(row, startAt, endAtExclusive, true))
        .sort(sortRowsAscendingByStartAt);
}

export function listLatestDailyRoutesByTrainCode(
    trainCode: TrainCodeParts,
    limit: number
): DailyEmuRouteRow[] {
    if (!Number.isInteger(limit) || limit <= 0) {
        return [];
    }

    return hydrateRows(
        emuRouteStatements.all<RawDailyEmuRouteRow>(
            'selectLatestDailyRoutesByTrainCode',
            trainCode.prefix,
            trainCode.number,
            limit
        )
    );
}

export function listHistoryByEmuPaged(
    emuId: EmuId,
    startAt: number,
    endAt: number,
    cursor: CursorPoint | null,
    limit: number
): DailyEmuRouteRow[] {
    return hydrateRows(
        selectRawHistoryByEmuPaged(emuId, startAt, endAt, cursor, limit)
    ).filter((row) => isRowWithinRange(row, startAt, endAt));
}

export function listHistoryLightByEmuPaged(
    emuId: EmuId,
    startAt: number,
    endAt: number,
    cursor: CursorPoint | null,
    limit: number
): DailyEmuRouteLightRow[] {
    return toInternalRows(
        selectRawHistoryByEmuPaged(emuId, startAt, endAt, cursor, limit)
    );
}

export function insertDailyEmuRoute(
    trainCode: TrainCodeParts,
    emuId: EmuId,
    _startStationName: string,
    _endStationName: string,
    startAt: number,
    _endAt: number
): void {
    const identityLink = resolveTimetableIdentityLink(trainCode, startAt);
    emuRouteStatements.run(
        'deleteDailyRouteByTrainCodeAndEmuCodeAtStartAt',
        trainCode.prefix,
        trainCode.number,
        emuId,
        identityLink.serviceDate
    );

    emuRouteStatements.run(
        'insertDailyEmuRoute',
        trainCode.prefix,
        trainCode.number,
        emuId,
        identityLink.serviceDate,
        identityLink.timetableId
    );
}

export function insertDailyEmuRouteWithIdentity(
    trainCode: TrainCodeParts,
    emuId: EmuId,
    serviceDate: ServiceDay,
    timetableId: number | null
): number {
    if (
        timetableId !== null &&
        (!Number.isInteger(timetableId) || timetableId <= 0)
    ) {
        return 0;
    }

    emuRouteStatements.run(
        'deleteDailyRouteByTrainCodeAndEmuCodeAtServiceDate',
        trainCode.prefix,
        trainCode.number,
        emuId,
        serviceDate
    );

    const result = emuRouteStatements.run(
        'insertDailyEmuRouteWithIdentity',
        trainCode.prefix,
        trainCode.number,
        emuId,
        serviceDate,
        timetableId
    );
    return Number(result.lastInsertRowid);
}

export function deleteDailyRoutesByTrainCodeInRange(
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
    const result = emuRouteStatements.run(
        'deleteDailyRoutesByTrainCodeInRange',
        trainCode.prefix,
        trainCode.number,
        startServiceDate,
        endServiceDate
    );
    return result.changes;
}

export function deleteDailyRouteByTrainCodeAndEmuCodeAtStartAt(
    trainCode: TrainCodeParts,
    emuId: EmuId,
    startAt: number
): number {
    if (!Number.isInteger(startAt) || startAt < 0) {
        return 0;
    }

    const serviceDate = normalizeServiceDateFromTimestamp(startAt);
    const result = emuRouteStatements.run(
        'deleteDailyRouteByTrainCodeAndEmuCodeAtStartAt',
        trainCode.prefix,
        trainCode.number,
        emuId,
        serviceDate
    );
    return result.changes;
}

export function getDailyRecordById(id: number): DailyEmuRouteRow | null {
    if (!Number.isInteger(id) || id <= 0) {
        return null;
    }

    const row =
        emuRouteStatements.get<RawDailyEmuRouteRow>(
            'selectDailyRecordById',
            id
        ) ?? null;
    return row ? hydrateRow(row) : null;
}

export function getDailyRecordLightById(
    id: number
): DailyEmuRouteLightRow | null {
    if (!Number.isInteger(id) || id <= 0) {
        return null;
    }

    const row =
        emuRouteStatements.get<RawDailyEmuRouteRow>(
            'selectDailyRecordById',
            id
        ) ?? null;
    return row ? toInternalRow(row) : null;
}

export function deleteDailyRouteById(id: number): number {
    if (!Number.isInteger(id) || id <= 0) {
        return 0;
    }

    const result = emuRouteStatements.run('deleteDailyRouteById', id);
    return result.changes;
}

export function listDailyRecordsPaged(
    startAt: number,
    endAt: number,
    cursor: CursorPoint | null,
    limit: number
): DailyEmuRouteRow[] {
    const cursorPoint = cursor ?? DEFAULT_CURSOR_POINT;
    const { startServiceDate, endServiceDate } =
        normalizeInclusiveServiceDateRange(startAt, endAt);

    return hydrateRows(
        emuRouteStatements.all<RawDailyEmuRouteRow>(
            'selectDailyRecordsPaged',
            startServiceDate,
            endServiceDate,
            cursorPoint.serviceDate,
            cursorPoint.serviceDate,
            cursorPoint.id,
            limit
        )
    ).filter((row) => isRowWithinRange(row, startAt, endAt));
}

export function listDailyRecordLightPaged(
    startAt: number,
    endAt: number,
    cursor: CursorPoint | null,
    limit: number
): DailyEmuRouteLightRow[] {
    const cursorPoint = cursor ?? DEFAULT_CURSOR_POINT;
    const { startServiceDate, endServiceDate } =
        normalizeInclusiveServiceDateRange(startAt, endAt);

    return toInternalRows(
        emuRouteStatements.all<RawDailyEmuRouteRow>(
            'selectDailyRecordsPaged',
            startServiceDate,
            endServiceDate,
            cursorPoint.serviceDate,
            cursorPoint.serviceDate,
            cursorPoint.id,
            limit
        )
    );
}

export function listDailyRecordsAll(
    startAt: number,
    endAt: number
): DailyEmuRouteRow[] {
    const { startServiceDate, endServiceDate } =
        normalizeInclusiveServiceDateRange(startAt, endAt);

    return hydrateRows(
        emuRouteStatements.all<RawDailyEmuRouteRow>(
            'selectDailyRecordsAll',
            startServiceDate,
            endServiceDate
        )
    ).filter((row) => isRowWithinRange(row, startAt, endAt));
}

export function buildNextCursor(
    rows: Array<Pick<DailyEmuRouteRow, 'service_date' | 'id'>>,
    limit: number
): string {
    if (rows.length < limit || rows.length === 0) {
        return '';
    }

    const last = rows[rows.length - 1]!;
    return `${dayToServiceDate(last.service_date)}:${last.id}`;
}
