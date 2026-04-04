import type { NotificationPayload } from '~/types/notifications';

export function buildFeedbackReplyNotification(
    topicId: number,
    topicTitle: string,
    authorName: string,
    messageId: number
): NotificationPayload {
    return {
        title: '反馈有新回复',
        body: `${authorName} 回复了「${topicTitle}」。`,
        url: `/feedback/${topicId}`,
        tag: `ocrh:feedback:${topicId}:reply:${messageId}`
    };
}
