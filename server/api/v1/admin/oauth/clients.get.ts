import { defineEventHandler } from 'h3';
import { listAllOauthClients } from '~/server/services/oauthStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.admin]
        },
        async () => {
            return {
                items: listAllOauthClients()
            };
        }
    );
});
