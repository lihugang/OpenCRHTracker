import { defineEventHandler } from 'h3';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import { createApiKey, maskApiKey } from '~/server/services/authStore';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requireApiKey: true,
            fixedCost: getFixedCost('authIssueApiKey')
        },
        async ({ identity }) => {
            const apiKey = createApiKey(identity.id);
            return {
                userId: identity.id,
                apiKey: apiKey.key,
                maskedApiKey: maskApiKey(apiKey.key),
                createdAt: apiKey.createdAt,
                expiresAt: apiKey.expiresAt,
                dailyTokenLimit: apiKey.dailyTokenLimit
            };
        }
    );
});
