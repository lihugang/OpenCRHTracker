import '~/server/libs/database/emu';
import {
    useEmuDatabase,
    asEmuId,
    type EmuId
} from '~/server/libs/database/emu';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import getLogger from '~/server/libs/log4js';
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
import { collectStatusByEmuFromRowsWithConflicts } from '~/server/utils/emuRouteFormation';
import {
    trainCodeKey,
    type TrainCodeParts
} from '~/server/utils/12306/trainCode';
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

interface RawLatestDailyEmuIdRow {
    train_prefix: string;
    train_number: number;
    emu_id: number;
}

type ExistingDailyEmuRouteRow = Pick<
    RawDailyEmuRouteRow,
    'id' | 'timetable_id' | 'status'
>;

export interface DailyEmuRouteLightRow {
    id: number;
    train_code: TrainCodeParts;
    emu_id: EmuId;
    service_date: ServiceDay;
    timetable_id: number | null;
    status: number;
}

export interface LatestDailyEmuIdRow {
    train_code: TrainCodeParts;
    emu_id: EmuId;
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
    | 'selectDailyRoutesByTargetsAtServiceDate'
    | 'selectDailyRoutesByTrainCodesInRange'
    | 'selectDailyRoutesByTrainCodeInRange'
    | 'selectLatestDailyEmuIdsByTrainCodes'
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
const logger = getLogger('emu-routes-store');
const reportedStatusMergeConflictKeys = new Set<string>();

interface DailyEmuRouteCacheEntry {
    serviceDate: ServiceDay;
    rows: DailyEmuRouteRow[];
}

// The EMU database is owned by this process, so a process-wide cache is
// sufficient. The key is intentionally only the EMU id; the loaded service
// date travels with the value and is replaced when another day is requested.
const dailyRoutesByEmuCache = new Map<number, DailyEmuRouteCacheEntry>();

export function getCachedDailyRoutesByEmuCodeAtServiceDate(
    emuId: EmuId,
    serviceDate: ServiceDay
): DailyEmuRouteRow[] | undefined {
    const key = Number(emuId);
    const entry = dailyRoutesByEmuCache.get(key);
    if (!entry) {
        return undefined;
    }
    if (entry.serviceDate !== serviceDate) {
        dailyRoutesByEmuCache.delete(key);
        return undefined;
    }
    return entry.rows;
}

export function setCachedDailyRoutesByEmuCodeAtServiceDate(
    emuId: EmuId,
    serviceDate: ServiceDay,
    rows: DailyEmuRouteRow[]
): void {
    dailyRoutesByEmuCache.set(Number(emuId), { serviceDate, rows });
}

export function invalidateCachedDailyRoutesByEmuCodes(
    emuIds: readonly EmuId[]
): void {
    for (const emuId of emuIds) {
        dailyRoutesByEmuCache.delete(Number(emuId));
    }
}

export function clearCachedDailyRoutes(): void {
    dailyRoutesByEmuCache.clear();
}

export function patchCachedDailyRouteRows(
    rows: readonly DailyEmuRouteRow[]
): void {
    const rowsByEmu = new Map<number, DailyEmuRouteRow[]>();
    for (const row of rows) {
        const emuKey = Number(row.emu_id);
        const entry = dailyRoutesByEmuCache.get(emuKey);
        if (!entry || entry.serviceDate !== row.service_date) {
            continue;
        }
        const nextRows = rowsByEmu.get(emuKey) ?? [...entry.rows];
        const index = nextRows.findIndex(
            (candidate) => candidate.id === row.id
        );
        if (index >= 0) {
            nextRows[index] = row;
        } else {
            nextRows.push(row);
        }
        rowsByEmu.set(emuKey, nextRows);
    }
    for (const [emuKey, rowsForEmu] of rowsByEmu) {
        const entry = dailyRoutesByEmuCache.get(emuKey);
        if (!entry) {
            continue;
        }
        rowsForEmu.sort(sortRowsAscendingByStartAt);
        dailyRoutesByEmuCache.set(emuKey, {
            serviceDate: entry.serviceDate,
            rows: rowsForEmu
        });
    }
}

function reportStatusMergeConflicts(
    rows: DailyEmuRouteRow[],
    target: string,
    startAt: number
): void {
    const { conflicts } = collectStatusByEmuFromRowsWithConflicts(rows);
    for (const conflict of conflicts) {
        const key = [
            target,
            startAt,
            Number(conflict.emuId),
            ...[...conflict.statuses].sort((left, right) => left - right)
        ].join(':');
        if (reportedStatusMergeConflictKeys.has(key)) {
            continue;
        }
        if (reportedStatusMergeConflictKeys.size >= 1024) {
            reportedStatusMergeConflictKeys.clear();
        }
        reportedStatusMergeConflictKeys.add(key);
        logger.warn(
            `daily_status_merge_conflict target=${target} emuId=${Number(conflict.emuId)} startAt=${startAt} statuses=${conflict.statuses.join('/')} mergedStatus=${conflict.mergedStatus}`
        );
    }
}

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

function findExistingDailyEmuRouteByIdentity(
    trainCode: TrainCodeParts,
    emuId: EmuId,
    serviceDate: ServiceDay,
    timetableId: number | null
): RawDailyEmuRouteRow | null {
    const matchingRows =
        emuRouteStatements.all<RawDailyEmuRouteRow>(
            'selectDailyEmuRouteByIdentity',
            trainCode.prefix,
            trainCode.number,
            emuId,
            serviceDate,
            timetableId
        ) ?? [];
    return (
        matchingRows.find((row) => row.timetable_id === timetableId) ??
        (timetableId !== null
            ? matchingRows.find((row) => row.timetable_id === null)
            : undefined) ??
        null
    );
}

function insertDailyEmuRouteResult(
    trainPrefix: string,
    trainNumber: number,
    emuId: EmuId,
    serviceDate: ServiceDay,
    timetableId: number | null,
    status: number
): DailyEmuRouteUpsertResult {
    const result = emuRouteStatements.run(
        'insertDailyEmuRouteWithIdentity',
        trainPrefix,
        trainNumber,
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

function upsertDailyEmuRouteByServiceDate(
    trainCode: TrainCodeParts,
    emuId: EmuId,
    serviceDate: ServiceDay,
    timetableId: number | null,
    status: number
): DailyEmuRouteUpsertResult {
    const formation = toFormationStatusInput(status);
    const existing = findExistingDailyEmuRouteByIdentity(
        trainCode,
        emuId,
        serviceDate,
        timetableId
    );
    if (!existing) {
        return insertDailyEmuRouteResult(
            trainCode.prefix,
            trainCode.number,
            emuId,
            serviceDate,
            timetableId,
            status
        );
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

function upsertDailyEmuRouteByServiceDateWithFullStatus(
    trainCode: TrainCodeParts,
    emuId: EmuId,
    serviceDate: ServiceDay,
    timetableId: number | null,
    status: number,
    existing: ExistingDailyEmuRouteRow | null
): DailyEmuRouteUpsertResult {
    if (decodeEmuRouteStatus(status) === null) {
        throw new Error(`invalid_emu_route_status ${status}`);
    }

    if (!existing) {
        return insertDailyEmuRouteResult(
            trainCode.prefix,
            trainCode.number,
            emuId,
            serviceDate,
            timetableId,
            status
        );
    }

    if (existing.timetable_id === timetableId && existing.status === status) {
        return {
            id: existing.id,
            action: 'unchanged',
            timetableId,
            previousStatus: existing.status,
            nextStatus: status
        };
    }

    if (existing.timetable_id === timetableId) {
        emuRouteStatements.run(
            'updateDailyEmuRouteStatusById',
            status,
            existing.id
        );
    } else {
        emuRouteStatements.run(
            'updateDailyEmuRouteTimetableIdAndStatusById',
            timetableId,
            status,
            existing.id
        );
    }

    return {
        id: existing.id,
        action: 'updated',
        timetableId,
        previousStatus: existing.status,
        nextStatus: status
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
    const result = upsertDailyEmuRouteByServiceDate(
        trainCode,
        emuId,
        identityLink.serviceDate,
        identityLink.timetableId,
        status
    );
    if (result.action !== 'unchanged') {
        invalidateCachedDailyRoutesByEmuCodes([emuId]);
    }
    return result;
}

export function upsertDailyEmuRouteWithFullStatus(
    trainCode: TrainCodeParts,
    emuId: EmuId,
    startAt: number,
    status: number
): DailyEmuRouteUpsertResult {
    if (!Number.isInteger(startAt) || startAt < 0) {
        throw new Error('invalid_start_at');
    }
    if (decodeEmuRouteStatus(status) === null) {
        throw new Error(`invalid_emu_route_status ${status}`);
    }

    const identityLink = resolveTimetableIdentityLink(trainCode, startAt);
    const result = upsertDailyEmuRouteByServiceDateWithFullStatus(
        trainCode,
        emuId,
        identityLink.serviceDate,
        identityLink.timetableId,
        status,
        findExistingDailyEmuRouteByIdentity(
            trainCode,
            emuId,
            identityLink.serviceDate,
            identityLink.timetableId
        )
    );
    if (result.action !== 'unchanged') {
        invalidateCachedDailyRoutesByEmuCodes([emuId]);
    }
    return result;
}

export function upsertDailyEmuRouteWithResolvedIdentityAndFullStatus(
    trainCode: TrainCodeParts,
    emuId: EmuId,
    serviceDate: ServiceDay,
    timetableId: number | null,
    status: number,
    existing: DailyEmuRouteLightRow | null
): DailyEmuRouteUpsertResult {
    if (
        existing &&
        (trainCodeKey(existing.train_code) !== trainCodeKey(trainCode) ||
            existing.emu_id !== emuId ||
            existing.service_date !== serviceDate ||
            (existing.timetable_id !== timetableId &&
                !(timetableId !== null && existing.timetable_id === null)))
    ) {
        throw new Error('invalid_existing_daily_emu_route_identity');
    }

    return upsertDailyEmuRouteByServiceDateWithFullStatus(
        trainCode,
        emuId,
        serviceDate,
        timetableId,
        status,
        existing
    );
}

function uniqueTrainCodeValues(
    trainCodes: ReadonlyArray<TrainCodeParts>
): TrainCodeParts[] {
    return Array.from(
        new Map(
            trainCodes.map((trainCode) => [trainCodeKey(trainCode), trainCode])
        ).values()
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

export function filterDailyRoutesByStartAt(
    rows: DailyEmuRouteRow[],
    startAt: number
) {
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

    return filterDailyRoutesByStartAt(
        listDailyRoutesByTrainCodeInRange(trainCode, startAt, startAt + 1),
        startAt
    );
}

export function listDailyRoutesByTargetsAtServiceDate(
    trainCodes: ReadonlyArray<TrainCodeParts>,
    emuIds: ReadonlyArray<EmuId>,
    serviceDate: ServiceDay
): DailyEmuRouteRow[] {
    if (trainCodes.length === 0 && emuIds.length === 0) {
        return [];
    }

    const uniqueTrainCodes = uniqueTrainCodeValues(trainCodes);
    const uniqueEmuIds = Array.from(
        new Set(emuIds.map((emuId) => Number(emuId)))
    );
    return hydrateRows(
        emuRouteStatements.all<RawDailyEmuRouteRow>(
            'selectDailyRoutesByTargetsAtServiceDate',
            JSON.stringify(uniqueTrainCodes),
            JSON.stringify(uniqueEmuIds),
            serviceDate,
            serviceDate
        )
    );
}

export function listDailyRoutesByTrainCodesInRange(
    trainCodes: ReadonlyArray<TrainCodeParts>,
    startAt: number,
    endAtExclusive: number
): DailyEmuRouteRow[] {
    if (
        !Number.isInteger(startAt) ||
        !Number.isInteger(endAtExclusive) ||
        endAtExclusive <= startAt ||
        trainCodes.length === 0
    ) {
        return [];
    }

    const uniqueTrainCodes = uniqueTrainCodeValues(trainCodes);
    const { startServiceDate, endServiceDate } =
        normalizeInclusiveServiceDateRange(startAt, endAtExclusive, true);
    return hydrateRows(
        emuRouteStatements.all<RawDailyEmuRouteRow>(
            'selectDailyRoutesByTrainCodesInRange',
            JSON.stringify(uniqueTrainCodes),
            startServiceDate,
            endServiceDate
        )
    )
        .filter((row) => isRowWithinRange(row, startAt, endAtExclusive, true))
        .sort(sortRowsAscendingByStartAt);
}

export function listDailyRoutesLightByTrainCodesAtServiceDate(
    trainCodes: ReadonlyArray<TrainCodeParts>,
    serviceDate: ServiceDay
): DailyEmuRouteLightRow[] {
    if (trainCodes.length === 0) {
        return [];
    }

    const uniqueTrainCodes = uniqueTrainCodeValues(trainCodes);
    return toInternalRows(
        emuRouteStatements.all<RawDailyEmuRouteRow>(
            'selectDailyRoutesByTrainCodesInRange',
            JSON.stringify(uniqueTrainCodes),
            serviceDate,
            serviceDate
        )
    );
}

export function listDailyRoutesByTrainCodesAndStartAt(
    trainCodes: ReadonlyArray<TrainCodeParts>,
    startAt: number
): DailyEmuRouteRow[] {
    if (!Number.isInteger(startAt) || startAt <= 0 || trainCodes.length === 0) {
        return [];
    }

    return filterDailyRoutesByStartAt(
        listDailyRoutesByTrainCodesInRange(trainCodes, startAt, startAt + 1),
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

    return filterDailyRoutesByStartAt(
        listDailyRoutesByEmuCodeInRange(emuId, startAt, startAt + 1),
        startAt
    );
}

export function listLatestDailyEmuIdsByTrainCodes(
    trainCodes: ReadonlyArray<TrainCodeParts>
): LatestDailyEmuIdRow[] {
    if (trainCodes.length === 0) {
        return [];
    }

    const uniqueTrainCodes = uniqueTrainCodeValues(trainCodes);
    return emuRouteStatements
        .all<RawLatestDailyEmuIdRow>(
            'selectLatestDailyEmuIdsByTrainCodes',
            JSON.stringify(uniqueTrainCodes)
        )
        .map((row) => ({
            train_code: {
                prefix: row.train_prefix,
                number: row.train_number
            },
            emu_id: asEmuId(row.emu_id)
        }));
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
    if (result.action !== 'unchanged') {
        invalidateCachedDailyRoutesByEmuCodes([emuId]);
    }
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
    if (result.changes > 0) {
        clearCachedDailyRoutes();
    }
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
    if (result.changes > 0) {
        invalidateCachedDailyRoutesByEmuCodes([emuId]);
    }
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
    if (result.changes > 0) {
        invalidateCachedDailyRoutesByEmuCodes([emuId]);
    }
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

    const existing = getDailyRecordLightById(id);
    const result = emuRouteStatements.run('deleteDailyRouteById', id);
    if (result.changes > 0 && existing) {
        invalidateCachedDailyRoutesByEmuCodes([existing.emu_id]);
    }
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
    const rows = listDailyRoutesByTrainCodeAndStartAt(trainCode, startAt);
    reportStatusMergeConflicts(
        rows,
        `train:${trainCode.prefix}${trainCode.number}`,
        startAt
    );
    return mergeEmuRouteStatuses(rows.map((row) => row.status));
}

export function mergeDailyRouteRowStatuses(
    rows: DailyEmuRouteRow[],
    target: string,
    startAt: number
): number {
    reportStatusMergeConflicts(rows, target, startAt);
    return mergeEmuRouteStatuses(rows.map((row) => row.status));
}

export function getEmuRouteStatusByEmuCode(
    emuId: EmuId,
    startAt: number
): number {
    const rows = listDailyRoutesByEmuCodeAndStartAt(emuId, startAt);
    reportStatusMergeConflicts(rows, `emu:${Number(emuId)}`, startAt);
    return mergeEmuRouteStatuses(rows.map((row) => row.status));
}

export function listConfirmedDailyRoutesByEmuCodeBefore(
    emuId: EmuId,
    startAtExclusive: number,
    minServiceDate?: ServiceDay
): DailyEmuRouteRow[] {
    if (!Number.isInteger(startAtExclusive) || startAtExclusive <= 0) {
        return [];
    }

    const serviceDate = normalizeServiceDateFromTimestamp(startAtExclusive);
    const effectiveMinServiceDate = minServiceDate ?? serviceDate;
    let cursorServiceDate = serviceDate;
    let cursorId = Number.MAX_SAFE_INTEGER;
    const rowsBeforeStartAt: DailyEmuRouteRow[] = [];

    for (;;) {
        const rawRows = emuRouteStatements.all<RawDailyEmuRouteRow>(
            'selectConfirmedDailyRoutesByEmuCodeBeforeCursor',
            emuId,
            EMU_ROUTE_STATUS_CONFIRMED,
            effectiveMinServiceDate,
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
            if (row.start_at <= 0 || row.end_at <= 0) {
                continue;
            }
            if (row.start_at < startAtExclusive) {
                rowsBeforeStartAt.push(row);
            }
        }

        const lastRawRow = rawRows[rawRows.length - 1]!;
        cursorServiceDate = asServiceDay(lastRawRow.service_date);
        cursorId = lastRawRow.id;
        if (rawRows.length < LATEST_CONFIRMED_ROUTE_SCAN_BATCH_SIZE) {
            break;
        }
    }

    return rowsBeforeStartAt.sort(
        (left, right) =>
            right.end_at - left.end_at ||
            right.start_at - left.start_at ||
            right.id - left.id
    );
}

export function getLatestConfirmedDailyRouteByEmuCodeBefore(
    emuId: EmuId,
    startAtExclusive: number,
    minServiceDate?: ServiceDay
): DailyEmuRouteRow | null {
    return (
        listConfirmedDailyRoutesByEmuCodeBefore(
            emuId,
            startAtExclusive,
            minServiceDate
        )[0] ?? null
    );
}

export function updateDailyRouteFullStatusByEmuCode(
    emuId: EmuId,
    startAt: number,
    status: number
): number {
    if (decodeEmuRouteStatus(status) === null) {
        return 0;
    }

    const changes = listDailyRoutesByEmuCodeAndStartAt(
        emuId,
        startAt
    ).reduce<number>((changes, row) => {
        if (row.status === status) {
            return changes;
        }
        emuRouteStatements.run('updateDailyEmuRouteStatusById', status, row.id);
        return changes + 1;
    }, 0);
    if (changes > 0) {
        invalidateCachedDailyRoutesByEmuCodes([emuId]);
    }
    return changes;
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
    const changes = listDailyRoutesByTrainCodeAndStartAt(
        trainCode,
        startAt
    ).reduce<number>(
        (changes, row) =>
            changes + (updateRouteFormationStatus(row, status) ? 1 : 0),
        0
    );
    if (changes > 0) {
        clearCachedDailyRoutes();
    }
    return changes;
}

export function updateDailyRouteFormationStatusByEmuCode(
    emuId: EmuId,
    startAt: number,
    status: number
): number {
    const changes = listDailyRoutesByEmuCodeAndStartAt(
        emuId,
        startAt
    ).reduce<number>(
        (changes, row) =>
            changes + (updateRouteFormationStatus(row, status) ? 1 : 0),
        0
    );
    if (changes > 0) {
        invalidateCachedDailyRoutesByEmuCodes([emuId]);
    }
    return changes;
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

    const changes = updateRouteFormationStatus(matchingRow, status) ? 1 : 0;
    if (changes > 0) {
        invalidateCachedDailyRoutesByEmuCodes([emuId]);
    }
    return changes;
}
