import { defineEventHandler, readBody } from 'h3';
import { postNotificationsSend } from '~/server/domain/notifications';
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

            return postNotificationsSend(identity.id, body);
        }
    );
});
