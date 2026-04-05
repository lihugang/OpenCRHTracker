import type { FeedbackStatus } from '~/types/feedback';
import type { NotificationPayload } from '~/types/notifications';
import { getFeedbackStatusLabel } from '~/utils/feedback/catalog';

export function buildFeedbackStatusUpdatedNotification(
    topicId: number,
    topicTitle: string,
    status: FeedbackStatus
): NotificationPayload {
    return {
        title: '反馈状态已更新 | Open CRH Tracker',
        body: `「${topicTitle}」已更新为 ${getFeedbackStatusLabel(status)}。`,
        url: `/feedback/${topicId}`,
        tag: `ocrh:feedback:${topicId}:status:${status}`
    };
}

export function buildFeedbackHiddenNotification(
    topicId: number,
    topicTitle: string
): NotificationPayload {
    return {
        title: '反馈可见性已更新 | Open CRH Tracker',
        body: `「${topicTitle}」已被管理员设为不公开。`,
        url: `/feedback/${topicId}`,
        tag: `ocrh:feedback:${topicId}:visibility:hidden`
    };
}
