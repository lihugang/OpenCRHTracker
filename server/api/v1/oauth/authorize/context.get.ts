import { defineEventHandler } from 'h3';
import ensureAuthRateLimit from '~/server/utils/api/authRateLimit/ensureAuthRateLimit';
import {
    getAuthorizeContext,
    parseAuthorizeRequest
} from '~/server/utils/oauth/authorizeRequest';

export default defineEventHandler((event) => {
    ensureAuthRateLimit(event, 'oauthAuthorize');
    return getAuthorizeContext(event, parseAuthorizeRequest(event));
});
