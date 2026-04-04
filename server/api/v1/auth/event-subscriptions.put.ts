import { defineEventHandler, readBody } from 'h3';
import useConfig from '~/server/config';
import { upsertUserEventSubscription } from '~/server/services/userEventSubscriptionStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import ensurePayloadStringLength from '~/server/utils/api/payload/ensurePayloadStringLength';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import { createEventSubscriptionListResponse } from '~/server/utils/auth/eventSubscriptions';
import type { NotificationTargetType } from '~/types/notifications';
import { isNotificationTargetType } from '~/utils/notifications/target';

interface PutEventSubscriptionBody {
    targetType?: unknown;
    targetId?: unknown;
}

export default defineEventHandler(async (event) => {
    const config = useConfig();

    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.auth.subscriptions.write]
        },
        async ({ identity }) => {
            const body =
                (await readBody<PutEventSubscriptionBody | null>(event)) ?? {};

            ensure(
                typeof body === 'object' &&
                    body !== null &&
                    !Array.isArray(body),
                400,
                'invalid_param',
                '请求体必须是 JSON 对象'
            );
            ensure(
                isNotificationTargetType(body.targetType),
                400,
                'invalid_param',
                'targetType 必须是有效的订阅目标类型'
            );
            ensure(
                typeof body.targetId === 'string' &&
                    body.targetId.trim().length > 0,
                400,
                'invalid_param',
                'targetId 不能为空'
            );

            ensurePayloadStringLength(
                body.targetId,
                'targetId',
                config.api.payload.maxStringLength
            );

            return createEventSubscriptionListResponse(
                identity.id,
                upsertUserEventSubscription(identity.id, {
                    targetType: body.targetType as NotificationTargetType,
                    targetId: body.targetId
                })
            );
        }
    );
});
