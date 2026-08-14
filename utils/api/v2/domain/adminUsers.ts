import type {
    DeleteAdminQqBanEntryData,
    GetAdminUsersData,
    GetAdminUsersSecurityData,
    PostAdminQqBanEntryData,
    PostAdminUsersQuotaResetData,
    PostAdminUsersRiskClearData,
    PostAdminUsersStatusData
} from '#shared/generated/proto/opencrh/v2/admin_users_pb';
import type {
    GetAdminUserMembershipsData,
    PutAdminUserMembershipData
} from '#shared/generated/proto/opencrh/v2/admin_users_pb';
import {
    DeleteAdminQqBanEntry,
    DeleteAdminUserMembership,
    GetAdminUserMemberships,
    GetAdminUsers,
    GetAdminUsersSecurity,
    PostAdminQqBanEntry,
    PostAdminUsersQuotaReset,
    PostAdminUsersRiskClear,
    PostAdminUsersStatus,
    PutAdminUserMembership
} from '#shared/api/v2/registry/adminUsers';
import type {
    AdminAddQqBanListResponse,
    AdminClearUserRiskResponse,
    AdminQqBanListItem,
    AdminRemoveQqBanListResponse,
    AdminResetUserQuotaResponse,
    AdminUpdateUserBanStateResponse,
    AdminUserBanActionItem,
    AdminUserListItem,
    AdminUserRiskCaseItem,
    AdminUserSecurityResponse,
    AdminUsersResponse
} from '~/types/admin';
import type { AdminUserMembershipsResponse } from '~/types/membership';
import { protoInt64ToNumber } from '~/utils/api/v2/mappers/numbers';
import { requestV2, type V2RequestInput } from '~/utils/api/v2/transport';
import { requireSuccess } from '~/utils/api/v2/domain/common';

function mapQqBanItem(item: {
    qqNumber: string;
    addedAt: bigint | number;
    addedBy: string;
}): AdminQqBanListItem {
    return {
        qqNumber: item.qqNumber,
        addedAt: protoInt64ToNumber(item.addedAt) ?? 0,
        addedBy: item.addedBy
    };
}

function mapSponsorshipGroupSummary(item: {
    groupId: string;
    name: string;
    startsAt: bigint | number;
    expiresAt: bigint | number;
}) {
    return {
        groupId: item.groupId,
        name: item.name,
        startsAt: protoInt64ToNumber(item.startsAt) ?? 0,
        expiresAt: protoInt64ToNumber(item.expiresAt) ?? 0
    };
}

function mapEffectiveQuota(
    item:
        | {
              tokenLimit: number;
              refillAmount: number;
              refillIntervalSeconds: number;
          }
        | null
        | undefined
) {
    if (!item) {
        return {
            tokenLimit: 0,
            refillAmount: 0,
            refillIntervalSeconds: 0
        };
    }
    return {
        tokenLimit: item.tokenLimit,
        refillAmount: item.refillAmount,
        refillIntervalSeconds: item.refillIntervalSeconds
    };
}

function mapUserListItem(item: {
    userId: string;
    createdAt: bigint | number;
    lastLoginAt?: bigint | number | undefined;
    isBanned: boolean;
    isAdmin: boolean;
    apiRemainCost: number;
    sponsorshipGroups: Array<{
        groupId: string;
        name: string;
        startsAt: bigint | number;
        expiresAt: bigint | number;
    }>;
    effectiveQuota?:
        | {
              tokenLimit: number;
              refillAmount: number;
              refillIntervalSeconds: number;
          }
        | undefined;
}): AdminUserListItem {
    return {
        userId: item.userId,
        createdAt: protoInt64ToNumber(item.createdAt) ?? 0,
        lastLoginAt: protoInt64ToNumber(item.lastLoginAt),
        isBanned: item.isBanned,
        isAdmin: item.isAdmin,
        apiRemainCost: item.apiRemainCost,
        sponsorshipGroups: item.sponsorshipGroups.map(
            mapSponsorshipGroupSummary
        ),
        effectiveQuota: mapEffectiveQuota(item.effectiveQuota)
    };
}

function mapUsers(data: GetAdminUsersData): AdminUsersResponse {
    return {
        totalUsers: data.totalUsers,
        bannedUsers: data.bannedUsers,
        asOf: protoInt64ToNumber(data.asOf) ?? 0,
        items: data.items.map(mapUserListItem)
    };
}

