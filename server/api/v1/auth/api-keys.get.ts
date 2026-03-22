import { defineEventHandler } from 'h3';
import useConfig from '~/server/config';
import { listApiKeysByUser, maskApiKey } from '~/server/services/authStore';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import getApiKeyUsageSummary from '~/server/utils/api/keyUsage/getApiKeyUsageSummary';
import getQuotaSummary from '~/server/utils/api/quota/getQuotaSummary';
import hasScope from '~/server/utils/api/scopes/hasScope';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import normalizeScopeList from '~/server/utils/api/scopes/normalizeScopeList';
import type { AuthApiKeyListResponse } from '~/types/auth';

function resolveCreatableScopes(identityScopes: string[]) {
    const creatableScopes = useConfig().api.permissions.creatableKeyMaxScopes;

    return normalizeScopeList(
        creatableScopes.filter((scope) => hasScope(identityScopes, scope))
    );
}

function resolveDefaultScopes(identityScopes: string[]) {
    const config = useConfig();
    const creatableScopes = resolveCreatableScopes(identityScopes);

    return normalizeScopeList(
        config.api.permissions.issuedKeyDefaultScopes.filter(
            (scope) =>
                hasScope(identityScopes, scope) &&
                hasScope(creatableScopes, scope)
        )
    );
}

export default defineEventHandler(async (event) => {
    const config = useConfig();

    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.auth.apiKeys.read],
            fixedCost: getFixedCost('authListApiKeys')
        },
        async ({ identity }) => {
            const records = listApiKeysByUser(identity.id);
            const response: AuthApiKeyListResponse = {
                userId: identity.id,
                quota: getQuotaSummary(identity),
                items: records.map((record) => ({
                    name: record.name,
                    revokeId: record.revoke_id,
                    maskedKeyId: maskApiKey(record.key),
                    issuer: record.issuer,
                    activeFrom: record.active_from,
                    revokedAt: record.revoked_at,
                    expiresAt: record.expires_at,
                    dailyTokenLimit: record.daily_token_limit,
                    scopes: record.scopes,
                    isCurrent: record.key === identity.keyId,
                    usage: getApiKeyUsageSummary(record.key)
                })),
                creatableScopes: resolveCreatableScopes(identity.scopes),
                defaultScopes: resolveDefaultScopes(identity.scopes),
                maxLifetimeSeconds: config.user.apiKeyMaxLifetimeSeconds,
                apiKeyNameLength: config.user.apiKeyNameLength
            };

            return response;
        }
    );
});
