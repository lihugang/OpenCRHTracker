import type Database from 'better-sqlite3';
import useDatabase, {
    registerDatabaseInitializer
} from '~/server/libs/database/common';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';

function ensureTaskSchema(db: Database.Database) {
    const schemaSql = importSqlBatch('tasks');
    db.exec(schemaSql.createTable);
}

registerDatabaseInitializer('task', ensureTaskSchema);

export function useTaskDatabase() {
    return useDatabase('task');
}
