import type ApiIdentity from '~/server/utils/api/identity/ApiIdentity';
import hasScope from '~/server/utils/api/scopes/hasScope';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import type { FeedbackVisibility } from '~/types/feedback';

export interface FeedbackTopicAccessTarget {
    creatorUserId: string | null;
    visibility: FeedbackVisibility;
    deletedAt: number | null;
}

export function canManageFeedback(identity: ApiIdentity) {
    return hasScope(identity.scopes, API_SCOPES.feedback.manage);
}

export function isFeedbackOwner(
    identity: ApiIdentity,
    topic: Pick<FeedbackTopicAccessTarget, 'creatorUserId'>
) {
    return identity.type === 'user' && topic.creatorUserId === identity.id;
}

export function canViewFeedbackTopic(
    identity: ApiIdentity,
    topic: FeedbackTopicAccessTarget
) {
    if (topic.deletedAt !== null) {
        return canManageFeedback(identity);
    }

    if (topic.visibility === 'public') {
        return true;
    }

    return canManageFeedback(identity) || isFeedbackOwner(identity, topic);
}

export function canReplyFeedbackTopic(
    identity: ApiIdentity,
    topic: FeedbackTopicAccessTarget
) {
    if (topic.deletedAt !== null || identity.type !== 'user') {
        return false;
    }

    if (canManageFeedback(identity)) {
        return true;
    }

    if (topic.visibility === 'public') {
        return true;
    }

    return isFeedbackOwner(identity, topic);
}
