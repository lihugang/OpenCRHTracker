import type Database from 'better-sqlite3';
import useDatabase, {
    registerDatabaseInitializer
} from '~/server/libs/database/common';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';

interface DailyEmuRoutesColumnRow {
    name: string;
}

type EmuSchemaSqlKey =
    | 'alterDailyEmuRoutesAddEndStationName'
    | 'alterDailyEmuRoutesAddStartStationName'
    | 'createDailyEmuRoutesTable'
    | 'createProbeStatusTable';

type EmuMetaSqlKey = 'selectDailyEmuRoutesColumns';

function ensureEmuTrackedSchema(db: Database.Database) {
    const schemaSql = importSqlBatch('emu/schema') as Record<
        EmuSchemaSqlKey,
        string
    >;
    const metaSql = importSqlBatch('emu/meta') as Record<EmuMetaSqlKey, string>;

    db.exec(schemaSql.createDailyEmuRoutesTable);
    db.exec(schemaSql.createProbeStatusTable);

    const columnRows = db.prepare(metaSql.selectDailyEmuRoutesColumns)
        .all() as DailyEmuRoutesColumnRow[];
    const columns = new Set(columnRows.map((row) => row.name));
    if (!columns.has('start_station_name')) {
        db.exec(schemaSql.alterDailyEmuRoutesAddStartStationName);
    }
    if (!columns.has('end_station_name')) {
        db.exec(schemaSql.alterDailyEmuRoutesAddEndStationName);
    }
}

registerDatabaseInitializer('EMUTracked', ensureEmuTrackedSchema);

let ensured = false;

export function ensureEmuDatabaseSchema() {
    if (ensured) {
        return;
    }
    const db = useDatabase('EMUTracked');
    ensureEmuTrackedSchema(db);
    ensured = true;
}

export function useEmuDatabase() {
    return useDatabase('EMUTracked');
}
