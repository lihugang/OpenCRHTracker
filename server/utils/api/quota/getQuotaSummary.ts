import type { AuthQuotaSummary } from '~/types/auth';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import hydrateBucket from '~/server/utils/api/quota/hydrateBucket';
import type { QuotaSubject } from '~/server/utils/api/quota/QuotaTypes';

export default function getQuotaSummary(
    subject: QuotaSubject,
    now = getNowSeconds()
): AuthQuotaSummary {
    const bucket = hydrateBucket(subject, now);
    const nextRefillAt =
        bucket.tokens >= subject.tokenLimit
            ? null
            : bucket.updatedAt + subject.refillIntervalSeconds;

    return {
        tokenLimit: subject.tokenLimit,
        remain: bucket.tokens,
        refillAmount: subject.refillAmount,
        refillIntervalSeconds: subject.refillIntervalSeconds,
        nextRefillAt
    };
}
