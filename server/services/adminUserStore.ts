import useConfig from '~/server/config';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import peekRemainTokens from '~/server/utils/api/quota/peekRemainTokens';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import type { AdminUserListItem, AdminUsersResponse } from '~/types/admin';

interface AdminUserRow {
    username: string;
    created_at: number;
    last_login_at: number | null;
}

type AdminUserSqlKey = 'selectAdminUsers';

const adminUserSql = importSqlBatch('users/queries') as Record<
    AdminUserSqlKey,
    string
>;
const adminUserStatements = createPreparedSqlStore<AdminUserSqlKey>({
    dbName: 'users',
    scope: 'admin-users',
    sql: adminUserSql
});

function toAdminUserListItem(
    row: AdminUserRow,
    now: number,
    tokenLimit: number
): AdminUserListItem {
    return {
        userId: row.username,
        createdAt: row.created_at,
        lastLoginAt: row.last_login_at,
        apiRemainCost: peekRemainTokens(
            {
                bucketKey: `user:${row.username}`,
                tokenLimit
            },
            now
        )
    };
}

export function getAdminUsersSnapshot(
    now = getNowSeconds()
): AdminUsersResponse {
    const rows = adminUserStatements.all<AdminUserRow>('selectAdminUsers');
    const tokenLimit = useConfig().quota.userMaxTokens;

    return {
        totalUsers: rows.length,
        asOf: now,
        items: rows.map((row) => toAdminUserListItem(row, now, tokenLimit))
    };
}
