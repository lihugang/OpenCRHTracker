import { defineEventHandler, getRouterParam } from 'h3';
import { postAdminOauthClientRevokeTokens } from '~/server/domain/admin/oauth';
import executeApi from '~/server/utils/api/executor/executeApi';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.admin]
        },
        async () =>
            postAdminOauthClientRevokeTokens(
                getRouterParam(event, 'clientId') ?? ''
            )
    );
});
