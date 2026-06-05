import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import { getUserByUsername } from '~/server/services/authStore';
import {
    getUserQuotaOverride,
    updateUserQuotaOverride,
    type UserQuotaOverride
} from '~/server/services/userProfileStore';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import getQuotaStore from '~/server/utils/api/quota/getQuotaStore';
import peekRemainTokens from '~/server/utils/api/quota/peekRemainTokens';
import resolveUserQuotaSubject from '~/server/utils/api/quota/resolveUserQuotaSubject';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import type {
    AdminUpdateUserQuotaRequest,
    AdminUpdateUserQuotaResponse,
    AdminUserListItem,
    AdminUsersResponse
} from '~/types/admin';

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
    now: number
): AdminUserListItem {
    const quotaSubject = resolveUserQuotaSubject(row.username);
    const quotaOverride = getUserQuotaOverride(row.username);

    return {
        userId: row.username,
        createdAt: row.created_at,
        lastLoginAt: row.last_login_at,
        apiRemainCost: peekRemainTokens(quotaSubject, now),
        customTokenLimit: quotaOverride.tokenLimit,
        customRefillAmount: quotaOverride.refillAmount
    };
}

export function getAdminUsersSnapshot(
    now = getNowSeconds()
): AdminUsersResponse {
    const rows = adminUserStatements.all<AdminUserRow>('selectAdminUsers');

    return {
        totalUsers: rows.length,
        asOf: now,
        items: rows.map((row) => toAdminUserListItem(row, now))
    };
}

function ensureUserExists(userId: string) {
    if (!getUserByUsername(userId)) {
        throw new ApiRequestError(404, 'not_found', '用户不存在');
    }
}

function syncQuotaBucket(userId: string) {
    const subject = resolveUserQuotaSubject(userId);
    const bucket = getQuotaStore().buckets.get(subject.bucketKey);
    if (bucket && bucket.tokens > subject.tokenLimit) {
        bucket.tokens = subject.tokenLimit;
    }

    return subject;
}

export function updateAdminUserQuotaOverride(
    input: AdminUpdateUserQuotaRequest
): AdminUpdateUserQuotaResponse {
    ensureUserExists(input.userId);

    const quotaOverride: UserQuotaOverride = updateUserQuotaOverride(
        input.userId,
        {
            tokenLimit: input.tokenLimit,
            refillAmount: input.refillAmount
        }
    );
    const effectiveQuota = syncQuotaBucket(input.userId);

    return {
        userId: input.userId,
        quotaOverride,
        effectiveQuota: {
            tokenLimit: effectiveQuota.tokenLimit,
            refillAmount: effectiveQuota.refillAmount,
            refillIntervalSeconds: effectiveQuota.refillIntervalSeconds
        }
    };
}
