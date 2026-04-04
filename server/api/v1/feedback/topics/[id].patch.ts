import { defineEventHandler, readBody } from 'h3';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import useConfig from '~/server/config';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import {
    appendFeedbackSystemMessage,
    getFeedbackTopicById,
    isValidFeedbackCategory,
    isValidFeedbackStatus,
    updateFeedbackTopicFields
} from '~/server/services/feedbackStore';
import { notifyFeedbackStatusUpdated } from '~/server/services/eventNotificationService';
import {
    ensureFeedbackString,
    parseFeedbackTopicId
} from '~/server/utils/feedback/request';
import type {
    FeedbackPrimaryType,
    FeedbackSecondaryType,
    FeedbackStatus,
    FeedbackTitleMode,
    UpdateFeedbackTopicResponse
} from '~/types/feedback';
import { buildFeedbackAutoTitle } from '~/utils/feedback/topic';

interface UpdateFeedbackTopicBody {
    primaryType?: unknown;
    secondaryType?: unknown;
    status?: unknown;
    title?: unknown;
}

export default defineEventHandler(async (event) => {
    const config = useConfig();
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.feedback.manage]
        },
        async () => {
            const topicId = parseFeedbackTopicId(event.context.params?.id);
            const topic = getFeedbackTopicById(topicId);

            if (!topic || topic.row.deleted_at !== null) {
                throw new ApiRequestError(404, 'not_found', '反馈不存在');
            }

            const body =
                (await readBody<UpdateFeedbackTopicBody | null>(event)) ?? {};

            ensure(
                typeof body === 'object' &&
                    body !== null &&
                    !Array.isArray(body),
                400,
                'invalid_param',
                '请求体必须是 JSON 对象'
            );
            ensure(
                typeof body.primaryType === 'string' &&
                    typeof body.secondaryType === 'string' &&
                    isValidFeedbackCategory(
                        body.primaryType,
                        body.secondaryType
                    ),
                400,
                'invalid_param',
                '反馈分类无效'
            );
            ensure(
                typeof body.status === 'string' &&
                    isValidFeedbackStatus(body.status),
                400,
                'invalid_param',
                '反馈状态无效'
            );

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
                    changes.push('管理员已修改标题。');
                }
            }

            if (
                topic.row.primary_type !== primaryType ||
                topic.row.secondary_type !== secondaryType
            ) {
                changes.push(
                    `管理员已调整分类为 ${primaryType}.${secondaryType || 'general'}。`
                );

                if (titleMode === 'auto') {
                    title = buildFeedbackAutoTitle(primaryType, secondaryType);
                }
            }

            if (topic.row.status !== status) {
                changes.push(`管理员已更新状态为 ${status}。`);
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
                } satisfies UpdateFeedbackTopicResponse;
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
            } satisfies UpdateFeedbackTopicResponse;
        }
    );
});
