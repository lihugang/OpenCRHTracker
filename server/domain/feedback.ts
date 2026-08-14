import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import useConfig from '~/server/config';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import {
    appendFeedbackSystemMessage,
    buildFeedbackTopicDetail,
    createFeedbackMessage,
    createFeedbackTopic,
    getFeedbackTopicById,
    hideFeedbackTopic,
    isValidFeedbackCategory,
    isValidFeedbackStatus,
    listAllFeedbackTopics,
    listFeedbackMessagesByTopicId,
    listMyFeedbackTopics,
    listPublicFeedbackTopics,
    parseFeedbackTopicCursor,
    updateFeedbackTopicFields
} from '~/server/services/feedbackStore';
import { autoSubscribeFeedbackTopic } from '~/server/services/eventNotificationService';
import {
    notifyFeedbackReply,
    notifyFeedbackStatusUpdated
} from '~/server/services/eventNotificationService';
import {
    canManageFeedback,
    canReadFeedback,
    canReplyFeedbackApi,
    canReplyFeedbackTopic,
    canViewFeedbackTopic,
    isFeedbackOwner
} from '~/server/utils/feedback/permissions';
import {
    ensureFeedbackString,
    parseFeedbackTopicId
} from '~/server/utils/feedback/request';
import type ApiIdentity from '~/server/utils/api/identity/ApiIdentity';
import type {
    FeedbackPrimaryType,
    FeedbackSecondaryType,
    FeedbackStatus,
    FeedbackTitleMode,
    FeedbackVisibility
} from '~/types/feedback';
import {
    getFeedbackCategoryLabel,
    getFeedbackStatusLabel
} from '~/utils/feedback/catalog';
import { buildFeedbackAutoTitle } from '~/utils/feedback/topic';

export function getFeedbackTopics(
    identity: ApiIdentity,
    input: {
        view: 'public' | 'mine' | 'all';
        primaryType: FeedbackPrimaryType | '';
        secondaryType: FeedbackSecondaryType | '';
        status: FeedbackStatus | '';
        cursor: ReturnType<typeof parseFeedbackTopicCursor>;
        limit: number;
    }
) {
    const filters = {
        primaryType: input.primaryType,
        secondaryType: input.secondaryType,
        status: input.status
    };

    if (input.view === 'all') {
        if (!canManageFeedback(identity)) {
            throw new ApiRequestError(
                403,
                'forbidden_scope',
                '当前身份无法查看全部反馈'
            );
        }
        const result = listAllFeedbackTopics(
            filters,
            input.cursor,
            input.limit
        );
        return {
            view: 'all',
            ...filters,
            limit: input.limit,
            nextCursor: result.nextCursor,
            items: result.items
        };
    }

    if (!canReadFeedback(identity)) {
        throw new ApiRequestError(
            403,
            'forbidden_scope',
            '当前身份无法查看反馈'
        );
    }

    if (input.view === 'mine') {
        if (identity.type !== 'user') {
            throw new ApiRequestError(
                403,
                'forbidden_scope',
                '当前身份无法查看我的反馈'
            );
        }
        const result = listMyFeedbackTopics(
            identity.id,
            filters,
            input.cursor,
            input.limit
        );
        return {
            view: 'mine',
            ...filters,
            limit: input.limit,
            nextCursor: result.nextCursor,
            items: result.items
        };
    }

    const result = listPublicFeedbackTopics(filters, input.cursor, input.limit);
    return {
        view: 'public',
        ...filters,
        limit: input.limit,
        nextCursor: result.nextCursor,
        items: result.items
    };
}

