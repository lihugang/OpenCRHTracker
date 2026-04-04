import type { NotificationPayload } from '~/types/notifications';

export function buildDeviceRegistrationSucceededNotification(): NotificationPayload {
    return {
        title: '订阅成功',
        body: '当前设备已可以接收 Open CRH Tracker 推送通知。',
        url: '/dashboard?panel=subscriptions',
        tag: 'ocrh:device-registered'
    };
}
