import getNowSeconds from '~/server/utils/time/getNowSeconds';
import getApiKeyUsageStore from '~/server/utils/api/keyUsage/getApiKeyUsageStore';
import {
    API_KEY_USAGE_BUCKET_COUNT,
    API_KEY_USAGE_BUCKET_SECONDS,
    type ApiKeyUsageState
} from '~/server/utils/api/keyUsage/KeyUsageTypes';

function toBucketStart(timestamp: number) {
    return timestamp - (timestamp % API_KEY_USAGE_BUCKET_SECONDS);
}

function toBucketIndex(bucketStart: number) {
    return (
        Math.floor(bucketStart / API_KEY_USAGE_BUCKET_SECONDS) %
        API_KEY_USAGE_BUCKET_COUNT
    );
}

function createUsageState(now: number): ApiKeyUsageState {
    return {
        bucketStarts: Array.from(
            { length: API_KEY_USAGE_BUCKET_COUNT },
            () => 0
        ),
        bucketValues: Array.from(
            { length: API_KEY_USAGE_BUCKET_COUNT },
            () => 0
        ),
        lastSeenAt: now
    };
}

export default function recordApiKeyUsage(
    keyId: string,
    tokens: number,
    timestamp = getNowSeconds()
) {
    const normalizedTokens = Math.max(0, Math.floor(tokens));
    if (normalizedTokens <= 0) {
        return;
    }

    const { byKeyId } = getApiKeyUsageStore();
    const usageState = byKeyId.get(keyId) ?? createUsageState(timestamp);
    const bucketStart = toBucketStart(timestamp);
    const bucketIndex = toBucketIndex(bucketStart);

    const storedBucketStart = usageState.bucketStarts[bucketIndex] ?? 0;
    if (storedBucketStart !== bucketStart) {
        usageState.bucketStarts[bucketIndex] = bucketStart;
        usageState.bucketValues[bucketIndex] = 0;
    }

    const currentBucketValue = usageState.bucketValues[bucketIndex] ?? 0;
    usageState.bucketValues[bucketIndex] =
        currentBucketValue + normalizedTokens;
    usageState.lastSeenAt = timestamp;
    byKeyId.set(keyId, usageState);
}
