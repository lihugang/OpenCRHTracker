import { defineEventHandler, getRouterParam } from 'h3';
import { deleteAuthAuthorization } from '~/server/domain/auth';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

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

            return deleteAuthAuthorization(identity.id, clientId);
        }
    );
});
