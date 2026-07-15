import getQuotaStore from '~/server/utils/api/quota/getQuotaStore';
import type {
    QuotaSubject,
    TokenBucket
} from '~/server/utils/api/quota/QuotaTypes';

export default function hydrateBucket(subject: QuotaSubject, now: number) {
    const { buckets } = getQuotaStore();
    let bucket = buckets.get(subject.bucketKey);

    if (!bucket) {
        bucket = {
            tokens: subject.tokenLimit,
            updatedAt: now,
            tokenLimit: subject.tokenLimit
        };
        buckets.set(subject.bucketKey, bucket);
        return bucket;
    }

    const previousTokenLimit = bucket.tokenLimit ?? subject.tokenLimit;
    if (subject.tokenLimit > previousTokenLimit) {
        bucket.tokens = subject.tokenLimit;
    } else if (subject.tokenLimit < previousTokenLimit) {
        bucket.tokens = Math.min(bucket.tokens, subject.tokenLimit);
    }
    bucket.tokenLimit = subject.tokenLimit;

    const refillStep = subject.refillIntervalSeconds;
    const elapsed = now - bucket.updatedAt;
    if (elapsed >= refillStep) {
        const refillCount = Math.floor(elapsed / refillStep);
        bucket.tokens = Math.min(
            subject.tokenLimit,
            bucket.tokens + refillCount * subject.refillAmount
        );
        bucket.updatedAt += refillCount * refillStep;
    }

    return bucket as TokenBucket;
}
