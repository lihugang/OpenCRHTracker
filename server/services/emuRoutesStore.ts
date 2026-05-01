import '~/server/libs/database/emu';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';

interface CursorPoint {
    startAt: number;
    id: number;
}

export interface DailyEmuRouteRow {
    id: number;
    train_code: string;
    emu_code: string;
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
    startAt: Number.MAX_SAFE_INTEGER,
    id: Number.MAX_SAFE_INTEGER
};

export function insertDailyEmuRoute(
    trainCode: string,
    emuCode: string,
    startStationName: string,
    endStationName: string,
    startAt: number,
    endAt: number
): void {
    const normalizedTrainCode = normalizeCode(trainCode);
    const normalizedEmuCode = normalizeCode(emuCode);
    const normalizedStartStationName = startStationName.trim();
    const normalizedEndStationName = endStationName.trim();
    const result = emuRouteStatements.run(
        'insertDailyEmuRoute',
        normalizedTrainCode,
        normalizedEmuCode,
        normalizedStartStationName,
        normalizedEndStationName,
        startAt,
        endAt
    );
}

export function listHistoryByTrainPaged(
    trainCode: string,
    startAt: number,
    endAt: number,
    cursor: CursorPoint | null,
    limit: number
): DailyEmuRouteRow[] {
    const cursorPoint = cursor ?? DEFAULT_CURSOR_POINT;
    return emuRouteStatements.all<DailyEmuRouteRow>(
        'selectHistoryByTrainPaged',
        normalizeCode(trainCode),
        startAt,
        endAt,
        cursorPoint.startAt,
        cursorPoint.startAt,
        cursorPoint.id,
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

    return emuRouteStatements.all<DailyEmuRouteRow>(
        'selectDailyRoutesByEmuCodeInRange',
        normalizedEmuCode,
        startAt,
        endAtExclusive
    );
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

    return emuRouteStatements.all<DailyEmuRouteRow>(
        'selectDailyRoutesByTrainCodeInRange',
        normalizedTrainCode,
        startAt,
        endAtExclusive
    );
}

export function listHistoryByEmuPaged(
    emuCode: string,
    startAt: number,
    endAt: number,
    cursor: CursorPoint | null,
    limit: number
): DailyEmuRouteRow[] {
    const cursorPoint = cursor ?? DEFAULT_CURSOR_POINT;
    return emuRouteStatements.all<DailyEmuRouteRow>(
        'selectHistoryByEmuPaged',
        normalizeCode(emuCode),
        startAt,
        endAt,
        cursorPoint.startAt,
        cursorPoint.startAt,
        cursorPoint.id,
        limit
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

    const result = emuRouteStatements.run(
        'deleteDailyRoutesByTrainCodeInRange',
        normalizedTrainCode,
        startAt,
        endAtExclusive
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

    const result = emuRouteStatements.run(
        'deleteDailyRouteByTrainCodeAndEmuCodeAtStartAt',
        normalizedTrainCode,
        normalizedEmuCode,
        startAt
    );
    return result.changes;
}

export function getDailyRecordById(id: number): DailyEmuRouteRow | null {
    if (!Number.isInteger(id) || id <= 0) {
        return null;
    }

    return (
        emuRouteStatements.get<DailyEmuRouteRow>('selectDailyRecordById', id) ??
        null
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
    return emuRouteStatements.all<DailyEmuRouteRow>(
        'selectDailyRecordsPaged',
        startAt,
        endAt,
        cursorPoint.startAt,
        cursorPoint.startAt,
        cursorPoint.id,
        limit
    );
}

export function listDailyRecordsAll(
    startAt: number,
    endAt: number
): DailyEmuRouteRow[] {
    return emuRouteStatements.all<DailyEmuRouteRow>(
        'selectDailyRecordsAll',
        startAt,
        endAt
    );
}

export function buildNextCursor(
    rows: DailyEmuRouteRow[],
    limit: number
): string {
    if (rows.length < limit || rows.length === 0) {
        return '';
    }
    const last = rows[rows.length - 1]!;
    return `${last.start_at}:${last.id}`;
}
