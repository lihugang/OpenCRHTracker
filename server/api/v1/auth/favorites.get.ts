import { defineEventHandler } from 'h3';
import useConfig from '~/server/config';
import { listUserFavoriteLookups } from '~/server/services/userProfileStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import type { AuthFavoritesResponse } from '~/types/auth';

export default defineEventHandler(async (event) => {
    const config = useConfig();

    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.auth.favorites.read]
        },
        async ({ identity }) => {
            const response: AuthFavoritesResponse = {
                userId: identity.id,
                maxEntries: config.user.favorites.maxEntries,
                items: listUserFavoriteLookups(identity.id)
            };

            return response;
        }
    );
});
