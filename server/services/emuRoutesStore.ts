import '~/server/libs/database/emu';
import {
    useEmuDatabase,
    asEmuId,
    type EmuId
} from '~/server/libs/database/emu';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import {
    hydrateHistoricalRouteSummary,
    resolveTimetableIdentityLink
} from '~/server/services/historicalTimetableResolver';
import {
    decodeEmuRouteStatus,
    EMU_ROUTE_STATUS_CONFIRMED,
    mergeEmuRouteStatuses,
    withFormationStatus,
    type EmuRouteFormationStatusInput
} from '~/server/utils/emuRouteStatus';
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
    status: number;
}

export interface DailyEmuRouteLightRow {
    id: number;
    train_code: TrainCodeParts;
    emu_id: EmuId;
    service_date: ServiceDay;
    timetable_id: number | null;
    status: number;
}

export interface DailyEmuRouteRow extends DailyEmuRouteLightRow {
    start_station_name: string;
    end_station_name: string;
    start_at: number;
    end_at: number;
}

export interface DailyEmuRouteUpsertResult {
    id: number;
    action: 'created' | 'updated' | 'unchanged';
    timetableId: number | null;
    previousStatus: number | null;
    nextStatus: number;
}

function toInternalRow(row: RawDailyEmuRouteRow): DailyEmuRouteLightRow {
    const status = decodeEmuRouteStatus(row.status) ? row.status : 0;
    return {
        id: row.id,
        train_code: {
            prefix: row.train_prefix,
            number: row.train_number
        },
        emu_id: asEmuId(row.emu_id),
        service_date: asServiceDay(row.service_date),
        timetable_id: row.timetable_id,
        status
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
    | 'insertDailyEmuRouteWithIdentity'
    | 'selectDailyEmuRouteByIdentity'
    | 'selectDailyRecordById'
    | 'selectConfirmedDailyRoutesByEmuCodeBeforeCursor'
    | 'selectDailyRoutesByEmuCodeInRange'
    | 'selectDailyRoutesByTrainCodeInRange'
    | 'selectLatestDailyRoutesByTrainCode'
    | 'selectHistoryByEmuPaged'
    | 'selectHistoryByTrainPaged'
    | 'selectDailyRecordsPaged'
    | 'selectDailyRecordsAll'
    | 'updateDailyEmuRouteStatusById'
    | 'updateDailyEmuRouteTimetableIdAndStatusById';

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

const LATEST_CONFIRMED_ROUTE_SCAN_BATCH_SIZE = 128;

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

function toFormationStatusInput(status: number): EmuRouteFormationStatusInput {
    const decoded = decodeEmuRouteStatus(status);
    if (!decoded) {
        throw new Error(`invalid_emu_route_status ${status}`);
    }

    return {
        confirmed: decoded.confirmed,
        formationPosition: decoded.formationPosition
    };
}

function upsertDailyEmuRouteByServiceDate(
    trainCode: TrainCodeParts,
    emuId: EmuId,
    serviceDate: ServiceDay,
    timetableId: number | null,
    status: number
): DailyEmuRouteUpsertResult {
    const formation = toFormationStatusInput(status);
    const matchingRows =
        emuRouteStatements.all<RawDailyEmuRouteRow>(
            'selectDailyEmuRouteByIdentity',
            trainCode.prefix,
            trainCode.number,
            emuId,
            serviceDate,
            timetableId
        ) ?? [];
    const existing =
        matchingRows.find((row) => row.timetable_id === timetableId) ??
        (timetableId !== null
            ? matchingRows.find((row) => row.timetable_id === null)
            : undefined) ??
        null;

    if (!existing) {
        const result = emuRouteStatements.run(
            'insertDailyEmuRouteWithIdentity',
            trainCode.prefix,
            trainCode.number,
            emuId,
            serviceDate,
            timetableId,
            status
        );
        return {
            id: Number(result.lastInsertRowid),
            action: 'created',
            timetableId,
            previousStatus: null,
            nextStatus: status
        };
    }

    const nextStatus = withFormationStatus(existing.status, formation);
    if (nextStatus === null) {
        throw new Error(`invalid_emu_route_status ${existing.status}`);
    }

    if (
        existing.timetable_id === timetableId &&
        existing.status === nextStatus
    ) {
        return {
            id: existing.id,
            action: 'unchanged',
            timetableId,
            previousStatus: existing.status,
            nextStatus
        };
    }

    if (existing.timetable_id === timetableId) {
        emuRouteStatements.run(
            'updateDailyEmuRouteStatusById',
            nextStatus,
            existing.id
        );
    } else {
        emuRouteStatements.run(
            'updateDailyEmuRouteTimetableIdAndStatusById',
            timetableId,
            nextStatus,
            existing.id
        );
    }

    return {
        id: existing.id,
        action: 'updated',
        timetableId,
        previousStatus: existing.status,
        nextStatus
    };
}

export function upsertDailyEmuRouteWithFormationStatus(
    trainCode: TrainCodeParts,
    emuId: EmuId,
    startAt: number,
    status: number
): DailyEmuRouteUpsertResult {
    if (!Number.isInteger(startAt) || startAt < 0) {
        throw new Error('invalid_start_at');
    }

    const identityLink = resolveTimetableIdentityLink(trainCode, startAt);
    return upsertDailyEmuRouteByServiceDate(
        trainCode,
        emuId,
        identityLink.serviceDate,
        identityLink.timetableId,
        status
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

function listDailyRoutesByStartAt(rows: DailyEmuRouteRow[], startAt: number) {
    const serviceDate = normalizeServiceDateFromTimestamp(startAt);
    const resolvedRows = rows.filter((row) => row.start_at === startAt);
    if (resolvedRows.length > 0) {
        return resolvedRows;
    }

    return rows.filter(
        (row) => row.start_at === 0 && row.service_date === serviceDate
    );
}

export function listDailyRoutesByTrainCodeAndStartAt(
    trainCode: TrainCodeParts,
    startAt: number
): DailyEmuRouteRow[] {
    if (!Number.isInteger(startAt) || startAt < 0) {
        return [];
    }

    return listDailyRoutesByStartAt(
        listDailyRoutesByTrainCodeInRange(trainCode, startAt, startAt + 1),
        startAt
    );
}

export function listDailyRoutesByEmuCodeAndStartAt(
    emuId: EmuId,
    startAt: number
): DailyEmuRouteRow[] {
    if (!Number.isInteger(startAt) || startAt < 0) {
        return [];
    }

    return listDailyRoutesByStartAt(
        listDailyRoutesByEmuCodeInRange(emuId, startAt, startAt + 1),
        startAt
    );
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

export function insertDailyEmuRouteWithIdentity(
    trainCode: TrainCodeParts,
    emuId: EmuId,
    serviceDate: ServiceDay,
    timetableId: number | null,
    status: number
): number {
    if (
        timetableId !== null &&
        (!Number.isInteger(timetableId) || timetableId <= 0)
    ) {
        return 0;
    }

    const result = upsertDailyEmuRouteByServiceDate(
        trainCode,
        emuId,
        serviceDate,
        timetableId,
        status
    );
    return result.id;
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

export function deleteDailyRouteByTrainCodeAndEmuCodeAtServiceDate(
    trainCode: TrainCodeParts,
    emuId: EmuId,
    serviceDate: ServiceDay
): number {
    const result = emuRouteStatements.run(
        'deleteDailyRouteByTrainCodeAndEmuCodeAtServiceDate',
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

export function getEmuRouteStatusByTrainCode(
    trainCode: TrainCodeParts,
    startAt: number
): number {
    return mergeEmuRouteStatuses(
        listDailyRoutesByTrainCodeAndStartAt(trainCode, startAt).map(
            (row) => row.status
        )
    );
}

export function getEmuRouteStatusByEmuCode(
    emuId: EmuId,
    startAt: number
): number {
    return mergeEmuRouteStatuses(
        listDailyRoutesByEmuCodeAndStartAt(emuId, startAt).map(
            (row) => row.status
        )
    );
}

export function getLatestConfirmedDailyRouteByEmuCodeBefore(
    emuId: EmuId,
    startAtExclusive: number
): DailyEmuRouteRow | null {
    if (!Number.isInteger(startAtExclusive) || startAtExclusive < 0) {
        return null;
    }

    const serviceDate = normalizeServiceDateFromTimestamp(startAtExclusive);
    let cursorServiceDate = serviceDate;
    let cursorId = Number.MAX_SAFE_INTEGER;
    let latestRow: DailyEmuRouteRow | null = null;

    for (;;) {
        const rawRows = emuRouteStatements.all<RawDailyEmuRouteRow>(
            'selectConfirmedDailyRoutesByEmuCodeBeforeCursor',
            emuId,
            EMU_ROUTE_STATUS_CONFIRMED,
            cursorServiceDate,
            cursorServiceDate,
            cursorId,
            LATEST_CONFIRMED_ROUTE_SCAN_BATCH_SIZE
        );
        if (rawRows.length === 0) {
            break;
        }

        const rows = hydrateRows(rawRows);
        for (const row of rows) {
            if (
                row.start_at > 0 &&
                row.start_at < startAtExclusive &&
                (latestRow === null ||
                    row.start_at > latestRow.start_at ||
                    (row.start_at === latestRow.start_at &&
                        row.id > latestRow.id))
            ) {
                latestRow = row;
            }
        }

        const lastRawRow = rawRows[rawRows.length - 1]!;
        if (
            latestRow !== null &&
            Number(lastRawRow.service_date) < Number(latestRow.service_date)
        ) {
            break;
        }

        cursorServiceDate = asServiceDay(lastRawRow.service_date);
        cursorId = lastRawRow.id;
        if (rawRows.length < LATEST_CONFIRMED_ROUTE_SCAN_BATCH_SIZE) {
            break;
        }
    }

    return latestRow;
}

function updateRouteFormationStatus(
    row: DailyEmuRouteRow,
    status: number
): boolean {
    const nextStatus = withFormationStatus(
        row.status,
        toFormationStatusInput(status)
    );
    if (nextStatus === null || nextStatus === row.status) {
        return false;
    }

    emuRouteStatements.run('updateDailyEmuRouteStatusById', nextStatus, row.id);
    return true;
}

export function updateDailyRouteFormationStatusByTrainCode(
    trainCode: TrainCodeParts,
    startAt: number,
    status: number
): number {
    return listDailyRoutesByTrainCodeAndStartAt(
        trainCode,
        startAt
    ).reduce<number>(
        (changes, row) =>
            changes + (updateRouteFormationStatus(row, status) ? 1 : 0),
        0
    );
}

export function updateDailyRouteFormationStatusByEmuCode(
    emuId: EmuId,
    startAt: number,
    status: number
): number {
    return listDailyRoutesByEmuCodeAndStartAt(emuId, startAt).reduce<number>(
        (changes, row) =>
            changes + (updateRouteFormationStatus(row, status) ? 1 : 0),
        0
    );
}

export function updateDailyRouteFormationStatusByTrainCodeAndEmuCode(
    trainCode: TrainCodeParts,
    emuId: EmuId,
    startAt: number,
    status: number
): number {
    const rows = listDailyRoutesByTrainCodeAndStartAt(trainCode, startAt);
    const matchingRow = rows.find(
        (row) => Number(row.emu_id) === Number(emuId)
    );
    if (!matchingRow) {
        return 0;
    }

    return updateRouteFormationStatus(matchingRow, status) ? 1 : 0;
}
