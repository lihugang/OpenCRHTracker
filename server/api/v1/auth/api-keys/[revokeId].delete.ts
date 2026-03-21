import { defineEventHandler, getRouterParam } from 'h3';
import { revokeApiKeyByRevokeIdAndUser } from '~/server/services/authStore';
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
            const revokeId = getRouterParam(event, 'revokeId');

            ensure(
                typeof revokeId === 'string' && revokeId.length > 0,
                400,
                'invalid_param',
                'revokeId 不能为空'
            );

            const revoked = revokeApiKeyByRevokeIdAndUser(
                revokeId,
                identity.id
            );
            if (!revoked) {
                throw new ApiRequestError(
                    404,
                    'not_found',
                    '未找到该 revokeId 对应的可撤销 API Key'
                );
            }

            return {
                userId: identity.id,
                revoked: true,
                revokeId
            };
        }
    );
});
