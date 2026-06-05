import useConfig from '~/server/config';
import { getUserQuotaOverride } from '~/server/services/userProfileStore';
import type { QuotaSubject } from '~/server/utils/api/quota/QuotaTypes';

export default function resolveUserQuotaSubject(userId: string): QuotaSubject {
    const config = useConfig();
    const override = getUserQuotaOverride(userId);

    return {
        bucketKey: `user:${userId}`,
        tokenLimit: override.tokenLimit ?? config.quota.userMaxTokens,
        refillAmount: override.refillAmount ?? config.quota.refillAmount,
        refillIntervalSeconds: config.quota.refillIntervalSeconds
    };
}
