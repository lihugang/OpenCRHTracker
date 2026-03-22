import { defineEventHandler } from 'h3';
import { maskApiKey } from '~/server/services/authStore';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import getQuotaSummary from '~/server/utils/api/quota/getQuotaSummary';
import type { AuthMeResponse } from '~/types/auth';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            cors: true,
            requiredScopes: [API_SCOPES.auth.me],
            fixedCost: getFixedCost('authMe')
        },
        async ({ identity }) => {
            const response: AuthMeResponse = {
                user: {
                    userId: identity.id
                },
                apiKey: {
                    revokeId: identity.revokeId ?? '',
                    issuer: identity.issuer ?? 'webapp',
                    maskedApiKey: maskApiKey(identity.apiKey ?? ''),
                    activeFrom: identity.activeFrom ?? 0,
                    expiresAt: identity.expiresAt ?? 0,
                    dailyTokenLimit:
                        identity.dailyTokenLimit ?? identity.tokenLimit,
                    scopes: identity.scopes
                },
                quota: getQuotaSummary(identity)
            };

            return response;
        }
    );
});
