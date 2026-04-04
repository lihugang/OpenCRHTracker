import { defineEventHandler, readBody } from 'h3';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import useConfig from '~/server/config';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import {
    createFeedbackMessage,
    getFeedbackTopicById
} from '~/server/services/feedbackStore';
import { notifyFeedbackReply } from '~/server/services/eventNotificationService';
import {
    canManageFeedback,
    canReplyFeedbackTopic,
    canViewFeedbackTopic
} from '~/server/utils/feedback/permissions';
import {
    ensureFeedbackString,
    parseFeedbackTopicId
} from '~/server/utils/feedback/request';
import type { ReplyFeedbackMessageResponse } from '~/types/feedback';

interface CreateFeedbackMessageBody {
    body?: unknown;
}

export default defineEventHandler(async (event) => {
    const config = useConfig();
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.feedback.reply]
        },
        async ({ identity }) => {
            const topicId = parseFeedbackTopicId(event.context.params?.id);
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

            ensure(
                canReplyFeedbackTopic(identity, accessTarget),
                403,
                'forbidden_scope',
                '当前身份无法在该反馈下回复'
            );

            const body =
                (await readBody<CreateFeedbackMessageBody | null>(event)) ?? {};
            ensure(
                typeof body === 'object' &&
                    body !== null &&
                    !Array.isArray(body),
                400,
                'invalid_param',
                '请求体必须是 JSON 对象'
            );

            const content = ensureFeedbackString(
                body.body,
                'body',
                config.api.feedback.validation.replyBody.minLength,
                config.api.feedback.validation.replyBody.maxLength
            );
            const now = getNowSeconds();
            const messageId = createFeedbackMessage({
                topicId,
                authorUserId: identity.id,
                authorType: canManageFeedback(identity)
                    ? 'admin'
                    : topic.row.creator_user_id !== null &&
                        identity.id === topic.row.creator_user_id
                      ? 'topicCreator'
                      : 'user',
                body: content,
                now
            });
            await notifyFeedbackReply(
                topicId,
                topic.row.title,
                canManageFeedback(identity)
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
            } satisfies ReplyFeedbackMessageResponse;
        }
    );
});
