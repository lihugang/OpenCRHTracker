import type Database from 'better-sqlite3';
import useDatabase, {
    registerDatabaseInitializer
} from '~/server/libs/database/common';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';

function ensureUsersSchema(db: Database.Database) {
    const schemaSql = importSqlBatch('users/schema');
    const orderedKeys = [
        'createUsersTable',
        'createUserProfilesTable',
        'createApiKeysTable',
        'createApiKeyScopesTable',
        'createUserEventSubscriptionsTable',
        'createUserEventSubscriptionsIndexes'
    ];
    const executedKeys = new Set<string>();

    for (const key of orderedKeys) {
        const statement = schemaSql[key];
        if (!statement) {
            continue;
        }

        db.exec(statement);
        executedKeys.add(key);
    }

    for (const [key, statement] of Object.entries(schemaSql)) {
        if (executedKeys.has(key)) {
            continue;
        }

        db.exec(statement);
    }
}

registerDatabaseInitializer('users', ensureUsersSchema);

export function useUsersDatabase() {
    return useDatabase('users');
}
