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
    | 'insertDailyEmuRoute'
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
    emuRouteStatements.run(
        'insertDailyEmuRoute',
        normalizeCode(trainCode),
        normalizeCode(emuCode),
        startStationName.trim(),
        endStationName.trim(),
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
