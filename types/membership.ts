export type UserMembershipStatus =
    | 'active'
    | 'scheduled'
    | 'expired'
    | 'revoked'
    | 'disabled'
    | 'unknown';

export interface SponsorshipQuotaContribution {
    tokenLimit: number | null;
    refillAmount: number | null;
}

export interface SponsorshipPermissionGroupItem {
    id: string;
    name: string;
    scopes: string[];
}

export interface SponsorshipGroupCatalogItem {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    visible: boolean;
    assignable: boolean;
    sortOrder: number;
    quota: SponsorshipQuotaContribution;
    permissionGroups: SponsorshipPermissionGroupItem[];
    subscriptionUrl: string | null;
}

export interface UserMembershipItem {
    userId: string;
    groupId: string;
    group: SponsorshipGroupCatalogItem | null;
    status: UserMembershipStatus;
    startsAt: number;
    expiresAt: number;
    source: string;
    grantedBy: string;
    revokedAt: number | null;
    revokedBy: string | null;
    createdAt: number;
    updatedAt: number;
}

export interface AuthMembershipItem {
    groupId: string;
    group: SponsorshipGroupCatalogItem;
    status: 'active' | 'scheduled';
    startsAt: number;
    expiresAt: number;
}

export interface SponsorshipGroupSummary {
    groupId: string;
    name: string;
    startsAt: number;
    expiresAt: number;
}

export interface SponsorshipEffectiveQuota {
    tokenLimit: number;
    refillAmount: number;
    refillIntervalSeconds: number;
}

export interface SponsorshipQuotaBreakdown {
    baseline: {
        tokenLimit: number;
        refillAmount: number;
    };
    sponsorship: SponsorshipQuotaContribution;
}

export interface AuthMembershipsResponse {
    userId: string;
    asOf: number;
    items: AuthMembershipItem[];
    catalog: SponsorshipGroupCatalogItem[];
    accountScopes: string[];
    effectiveQuota: SponsorshipEffectiveQuota;
    quotaBreakdown: SponsorshipQuotaBreakdown;
}

export interface AdminUserMembershipsResponse {
    userId: string;
    asOf: number;
    items: UserMembershipItem[];
    catalog: SponsorshipGroupCatalogItem[];
    accountScopes: string[];
    effectiveQuota: SponsorshipEffectiveQuota;
    quotaBreakdown: SponsorshipQuotaBreakdown;
}

export interface AdminUpsertUserMembershipRequest {
    startsAt: number;
    durationDays: number;
}

export interface AuthMembershipRedeemResponse {
    code: string;
    redeemedAt: number;
    durationDays: number;
    membership: AuthMembershipItem;
    memberships: AuthMembershipsResponse;
}
