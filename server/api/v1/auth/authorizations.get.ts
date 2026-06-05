import { defineEventHandler } from 'h3';
import { listAuthorizedOauthAppsByUser } from '~/server/services/oauthStore';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import type { AuthAuthorizationListResponse } from '~/types/auth';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.auth.authorizations.read],
            fixedCost: getFixedCost('authListAuthorizations')
        },
        async ({ identity }) => {
            const response: AuthAuthorizationListResponse = {
                userId: identity.id,
                items: listAuthorizedOauthAppsByUser(identity.id)
            };

            return response;
        }
    );
});
