import useConfig from '~/server/config';
import { getFeedbackTopicById } from '~/server/services/feedbackStore';
import type { UserEventSubscriptionItem } from '~/server/services/userEventSubscriptionStore';
import type {
    AuthEventSubscriptionItem,
    AuthEventSubscriptionListResponse
} from '~/types/auth';
import { buildNotificationTargetPath } from '~/utils/notifications/target';

function canViewFeedbackSubscription(userId: string, topicId: number) {
    const topic = getFeedbackTopicById(topicId);
    if (!topic) {
        return {
            canView: false,
            title: `反馈 #${topicId}`
        };
    }

    const isAdmin = useConfig().user.adminUserIds.includes(userId);
    if (topic.row.deleted_at !== null && !isAdmin) {
        return {
            canView: false,
            title: topic.row.title
        };
    }

    if (
        topic.row.visibility === 'private' &&
        topic.row.creator_user_id !== userId &&
        !isAdmin
    ) {
        return {
            canView: false,
            title: topic.row.title
        };
    }

    return {
        canView: true,
        title: topic.row.title
    };
}

function resolveEventSubscriptionLabel(
    userId: string,
    item: UserEventSubscriptionItem
) {
    if (item.targetType === 'train') {
        return {
            canView: true,
            label: `车次 ${item.targetId}`
        };
    }

    if (item.targetType === 'emu') {
        return {
            canView: true,
            label: `车组 ${item.targetId}`
        };
    }

    const topicId = Number(item.targetId);
    if (!Number.isInteger(topicId) || topicId <= 0) {
        return {
            canView: false,
            label: `反馈 #${item.targetId}`
        };
    }

    const resolved = canViewFeedbackSubscription(userId, topicId);
    return {
        canView: resolved.canView,
        label:
            resolved.title.trim().length > 0
                ? `反馈：${resolved.title}`
                : `反馈 #${item.targetId}`
    };
}

function toPublicEventSubscriptionItem(
    userId: string,
    item: UserEventSubscriptionItem
): AuthEventSubscriptionItem | null {
    const resolved = resolveEventSubscriptionLabel(userId, item);
    if (!resolved.canView) {
        return null;
    }

    return {
        targetType: item.targetType,
        targetId: item.targetId,
        label: resolved.label,
        path: buildNotificationTargetPath(item),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
    };
}

export function createEventSubscriptionListResponse(
    userId: string,
    items: UserEventSubscriptionItem[]
): AuthEventSubscriptionListResponse {
    return {
        userId,
        maxEntries: useConfig().user.pushSubscriptions.maxEventSubscriptions,
        items: items
            .map((item) => toPublicEventSubscriptionItem(userId, item))
            .filter(
                (item): item is AuthEventSubscriptionItem => item !== null
            )
    };
}
