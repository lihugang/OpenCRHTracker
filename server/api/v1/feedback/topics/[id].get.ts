import { defineEventHandler } from 'h3';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import executeApi from '~/server/utils/api/executor/executeApi';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import {
    buildFeedbackTopicDetail,
    getFeedbackTopicById,
    listFeedbackMessagesByTopicId
} from '~/server/services/feedbackStore';
import {
    canManageFeedback,
    canReplyFeedbackTopic,
    canViewFeedbackTopic,
    isFeedbackOwner
} from '~/server/utils/feedback/permissions';
import { parseFeedbackTopicId } from '~/server/utils/feedback/request';
import type { FeedbackTopicDetail } from '~/types/feedback';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            cors: true,
            requiredScopes: [API_SCOPES.feedback.read]
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

            return detail satisfies FeedbackTopicDetail;
        }
    );
});
