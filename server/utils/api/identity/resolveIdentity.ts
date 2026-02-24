import { getHeader, type H3Event } from 'h3';
import useConfig from '~/server/config';
import { getValidApiKey } from '~/server/services/authStore';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import type ApiIdentity from '~/server/utils/api/identity/ApiIdentity';
import getAnonymousIdentity from '~/server/utils/api/identity/getAnonymousIdentity';

function readApiKey(event: H3Event) {
    const config = useConfig();
    const rawHeader = getHeader(event, config.api.apiKeyHeader);
    if (!rawHeader) {
        return null;
    }

    const value = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    const key = value?.trim();
    if (!key) {
        return null;
    }
    return key;
}

export default function resolveIdentity(
    event: H3Event,
    requireApiKey = false
): ApiIdentity {
    const config = useConfig();
    const key = readApiKey(event);

    if (!key) {
        if (requireApiKey) {
            throw new ApiRequestError(
                401,
                'unauthorized',
                '此接口需要 API Key'
            );
        }
        return getAnonymousIdentity(event);
    }

    const apiKeyRecord = getValidApiKey(key);
    if (!apiKeyRecord) {
        throw new ApiRequestError(
            401,
            'invalid_api_key',
            'API Key 无效或已过期'
        );
    }

    return {
        type: 'user',
        id: apiKeyRecord.user_id,
        bucketKey: `user:${apiKeyRecord.user_id}`,
        tokenLimit: config.quota.userMaxTokens,
        apiKey: key
    };
}
