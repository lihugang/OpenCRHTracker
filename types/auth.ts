export interface AuthSession {
    userId: string;
    keyId: string;
    maskedApiKey: string;
    scopes: string[];
    createdAt: number;
    expiresAt: number;
    dailyTokenLimit: number;
}

export interface AuthMeResponse {
    user: {
        userId: string;
    };
    apiKey: {
        keyId: string;
        maskedApiKey: string;
        createdAt: number;
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
