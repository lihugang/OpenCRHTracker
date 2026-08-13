import { defineEventHandler } from 'h3';
import { postAdminWebappTokensRevokeAll } from '~/server/domain/admin/webappTokens';
import executeApi from '~/server/utils/api/executor/executeApi';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.admin]
        },
        async ({ identity }) => postAdminWebappTokensRevokeAll(identity)
    );
});
