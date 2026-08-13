import { defineEventHandler } from 'h3';
import { getOauthClients } from '~/server/domain/oauth';
import executeApi from '~/server/utils/api/executor/executeApi';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: ['api.auth.api-keys.read']
        },
        async ({ identity }) => getOauthClients(identity.id)
    );
});
