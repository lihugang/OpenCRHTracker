import type Database from 'better-sqlite3';
import useDatabase, {
    registerDatabaseInitializer
} from '~/server/libs/database/common';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';

function ensureTaskSchema(db: Database.Database) {
    const schemaSql = importSqlBatch('tasks');
    const createTable = schemaSql.createTable;
    if (!createTable) {
        throw new Error(
            '[task-db] missing schema SQL: assets/sql/tasks/createTable.sql'
        );
    }
    db.exec(createTable);
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
