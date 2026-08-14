import { setResponseStatus, type H3Event } from 'h3';
import setCommonHeaders from '~/server/utils/api/response/setCommonHeaders';
import type ResponseMeta from '~/server/utils/api/response/ResponseMeta';
import { withV1DeprecationNotice } from '~/server/utils/api/v1/deprecation';

export default function apiSuccess<T>(
    event: H3Event,
    data: T,
    meta: ResponseMeta,
    statusCode = 200
) {
    setCommonHeaders(event, meta);
    setResponseStatus(event, statusCode);
    return withV1DeprecationNotice(event, {
        ok: true as const,
        data,
        error: '' as const
    });
}
