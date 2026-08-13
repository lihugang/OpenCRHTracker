import { defineEventHandler } from 'h3';
import { getAuthSubscriptions } from '~/server/domain/auth';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.auth.subscriptions.read],
            fixedCost: getFixedCost('authListSubscriptions')
        },
        async ({ identity }) => getAuthSubscriptions(identity.id)
    );
});
