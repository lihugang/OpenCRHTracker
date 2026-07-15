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
        'createMembershipCodeBatchesTable',
        'createMembershipCodesTable',
        'createMembershipCodeIndexes',
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

    type UsersMigrationSqlKey =
        | 'selectUsersColumns'
        | 'alterUsersAddIsBanned'
        | 'selectUserMembershipsColumns'
        | 'selectNullUserMembershipExpiryCount'
        | 'dropRequiredExpiryUserMembershipsTable'
        | 'createRequiredExpiryUserMembershipsTable'
        | 'copyRequiredExpiryUserMemberships'
        | 'dropLegacyUserMembershipsTable'
        | 'renameRequiredExpiryUserMembershipsTable';

    const migrationSql = importSqlBatch('users/migrations') as Record<
        UsersMigrationSqlKey,
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

    const membershipColumns = db
        .prepare(migrationSql.selectUserMembershipsColumns)
        .all() as Array<{ name?: unknown; notnull?: unknown }>;
    const expiresAtColumn = membershipColumns.find(
        (column) => column.name === 'expires_at'
    );

    if (expiresAtColumn?.notnull !== 1) {
        const nullExpiryCount = db
            .prepare(migrationSql.selectNullUserMembershipExpiryCount)
            .get() as { count?: unknown } | undefined;
        if (nullExpiryCount?.count !== 0) {
            throw new Error(
                'Cannot require user membership expiry while legacy permanent memberships exist'
            );
        }

        const migrateMembershipExpiry = db.transaction(() => {
            db.exec(migrationSql.dropRequiredExpiryUserMembershipsTable);
            db.exec(migrationSql.createRequiredExpiryUserMembershipsTable);
            db.exec(migrationSql.copyRequiredExpiryUserMemberships);
            db.exec(migrationSql.dropLegacyUserMembershipsTable);
            db.exec(migrationSql.renameRequiredExpiryUserMembershipsTable);
            db.exec(schemaSql.createUserMembershipsIndexes ?? '');
        });
        migrateMembershipExpiry();
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
