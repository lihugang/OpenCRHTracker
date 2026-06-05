import { defineEventHandler, getRouterParam } from 'h3';
import { getOauthClientByIdAndOwner } from '~/server/services/oauthStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import type { OAuthClientMutationResponse } from '~/types/auth';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: ['api.auth.api-keys.read']
        },
        async ({ identity }) => {
            const clientId = getRouterParam(event, 'clientId') ?? '';
            const client = getOauthClientByIdAndOwner(clientId, identity.id);
            ensure(client, 404, 'not_found', 'OAuth 客户端不存在');
            const response: OAuthClientMutationResponse = {
                client
            };
            return response;
        }
    );
});
