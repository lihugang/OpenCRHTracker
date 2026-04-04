import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import {
    listUserSubscriptions,
    removeUserSubscriptionsByEndpoints,
    type UserProfileSubscriptionItem
} from '~/server/services/userProfileStore';
import { previewSubscriptionEndpoint } from '~/server/utils/auth/subscriptions';
import type { NotificationPayload } from '~/types/notifications';

interface WebPushLike {
    setVapidDetails(
        subject: string,
        publicKey: string,
        privateKey: string
    ): void;
    sendNotification(
        subscription: {
            endpoint: string;
            expirationTime: number | null;
            keys: {
                p256dh: string;
                auth: string;
            };
        },
        payload: string
    ): Promise<unknown>;
}

interface PushSendResult {
    delivered: boolean;
    hardInvalid: boolean;
    message: string;
}

interface WebPushClientResolution {
    client: WebPushLike | null;
    failureMessage: string;
}

const logger = getLogger('push-notification');
const WEB_PUSH_MODULE_SPECIFIER = 'web-push';
let webPushPromise: Promise<WebPushClientResolution> | null = null;

function getPushErrorMessage(error: unknown) {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

function getPushErrorStatusCode(error: unknown) {
    if (
        typeof error === 'object' &&
        error !== null &&
        'statusCode' in error &&
        typeof error.statusCode === 'number'
    ) {
        return error.statusCode;
    }

    return null;
}

function isHardInvalidPushError(error: unknown) {
    const statusCode = getPushErrorStatusCode(error);
    if (statusCode === 404 || statusCode === 410) {
        return true;
    }

    const message = getPushErrorMessage(error).toLowerCase();
    if (
        statusCode === 400 &&
        (message.includes('invalid') ||
            message.includes('expired') ||
            message.includes('not found') ||
            message.includes('gone'))
    ) {
        return true;
    }

    return false;
}

async function getWebPushClient() {
    if (webPushPromise) {
        return webPushPromise;
    }

    webPushPromise = (async () => {
        const config = useConfig();
        if (
            config.user.push.vapidPublicKey.trim().length === 0 ||
            config.user.push.vapidPrivateKey.trim().length === 0
        ) {
            logger.warn('push_disabled_missing_vapid_keys');
            return {
                client: null,
                failureMessage: 'missing_vapid_keys'
            } satisfies WebPushClientResolution;
        }

        try {
            const importedModule = (await import(
                WEB_PUSH_MODULE_SPECIFIER
            )) as Partial<WebPushLike> & { default?: WebPushLike };
            const webPush = importedModule.default ?? importedModule;

            if (
                typeof webPush.setVapidDetails !== 'function' ||
                typeof webPush.sendNotification !== 'function'
            ) {
                throw new Error('Invalid web-push module export');
            }

            webPush.setVapidDetails(
                'mailto:push@opencrhtracker.local',
                config.user.push.vapidPublicKey,
                config.user.push.vapidPrivateKey
            );

            return {
                client: webPush as WebPushLike,
                failureMessage: ''
            } satisfies WebPushClientResolution;
        } catch (error) {
            const message = getPushErrorMessage(error);
            logger.error(`push_client_init_failed message=${message}`);
            return {
                client: null,
                failureMessage: `web_push_init_failed:${message}`
            } satisfies WebPushClientResolution;
        }
    })();

    return webPushPromise;
}

function removeInvalidSubscriptions(
    userId: string,
    endpoints: readonly string[],
    context: 'single' | 'batch'
) {
    try {
        removeUserSubscriptionsByEndpoints(userId, endpoints);

        if (context === 'single' && endpoints[0]) {
            logger.info(
                `push_subscription_removed_invalid userId=${userId} endpoint=${previewSubscriptionEndpoint(endpoints[0])}`
            );
            return;
        }

        logger.info(
            `push_subscription_removed_invalid_batch userId=${userId} endpoints=${JSON.stringify(endpoints.map((endpoint) => previewSubscriptionEndpoint(endpoint)))}`
        );
    } catch (error) {
        logger.error(
            `push_subscription_cleanup_failed userId=${userId} context=${context} message=${getPushErrorMessage(error)}`
        );
    }
}

function toStoredPushSubscription(item: UserProfileSubscriptionItem): {
    endpoint: string;
    expirationTime: number | null;
    keys: {
        p256dh: string;
        auth: string;
    };
} {
    return {
        endpoint: item.endpoint,
        expirationTime: item.expirationTime,
        keys: {
            p256dh: item.keys.p256dh,
            auth: item.keys.auth
        }
    };
}

async function sendPushNotificationToStoredSubscription(
    item: UserProfileSubscriptionItem,
    payload: NotificationPayload
): Promise<PushSendResult> {
    const clientResolution = await getWebPushClient();
    if (!clientResolution.client) {
        return {
            delivered: false,
            hardInvalid: false,
            message: clientResolution.failureMessage
        };
    }

    try {
        await clientResolution.client.sendNotification(
            toStoredPushSubscription(item),
            JSON.stringify(payload)
        );

        return {
            delivered: true,
            hardInvalid: false,
            message: ''
        };
    } catch (error) {
        return {
            delivered: false,
            hardInvalid: isHardInvalidPushError(error),
            message: getPushErrorMessage(error)
        };
    }
}

export async function sendPushNotificationToSubscription(
    userId: string,
    item: UserProfileSubscriptionItem,
    payload: NotificationPayload
) {
    const result = await sendPushNotificationToStoredSubscription(
        item,
        payload
    );
    if (!result.hardInvalid) {
        if (!result.delivered && result.message.length > 0) {
            logger.warn(
                `push_send_failed_single userId=${userId} endpoint=${previewSubscriptionEndpoint(item.endpoint)} message=${result.message}`
            );
        }
        return result;
    }

    removeInvalidSubscriptions(userId, [item.endpoint], 'single');
    return result;
}

export async function sendPushNotificationToUser(
    userId: string,
    payload: NotificationPayload
) {
    const items = listUserSubscriptions(userId);
    if (items.length === 0) {
        return {
            deliveredCount: 0,
            removedEndpoints: [] as string[]
        };
    }

    const results = await Promise.all(
        items.map(async (item) => ({
            endpoint: item.endpoint,
            result: await sendPushNotificationToStoredSubscription(
                item,
                payload
            )
        }))
    );
    const removedEndpoints = results
        .filter((item) => item.result.hardInvalid)
        .map((item) => item.endpoint);

    if (removedEndpoints.length > 0) {
        removeInvalidSubscriptions(userId, removedEndpoints, 'batch');
    }

    for (const item of results) {
        if (!item.result.delivered && !item.result.hardInvalid) {
            logger.warn(
                `push_send_failed userId=${userId} endpoint=${previewSubscriptionEndpoint(item.endpoint)} message=${item.result.message}`
            );
        }
    }

    return {
        deliveredCount: results.filter((item) => item.result.delivered).length,
        removedEndpoints
    };
}