export function postFeedbackTopics(
    identity: ApiIdentity,
    input: {
        primaryType: FeedbackPrimaryType;
        secondaryType: FeedbackSecondaryType;
        visibility: FeedbackVisibility;
        body: string;
    }
) {
    const config = useConfig();
    const content = ensureFeedbackString(
        input.body,
        'body',
        config.api.feedback.validation.createBody.minLength,
        config.api.feedback.validation.createBody.maxLength
    );
    const isSecurityIssue =
        input.primaryType === 'website' && input.secondaryType === 'security';
    const requestedVisibility = isSecurityIssue ? 'private' : input.visibility;

    if (identity.type !== 'user' && requestedVisibility !== 'public') {
        throw new ApiRequestError(
            403,
            'forbidden_scope',
            isSecurityIssue
                ? '安全问题反馈需要登录后提交'
                : '游客仅可提交公开反馈'
        );
    }

    const title = buildFeedbackAutoTitle(
        input.primaryType,
        input.secondaryType
    );
    const now = getNowSeconds();
    const topicId = createFeedbackTopic({
        creatorUserId: identity.type === 'user' ? identity.id : null,
        creatorType: identity.type === 'user' ? 'user' : 'guest',
        visibility: requestedVisibility,
        primaryType: input.primaryType,
        secondaryType: input.secondaryType,
        status: 'pending' satisfies FeedbackStatus,
        title,
        titleMode: 'auto',
        body: content,
        now
    });

    if (identity.type === 'user') {
        autoSubscribeFeedbackTopic(identity.id, topicId);
    }

    return {
        id: topicId,
        title
    };
}

export function getFeedbackTopic(identity: ApiIdentity, topicId: number) {
    if (!canReadFeedback(identity)) {
        throw new ApiRequestError(
            403,
            'forbidden_scope',
            '当前身份无法查看反馈'
        );
    }

    const topic = getFeedbackTopicById(topicId);
    if (!topic) {
        throw new ApiRequestError(404, 'not_found', '反馈不存在');
    }

    const accessTarget = {
        creatorUserId: topic.row.creator_user_id,
        visibility: topic.row.visibility,
        deletedAt: topic.row.deleted_at
    };

    if (!canViewFeedbackTopic(identity, accessTarget)) {
        throw new ApiRequestError(404, 'not_found', '反馈不存在');
    }

    const detail = buildFeedbackTopicDetail(
        topic,
        listFeedbackMessagesByTopicId(topicId),
        {
            canReply: canReplyFeedbackTopic(identity, accessTarget),
            canManage: canManageFeedback(identity),
            isOwner: isFeedbackOwner(identity, accessTarget)
        }
    );

    if (!detail) {
        throw new ApiRequestError(404, 'not_found', '反馈不存在');
    }

    return detail;
}

export async function patchFeedbackTopic(
    identity: ApiIdentity,
    topicId: number,
    body: {
        primaryType?: unknown;
        secondaryType?: unknown;
        status?: unknown;
        title?: unknown;
    }
) {
    const config = useConfig();
    if (!canManageFeedback(identity)) {
        throw new ApiRequestError(
            403,
            'forbidden_scope',
            '当前身份无法管理反馈'
        );
    }

    const topic = getFeedbackTopicById(topicId);
    if (!topic || topic.row.deleted_at !== null) {
        throw new ApiRequestError(404, 'not_found', '反馈不存在');
    }

    if (
        typeof body.primaryType !== 'string' ||
        typeof body.secondaryType !== 'string' ||
        !isValidFeedbackCategory(body.primaryType, body.secondaryType)
    ) {
        throw new ApiRequestError(400, 'invalid_param', '反馈分类无效');
    }
    if (
        typeof body.status !== 'string' ||
        !isValidFeedbackStatus(body.status)
    ) {
        throw new ApiRequestError(400, 'invalid_param', '反馈状态无效');
    }

    const primaryType = body.primaryType as FeedbackPrimaryType;
    const secondaryType = body.secondaryType as FeedbackSecondaryType;
    const status = body.status as FeedbackStatus;
    let title = topic.row.title;
    let titleMode = topic.row.title_mode as FeedbackTitleMode;
    const changes: string[] = [];

    if (typeof body.title === 'string') {
        const nextTitle = ensureFeedbackString(
            body.title,
            'title',
            config.api.feedback.validation.title.minLength,
            config.api.feedback.validation.title.maxLength
        );
        if (nextTitle !== topic.row.title) {
            title = nextTitle;
            titleMode = 'custom';
            changes.push(`管理员已将标题修改为 ${nextTitle}。`);
        }
    }

    if (
        topic.row.primary_type !== primaryType ||
        topic.row.secondary_type !== secondaryType
    ) {
        changes.push(
            `分类已被设为 ${getFeedbackCategoryLabel(primaryType, secondaryType)}。`
        );
        if (titleMode === 'auto') {
            title = buildFeedbackAutoTitle(primaryType, secondaryType);
        }
    }

    if (topic.row.status !== status) {
        changes.push(`状态已被设置为 ${getFeedbackStatusLabel(status)}。`);
    }

    if (changes.length === 0) {
        return {
            id: topicId,
            primaryType: topic.row.primary_type,
            secondaryType: topic.row.secondary_type,
            status: topic.row.status,
            title: topic.row.title,
            titleMode: topic.row.title_mode,
            updatedAt: topic.row.updated_at
        };
    }

    const now = getNowSeconds();
    updateFeedbackTopicFields({
        topicId,
        primaryType,
        secondaryType,
        status,
        title,
        titleMode,
        now
    });
    appendFeedbackSystemMessage(
        topicId,
        changes.join(' '),
        {
            event: 'topic_updated',
            previous: {
                primaryType: topic.row.primary_type,
                secondaryType: topic.row.secondary_type,
                status: topic.row.status,
                title: topic.row.title,
                titleMode: topic.row.title_mode
            },
            next: {
                primaryType,
                secondaryType,
                status,
                title,
                titleMode
            }
        },
        now
    );
    if (topic.row.status !== status) {
        await notifyFeedbackStatusUpdated(topicId, title, status, {
            creatorUserId: topic.row.creator_user_id,
            visibility: topic.row.visibility,
            deletedAt: topic.row.deleted_at
        });
    }

    return {
        id: topicId,
        primaryType,
        secondaryType,
        status,
        title,
        titleMode,
        updatedAt: now
    };
}

