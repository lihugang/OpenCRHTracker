import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

declare let self: ServiceWorkerGlobalScope;

const DEFAULT_NOTIFICATION_TITLE = '新通知';
const DEFAULT_NOTIFICATION_BODY = '这是一条来自 Open CRH Tracker 的推送通知';
const DEFAULT_NOTIFICATION_PATH = '/';

interface PushNotificationPayload {
    title?: unknown;
    body?: unknown;
    url?: unknown;
    tag?: unknown;
}

interface NotificationDataPayload {
    url: string;
}

function isPushNotificationPayload(
    value: unknown
): value is PushNotificationPayload {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeNotificationText(value: unknown, fallback: string) {
    if (typeof value !== 'string') {
        return fallback;
    }

    const normalized = value.trim();

    return normalized.length > 0 ? normalized : fallback;
}

function getDefaultNotificationUrl() {
    return new URL(DEFAULT_NOTIFICATION_PATH, self.location.origin).href;
}

function resolveNotificationUrl(value: unknown) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        return getDefaultNotificationUrl();
    }

    try {
        const resolvedUrl = new URL(value, self.location.origin);

        if (resolvedUrl.origin !== self.location.origin) {
            return getDefaultNotificationUrl();
        }

        return resolvedUrl.href;
    } catch {
        return getDefaultNotificationUrl();
    }
}

function parsePushNotificationPayload(
    event: PushEvent
): PushNotificationPayload {
    if (!event.data) {
        return {};
    }

    try {
        const json = event.data.json();

        if (isPushNotificationPayload(json)) {
            return json;
        }
    } catch {
        const text = event.data.text();

        return {
            body: normalizeNotificationText(text, DEFAULT_NOTIFICATION_BODY)
        };
    }

    return {};
}

async function openNotificationTarget(url: string) {
    const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
    });
    const sameOriginClient = windowClients.find((client) => {
        try {
            return new URL(client.url).origin === self.location.origin;
        } catch {
            return false;
        }
    });

    if (sameOriginClient) {
        const navigatedClient = await sameOriginClient
            .navigate(url)
            .catch(() => null);
        const focusTarget = navigatedClient ?? sameOriginClient;

        await focusTarget.focus();
        return;
    }

    await self.clients.openWindow(url);
}

self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.addEventListener('push', (event) => {
    const data = parsePushNotificationPayload(event);
    const title = normalizeNotificationText(
        data.title,
        DEFAULT_NOTIFICATION_TITLE
    );
    const options: NotificationOptions = {
        body: normalizeNotificationText(data.body, DEFAULT_NOTIFICATION_BODY),
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png',
        tag:
            typeof data.tag === 'string' && data.tag.trim().length > 0
                ? data.tag.trim()
                : undefined,
        data: {
            url: resolveNotificationUrl(data.url)
        } satisfies NotificationDataPayload
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const data = isPushNotificationPayload(event.notification.data)
        ? event.notification.data
        : {};

    event.waitUntil(openNotificationTarget(resolveNotificationUrl(data.url)));
});
