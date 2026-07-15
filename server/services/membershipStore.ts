import { LRUCache } from 'lru-cache';
import useConfig, {
    type MembershipGroupConfig,
    type MembershipPermissionGroupConfig
} from '~/server/config';
import '~/server/libs/database/users';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import { getUserQuotaOverride } from '~/server/services/userProfileStore';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import normalizeScopeList from '~/server/utils/api/scopes/normalizeScopeList';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import type {
    AdminUserMembershipsResponse,
    AuthMembershipsResponse,
    SponsorshipEffectiveQuota,
    SponsorshipGroupCatalogItem,
    SponsorshipQuotaBreakdown,
    UserMembershipItem,
    UserMembershipStatus
} from '~/types/membership';

interface UserMembershipRowData {
    user_id: string;
    group_id: string;
    starts_at: number;
    expires_at: number | null;
    source: string;
    granted_by: string;
    revoked_at: number | null;
    revoked_by: string | null;
    created_at: number;
    updated_at: number;
}

export interface UserMembershipRow {
    userId: string;
    groupId: string;
    startsAt: number;
    expiresAt: number | null;
    source: string;
    grantedBy: string;
    revokedAt: number | null;
    revokedBy: string | null;
    createdAt: number;
    updatedAt: number;
}

export interface UserMembershipEntitlements {
    activeMemberships: UserMembershipItem[];
    accountScopes: string[];
    tokenLimit: number;
    refillAmount: number;
}

export interface UpsertUserMembershipInput {
    userId: string;
    groupId: string;
    startsAt: number;
    expiresAt: number | null;
    actorUserId: string;
    source?: string;
}

type MembershipSqlKey =
    | 'selectUserExists'
    | 'selectUserMembershipsByUserId'
    | 'upsertUserMembership'
    | 'revokeUserMembership';

const membershipSql = importSqlBatch('users/queries') as Record<
    MembershipSqlKey,
    string
>;
const membershipStatements = createPreparedSqlStore<MembershipSqlKey>({
    dbName: 'users',
    scope: 'user-memberships',
    sql: membershipSql
});

const rawMembershipCache = new LRUCache<string, UserMembershipRow[]>({
    max: useConfig().api.authCache.membership.maxEntries,
    ttl: useConfig().api.authCache.membership.defaultTtlSeconds * 1000,
    updateAgeOnGet: true
});

