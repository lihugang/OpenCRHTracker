import { defineEventHandler, getRouterParam } from 'h3';
import { deleteAuthSubscription } from '~/server/domain/auth';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

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

            return deleteAuthSubscription(identity.id, subscriptionId);
        }
    );
});
