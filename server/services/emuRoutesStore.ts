import '~/server/libs/database/emu';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import {
    hydrateHistoricalRouteSummary,
    resolveTimetableIdentityLink
} from '~/server/services/historicalTimetableResolver';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import { formatShanghaiDateString } from '~/server/utils/date/getCurrentDateString';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';

export interface CursorPoint {
    serviceDate: string;
    id: number;
}

interface RawDailyEmuRouteRow {
    id: number;
    train_code: string;
    emu_code: string;
    service_date: string;
    timetable_id: number | null;
}

export interface DailyEmuRouteRow extends RawDailyEmuRouteRow {
    start_station_name: string;
    end_station_name: string;
    start_at: number;
    end_at: number;
}

type EmuRouteSqlKey =
    | 'deleteDailyRouteById'
    | 'deleteDailyRouteByTrainCodeAndEmuCodeAtStartAt'
    | 'deleteDailyRoutesByTrainCodeInRange'
    | 'insertDailyEmuRoute'
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
    serviceDate: '99991231',
    id: Number.MAX_SAFE_INTEGER
};

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

function hydrateRow(row: RawDailyEmuRouteRow): DailyEmuRouteRow {
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

    const rowServiceDate = row.service_date;
    const { startServiceDate, endServiceDate } =
        normalizeInclusiveServiceDateRange(startAt, endAt, endExclusive);
    return (
        rowServiceDate >= startServiceDate && rowServiceDate <= endServiceDate
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
        return left.service_date.localeCompare(right.service_date);
    }

    return left.id - right.id;
}

function selectRawHistoryByTrainPaged(
    trainCode: string,
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
        normalizeCode(trainCode),
        startServiceDate,
        endServiceDate,
        cursorPoint.serviceDate,
        cursorPoint.serviceDate,
        cursorPoint.id,
        limit
    );
}

function selectRawHistoryByEmuPaged(
    emuCode: string,
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
        normalizeCode(emuCode),
        startServiceDate,
        endServiceDate,
        cursorPoint.serviceDate,
        cursorPoint.serviceDate,
        cursorPoint.id,
        limit
    );
}

export function listHistoryByTrainPaged(
    trainCode: string,
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
    trainCode: string,
    startAt: number,
    endAt: number,
    cursor: CursorPoint | null,
    limit: number
) {
    return selectRawHistoryByTrainPaged(
        trainCode,
        startAt,
        endAt,
        cursor,
        limit
    );
}

export function listDailyRoutesByEmuCodeInRange(
    emuCode: string,
    startAt: number,
    endAtExclusive: number
): DailyEmuRouteRow[] {
    const normalizedEmuCode = normalizeCode(emuCode);
    if (
        normalizedEmuCode.length === 0 ||
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
            normalizedEmuCode,
            startServiceDate,
            endServiceDate
        )
    )
        .filter((row) => isRowWithinRange(row, startAt, endAtExclusive, true))
        .sort(sortRowsAscendingByStartAt);
}

export function listDailyRoutesByTrainCodeInRange(
    trainCode: string,
    startAt: number,
    endAtExclusive: number
): DailyEmuRouteRow[] {
    const normalizedTrainCode = normalizeCode(trainCode);
    if (
        normalizedTrainCode.length === 0 ||
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
            normalizedTrainCode,
            startServiceDate,
            endServiceDate
        )
    )
        .filter((row) => isRowWithinRange(row, startAt, endAtExclusive, true))
        .sort(sortRowsAscendingByStartAt);
}

export function listLatestDailyRoutesByTrainCode(
    trainCode: string,
    limit: number
): DailyEmuRouteRow[] {
    const normalizedTrainCode = normalizeCode(trainCode);
    if (
        normalizedTrainCode.length === 0 ||
        !Number.isInteger(limit) ||
        limit <= 0
    ) {
        return [];
    }

    return hydrateRows(
        emuRouteStatements.all<RawDailyEmuRouteRow>(
            'selectLatestDailyRoutesByTrainCode',
            normalizedTrainCode,
            limit
        )
    );
}

export function listHistoryByEmuPaged(
    emuCode: string,
    startAt: number,
    endAt: number,
    cursor: CursorPoint | null,
    limit: number
): DailyEmuRouteRow[] {
    return hydrateRows(
        selectRawHistoryByEmuPaged(emuCode, startAt, endAt, cursor, limit)
    ).filter((row) => isRowWithinRange(row, startAt, endAt));
}

export function listHistoryLightByEmuPaged(
    emuCode: string,
    startAt: number,
    endAt: number,
    cursor: CursorPoint | null,
    limit: number
) {
    return selectRawHistoryByEmuPaged(emuCode, startAt, endAt, cursor, limit);
}

export function insertDailyEmuRoute(
    trainCode: string,
    emuCode: string,
    _startStationName: string,
    _endStationName: string,
    startAt: number,
    _endAt: number
): void {
    const normalizedTrainCode = normalizeCode(trainCode);
    const normalizedEmuCode = normalizeCode(emuCode);
    if (normalizedTrainCode.length === 0 || normalizedEmuCode.length === 0) {
        return;
    }

    const identityLink = resolveTimetableIdentityLink(
        normalizedTrainCode,
        startAt
    );
    emuRouteStatements.run(
        'deleteDailyRouteByTrainCodeAndEmuCodeAtStartAt',
        normalizedTrainCode,
        normalizedEmuCode,
        identityLink.serviceDate
    );

    emuRouteStatements.run(
        'insertDailyEmuRoute',
        normalizedTrainCode,
        normalizedEmuCode,
        identityLink.serviceDate,
        identityLink.timetableId
    );
}

export function deleteDailyRoutesByTrainCodeInRange(
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
    const result = emuRouteStatements.run(
        'deleteDailyRoutesByTrainCodeInRange',
        normalizedTrainCode,
        startServiceDate,
        endServiceDate
    );
    return result.changes;
}

export function deleteDailyRouteByTrainCodeAndEmuCodeAtStartAt(
    trainCode: string,
    emuCode: string,
    startAt: number
): number {
    const normalizedTrainCode = normalizeCode(trainCode);
    const normalizedEmuCode = normalizeCode(emuCode);
    if (
        normalizedTrainCode.length === 0 ||
        normalizedEmuCode.length === 0 ||
        !Number.isInteger(startAt) ||
        startAt < 0
    ) {
        return 0;
    }

    const serviceDate = normalizeServiceDateFromTimestamp(startAt);
    const result = emuRouteStatements.run(
        'deleteDailyRouteByTrainCodeAndEmuCodeAtStartAt',
        normalizedTrainCode,
        normalizedEmuCode,
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
): RawDailyEmuRouteRow | null {
    if (!Number.isInteger(id) || id <= 0) {
        return null;
    }

    return (
        emuRouteStatements.get<RawDailyEmuRouteRow>(
            'selectDailyRecordById',
            id
        ) ?? null
    );
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
) {
    const cursorPoint = cursor ?? DEFAULT_CURSOR_POINT;
    const { startServiceDate, endServiceDate } =
        normalizeInclusiveServiceDateRange(startAt, endAt);

    return emuRouteStatements.all<RawDailyEmuRouteRow>(
        'selectDailyRecordsPaged',
        startServiceDate,
        endServiceDate,
        cursorPoint.serviceDate,
        cursorPoint.serviceDate,
        cursorPoint.id,
        limit
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
    return `${last.service_date}:${last.id}`;
}