function mapMembershipRow(row: UserMembershipRowData): UserMembershipRow {
    return {
        userId: row.user_id,
        groupId: row.group_id,
        startsAt: row.starts_at,
        expiresAt: row.expires_at,
        source: row.source,
        grantedBy: row.granted_by,
        revokedAt: row.revoked_at,
        revokedBy: row.revoked_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function getPermissionGroupMap() {
    return new Map(
        useConfig().membership.permissionGroups.map((group) => [
            group.id,
            group
        ])
    );
}

function getMembershipGroupMap() {
    return new Map(
        useConfig().membership.groups.map((group) => [group.id, group])
    );
}

function toCatalogItem(
    group: MembershipGroupConfig,
    permissionGroups: Map<string, MembershipPermissionGroupConfig>
): SponsorshipGroupCatalogItem {
    return {
        id: group.id,
        name: group.name,
        description: group.description,
        enabled: group.enabled,
        visible: group.visible,
        assignable: group.assignable,
        sortOrder: group.sortOrder,
        quota: {
            tokenLimit: group.quota?.tokenLimit ?? null,
            refillAmount: group.quota?.refillAmount ?? null
        },
        permissionGroups: group.permissionGroupIds.flatMap((id) => {
            const permissionGroup = permissionGroups.get(id);
            return permissionGroup
                ? [
                      {
                          id: permissionGroup.id,
                          name: permissionGroup.name,
                          scopes: permissionGroup.scopes
                      }
                  ]
                : [];
        }),
        subscriptionUrl: group.subscriptionUrl ?? null
    };
}

function sortCatalog(items: SponsorshipGroupCatalogItem[]) {
    return items.sort(
        (left, right) =>
            left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)
    );
}

export function getSponsorshipGroupCatalog(
    visibility: 'visible' | 'assignable' | 'all' = 'visible'
) {
    const permissionGroups = getPermissionGroupMap();
    const groups = useConfig().membership.groups.filter((group) => {
        if (visibility === 'visible') {
            return group.enabled && group.visible;
        }
        if (visibility === 'assignable') {
            return group.enabled && group.assignable;
        }
        return true;
    });

    return sortCatalog(
        groups.map((group) => toCatalogItem(group, permissionGroups))
    );
}

export function invalidateUserMembershipCache(userId: string) {
    rawMembershipCache.delete(userId);
}

export function getUserMembershipRows(userId: string): UserMembershipRow[] {
    const cached = rawMembershipCache.get(userId);
    if (cached) {
        return cached;
    }

    const rows = membershipStatements
        .all<UserMembershipRowData>('selectUserMembershipsByUserId', userId)
        .map(mapMembershipRow);
    rawMembershipCache.set(userId, rows);
    return rows;
}

export function resolveUserMembershipStatus(
    row: UserMembershipRow,
    now = getNowSeconds(),
    group = getMembershipGroupMap().get(row.groupId)
): UserMembershipStatus {
    if (row.revokedAt !== null) {
        return 'revoked';
    }
    if (!group) {
        return 'unknown';
    }
    if (!group.enabled) {
        return 'disabled';
    }
    if (row.startsAt > now) {
        return 'scheduled';
    }
    if (row.expiresAt !== null && now >= row.expiresAt) {
        return 'expired';
    }
    return 'active';
}

function resolveUserMembershipItems(
    userId: string,
    now: number
): UserMembershipItem[] {
    const membershipGroups = getMembershipGroupMap();
    const permissionGroups = getPermissionGroupMap();

    return getUserMembershipRows(userId).map((row) => {
        const group = membershipGroups.get(row.groupId);
        return {
            ...row,
            group: group ? toCatalogItem(group, permissionGroups) : null,
            status: resolveUserMembershipStatus(row, now, group)
        };
    });
}

export function resolveUserMembershipEntitlements(
    userId: string,
    now = getNowSeconds()
): UserMembershipEntitlements {
    const config = useConfig();
    const activeMemberships = resolveUserMembershipItems(userId, now).filter(
        (item) => item.status === 'active'
    );
    const permissionScopes = activeMemberships.flatMap(
        (membership) =>
            membership.group?.permissionGroups.flatMap(
                (group) => group.scopes
            ) ?? []
    );
    const accountScopes = normalizeScopeList([
        ...config.api.permissions.issuedKeyDefaultScopes,
        ...permissionScopes,
        ...(config.user.adminUserIds.includes(userId) ? [API_SCOPES.admin] : [])
    ]);
    const groupTokenLimits = activeMemberships.flatMap((membership) => {
        const value = membership.group?.quota.tokenLimit;
        return value === null || value === undefined ? [] : [value];
    });
    const groupRefillAmounts = activeMemberships.flatMap((membership) => {
        const value = membership.group?.quota.refillAmount;
        return value === null || value === undefined ? [] : [value];
    });

    return {
        activeMemberships,
        accountScopes,
        tokenLimit: Math.max(config.quota.userMaxTokens, ...groupTokenLimits),
        refillAmount: Math.max(config.quota.refillAmount, ...groupRefillAmounts)
    };
}

function resolveQuotaPresentation(
    userId: string,
    entitlements: UserMembershipEntitlements
): {
    effectiveQuota: SponsorshipEffectiveQuota;
    quotaBreakdown: SponsorshipQuotaBreakdown;
} {
    const config = useConfig();
    const quotaOverride = getUserQuotaOverride(userId);
    const sponsorshipTokenLimits = entitlements.activeMemberships.flatMap(
        (membership) => {
            const value = membership.group?.quota.tokenLimit;
            return value === null || value === undefined ? [] : [value];
        }
    );
    const sponsorshipRefillAmounts = entitlements.activeMemberships.flatMap(
        (membership) => {
            const value = membership.group?.quota.refillAmount;
            return value === null || value === undefined ? [] : [value];
        }
    );

    return {
        effectiveQuota: {
            tokenLimit: quotaOverride.tokenLimit ?? entitlements.tokenLimit,
            refillAmount:
                quotaOverride.refillAmount ?? entitlements.refillAmount,
            refillIntervalSeconds: config.quota.refillIntervalSeconds
        },
        quotaBreakdown: {
            baseline: {
                tokenLimit: config.quota.userMaxTokens,
                refillAmount: config.quota.refillAmount
            },
            sponsorship: {
                tokenLimit:
                    sponsorshipTokenLimits.length > 0
                        ? Math.max(...sponsorshipTokenLimits)
                        : null,
                refillAmount:
                    sponsorshipRefillAmounts.length > 0
                        ? Math.max(...sponsorshipRefillAmounts)
                        : null
            },
            manualOverride: quotaOverride
        }
    };
}

export function getUserMembershipSnapshot(
    userId: string,
    now = getNowSeconds()
): AdminUserMembershipsResponse {
    const entitlements = resolveUserMembershipEntitlements(userId, now);
    const quota = resolveQuotaPresentation(userId, entitlements);

    return {
        userId,
        asOf: now,
        items: resolveUserMembershipItems(userId, now),
        catalog: getSponsorshipGroupCatalog('all'),
        accountScopes: entitlements.accountScopes,
        ...quota
    };
}

export function getAuthMembershipsSnapshot(
    userId: string,
    now = getNowSeconds()
): AuthMembershipsResponse {
    const snapshot = getUserMembershipSnapshot(userId, now);
    const items = snapshot.items.flatMap((item) => {
        if (
            !item.group ||
            (item.status !== 'active' && item.status !== 'scheduled')
        ) {
            return [];
        }

        return [
            {
                groupId: item.groupId,
                group: item.group,
                status: item.status,
                startsAt: item.startsAt,
                expiresAt: item.expiresAt
            }
        ];
    });

    return {
        ...snapshot,
        items,
        catalog: getSponsorshipGroupCatalog('visible')
    };
}

export function ensureMembershipUserExists(userId: string) {
    const row = membershipStatements.get<{ found: number }>(
        'selectUserExists',
        userId
    );
    if (!row) {
        throw new ApiRequestError(404, 'not_found', '用户不存在');
    }
}

export function upsertUserMembership(
    input: UpsertUserMembershipInput,
    now = getNowSeconds()
) {
    ensureMembershipUserExists(input.userId);
    const existingMembership = getUserMembershipRows(input.userId).find(
        (row) => row.groupId === input.groupId
    );
    const group = getMembershipGroupMap().get(input.groupId);
    if (!group) {
        throw new ApiRequestError(
            404,
            'sponsorship_group_not_found',
            '赞助权益组不存在'
        );
    }
    if (!group.enabled) {
        throw new ApiRequestError(
            409,
            'sponsorship_group_disabled',
            '该赞助权益组已停用'
        );
    }
    const existingStatus = existingMembership
        ? resolveUserMembershipStatus(existingMembership, now, group)
        : null;
    if (
        !group.assignable &&
        existingStatus !== 'active' &&
        existingStatus !== 'scheduled'
    ) {
        throw new ApiRequestError(
            409,
            'sponsorship_group_not_assignable',
            '该赞助权益组当前不可授予'
        );
    }
    if (!Number.isSafeInteger(input.startsAt) || input.startsAt <= 0) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            '赞助权益开始时间必须为正整数 Unix 秒时间戳'
        );
    }
    if (
        input.expiresAt !== null &&
        (!Number.isSafeInteger(input.expiresAt) ||
            input.expiresAt <= input.startsAt ||
            input.expiresAt <= now)
    ) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            '赞助权益到期时间必须晚于开始时间和当前时间'
        );
    }

    membershipStatements.run(
        'upsertUserMembership',
        input.userId,
        input.groupId,
        input.startsAt,
        input.expiresAt,
        input.source ?? 'admin_manual',
        input.actorUserId,
        now,
        now
    );
    invalidateUserMembershipCache(input.userId);

    return getUserMembershipSnapshot(input.userId, now);
}

export function revokeUserMembership(
    userId: string,
    groupId: string,
    actorUserId: string,
    now = getNowSeconds()
) {
    ensureMembershipUserExists(userId);
    const result = membershipStatements.run(
        'revokeUserMembership',
        now,
        actorUserId,
        now,
        userId,
        groupId
    );
    if (result.changes === 0) {
        throw new ApiRequestError(
            404,
            'sponsorship_record_not_found',
            '赞助权益记录不存在或已撤销'
        );
    }
    invalidateUserMembershipCache(userId);

    return getUserMembershipSnapshot(userId, now);
}
