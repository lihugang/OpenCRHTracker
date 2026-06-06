import { defineEventHandler, getRouterParam } from 'h3';
import { deleteOauthClientByOwner } from '~/server/services/oauthStore';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.auth.oauthClients.delete],
            fixedCost: getFixedCost('authDeleteOauthClient')
        },
        async ({ identity }) => {
            const clientId = getRouterParam(event, 'clientId') ?? '';
            const deleted = deleteOauthClientByOwner(clientId, identity.id);
            ensure(deleted, 404, 'not_found', 'OAuth 客户端不存在');
            return {
                deleted: true,
                clientId
            };
        }
    );
});
