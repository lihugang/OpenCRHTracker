import { getHeader, type H3Event } from 'h3';
import useConfig from '~/server/config';
import { getValidApiKey } from '~/server/services/authStore';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import getAnonymousIdentity from '~/server/utils/api/identity/getAnonymousIdentity';
import type ApiIdentity from '~/server/utils/api/identity/ApiIdentity';
import {
    clearAuthCookie,
    readAuthCookie
} from '~/server/utils/auth/authCookie';

type ApiKeySource = 'authorization' | 'configured-header' | 'cookie';

interface ResolvedApiKey {
    key: string;
    source: ApiKeySource;
}

function normalizeAuthHeaderValue(value: string | null | undefined) {
    const normalizedValue = value?.trim();
    const key = normalizedValue?.replace(/^Bearer\s+/i, '').trim();
    return key && key.length > 0 ? key : null;
}

function readAuthorizationHeader(event: H3Event) {
    const rawHeader = getHeader(event, 'authorization');
    if (!rawHeader) {
        return null;
    }

    const value = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    const key = normalizeAuthHeaderValue(value);
    return key
        ? ({
              key,
              source: 'authorization'
          } satisfies ResolvedApiKey)
        : null;
}

function readConfiguredApiKeyHeader(event: H3Event) {
    const config = useConfig();
    if (config.api.apiKeyHeader.toLowerCase() === 'authorization') {
        return null;
    }

    const rawHeader = getHeader(event, config.api.apiKeyHeader);
    if (!rawHeader) {
        return null;
    }

    const value = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    const normalizedValue = value?.trim();
    return normalizedValue && normalizedValue.length > 0
        ? ({
              key: normalizedValue,
              source: 'configured-header'
          } satisfies ResolvedApiKey)
        : null;
}

function readApiKey(event: H3Event) {
    const cookieKey = readAuthCookie(event);
    return (
        readAuthorizationHeader(event) ??
        readConfiguredApiKeyHeader(event) ??
        (cookieKey
            ? ({
                  key: cookieKey,
                  source: 'cookie'
              } satisfies ResolvedApiKey)
            : null)
    );
}

export default function resolveIdentity(event: H3Event): ApiIdentity {
    const resolvedApiKey = readApiKey(event);
    if (!resolvedApiKey) {
        return getAnonymousIdentity(event);
    }

    const apiKeyRecord = getValidApiKey(resolvedApiKey.key);
    if (!apiKeyRecord) {
        if (resolvedApiKey.source === 'cookie') {
            clearAuthCookie(event);
            return getAnonymousIdentity(event);
        }

        throw new ApiRequestError(
            401,
            'invalid_api_key',
            'API Key 无效或已过期'
        );
    }

    return {
        type: 'user',
        id: apiKeyRecord.userId,
        keyId: apiKeyRecord.keyId,
        issuer: apiKeyRecord.issuer,
        apiKey: resolvedApiKey.key,
        bucketKey: `user:${apiKeyRecord.userId}`,
        tokenLimit: apiKeyRecord.dailyTokenLimit,
        scopes: apiKeyRecord.scopes,
        activeFrom: apiKeyRecord.activeFrom,
        expiresAt: apiKeyRecord.expiresAt,
        dailyTokenLimit: apiKeyRecord.dailyTokenLimit
    };
}
