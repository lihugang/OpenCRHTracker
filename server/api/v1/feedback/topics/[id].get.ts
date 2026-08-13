import { defineEventHandler } from 'h3';
import { getFeedbackTopic } from '~/server/domain/feedback';
import executeApi from '~/server/utils/api/executor/executeApi';
import { parseFeedbackTopicId } from '~/server/utils/feedback/request';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            cors: true
        },
        async ({ identity }) =>
            getFeedbackTopic(
                identity,
                parseFeedbackTopicId(event.context.params?.id)
            )
    );
});
