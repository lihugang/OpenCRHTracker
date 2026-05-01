import type Database from 'better-sqlite3';
import useDatabase, {
    registerDatabaseInitializer
} from '~/server/libs/database/common';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';

function ensureTimetableHistorySchema(db: Database.Database) {
    const schemaSql = importSqlBatch('timetable-history/schema');
    for (const statement of Object.values(schemaSql)) {
        db.exec(statement);
    }
}

registerDatabaseInitializer('timetableHistory', ensureTimetableHistorySchema);

let ensured = false;

export function ensureTimetableHistoryDatabaseSchema() {
    if (ensured) {
        return;
    }

    const db = useDatabase('timetableHistory');
    ensureTimetableHistorySchema(db);
    ensured = true;
}

export function useTimetableHistoryDatabase() {
    return useDatabase('timetableHistory');
}
