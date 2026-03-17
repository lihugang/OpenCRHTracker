import { defineEventHandler } from 'h3';
import useConfig from '~/server/config';
import { maskApiKey } from '~/server/services/authStore';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import getRemainTokens from '~/server/utils/api/quota/getRemainTokens';
import type { AuthMeResponse } from '~/types/auth';

export default defineEventHandler(async (event) => {
    const config = useConfig();

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
                    keyId: identity.keyId ?? '',
                    issuer: identity.issuer ?? 'webapp',
                    maskedApiKey: maskApiKey(identity.apiKey ?? ''),
                    activeFrom: identity.activeFrom ?? 0,
                    expiresAt: identity.expiresAt ?? 0,
                    dailyTokenLimit:
                        identity.dailyTokenLimit ?? identity.tokenLimit,
                    scopes: identity.scopes
                },
                quota: {
                    tokenLimit: identity.tokenLimit,
                    remain: getRemainTokens(identity),
                    refillAmount: config.quota.refillAmount,
                    refillIntervalSeconds: config.quota.refillIntervalSeconds
                }
            };

            return response;
        }
    );
});
