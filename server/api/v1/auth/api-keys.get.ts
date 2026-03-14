import { defineEventHandler } from 'h3';
import { listApiKeysByUser, maskApiKey } from '~/server/services/authStore';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.auth.apiKeys.read],
            fixedCost: getFixedCost('authListApiKeys')
        },
        async ({ identity }) => {
            const records = listApiKeysByUser(identity.id);

            return {
                userId: identity.id,
                items: records.map((record) => ({
                    keyId: record.key,
                    maskedKeyId: maskApiKey(record.key),
                    createdAt: record.created_at,
                    revokedAt: record.revoked_at,
                    expiresAt: record.expires_at,
                    dailyTokenLimit: record.daily_token_limit,
                    scopes: record.scopes
                }))
            };
        }
    );
});
