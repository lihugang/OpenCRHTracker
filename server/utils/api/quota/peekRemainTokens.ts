import useConfig from '~/server/config';
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

    const config = useConfig();
    const refillStep = config.quota.refillIntervalSeconds;
    const elapsed = now - bucket.updatedAt;

    if (elapsed < refillStep) {
        return Math.min(subject.tokenLimit, bucket.tokens);
    }

    const refillCount = Math.floor(elapsed / refillStep);
    return Math.min(
        subject.tokenLimit,
        bucket.tokens + refillCount * config.quota.refillAmount
    );
}
