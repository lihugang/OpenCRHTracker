import { getHeader, type H3Event } from 'h3';
import useConfig from '~/server/config';
import { getValidApiKey, isUserBanned } from '~/server/services/authStore';
import {
    resolveUserMembershipEntitlements,
    type UserMembershipEntitlements
} from '~/server/services/membershipStore';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import getAnonymousIdentity from '~/server/utils/api/identity/getAnonymousIdentity';
import type ApiIdentity from '~/server/utils/api/identity/ApiIdentity';
import resolveUserQuotaSubject from '~/server/utils/api/quota/resolveUserQuotaSubject';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import hasScope from '~/server/utils/api/scopes/hasScope';
import intersectScopeLists from '~/server/utils/api/scopes/intersectScopeLists';
import normalizeScopeList from '~/server/utils/api/scopes/normalizeScopeList';
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

function resolveEffectiveScopes(
    apiKeyRecord: NonNullable<ReturnType<typeof getValidApiKey>>,
    entitlements: UserMembershipEntitlements
) {
    if (apiKeyRecord.issuer === 'webapp') {
        return entitlements.accountScopes;
    }

    const effectiveScopes = intersectScopeLists(
        apiKeyRecord.scopes,
        entitlements.accountScopes
    );
    if (
        apiKeyRecord.issuer === 'oauth' &&
        hasScope(apiKeyRecord.scopes, API_SCOPES.notifications.send)
    ) {
        effectiveScopes.push(API_SCOPES.notifications.send);
    }

    return normalizeScopeList(effectiveScopes);
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

    if (isUserBanned(apiKeyRecord.userId)) {
        if (resolvedApiKey.source === 'cookie') {
            clearAuthCookie(event);
        }

        throw new ApiRequestError(403, 'account_banned', '账号已被封禁');
    }

    const entitlements = resolveUserMembershipEntitlements(apiKeyRecord.userId);
    const quotaSubject = resolveUserQuotaSubject(
        apiKeyRecord.userId,
        entitlements
    );

    return {
        type: 'user',
        id: apiKeyRecord.userId,
        keyId: apiKeyRecord.keyId,
        revokeId: apiKeyRecord.revokeId,
        issuer: apiKeyRecord.issuer,
        oauthClientId: apiKeyRecord.oauthClientId ?? undefined,
        apiKey: resolvedApiKey.key,
        bucketKey: quotaSubject.bucketKey,
        tokenLimit: quotaSubject.tokenLimit,
        refillAmount: quotaSubject.refillAmount,
        refillIntervalSeconds: quotaSubject.refillIntervalSeconds,
        scopes: resolveEffectiveScopes(apiKeyRecord, entitlements),
        activeFrom: apiKeyRecord.activeFrom,
        expiresAt: apiKeyRecord.expiresAt
    };
}
