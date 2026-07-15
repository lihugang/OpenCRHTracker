import useConfig from '~/server/config';
import { resolveUserMembershipEntitlements } from '~/server/services/membershipStore';
import { getUserQuotaOverride } from '~/server/services/userProfileStore';
import type { QuotaSubject } from '~/server/utils/api/quota/QuotaTypes';

export default function resolveUserQuotaSubject(
    userId: string,
    entitlements = resolveUserMembershipEntitlements(userId)
): QuotaSubject {
    const config = useConfig();
    const override = getUserQuotaOverride(userId);

    return {
        bucketKey: `user:${userId}`,
        tokenLimit: override.tokenLimit ?? entitlements.tokenLimit,
        refillAmount: override.refillAmount ?? entitlements.refillAmount,
        refillIntervalSeconds: config.quota.refillIntervalSeconds
    };
}
