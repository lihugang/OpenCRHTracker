import type Database from 'better-sqlite3';
import useDatabase, {
    registerDatabaseInitializer
} from '~/server/libs/database/common';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';

function ensureUsersSchema(db: Database.Database) {
    const schemaSql = importSqlBatch('users/schema');
    const orderedKeys = [
        '001_createUsersTable',
        '002_createUserProfilesTable',
        '003_createUserMembershipsTable',
        '004_createUserMembershipsIndexes',
        '005_createMembershipCodeBatchesTable',
        '006_createMembershipCodesTable',
        '007_createMembershipCodeIndexes',
        '008_createApiKeysTable',
        '009_createApiKeyScopesTable',
        '010_createUserEventSubscriptionsTable',
        '011_createUserEventSubscriptionsIndexes'
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
