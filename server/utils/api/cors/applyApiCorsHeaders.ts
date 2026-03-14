import { getHeader, setHeader, type H3Event } from 'h3';
import useConfig from '~/server/config';

function resolveAllowMethods(event: H3Event) {
    const requestedMethod = getHeader(event, 'access-control-request-method');
    const methods = new Set(['GET', 'HEAD', 'OPTIONS']);

    if (requestedMethod) {
        methods.add(requestedMethod.toUpperCase());
    }

    return Array.from(methods).join(', ');
}

function resolveAllowHeaders(event: H3Event) {
    const config = useConfig();
    const requestedHeaders = getHeader(event, 'access-control-request-headers');

    if (requestedHeaders) {
        return requestedHeaders;
    }

    return `${config.api.apiKeyHeader}, content-type`;
}

export default function applyApiCorsHeaders(event: H3Event) {
    const config = useConfig();

    setHeader(event, 'Access-Control-Allow-Origin', '*');
    setHeader(
        event,
        'Access-Control-Expose-Headers',
        [
            config.api.headers.remain,
            config.api.headers.cost,
            config.api.headers.retryAfter
        ].join(', ')
    );
}

export function applyApiCorsPreflightHeaders(event: H3Event) {
    applyApiCorsHeaders(event);
    setHeader(
        event,
        'Access-Control-Allow-Methods',
        resolveAllowMethods(event)
    );
    setHeader(
        event,
        'Access-Control-Allow-Headers',
        resolveAllowHeaders(event)
    );
    setHeader(event, 'Access-Control-Max-Age', 86400);
    setHeader(event, 'Vary', 'Access-Control-Request-Headers');
}
