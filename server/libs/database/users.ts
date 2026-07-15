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
        'createUserMembershipsTable',
        'createUserMembershipsIndexes',
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

    const migrationSql = importSqlBatch('users/migrations') as Record<
        'selectUsersColumns' | 'alterUsersAddIsBanned',
        string
    >;
    const userColumns = db
        .prepare(migrationSql.selectUsersColumns)
        .all() as Array<{ name?: unknown }>;
    const hasIsBannedColumn = userColumns.some(
        (column) => column.name === 'is_banned'
    );

    if (!hasIsBannedColumn) {
        db.exec(migrationSql.alterUsersAddIsBanned);
    }

    const oauthSchemaSql = importSqlBatch('users/oauth');
    const orderedOauthKeys = [
        'createOauthClientsTable',
        'createOauthClientRedirectUrisTable',
        'createOauthClientScopeRequestsTable',
        'createOauthClientAdminGrantsTable',
        'createOauthAuthorizationCodesTable',
        'createOauthConsentsTable',
        'createOauthLoginContinuationsTable'
    ];

    for (const key of orderedOauthKeys) {
        const statement = oauthSchemaSql[key];
        if (!statement) {
            continue;
        }

        db.exec(statement);
    }
}

registerDatabaseInitializer('users', ensureUsersSchema);

export function useUsersDatabase() {
    return useDatabase('users');
}
