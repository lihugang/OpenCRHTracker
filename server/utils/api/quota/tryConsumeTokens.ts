import useConfig from '~/server/config';
import hydrateBucket from '~/server/utils/api/quota/hydrateBucket';
import type {
    QuotaConsumeResult,
    QuotaSubject
} from '~/server/utils/api/quota/QuotaTypes';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

export default function tryConsumeTokens(
    subject: QuotaSubject,
    rawCost: number
): QuotaConsumeResult {
    const config = useConfig();
    const now = getNowSeconds();
    const cost = Math.max(0, Math.floor(rawCost));
    const bucket = hydrateBucket(subject, now);

    if (cost === 0) {
        return {
            ok: true,
            remain: bucket.tokens,
            cost: 0
        };
    }

    if (cost > subject.tokenLimit) {
        return {
            ok: false,
            remain: bucket.tokens,
            cost: 0,
            impossible: true
        };
    }

    if (bucket.tokens >= cost) {
        bucket.tokens -= cost;
        return {
            ok: true,
            remain: bucket.tokens,
            cost
        };
    }

    const deficit = cost - bucket.tokens;
    const refillPerStep = config.quota.refillAmount;
    const refillStep = config.quota.refillIntervalSeconds;
    const refillCount = Math.ceil(deficit / refillPerStep);
    const nextAvailableAt = bucket.updatedAt + refillCount * refillStep;
    const retryAfter = Math.max(1, nextAvailableAt - now);

    return {
        ok: false,
        remain: bucket.tokens,
        cost: 0,
        retryAfter
    };
}
