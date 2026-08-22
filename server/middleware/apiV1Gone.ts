import { defineEventHandler, setResponseStatus } from 'h3';
import applyApiCorsHeaders from '~/server/utils/api/cors/applyApiCorsHeaders';
import {
    applyV1DeprecationHeaders,
    isV1ApiRequest,
    V1_DEPRECATION_NOTICE
} from '~/server/utils/api/v1/deprecation';

export default defineEventHandler((event) => {
    if (event.method === 'OPTIONS' || !isV1ApiRequest(event)) {
        return;
    }

    applyApiCorsHeaders(event);
    applyV1DeprecationHeaders(event);
    setResponseStatus(event, 410, 'Gone');

    return {
        ok: false as const,
        data: 'API v1 已停止服务，请迁移至 API v2。',
        error: 'api_v1_gone',
        notice: V1_DEPRECATION_NOTICE
    };
});
