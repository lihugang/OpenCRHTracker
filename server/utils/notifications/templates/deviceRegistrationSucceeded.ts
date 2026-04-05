import type { NotificationPayload } from '~/types/notifications';

export function buildDeviceRegistrationSucceededNotification(): NotificationPayload {
    return {
        title: '订阅成功 | Open CRH Tracker',
        body: '您在此设备上的订阅启用成功，此设备将能收到来自 Open CRH Tracker 的通知。如需关闭，请前往个人账户页，点击订阅选项卡，并选择对应设备进行关闭。',
        url: '/dashboard?panel=subscriptions',
        tag: 'ocrh:device-registered'
    };
}