function mapUserMemberships(
    data: GetAdminUserMembershipsData | PutAdminUserMembershipData
): AdminUserMembershipsResponse {
    return {
        userId: data.userId,
        asOf: protoInt64ToNumber(data.asOf) ?? 0,
        items: data.items.map((item) => ({
            userId: item.userId,
            groupId: item.groupId,
            group: item.group
                ? {
                      id: item.group.id,
                      name: item.group.name,
                      description: item.group.description,
                      enabled: item.group.enabled,
                      visible: item.group.visible,
                      assignable: item.group.assignable,
                      sortOrder: item.group.sortOrder,
                      quota: {
                          tokenLimit: item.group.quota?.tokenLimit ?? null,
                          refillAmount: item.group.quota?.refillAmount ?? null
                      },
                      permissionGroups: item.group.permissionGroups.map(
                          (group) => ({
                              id: group.id,
                              name: group.name,
                              scopes: group.scopes
                          })
                      ),
                      subscriptionUrl: item.group.subscriptionUrl ?? null
                  }
                : null,
            status: mapMembershipStatus(item.status),
            startsAt: protoInt64ToNumber(item.startsAt) ?? 0,
            expiresAt: protoInt64ToNumber(item.expiresAt) ?? 0,
            source: item.source,
            grantedBy: item.grantedBy,
            revokedAt: protoInt64ToNumber(item.revokedAt),
            revokedBy: item.revokedBy ?? null,
            createdAt: protoInt64ToNumber(item.createdAt) ?? 0,
            updatedAt: protoInt64ToNumber(item.updatedAt) ?? 0
        })),
        catalog: data.catalog.map((group) => ({
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
            permissionGroups: group.permissionGroups.map((entry) => ({
                id: entry.id,
                name: entry.name,
                scopes: entry.scopes
            })),
            subscriptionUrl: group.subscriptionUrl ?? null
        })),
        accountScopes: data.accountScopes,
        effectiveQuota: mapEffectiveQuota(data.effectiveQuota),
        quotaBreakdown: {
            baseline: {
                tokenLimit: data.quotaBreakdown?.baseline?.tokenLimit ?? 0,
                refillAmount: data.quotaBreakdown?.baseline?.refillAmount ?? 0
            },
            sponsorship: {
                tokenLimit:
                    data.quotaBreakdown?.sponsorship?.tokenLimit ?? null,
                refillAmount:
                    data.quotaBreakdown?.sponsorship?.refillAmount ?? null
            }
        }
    };
}

function mapMembershipStatus(value: number) {
    switch (value) {
        case 1:
            return 'active' as const;
        case 2:
            return 'scheduled' as const;
        case 3:
            return 'expired' as const;
        case 4:
            return 'revoked' as const;
        case 5:
            return 'disabled' as const;
        default:
            return 'unknown' as const;
    }
}

function mapBanAction(item: {
    id: number;
    userId: string;
    action: number;
    status: number;
    source: number;
    reason: string;
    actorUserId?: string | undefined;
    qqNumber?: string | undefined;
    ipAddress?: string | undefined;
    userAgent?: string | undefined;
    matchedActionId?: number | undefined;
    changed?: boolean | undefined;
    requestedAt: bigint | number;
    completedAt?: bigint | number | undefined;
    errorMessage?: string | undefined;
}): AdminUserBanActionItem {
    return {
        id: item.id,
        userId: item.userId,
        action: item.action === 2 ? 'unban' : 'ban',
        status:
            item.status === 1
                ? 'pending'
                : item.status === 2
                  ? 'succeeded'
                  : item.status === 3
                    ? 'failed'
                    : 'skipped',
        source:
            item.source === 1
                ? 'admin_manual'
                : item.source === 2
                  ? 'qq_ban_list'
                  : 'fingerprint_match',
        reason: item.reason,
        actorUserId: item.actorUserId ?? null,
        qqNumber: item.qqNumber ?? null,
        ipAddress: item.ipAddress ?? null,
        userAgent: item.userAgent ?? null,
        matchedActionId: item.matchedActionId ?? null,
        changed: item.changed ?? null,
        requestedAt: protoInt64ToNumber(item.requestedAt) ?? 0,
        completedAt: protoInt64ToNumber(item.completedAt),
        errorMessage: item.errorMessage ?? null
    };
}

function mapRiskCase(item: {
    id: number;
    userId: string;
    status: number;
    fingerprintId?: number | undefined;
    matchedActionId: number;
    ipAddress: string;
    userAgent: string;
    qqNumber?: string | undefined;
    banActionId?: number | undefined;
    detectedAt: bigint | number;
    updatedAt: bigint | number;
    escalatedAt?: bigint | number | undefined;
    clearedAt?: bigint | number | undefined;
    clearedBy?: string | undefined;
    errorMessage?: string | undefined;
}): AdminUserRiskCaseItem {
    return {
        id: item.id,
        userId: item.userId,
        status:
            item.status === 1
                ? 'pending'
                : item.status === 2
                  ? 'active'
                  : item.status === 3
                    ? 'escalating'
                    : item.status === 4
                      ? 'escalated'
                      : item.status === 5
                        ? 'failed'
                        : 'cleared',
        fingerprintId: item.fingerprintId ?? null,
        matchedActionId: item.matchedActionId,
        ipAddress: item.ipAddress,
        userAgent: item.userAgent,
        qqNumber: item.qqNumber ?? null,
        banActionId: item.banActionId ?? null,
        detectedAt: protoInt64ToNumber(item.detectedAt) ?? 0,
        updatedAt: protoInt64ToNumber(item.updatedAt) ?? 0,
        escalatedAt: protoInt64ToNumber(item.escalatedAt),
        clearedAt: protoInt64ToNumber(item.clearedAt),
        clearedBy: item.clearedBy ?? null,
        errorMessage: item.errorMessage ?? null
    };
}

