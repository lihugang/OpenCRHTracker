import { defineEventHandler, getHeader, readBody } from 'h3';
import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import {
    listUserSubscriptions,
    upsertUserSubscription
} from '~/server/services/userProfileStore';
import { sendPushNotificationToSubscription } from '~/server/services/pushNotificationService';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import ensurePayloadStringLength from '~/server/utils/api/payload/ensurePayloadStringLength';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import {
    createSubscriptionListResponse,
    getSubscriptionNameMaxLength,
    normalizeSubscriptionName,
    previewSubscriptionEndpoint
} from '~/server/utils/auth/subscriptions';
import { buildDeviceRegistrationSucceededNotification } from '~/server/utils/notifications/templates/deviceRegistrationSucceeded';

interface PutSubscriptionBody {
    name?: unknown;
    subscription?: unknown;
}

interface PutSubscriptionValue {
    endpoint?: unknown;
    expirationTime?: unknown;
    keys?: unknown;
}

interface PutSubscriptionKeysValue {
    p256dh?: unknown;
    auth?: unknown;
}

const logger = getLogger('auth-subscriptions-api');

function getErrorMessage(error: unknown) {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

export default defineEventHandler(async (event) => {
    const nameMaxLength = getSubscriptionNameMaxLength();

    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.auth.subscriptions.write],
            fixedCost: getFixedCost('authUpsertSubscription')
        },
        async ({ identity }) => {
            const config = useConfig();
            const body =
                (await readBody<PutSubscriptionBody | null>(event)) ?? {};

            ensure(
                typeof body === 'object' &&
                    body !== null &&
                    !Array.isArray(body),
                400,
                'invalid_param',
                '请求体必须是 JSON 对象'
            );

            ensure(
                typeof body.subscription === 'object' &&
                    body.subscription !== null &&
                    !Array.isArray(body.subscription),
                400,
                'invalid_param',
                'subscription 必须是对象'
            );

            const subscription = body.subscription as PutSubscriptionValue;
            const keys =
                typeof subscription.keys === 'object' &&
                subscription.keys !== null &&
                !Array.isArray(subscription.keys)
                    ? (subscription.keys as PutSubscriptionKeysValue)
                    : null;

            ensure(
                typeof subscription.endpoint === 'string' &&
                    subscription.endpoint.trim().length > 0,
                400,
                'invalid_param',
                'subscription.endpoint 不能为空'
            );
            ensurePayloadStringLength(
                subscription.endpoint,
                'subscription.endpoint',
                config.api.payload.maxStringLength
            );

            ensure(
                keys !== null &&
                    typeof keys.p256dh === 'string' &&
                    keys.p256dh.trim().length > 0 &&
                    typeof keys.auth === 'string' &&
                    keys.auth.trim().length > 0,
                400,
                'invalid_param',
                'subscription.keys 必须包含 p256dh 和 auth'
            );
            ensurePayloadStringLength(
                keys.p256dh,
                'subscription.keys.p256dh',
                config.api.payload.maxStringLength
            );
            ensurePayloadStringLength(
                keys.auth,
                'subscription.keys.auth',
                config.api.payload.maxStringLength
            );

            ensure(
                subscription.expirationTime === undefined ||
                    subscription.expirationTime === null ||
                    (typeof subscription.expirationTime === 'number' &&
                        Number.isFinite(subscription.expirationTime) &&
                        Number.isInteger(subscription.expirationTime) &&
                        subscription.expirationTime > 0),
                400,
                'invalid_param',
                'subscription.expirationTime 必须是正整数时间戳或 null'
            );

            ensure(
                body.name === undefined || typeof body.name === 'string',
                400,
                'invalid_param',
                'name 必须是字符串'
            );

            if (typeof body.name === 'string') {
                ensurePayloadStringLength(
                    body.name,
                    'name',
                    Math.min(nameMaxLength, config.api.payload.maxStringLength)
                );
            }

            const result = upsertUserSubscription(
                identity.id,
                {
                    name: normalizeSubscriptionName(
                        typeof body.name === 'string' ? body.name : undefined
                    ),
                    endpoint: subscription.endpoint.trim(),
                    expirationTime:
                        typeof subscription.expirationTime === 'number'
                            ? subscription.expirationTime
                            : null,
                    keys: {
                        p256dh: keys.p256dh.trim(),
                        auth: keys.auth.trim()
                    }
                },
                getHeader(event, 'user-agent') ?? ''
            );

            if (result.action === 'created') {
                try {
                    const notificationResult =
                        await sendPushNotificationToSubscription(
                            identity.id,
                            result.item,
                            buildDeviceRegistrationSucceededNotification()
                        );

                    if (!notificationResult.delivered) {
                        logger.warn(
                            `subscription_registration_notification_failed userId=${identity.id} endpoint=${previewSubscriptionEndpoint(result.item.endpoint)} message=${notificationResult.message}`
                        );
                    }
                } catch (error) {
                    logger.error(
                        `subscription_registration_notification_failed_unexpected userId=${identity.id} endpoint=${previewSubscriptionEndpoint(result.item.endpoint)} message=${getErrorMessage(error)}`
                    );
                }
            }

            return createSubscriptionListResponse(
                identity.id,
                listUserSubscriptions(identity.id)
            );
        }
    );
});
