export interface QuotaSubject {
    bucketKey: string;
    tokenLimit: number;
    refillAmount: number;
    refillIntervalSeconds: number;
}

export interface QuotaConsumeResult {
    ok: boolean;
    remain: number;
    cost: number;
    retryAfter?: number;
    impossible?: boolean;
}

export interface TokenBucket {
    tokens: number;
    updatedAt: number;
    tokenLimit: number;
}

export interface QuotaStoreContainer {
    buckets: Map<string, TokenBucket>;
}
