import type { AuthQuotaSummary } from '~/types/auth';
import useConfig from '~/server/config';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import hydrateBucket from '~/server/utils/api/quota/hydrateBucket';
import type { QuotaSubject } from '~/server/utils/api/quota/QuotaTypes';

export default function getQuotaSummary(
    subject: QuotaSubject,
    now = getNowSeconds()
): AuthQuotaSummary {
    const config = useConfig();
    const bucket = hydrateBucket(subject, now);
    const nextRefillAt =
        bucket.tokens >= subject.tokenLimit
            ? null
            : bucket.updatedAt + config.quota.refillIntervalSeconds;

    return {
        tokenLimit: subject.tokenLimit,
        remain: bucket.tokens,
        refillAmount: config.quota.refillAmount,
        refillIntervalSeconds: config.quota.refillIntervalSeconds,
        nextRefillAt
    };
}
