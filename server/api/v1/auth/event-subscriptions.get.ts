import { defineEventHandler } from 'h3';
import { listUserEventSubscriptions } from '~/server/services/userEventSubscriptionStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import { createEventSubscriptionListResponse } from '~/server/utils/auth/eventSubscriptions';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.auth.subscriptions.read]
        },
        async ({ identity }) => {
            return createEventSubscriptionListResponse(
                identity.id,
                listUserEventSubscriptions(identity.id)
            );
        }
    );
});
