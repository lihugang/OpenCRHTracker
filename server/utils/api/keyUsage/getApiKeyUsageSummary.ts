import type { AuthApiKeyUsageSummary } from '~/types/auth';
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

function createEmptyUsageSummary(): AuthApiKeyUsageSummary {
    return {
        last1Hour: 0,
        last8Hours: 0,
        last1Day: 0,
        bucketSeconds: API_KEY_USAGE_BUCKET_SECONDS
    };
}

function sumRecentBuckets(
    usageState: ApiKeyUsageState,
    bucketCount: number,
    currentBucketStart: number
) {
    let total = 0;

    for (let offset = 0; offset < bucketCount; offset += 1) {
        const bucketStart =
            currentBucketStart - offset * API_KEY_USAGE_BUCKET_SECONDS;
        const bucketIndex = toBucketIndex(bucketStart);

        if (usageState.bucketStarts[bucketIndex] === bucketStart) {
            total += usageState.bucketValues[bucketIndex] ?? 0;
        }
    }

    return total;
}

export default function getApiKeyUsageSummary(
    keyId: string,
    timestamp = getNowSeconds()
) {
    const usageState = getApiKeyUsageStore().byKeyId.get(keyId);
    if (!usageState) {
        return createEmptyUsageSummary();
    }

    const currentBucketStart = toBucketStart(timestamp);

    return {
        last1Hour: sumRecentBuckets(usageState, 12, currentBucketStart),
        last8Hours: sumRecentBuckets(usageState, 96, currentBucketStart),
        last1Day: sumRecentBuckets(usageState, 288, currentBucketStart),
        bucketSeconds: API_KEY_USAGE_BUCKET_SECONDS
    };
}
