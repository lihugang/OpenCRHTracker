import { defineEventHandler } from 'h3';
import ensureAuthRateLimit from '~/server/utils/api/authRateLimit/ensureAuthRateLimit';
import {
    parseAuthorizeRequest,
    resolveAuthorizeSession
} from '~/server/utils/oauth/authorizeRequest';
import { setOauthContinuationCookie } from '~/server/utils/oauth/continuationCookie';
import { getOauthAuthorizeContext } from '~/server/domain/oauth';

export default defineEventHandler((event) => {
    ensureAuthRateLimit(event, 'oauthAuthorize');
    const result = getOauthAuthorizeContext(
        parseAuthorizeRequest(event),
        resolveAuthorizeSession(event)
    );
    if (result.mode === 'redirect' && result.continuationId) {
        setOauthContinuationCookie(event, result.continuationId);
    }
    return result.mode === 'redirect'
        ? { mode: result.mode, location: result.location }
        : result;
});
