import { setResponseStatus, type H3Event } from 'h3';
import setCommonHeaders from '~/server/utils/api/response/setCommonHeaders';
import type ResponseMeta from '~/server/utils/api/response/ResponseMeta';
import { withV1DeprecationNotice } from '~/server/utils/api/v1/deprecation';

export default function apiFailure(
    event: H3Event,
    statusCode: number,
    userMessage: string,
    errorCode: string,
    meta: ResponseMeta
) {
    setCommonHeaders(event, meta);
    setResponseStatus(event, statusCode);
    return withV1DeprecationNotice(event, {
        ok: false as const,
        data: userMessage,
        error: errorCode
    });
}
