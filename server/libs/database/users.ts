import type Database from 'better-sqlite3';
import useDatabase, {
    registerDatabaseInitializer
} from '~/server/libs/database/common';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';

function ensureUsersSchema(db: Database.Database) {
    const schemaSql = importSqlBatch('users/schema');
    for (const statement of Object.values(schemaSql)) {
        db.exec(statement);
    }
}

registerDatabaseInitializer('users', ensureUsersSchema);

export function useUsersDatabase() {
    return useDatabase('users');
}
