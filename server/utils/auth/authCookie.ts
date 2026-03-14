import { deleteCookie, getCookie, setCookie, type H3Event } from 'h3';
import useConfig from '~/server/config';

function getAuthCookieOptions() {
    const config = useConfig();

    return {
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: !import.meta.dev,
        path: '/',
        maxAge: config.user.apiKeyTtlSeconds
    };
}

export function readAuthCookie(event: H3Event) {
    const config = useConfig();
    const value = getCookie(event, config.api.authCookieName)?.trim();
    return value && value.length > 0 ? value : null;
}

export function setAuthCookie(event: H3Event, apiKey: string) {
    setCookie(
        event,
        useConfig().api.authCookieName,
        apiKey,
        getAuthCookieOptions()
    );
}

export function clearAuthCookie(event: H3Event) {
    deleteCookie(event, useConfig().api.authCookieName, {
        httpOnly: true,
        sameSite: 'lax',
        secure: !import.meta.dev,
        path: '/'
    });
}