function mapSecurity(
    data: GetAdminUsersSecurityData
): AdminUserSecurityResponse {
    return {
        asOf: protoInt64ToNumber(data.asOf) ?? 0,
        banCorrelationWindowSeconds: data.banCorrelationWindowSeconds,
        qqBanList: data.qqBanList.map(mapQqBanItem),
        banActions: data.banActions.map(mapBanAction),
        riskCases: data.riskCases.map(mapRiskCase)
    };
}

export async function fetchAdminUsers(
    input: V2RequestInput,
    signal?: AbortSignal
) {
    const result = await requestV2<GetAdminUsersData, AdminUsersResponse>(
        GetAdminUsers,
        input,
        mapUsers,
        { signal, retry: 0 }
    );
    return requireSuccess(GetAdminUsers, result);
}

export async function fetchAdminUserMemberships(
    userId: string,
    signal?: AbortSignal
) {
    const result = await requestV2<
        GetAdminUserMembershipsData,
        AdminUserMembershipsResponse
    >(GetAdminUserMemberships, { params: { userId } }, mapUserMemberships, {
        signal,
        retry: 0
    });
    return requireSuccess(GetAdminUserMemberships, result);
}

export async function putAdminUserMembership(
    userId: string,
    groupId: string,
    startsAt: number,
    durationDays: number
) {
    const result = await requestV2<
        PutAdminUserMembershipData,
        AdminUserMembershipsResponse
    >(
        PutAdminUserMembership,
        {
            params: { userId, groupId },
            body: {
                userId,
                groupId,
                startsAt,
                durationDays
            }
        },
        mapUserMemberships
    );
    return requireSuccess(PutAdminUserMembership, result);
}

export async function deleteAdminUserMembership(
    userId: string,
    groupId: string
) {
    const result = await requestV2<
        GetAdminUserMembershipsData,
        AdminUserMembershipsResponse
    >(
        DeleteAdminUserMembership,
        { params: { userId, groupId } },
        mapUserMemberships
    );
    return requireSuccess(DeleteAdminUserMembership, result);
}

export async function addAdminQqBanEntry(qqNumber: string) {
    const result = await requestV2<
        PostAdminQqBanEntryData,
        AdminAddQqBanListResponse
    >(PostAdminQqBanEntry, { body: { qqNumber } }, (data) => ({
        created: data.created,
        item: data.item
            ? mapQqBanItem(data.item)
            : { qqNumber, addedAt: 0, addedBy: '' }
    }));
    return requireSuccess(PostAdminQqBanEntry, result);
}

export async function removeAdminQqBanEntry(qqNumber: string) {
    const result = await requestV2<
        DeleteAdminQqBanEntryData,
        AdminRemoveQqBanListResponse
    >(DeleteAdminQqBanEntry, { params: { qqNumber } }, (data) => ({
        qqNumber: data.qqNumber,
        removed: data.removed
    }));
    return requireSuccess(DeleteAdminQqBanEntry, result);
}

export async function resetAdminUserQuota(userId: string) {
    const result = await requestV2<
        PostAdminUsersQuotaResetData,
        AdminResetUserQuotaResponse
    >(PostAdminUsersQuotaReset, { body: { userId } }, (data) => ({
        userId: data.userId,
        apiRemainCost: data.apiRemainCost,
        effectiveQuota: mapEffectiveQuota(data.effectiveQuota)
    }));
    return requireSuccess(PostAdminUsersQuotaReset, result);
}

export async function clearAdminUserRisk(userId: string) {
    const result = await requestV2<
        PostAdminUsersRiskClearData,
        AdminClearUserRiskResponse
    >(PostAdminUsersRiskClear, { body: { userId } }, (data) => ({
        userId: data.userId,
        riskCaseId: data.riskCaseId ?? null,
        changed: data.changed,
        exemptionExpiresAt: protoInt64ToNumber(data.exemptionExpiresAt),
        clearedAt: protoInt64ToNumber(data.clearedAt) ?? 0
    }));
    return requireSuccess(PostAdminUsersRiskClear, result);
}

export async function fetchAdminUsersSecurity(signal?: AbortSignal) {
    const result = await requestV2<
        GetAdminUsersSecurityData,
        AdminUserSecurityResponse
    >(GetAdminUsersSecurity, {}, mapSecurity, {
        signal,
        retry: 0
    });
    return requireSuccess(GetAdminUsersSecurity, result);
}

export async function updateAdminUserStatus(userId: string, banned: boolean) {
    const result = await requestV2<
        PostAdminUsersStatusData,
        AdminUpdateUserBanStateResponse
    >(PostAdminUsersStatus, { body: { userId, banned } }, (data) => ({
        userId: data.userId,
        isBanned: data.isBanned,
        changed: data.changed,
        revokedWebappApiKeyCount: data.revokedWebappApiKeyCount,
        updatedAt: protoInt64ToNumber(data.updatedAt) ?? 0
    }));
    return requireSuccess(PostAdminUsersStatus, result);
}
