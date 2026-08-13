import { defineEventHandler } from 'h3';
import { getAuthApiKeys } from '~/server/domain/auth';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.auth.apiKeys.read],
            fixedCost: getFixedCost('authListApiKeys')
        },
        async ({ identity }) => getAuthApiKeys(identity)
    );
});
