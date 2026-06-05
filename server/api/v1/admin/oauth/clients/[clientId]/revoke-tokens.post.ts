import { defineEventHandler, getRouterParam } from 'h3';
import { getOauthClientById } from '~/server/services/oauthStore';
import { revokeApiKeysByOauthClientId } from '~/server/services/authStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.admin]
        },
        async () => {
            const clientId = getRouterParam(event, 'clientId') ?? '';
            const client = getOauthClientById(clientId);
            ensure(client, 404, 'not_found', 'OAuth 客户端不存在');
            return revokeApiKeysByOauthClientId(clientId);
        }
    );
});
