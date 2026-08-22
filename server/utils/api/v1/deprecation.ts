import { getRequestURL, setHeader, type H3Event } from 'h3';

export const V1_DEPRECATION_NOTICE =
    'v1 接口已于 2026-08-20 00:00:00 +8 停止服务。';

export const V1_DEPRECATION_EXPOSED_HEADERS = [
    'Deprecation',
    'Sunset',
    'X-API-Deprecation-Notice'
] as const;

const V1_DEPRECATION_TIMESTAMP = '@1786636800';
const V1_SUNSET_HTTP_DATE = 'Wed, 19 Aug 2026 16:00:00 GMT';
const V1_DEPRECATION_HEADER_NOTICE =
    'OpenCRHTracker API v1 stopped serving at 2026-08-20T00:00:00+08:00.';

export function isV1ApiRequest(event: H3Event) {
    const pathname = getRequestURL(event).pathname;
    return pathname === '/api/v1' || pathname.startsWith('/api/v1/');
}

export function applyV1DeprecationHeaders(event: H3Event) {
    if (!isV1ApiRequest(event)) {
        return;
    }

    setHeader(event, 'Deprecation', V1_DEPRECATION_TIMESTAMP);
    setHeader(event, 'Sunset', V1_SUNSET_HTTP_DATE);
    setHeader(event, 'X-API-Deprecation-Notice', V1_DEPRECATION_HEADER_NOTICE);
}
