import type Database from 'better-sqlite3';
import useDatabase, {
    registerDatabaseInitializer
} from '~/server/libs/database/common';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';

function ensureTaskSchema(db: Database.Database) {
    const schemaSql = importSqlBatch('tasks/schema');
    for (const statement of Object.values(schemaSql)) {
        db.exec(statement);
    }
}

registerDatabaseInitializer('task', ensureTaskSchema);

let ensured = false;

export function ensureTaskDatabaseSchema() {
    if (ensured) {
        return;
    }
    const db = useDatabase('task');
    ensureTaskSchema(db);
    ensured = true;
}

export function useTaskDatabase() {
    return useDatabase('task');
}
