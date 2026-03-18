export type AuthApiKeyIssuer = 'webapp' | 'api';

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
    quota: {
        tokenLimit: number;
        remain: number;
        refillAmount: number;
        refillIntervalSeconds: number;
    };
}

export interface AuthApiKeyListItem {
    revokeId: string;
    maskedKeyId: string;
    issuer: AuthApiKeyIssuer;
    activeFrom: number;
    revokedAt: number | null;
    expiresAt: number;
    dailyTokenLimit: number;
    scopes: string[];
    isCurrent: boolean;
}

export interface AuthApiKeyListResponse {
    userId: string;
    items: AuthApiKeyListItem[];
    creatableScopes: string[];
    defaultScopes: string[];
    maxLifetimeSeconds: number;
}

export interface AuthIssueApiKeyResponse {
    userId: string;
    revokeId: string;
    issuer: AuthApiKeyIssuer;
    apiKey: string;
    maskedApiKey: string;
    activeFrom: number;
    expiresAt: number;
    dailyTokenLimit: number;
    scopes: string[];
}
