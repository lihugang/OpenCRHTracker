import { defineEventHandler } from 'h3';
import useConfig from '~/server/config';
import { listOauthClientsByOwner } from '~/server/services/oauthStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import type { OAuthClientListResponse } from '~/types/auth';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: ['api.auth.api-keys.read']
        },
        async ({ identity }) => {
            const response: OAuthClientListResponse = {
                items: listOauthClientsByOwner(identity.id),
                allowedScopes: useConfig().api.permissions.creatableKeyMaxScopes
            };
            return response;
        }
    );
});
