import { defineEventHandler, readBody } from 'h3';
import { patchFeedbackTopic } from '~/server/domain/feedback';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { parseFeedbackTopicId } from '~/server/utils/feedback/request';

interface UpdateFeedbackTopicBody {
    primaryType?: unknown;
    secondaryType?: unknown;
    status?: unknown;
    title?: unknown;
}

export default defineEventHandler(async (event) => {
    return executeApi(event, {}, async ({ identity }) => {
        const body =
            (await readBody<UpdateFeedbackTopicBody | null>(event)) ?? {};
        ensure(
            typeof body === 'object' && body !== null && !Array.isArray(body),
            400,
            'invalid_param',
            '请求体必须是 JSON 对象'
        );

        return patchFeedbackTopic(
            identity,
            parseFeedbackTopicId(event.context.params?.id),
            body
        );
    });
});
