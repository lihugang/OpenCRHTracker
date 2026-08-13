import { defineEventHandler, getRouterParam } from 'h3';
import { deleteOauthClient } from '~/server/domain/oauth';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.auth.oauthClients.delete],
            fixedCost: getFixedCost('authDeleteOauthClient')
        },
        async ({ identity }) =>
            deleteOauthClient(identity.id, getRouterParam(event, 'clientId') ?? '')
    );
});
