import { defineV2Operation } from '~/server/utils/api/v2/V2Types';
import {
    PostNotificationsSendRequestSchema,
    PostNotificationsSendDataSchema,
    PostNotificationsSendResponseSchema
} from '#shared/generated/proto/opencrh/v2/notifications_pb';
import { postNotificationsSendV2Adapter } from '~/server/utils/api/v2/adapters/notifications';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export const NOTIFICATIONS_MANIFEST_ENTRIES = {
    PostNotificationsSend: defineV2Operation({
        operationName: 'PostNotificationsSend',
        method: 'POST',
        pathTemplate: '/api/v2/notifications/send',
        requestSchema: PostNotificationsSendRequestSchema,
        dataSchema: PostNotificationsSendDataSchema,
        responseSchema: PostNotificationsSendResponseSchema,
        requiredScopes: [API_SCOPES.notifications.send],
        cors: false,
        cost: { kind: 'none' },
        bodyMode: 'required',
        handler: postNotificationsSendV2Adapter
    })
} as const;
