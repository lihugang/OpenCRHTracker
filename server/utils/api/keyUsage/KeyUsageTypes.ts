export const API_KEY_USAGE_BUCKET_SECONDS = 5 * 60;
export const API_KEY_USAGE_BUCKET_COUNT =
    (24 * 60 * 60) / API_KEY_USAGE_BUCKET_SECONDS;

export interface ApiKeyUsageState {
    bucketStarts: number[];
    bucketValues: number[];
    lastSeenAt: number;
}

export interface ApiKeyUsageStoreContainer {
    byKeyId: Map<string, ApiKeyUsageState>;
}
