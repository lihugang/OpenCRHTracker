import { defineEventHandler } from 'h3';
import { getUserPreference } from '~/server/services/userProfileStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import { createAuthSettingsResponse } from '~/server/utils/auth/settings';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.auth.settings.read]
        },
        async ({ identity }) => {
            return createAuthSettingsResponse(
                identity.id,
                getUserPreference(identity.id)
            );
        }
    );
});
