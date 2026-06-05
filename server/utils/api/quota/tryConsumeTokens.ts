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
    const cost = Math.max(0, Math.floor(rawCost));
    const now = getNowSeconds();
    const bucket = hydrateBucket(subject, now);

    if (!subject.refillIntervalSeconds || subject.refillAmount <= 0) {
        throw new Error('invalid quota subject refill configuration');
    }

    if (!subject.tokenLimit || subject.tokenLimit < 0) {
        throw new Error('invalid quota subject token limit');
    }

    if (!useRuntimeQuotaConsumeFlag()) {
        return {
            ok: true,
            remain: bucket.tokens,
            cost
        };
    }

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
    const refillPerStep = subject.refillAmount;
    const refillStep = subject.refillIntervalSeconds;
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

function useRuntimeQuotaConsumeFlag() {
    return useConfig().quota.consumeTokens;
}
