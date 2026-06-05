import {
    defineEventHandler,
    getRequestURL,
    sendNoContent,
    setHeader
} from 'h3';
import { applyApiCorsPreflightHeaders } from '~/server/utils/api/cors/applyApiCorsHeaders';

function isOauthCorsPath(pathname: string) {
    return pathname === '/oauth/token' || pathname === '/oauth/userinfo';
}

function applyOauthCorsHeaders(pathname: string) {
    return {
        methods:
            pathname === '/oauth/token'
                ? 'POST, OPTIONS'
                : 'GET, OPTIONS'
    };
}

export default defineEventHandler((event) => {
    const pathname = getRequestURL(event).pathname;
    if (isOauthCorsPath(pathname)) {
        setHeader(event, 'Access-Control-Allow-Origin', '*');
        setHeader(event, 'Access-Control-Allow-Headers', 'content-type, authorization');
        setHeader(
            event,
            'Access-Control-Allow-Methods',
            applyOauthCorsHeaders(pathname).methods
        );
    }

    if (event.method !== 'OPTIONS') {
        return;
    }

    if (isOauthCorsPath(pathname)) {
        return sendNoContent(event, 204);
    }

    applyApiCorsPreflightHeaders(event);
    return sendNoContent(event, 204);
});
