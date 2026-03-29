import { defineEventHandler } from 'h3';
import { revokeApiKeysByIssuer } from '~/server/services/authStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import type { AdminRevokeAllWebappTokensResponse } from '~/types/admin';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.admin]
        },
        async ({ identity }) => {
            const result = revokeApiKeysByIssuer('webapp');

            const response: AdminRevokeAllWebappTokensResponse = {
                issuer: 'webapp',
                revokedCount: result.revokedCount,
                revokedAt: result.revokedAt,
                revokedCurrentSession: identity.issuer === 'webapp'
            };

            return response;
        }
    );
});
