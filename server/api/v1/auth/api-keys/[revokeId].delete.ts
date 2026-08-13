import { defineEventHandler, getRouterParam } from 'h3';
import { deleteAuthApiKey } from '~/server/domain/auth';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
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

            return deleteAuthApiKey(identity.id, revokeId);
        }
    );
});
