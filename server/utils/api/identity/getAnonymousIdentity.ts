import type { H3Event } from 'h3';
import useConfig from '~/server/config';
import getClientIp from '~/server/utils/api/quota/getClientIp';
import type ApiIdentity from '~/server/utils/api/identity/ApiIdentity';

export default function getAnonymousIdentity(event: H3Event): ApiIdentity {
    const config = useConfig();
    const ip = getClientIp(event);
    return {
        type: 'anonymous',
        id: ip ?? 'unknown',
        bucketKey: `ip:${ip}`,
        tokenLimit: config.quota.anonymousMaxTokens
    };
}
