import { defineEventHandler, getRouterParam } from 'h3';
import { deleteOauthClientByOwner } from '~/server/services/oauthStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: ['api.auth.api-keys.revoke']
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
