import { setResponseStatus, type H3Event } from 'h3';
import setCommonHeaders from '~/server/utils/api/response/setCommonHeaders';
import type ResponseMeta from '~/server/utils/api/response/ResponseMeta';

export default function apiFailure(
    event: H3Event,
    statusCode: number,
    userMessage: string,
    errorCode: string,
    meta: ResponseMeta
) {
    setCommonHeaders(event, meta);
    setResponseStatus(event, statusCode);
    return {
        ok: false,
        data: userMessage,
        error: errorCode
    };
}
