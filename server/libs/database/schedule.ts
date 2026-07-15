import type Database from 'better-sqlite3';
import useDatabase, {
    registerDatabaseInitializer
} from '~/server/libs/database/common';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';

function ensureScheduleSchema(db: Database.Database) {
    const schemaSql = importSqlBatch('schedule/schema');
    for (const statement of Object.values(schemaSql)) {
        db.exec(statement);
    }

    const migrationSql = importSqlBatch('schedule/migrations') as Record<
        | 'selectScheduleStopsColumns'
        | 'alterScheduleStopsAddStationPlatformInfoFetchedAt',
        string
    >;
    const stopColumns = db
        .prepare(migrationSql.selectScheduleStopsColumns)
        .all() as Array<{ name?: unknown }>;
    const hasStationPlatformInfoFetchedAt = stopColumns.some(
        (column) => column.name === 'station_platform_info_fetched_at'
    );
    if (!hasStationPlatformInfoFetchedAt) {
        db.exec(migrationSql.alterScheduleStopsAddStationPlatformInfoFetchedAt);
    }
}

registerDatabaseInitializer('schedule', ensureScheduleSchema);

let ensured = false;

export function ensureScheduleDatabaseSchema() {
    if (ensured) {
        return;
    }

    const db = useDatabase('schedule');
    ensureScheduleSchema(db);
    ensured = true;
}

export function useScheduleDatabase() {
    return useDatabase('schedule');
}
