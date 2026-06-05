import { defineEventHandler, getRouterParam } from 'h3';
import { revokeOauthAuthorizationByUser } from '~/server/services/oauthStore';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import type { AuthAuthorizationRevokeResponse } from '~/types/auth';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.auth.authorizations.revoke],
            fixedCost: getFixedCost('authRevokeAuthorization')
        },
        async ({ identity }) => {
            const clientId = getRouterParam(event, 'clientId');

            ensure(
                typeof clientId === 'string' && clientId.length > 0,
                400,
                'invalid_param',
                'clientId 不能为空'
            );

            const revoked = revokeOauthAuthorizationByUser(identity.id, clientId);
            if (!revoked) {
                throw new ApiRequestError(404, 'not_found', '未找到该应用的授权记录');
            }

            const response: AuthAuthorizationRevokeResponse = {
                userId: identity.id,
                clientId,
                revoked: true
            };

            return response;
        }
    );
});
