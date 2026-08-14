import { listUserSubscriptions } from '~/server/services/userProfileStore';
import { sendPushNotificationToUser } from '~/server/services/pushNotificationService';
import type { NotificationPayload } from '~/types/notifications';

export async function postNotificationsSend(
    userId: string,
    body: NotificationPayload
) {
    const subscriptionCount = listUserSubscriptions(userId).length;
    const result = await sendPushNotificationToUser(userId, body);

    return {
        deliveredCount: result.deliveredCount,
        removedEndpointCount: result.removedEndpoints.length,
        hasSubscriptions: subscriptionCount > 0
    };
}
