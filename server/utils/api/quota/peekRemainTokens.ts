import getQuotaStore from '~/server/utils/api/quota/getQuotaStore';
import type { QuotaSubject } from '~/server/utils/api/quota/QuotaTypes';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

export default function peekRemainTokens(
    subject: QuotaSubject,
    now = getNowSeconds()
) {
    const bucket = getQuotaStore().buckets.get(subject.bucketKey);
    if (!bucket) {
        return subject.tokenLimit;
    }

    const previousTokenLimit = bucket.tokenLimit ?? subject.tokenLimit;
    if (subject.tokenLimit > previousTokenLimit) {
        return subject.tokenLimit;
    }

    const currentTokens = Math.min(subject.tokenLimit, bucket.tokens);
    const refillStep = subject.refillIntervalSeconds;
    const elapsed = now - bucket.updatedAt;

    if (elapsed < refillStep) {
        return currentTokens;
    }

    const refillCount = Math.floor(elapsed / refillStep);
    return Math.min(
        subject.tokenLimit,
        currentTokens + refillCount * subject.refillAmount
    );
}
