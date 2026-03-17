import { defineEventHandler, getRouterParam } from 'h3';
import { revokeApiKeyByUser } from '~/server/services/authStore';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.auth.apiKeys.revoke],
            fixedCost: getFixedCost('authRevokeApiKey')
        },
        async ({ identity }) => {
            const keyId = getRouterParam(event, 'key');

            ensure(
                typeof keyId === 'string' && keyId.length > 0,
                400,
                'invalid_param',
                'A keyId is required'
            );

            const revoked = revokeApiKeyByUser(keyId, identity.id);
            if (!revoked) {
                throw new ApiRequestError(
                    404,
                    'not_found',
                    'No revocable key was found for this keyId'
                );
            }

            return {
                userId: identity.id,
                revoked: true,
                keyId
            };
        }
    );
});
