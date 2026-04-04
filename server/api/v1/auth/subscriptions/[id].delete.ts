import { defineEventHandler, getRouterParam } from 'h3';
import { removeUserSubscription } from '~/server/services/userProfileStore';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import { createSubscriptionListResponse } from '~/server/utils/auth/subscriptions';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.auth.subscriptions.write],
            fixedCost: getFixedCost('authDeleteSubscription')
        },
        async ({ identity }) => {
            const subscriptionId = getRouterParam(event, 'id');

            ensure(
                typeof subscriptionId === 'string' && subscriptionId.length > 0,
                400,
                'invalid_param',
                'id 不能为空'
            );

            return createSubscriptionListResponse(
                identity.id,
                removeUserSubscription(identity.id, subscriptionId)
            );
        }
    );
});
