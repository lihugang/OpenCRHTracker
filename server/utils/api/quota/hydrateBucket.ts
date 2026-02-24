import useConfig from '~/server/config';
import getQuotaStore from '~/server/utils/api/quota/getQuotaStore';
import type {
    QuotaSubject,
    TokenBucket
} from '~/server/utils/api/quota/QuotaTypes';

export default function hydrateBucket(subject: QuotaSubject, now: number) {
    const config = useConfig();
    const { buckets } = getQuotaStore();
    let bucket = buckets.get(subject.bucketKey);

    if (!bucket) {
        bucket = {
            tokens: subject.tokenLimit,
            updatedAt: now
        };
        buckets.set(subject.bucketKey, bucket);
        return bucket;
    }

    const refillStep = config.quota.refillIntervalSeconds;
    const elapsed = now - bucket.updatedAt;
    if (elapsed >= refillStep) {
        const refillCount = Math.floor(elapsed / refillStep);
        bucket.tokens = Math.min(
            subject.tokenLimit,
            bucket.tokens + refillCount * config.quota.refillAmount
        );
        bucket.updatedAt += refillCount * refillStep;
    }

    if (bucket.tokens > subject.tokenLimit) {
        bucket.tokens = subject.tokenLimit;
    }

    return bucket as TokenBucket;
}
