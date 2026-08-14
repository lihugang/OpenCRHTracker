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
