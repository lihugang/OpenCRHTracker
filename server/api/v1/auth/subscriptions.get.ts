import { defineEventHandler } from 'h3';
import { listUserSubscriptions } from '~/server/services/userProfileStore';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import { createSubscriptionListResponse } from '~/server/utils/auth/subscriptions';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.auth.subscriptions.read],
            fixedCost: getFixedCost('authListSubscriptions')
        },
        async ({ identity }) => {
            return createSubscriptionListResponse(
                identity.id,
                listUserSubscriptions(identity.id)
            );
        }
    );
});
