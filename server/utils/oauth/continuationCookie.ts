import { deleteCookie, getCookie, setCookie, type H3Event } from 'h3';
import useConfig from '~/server/config';

const COOKIE_NAME = 'oauth_continuation';

function getCookieOptions() {
    return {
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: !import.meta.dev,
        path: '/',
        maxAge: useConfig().oauth.loginContinuationTtlSeconds
    };
}

export function readOauthContinuationCookie(event: H3Event) {
    const value = getCookie(event, COOKIE_NAME)?.trim();
    return value && value.length > 0 ? value : null;
}

export function setOauthContinuationCookie(
    event: H3Event,
    continuationId: string
) {
    setCookie(event, COOKIE_NAME, continuationId, getCookieOptions());
}

export function clearOauthContinuationCookie(event: H3Event) {
    deleteCookie(event, COOKIE_NAME, {
        httpOnly: true,
        sameSite: 'lax',
        secure: !import.meta.dev,
        path: '/'
    });
}