export function deleteFeedbackTopic(identity: ApiIdentity, topicId: number) {
    if (!canManageFeedback(identity)) {
        throw new ApiRequestError(
            403,
            'forbidden_scope',
            '当前身份无法管理反馈'
        );
    }

    const topic = getFeedbackTopicById(topicId);
    if (!topic || topic.row.deleted_at !== null) {
        throw new ApiRequestError(404, 'not_found', '反馈不存在');
    }

    if (topic.row.visibility === 'private') {
        return {
            id: topicId,
            visibility: 'private',
            updatedAt: topic.row.updated_at
        };
    }

    const now = getNowSeconds();
    hideFeedbackTopic(topicId, now);
    appendFeedbackSystemMessage(
        topicId,
        '管理员已将该反馈设为不公开。',
        {
            event: 'topic_hidden'
        },
        now
    );

    return {
        id: topicId,
        visibility: 'private',
        updatedAt: now
    };
}

export async function postFeedbackTopicMessage(
    identity: ApiIdentity,
    topicId: number,
    body: string,
    meta: Record<string, unknown> | undefined
) {
    const config = useConfig();
    if (!canReplyFeedbackApi(identity)) {
        throw new ApiRequestError(
            403,
            'forbidden_scope',
            '当前身份无法发送回复'
        );
    }

    const topic = getFeedbackTopicById(topicId);
    if (!topic) {
        throw new ApiRequestError(404, 'not_found', '反馈不存在');
    }

    const accessTarget = {
        creatorUserId: topic.row.creator_user_id,
        visibility: topic.row.visibility,
        deletedAt: topic.row.deleted_at
    };

    if (!canViewFeedbackTopic(identity, accessTarget)) {
        throw new ApiRequestError(404, 'not_found', '反馈不存在');
    }
    if (!canReplyFeedbackTopic(identity, accessTarget)) {
        throw new ApiRequestError(
            403,
            'forbidden_scope',
            '当前身份无法在该反馈下回复'
        );
    }

    const content = ensureFeedbackString(
        body,
        'body',
        config.api.feedback.validation.replyBody.minLength,
        config.api.feedback.validation.replyBody.maxLength
    );
    const now = getNowSeconds();
    const isAdmin = canManageFeedback(identity);
    const authorType = isAdmin
        ? 'admin'
        : topic.row.creator_user_id !== null &&
            identity.id === topic.row.creator_user_id
          ? 'topicCreator'
          : 'user';
    const messageId = createFeedbackMessage({
        topicId,
        authorUserId: identity.id,
        authorType,
        body: content,
        now,
        meta
    });
    await notifyFeedbackReply(
        topicId,
        topic.row.title,
        isAdmin
            ? identity.id
            : topic.row.creator_user_id !== null &&
                identity.id === topic.row.creator_user_id
              ? '反馈提出者'
              : identity.id,
        identity.id,
        messageId,
        accessTarget
    );

    return {
        topicId,
        messageId
    };
}
