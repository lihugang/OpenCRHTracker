import useConfig from '~/server/config';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import { getUserByUsername } from '~/server/services/authStore';
import { updateManualUserBanState } from '~/server/services/userBanSecurityStore';
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
    AdminResetUserQuotaRequest,
    AdminResetUserQuotaResponse,
    AdminUpdateUserBanStateRequest,
    AdminUpdateUserBanStateResponse,
    AdminUpdateUserQuotaRequest,
    AdminUpdateUserQuotaResponse,
    AdminUserListItem,
    AdminUsersResponse
} from '~/types/admin';

interface AdminUserRow {
    username: string;
    created_at: number;
    last_login_at: number | null;
    is_banned: number;
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
        isBanned: row.is_banned === 1,
        isAdmin: useConfig().user.adminUserIds.includes(row.username),
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
        bannedUsers: rows.filter((row) => row.is_banned === 1).length,
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

export function updateAdminUserBanState(
    input: AdminUpdateUserBanStateRequest,
    actorUserId: string
): AdminUpdateUserBanStateResponse {
    ensureUserExists(input.userId);

    if (useConfig().user.adminUserIds.includes(input.userId)) {
        throw new ApiRequestError(
            403,
            'admin_user_protected',
            '管理员账户不可封禁或解封'
        );
    }

    return updateManualUserBanState(input.userId, input.banned, actorUserId);
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

export function resetAdminUserQuota(
    input: AdminResetUserQuotaRequest
): AdminResetUserQuotaResponse {
    ensureUserExists(input.userId);

    const now = getNowSeconds();
    const effectiveQuota = resolveUserQuotaSubject(input.userId);
    getQuotaStore().buckets.set(effectiveQuota.bucketKey, {
        tokens: effectiveQuota.tokenLimit,
        updatedAt: now
    });

    return {
        userId: input.userId,
        apiRemainCost: effectiveQuota.tokenLimit,
        effectiveQuota: {
            tokenLimit: effectiveQuota.tokenLimit,
            refillAmount: effectiveQuota.refillAmount,
            refillIntervalSeconds: effectiveQuota.refillIntervalSeconds
        }
    };
}
