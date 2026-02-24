import { defineEventHandler } from 'h3';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import { listApiKeysByUser, maskApiKey } from '~/server/services/authStore';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requireApiKey: true,
            fixedCost: getFixedCost('authListApiKeys')
        },
        async ({ identity }) => {
            const records = listApiKeysByUser(identity.id);
            return {
                userId: identity.id,
                items: records.map((record) => ({
                    maskedKey: maskApiKey(record.key),
                    createdAt: record.created_at,
                    revokedAt: record.revoked_at,
                    expiresAt: record.expires_at,
                    dailyTokenLimit: record.daily_token_limit
                }))
            };
        }
    );
});
