import { defineEventHandler } from 'h3';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import {
    appendFeedbackSystemMessage,
    getFeedbackTopicById,
    hideFeedbackTopic
} from '~/server/services/feedbackStore';
import { canManageFeedback } from '~/server/utils/feedback/permissions';
import { parseFeedbackTopicId } from '~/server/utils/feedback/request';
import type { DeleteFeedbackTopicResponse } from '~/types/feedback';

export default defineEventHandler(async (event) => {
    return executeApi(event, {}, async ({ identity }) => {
        ensure(
            canManageFeedback(identity),
            403,
            'forbidden_scope',
            '当前身份无法管理反馈'
        );

        const topicId = parseFeedbackTopicId(event.context.params?.id);
        const topic = getFeedbackTopicById(topicId);

        if (!topic || topic.row.deleted_at !== null) {
            throw new ApiRequestError(404, 'not_found', '反馈不存在');
        }

        if (topic.row.visibility === 'private') {
            return {
                id: topicId,
                visibility: 'private',
                updatedAt: topic.row.updated_at
            } satisfies DeleteFeedbackTopicResponse;
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
        } satisfies DeleteFeedbackTopicResponse;
    });
});
