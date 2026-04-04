import { defineEventHandler, getRouterParam, readBody } from 'h3';
import useConfig from '~/server/config';
import { renameUserSubscription } from '~/server/services/userProfileStore';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import ensurePayloadStringLength from '~/server/utils/api/payload/ensurePayloadStringLength';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import {
    createSubscriptionListResponse,
    getSubscriptionNameMaxLength,
    normalizeSubscriptionName
} from '~/server/utils/auth/subscriptions';

interface PatchSubscriptionBody {
    name?: unknown;
}

export default defineEventHandler(async (event) => {
    const nameMaxLength = getSubscriptionNameMaxLength();

    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.auth.subscriptions.write],
            fixedCost: getFixedCost('authUpdateSubscription')
        },
        async ({ identity }) => {
            const config = useConfig();
            const subscriptionId = getRouterParam(event, 'id');
            const body = (await readBody<PatchSubscriptionBody | null>(event)) ?? {};

            ensure(
                typeof subscriptionId === 'string' && subscriptionId.length > 0,
                400,
                'invalid_param',
                'id 不能为空'
            );
            ensure(
                typeof body === 'object' &&
                    body !== null &&
                    !Array.isArray(body),
                400,
                'invalid_param',
                '请求体必须是 JSON 对象'
            );
            ensure(
                typeof body.name === 'string',
                400,
                'invalid_param',
                'name 必须是字符串'
            );
            ensurePayloadStringLength(
                body.name,
                'name',
                Math.min(nameMaxLength, config.api.payload.maxStringLength)
            );

            const items = renameUserSubscription(
                identity.id,
                subscriptionId,
                normalizeSubscriptionName(body.name)
            );

            return createSubscriptionListResponse(identity.id, items);
        }
    );
});
