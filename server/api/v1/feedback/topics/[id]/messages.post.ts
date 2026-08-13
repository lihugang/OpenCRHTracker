import { defineEventHandler, readBody } from 'h3';
import { postFeedbackTopicMessage } from '~/server/domain/feedback';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { parseFeedbackTopicId } from '~/server/utils/feedback/request';

interface CreateFeedbackMessageBody {
    body?: unknown;
}

export default defineEventHandler(async (event) => {
    return executeApi(event, {}, async ({ identity }) => {
        const body =
            (await readBody<CreateFeedbackMessageBody | null>(event)) ?? {};
        ensure(
            typeof body === 'object' && body !== null && !Array.isArray(body),
            400,
            'invalid_param',
            '请求体必须是 JSON 对象'
        );

        return postFeedbackTopicMessage(
            identity,
            parseFeedbackTopicId(event.context.params?.id),
            typeof body.body === 'string' ? body.body : '',
            undefined
        );
    });
});
