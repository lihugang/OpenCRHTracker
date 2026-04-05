import type { NotificationPayload } from '~/types/notifications';

export function buildFeedbackReplyNotification(
    topicId: number,
    topicTitle: string,
    authorName: string,
    messageId: number
): NotificationPayload {
    return {
        title: '新回复 | Open CRH Tracker',
        body: `${authorName} 回复了「${topicTitle}」。`,
        url: `/feedback/${topicId}`,
        tag: `ocrh:feedback:${topicId}:reply:${messageId}`
    };
}
