import { defineEventHandler } from 'h3';
import { getAuthSettings } from '~/server/domain/auth';
import executeApi from '~/server/utils/api/executor/executeApi';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.auth.settings.read]
        },
        async ({ identity }) => getAuthSettings(identity.id)
    );
});
