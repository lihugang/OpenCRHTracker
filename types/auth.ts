import type { FavoriteLookupItem } from '~/types/lookup';
import type { NotificationTargetType } from '~/types/notifications';

export type AuthApiKeyIssuer = 'webapp' | 'api';

export interface AuthApiKeyNameLength {
    minLength: number;
    maxLength: number;
}

export interface AuthSession {
    userId: string;
    revokeId: string;
    issuer: AuthApiKeyIssuer;
    maskedApiKey: string;
    scopes: string[];
    activeFrom: number;
    expiresAt: number;
    dailyTokenLimit: number;
}

export interface AuthQuotaSummary {
    tokenLimit: number;
    remain: number;
    refillAmount: number;
    refillIntervalSeconds: number;
    nextRefillAt: number | null;
}

export interface AuthApiKeyUsageSummary {
    last1Hour: number;
    last8Hours: number;
    last1Day: number;
    bucketSeconds: number;
}

export interface AuthSubscriptionItem {
    id: string;
    name: string;
    endpoint: string;
    endpointPreview: string;
    expirationTime: number | null;
    createdAt: number;
    updatedAt: number;
    userAgent: string;
}

export interface AuthMeResponse {
    user: {
        userId: string;
    };
    apiKey: {
        revokeId: string;
        issuer: AuthApiKeyIssuer;
        maskedApiKey: string;
        activeFrom: number;
        expiresAt: number;
        dailyTokenLimit: number;
        scopes: string[];
    };
    quota: AuthQuotaSummary;
}

export interface AuthApiKeyListItem {
    name: string;
    revokeId: string;
    maskedKeyId: string;
    issuer: AuthApiKeyIssuer;
    activeFrom: number;
    revokedAt: number | null;
    expiresAt: number;
    dailyTokenLimit: number;
    scopes: string[];
    isCurrent: boolean;
    usage: AuthApiKeyUsageSummary | null;
}

export interface AuthApiKeyListResponse {
    userId: string;
    quota: AuthQuotaSummary;
    items: AuthApiKeyListItem[];
    creatableScopes: string[];
    defaultScopes: string[];
    maxLifetimeSeconds: number;
    apiKeyNameLength: AuthApiKeyNameLength;
}

export interface AuthIssueApiKeyResponse {
    userId: string;
    name: string;
    revokeId: string;
    issuer: AuthApiKeyIssuer;
    apiKey: string;
    maskedApiKey: string;
    activeFrom: number;
    expiresAt: number;
    dailyTokenLimit: number;
    scopes: string[];
}

export interface AuthFavoritesResponse {
    userId: string;
    maxEntries: number;
    items: FavoriteLookupItem[];
}

export interface AuthSubscriptionListResponse {
    userId: string;
    maxDevices: number;
    vapidPublicKey: string;
    syncTimeoutSeconds: number;
    items: AuthSubscriptionItem[];
}

export interface AuthEventSubscriptionItem {
    targetType: NotificationTargetType;
    targetId: string;
    label: string;
    path: string;
    createdAt: number;
    updatedAt: number;
}

export interface AuthEventSubscriptionListResponse {
    userId: string;
    maxEntries: number;
    items: AuthEventSubscriptionItem[];
}
