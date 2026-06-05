import type { H3Event } from 'h3';
import useConfig from '~/server/config';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import formatRetryAfterMessage from '~/server/utils/api/quota/formatRetryAfterMessage';
import getClientIp from '~/server/utils/api/quota/getClientIp';
import getAuthRateLimitStore from '~/server/utils/api/authRateLimit/getAuthRateLimitStore';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

export type AuthRateLimitAction =
    | 'login'
    | 'register'
    | 'oauthAuthorize'
    | 'oauthToken';

function getRateLimitMessageKind(action: AuthRateLimitAction) {
    switch (action) {
        case 'login':
            return 'auth_login' as const;
        case 'register':
            return 'auth_register' as const;
        case 'oauthAuthorize':
            return 'auth_oauth_authorize' as const;
        case 'oauthToken':
            return 'auth_oauth_token' as const;
    }
}

export default function ensureAuthRateLimit(
    event: H3Event,
    action: AuthRateLimitAction
) {
    const policy = useConfig().api.authRateLimit[action];
    const now = getNowSeconds();
    const ip = getClientIp(event);
    const key = `${action}:${ip}`;
    const { records } = getAuthRateLimitStore();
    const existing = records.get(key);

    if (existing && now - existing.windowStartedAt < policy.windowSeconds) {
        if (existing.count >= policy.maxRequests) {
            const retryAfter =
                existing.windowStartedAt + policy.windowSeconds - now;
            throw new ApiRequestError(
                429,
                'auth_rate_limited',
                formatRetryAfterMessage(retryAfter, getRateLimitMessageKind(action)),
                retryAfter
            );
        }
    }

    if (!existing || now - existing.windowStartedAt >= policy.windowSeconds) {
        records.set(key, {
            count: 1,
            windowStartedAt: now
        });
        return;
    }

    existing.count += 1;
}

export function assertAuthRateLimit(
    event: H3Event,
    action: AuthRateLimitAction
) {
    const policy = useConfig().api.authRateLimit[action];
    const now = getNowSeconds();
    const ip = getClientIp(event);
    const key = `${action}:${ip}`;
    const { records } = getAuthRateLimitStore();
    const existing = records.get(key);

    if (!existing || now - existing.windowStartedAt >= policy.windowSeconds) {
        return;
    }

    if (existing.count < policy.maxRequests) {
        return;
    }

    const retryAfter = existing.windowStartedAt + policy.windowSeconds - now;
    throw new ApiRequestError(
        429,
        'auth_rate_limited',
        formatRetryAfterMessage(retryAfter, getRateLimitMessageKind(action)),
        retryAfter
    );
}

export function recordAuthRateLimitHit(
    event: H3Event,
    action: AuthRateLimitAction
) {
    const policy = useConfig().api.authRateLimit[action];
    const now = getNowSeconds();
    const ip = getClientIp(event);
    const key = `${action}:${ip}`;
    const { records } = getAuthRateLimitStore();
    const existing = records.get(key);

    if (!existing || now - existing.windowStartedAt >= policy.windowSeconds) {
        records.set(key, {
            count: 1,
            windowStartedAt: now
        });
        return;
    }

    existing.count += 1;
}
