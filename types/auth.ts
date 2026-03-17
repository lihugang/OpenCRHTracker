export type AuthApiKeyIssuer = 'webapp' | 'api';

export interface AuthSession {
    userId: string;
    keyId: string;
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
        keyId: string;
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
    keyId: string;
    maskedKeyId: string;
    issuer: AuthApiKeyIssuer;
    activeFrom: number;
    revokedAt: number | null;
    expiresAt: number;
    dailyTokenLimit: number;
    scopes: string[];
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
    keyId: string;
    issuer: AuthApiKeyIssuer;
    apiKey: string;
    maskedApiKey: string;
    activeFrom: number;
    expiresAt: number;
    dailyTokenLimit: number;
    scopes: string[];
}
