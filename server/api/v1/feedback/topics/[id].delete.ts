import { defineEventHandler } from 'h3';
import { deleteFeedbackTopic } from '~/server/domain/feedback';
import executeApi from '~/server/utils/api/executor/executeApi';
import { parseFeedbackTopicId } from '~/server/utils/feedback/request';

export default defineEventHandler(async (event) => {
    return executeApi(event, {}, async ({ identity }) =>
        deleteFeedbackTopic(
            identity,
            parseFeedbackTopicId(event.context.params?.id)
        )
    );
});
