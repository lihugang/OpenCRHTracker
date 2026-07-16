import useConfig from '~/server/config';
import { resolveUserMembershipEntitlements } from '~/server/services/membershipStore';
import type { QuotaSubject } from '~/server/utils/api/quota/QuotaTypes';

export default function resolveUserQuotaSubject(
    userId: string,
    entitlements = resolveUserMembershipEntitlements(userId)
): QuotaSubject {
    const config = useConfig();

    return {
        bucketKey: `user:${userId}`,
        tokenLimit: entitlements.tokenLimit,
        refillAmount: entitlements.refillAmount,
        refillIntervalSeconds: config.quota.refillIntervalSeconds
    };
}
