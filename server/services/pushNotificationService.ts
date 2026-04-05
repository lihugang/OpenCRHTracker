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
const PUSH_ERROR_BODY_PREVIEW_MAX_LENGTH = 240;
const PUSH_ERROR_LOG_HEADER_NAMES = [
    'www-authenticate',
    'apns-id',
    'retry-after',
    'content-type',
    'date'
] as const;
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

function getPushErrorBody(error: unknown) {
    if (
        typeof error === 'object' &&
        error !== null &&
        'body' in error &&
        typeof error.body === 'string'
    ) {
        return error.body;
    }

    return '';
}

function getPushErrorHeaders(error: unknown) {
    if (
        typeof error === 'object' &&
        error !== null &&
        'headers' in error &&
        typeof error.headers === 'object' &&
        error.headers !== null &&
        !Array.isArray(error.headers)
    ) {
        return error.headers as Record<string, unknown>;
    }

    return null;
}

function previewPushErrorBody(body: string) {
    const normalized = body.trim().replace(/\s+/g, ' ');

    if (normalized.length <= PUSH_ERROR_BODY_PREVIEW_MAX_LENGTH) {
        return normalized;
    }

    return `${normalized.slice(0, PUSH_ERROR_BODY_PREVIEW_MAX_LENGTH)}...`;
}

function normalizePushErrorHeaderValue(value: unknown) {
    if (typeof value === 'string') {
        return value;
    }

    if (Array.isArray(value)) {
        return value
            .filter((item): item is string => typeof item === 'string')
            .join(', ');
    }

    return '';
}

function getPushErrorHeaderValue(
    headers: Record<string, unknown>,
    headerName: string
) {
    const matchedKey = Object.keys(headers).find(
        (key) => key.toLowerCase() === headerName.toLowerCase()
    );
    if (!matchedKey) {
        return '';
    }

    return normalizePushErrorHeaderValue(headers[matchedKey]).trim();
}

function getPushErrorHeaderSummary(error: unknown) {
    const headers = getPushErrorHeaders(error);
    if (!headers) {
        return '';
    }

    const summary: Record<string, string> = {};

    for (const headerName of PUSH_ERROR_LOG_HEADER_NAMES) {
        const value = getPushErrorHeaderValue(headers, headerName);
        if (value.length > 0) {
            summary[headerName] = value;
        }
    }

    if (Object.keys(summary).length === 0) {
        return '';
    }

    return JSON.stringify(summary);
}

function formatPushErrorForLog(error: unknown) {
    const message = getPushErrorMessage(error);
    const statusCode = getPushErrorStatusCode(error);
    const bodyPreview = previewPushErrorBody(getPushErrorBody(error));
    const headerSummary = getPushErrorHeaderSummary(error);
    const details = [message];

    if (statusCode !== null) {
        details.push(`statusCode=${statusCode}`);
    }

    if (bodyPreview.length > 0) {
        details.push(`body=${JSON.stringify(bodyPreview)}`);
    }

    if (headerSummary.length > 0) {
        details.push(`headers=${headerSummary}`);
    }

    return details.join(' ');
}

function getMissingVapidConfigParts(config: ReturnType<typeof useConfig>) {
    const missingParts: string[] = [];

    if (config.user.push.vapidPublicKey.trim().length === 0) {
        missingParts.push('public_key');
    }

    if (config.user.push.vapidPrivateKey.trim().length === 0) {
        missingParts.push('private_key');
    }

    if (config.user.push.vapidEmail.trim().length === 0) {
        missingParts.push('email');
    }

    return missingParts;
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
        const missingVapidConfigParts = getMissingVapidConfigParts(config);
        if (missingVapidConfigParts.length > 0) {
            logger.warn(
                `push_disabled_missing_vapid_config missing=${missingVapidConfigParts.join(',')}`
            );
            return {
                client: null,
                failureMessage: `missing_vapid_config:${missingVapidConfigParts.join(',')}`
            } satisfies WebPushClientResolution;
        }

        const vapidSubject = `mailto:${config.user.push.vapidEmail}`;

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
                vapidSubject,
                config.user.push.vapidPublicKey,
                config.user.push.vapidPrivateKey
            );

            return {
                client: webPush as WebPushLike,
                failureMessage: ''
            } satisfies WebPushClientResolution;
        } catch (error) {
            const message = formatPushErrorForLog(error);
            logger.error(
                `push_client_init_failed subject=${JSON.stringify(vapidSubject)} message=${message}`
            );
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
            message: formatPushErrorForLog(error)
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
