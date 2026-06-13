import { defineEventHandler, readBody } from 'h3';
import { sendPushNotificationToUser } from '~/server/services/pushNotificationService';
import { listUserSubscriptions } from '~/server/services/userProfileStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import type { NotificationPayload } from '~/types/notifications';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.notifications.send]
        },
        async ({ identity }) => {
            const body =
                (await readBody<NotificationPayload | null>(event)) ?? null;
            ensure(
                typeof body === 'object' && body !== null,
                400,
                'invalid_param',
                '请求体必须是通知 payload 对象'
            );

            const subscriptionCount = listUserSubscriptions(identity.id).length;
            const result = await sendPushNotificationToUser(identity.id, body);

            return {
                deliveredCount: result.deliveredCount,
                removedEndpointCount: result.removedEndpoints.length,
                hasSubscriptions: subscriptionCount > 0
            };
        }
    );
});
