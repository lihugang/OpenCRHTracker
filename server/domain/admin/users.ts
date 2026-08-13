import {
    clearAdminUserRiskState,
    getAdminUsersSnapshot,
    resetAdminUserQuota,
    updateAdminUserBanState
} from '~/server/services/adminUserStore';
import {
    ensureMembershipUserExists,
    getUserMembershipSnapshot,
    revokeUserMembership,
    upsertUserMembership
} from '~/server/services/membershipStore';
import {
    addQqBanListEntry,
    getAdminUserSecuritySnapshot,
    removeQqBanListEntry
} from '~/server/services/userBanSecurityStore';
import type { AdminUpdateUserBanStateRequest } from '~/types/admin';
export { postAdminWebappTokensRevokeAll } from '~/server/domain/admin/webappTokens';

export function getAdminUsers() {
    return getAdminUsersSnapshot();
}

export function getAdminUserMemberships(userId: string) {
    ensureMembershipUserExists(userId);
    return getUserMembershipSnapshot(userId);
}

export function putAdminUserMembership(input: {
    userId: string;
    groupId: string;
    startsAt: number;
    expiresAt: number;
    actorUserId: string;
}) {
    return upsertUserMembership({
        userId: input.userId,
        groupId: input.groupId,
        startsAt: input.startsAt,
        expiresAt: input.expiresAt,
        actorUserId: input.actorUserId
    });
}

export function deleteAdminUserMembership(
    userId: string,
    groupId: string,
    actorUserId: string
) {
    return revokeUserMembership(userId, groupId, actorUserId);
}

export function postAdminQqBanEntry(qqNumber: string, actorUserId: string) {
    return addQqBanListEntry(qqNumber, actorUserId);
}

export function deleteAdminQqBanEntry(qqNumber: string, actorUserId: string) {
    return removeQqBanListEntry(qqNumber, actorUserId);
}

export function postAdminUsersQuotaReset(userId: string) {
    return resetAdminUserQuota({ userId });
}

export function postAdminUsersRiskClear(userId: string, actorUserId: string) {
    return clearAdminUserRiskState(userId, actorUserId);
}

export function getAdminUsersSecurity() {
    return getAdminUserSecuritySnapshot();
}

export function postAdminUsersStatus(
    request: AdminUpdateUserBanStateRequest,
    actorUserId: string
) {
    return updateAdminUserBanState(request, actorUserId);
}
