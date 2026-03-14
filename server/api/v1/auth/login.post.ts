import { defineEventHandler, readBody } from 'h3';
import {
    createApiKey,
    getUserByUsername,
    updateLastLoginAt,
    verifyUserPassword
} from '~/server/services/authStore';
import ensureAuthRateLimit from '~/server/utils/api/authRateLimit/ensureAuthRateLimit';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import { setAuthCookie } from '~/server/utils/auth/authCookie';
import toPublicAuthSession from '~/server/utils/auth/toPublicAuthSession';
import { validatePasswordDigest } from '~/utils/auth/credentials';

interface LoginBody {
    username?: string;
    passwordDigest?: string;
}

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            bypassAnonymousQuota: true
        },
        async () => {
            ensureAuthRateLimit(event, 'login');

            const body = await readBody<LoginBody>(event);
            ensure(
                body && typeof body === 'object',
                400,
                'invalid_param',
                '请求体必须是 JSON 对象'
            );
            ensure(
                typeof body.username === 'string' && body.username.length > 0,
                400,
                'invalid_param',
                'username 不能为空'
            );
            ensure(
                typeof body.passwordDigest === 'string' &&
                    body.passwordDigest.length > 0,
                400,
                'invalid_param',
                'passwordDigest 不能为空'
            );

            const passwordDigestError = validatePasswordDigest(
                body.passwordDigest
            );
            if (passwordDigestError) {
                throw new ApiRequestError(
                    400,
                    'invalid_param',
                    passwordDigestError
                );
            }

            const user = getUserByUsername(body.username);
            if (!user || !verifyUserPassword(user, body.passwordDigest)) {
                throw new ApiRequestError(
                    401,
                    'invalid_credentials',
                    '用户名或密码错误'
                );
            }

            updateLastLoginAt(user.username);
            const session = createApiKey(user.username);
            setAuthCookie(event, session.apiKey);
            return toPublicAuthSession(session);
        }
    );
});
