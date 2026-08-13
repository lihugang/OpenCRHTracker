import { defineEventHandler, getRouterParam } from 'h3';
import { getOauthClient } from '~/server/domain/oauth';
import executeApi from '~/server/utils/api/executor/executeApi';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: ['api.auth.api-keys.read']
        },
        async ({ identity }) =>
            getOauthClient(identity.id, getRouterParam(event, 'clientId') ?? '')
    );
});
