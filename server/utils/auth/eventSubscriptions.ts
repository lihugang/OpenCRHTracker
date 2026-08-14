import useConfig from '~/server/config';
import { getFeedbackTopicById } from '~/server/services/feedbackStore';
import type { UserEventSubscriptionItem } from '~/server/services/userEventSubscriptionStore';
import type {
    AuthEventSubscriptionItem,
    AuthEventSubscriptionListResult
} from '~/server/types/authTargets';
import { buildAuthEventTargetPath } from '~/server/utils/auth/eventTargets';
import {
    formatExternalEmuCode,
    formatExternalTrainCode
} from '~/server/utils/internal/boundaries';

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
    if (item.kind === 'train') {
        return {
            canView: true,
            label: `车次 ${formatExternalTrainCode(item.trainCode)}`
        };
    }

    if (item.kind === 'emu') {
        return {
            canView: true,
            label: `车组 ${formatExternalEmuCode(item.emuId)}`
        };
    }

    const resolved = canViewFeedbackSubscription(userId, item.topicId);
    return {
        canView: resolved.canView,
        label:
            resolved.title.trim().length > 0
                ? `反馈：${resolved.title}`
                : `反馈 #${item.topicId}`
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
        target:
            item.kind === 'train'
                ? { kind: 'train', trainCode: item.trainCode }
                : item.kind === 'emu'
                  ? { kind: 'emu', emuId: item.emuId }
                  : { kind: 'feedback', topicId: item.topicId },
        label: resolved.label,
        path: buildAuthEventTargetPath(item),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
    };
}

export function createEventSubscriptionListResponse(
    userId: string,
    items: UserEventSubscriptionItem[]
): AuthEventSubscriptionListResult {
    return {
        userId,
        maxEntries: useConfig().user.pushSubscriptions.maxEventSubscriptions,
        items: items
            .map((item) => toPublicEventSubscriptionItem(userId, item))
            .filter((item): item is AuthEventSubscriptionItem => item !== null)
    };
}
