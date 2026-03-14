import { defineEventHandler, readBody } from 'h3';
import {
    createUserWithApiKey,
    getUserByUsername
} from '~/server/services/authStore';
import ensureAuthRateLimit from '~/server/utils/api/authRateLimit/ensureAuthRateLimit';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import { setAuthCookie } from '~/server/utils/auth/authCookie';
import toPublicAuthSession from '~/server/utils/auth/toPublicAuthSession';
import {
    validatePasswordDigest,
    validateUsername
} from '~/utils/auth/credentials';

interface RegisterBody {
    username?: string;
    passwordDigest?: string;
}

function isUniqueConstraintError(error: unknown) {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof (error as { code?: unknown }).code === 'string' &&
        (error as { code: string }).code.startsWith('SQLITE_CONSTRAINT')
    );
}

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            bypassAnonymousQuota: true
        },
        async () => {
            ensureAuthRateLimit(event, 'register');

            const body = await readBody<RegisterBody>(event);
            ensure(
                body && typeof body === 'object',
                400,
                'invalid_param',
                '请求体必须是 JSON 对象'
            );
            ensure(
                typeof body.username === 'string',
                400,
                'invalid_param',
                'username 不能为空'
            );
            ensure(
                typeof body.passwordDigest === 'string',
                400,
                'invalid_param',
                'passwordDigest 不能为空'
            );

            const usernameError = validateUsername(body.username);
            if (usernameError) {
                throw new ApiRequestError(400, 'invalid_param', usernameError);
            }

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

            if (getUserByUsername(body.username)) {
                throw new ApiRequestError(
                    409,
                    'username_taken',
                    '用户名已存在'
                );
            }

            try {
                const session = createUserWithApiKey(
                    body.username,
                    body.passwordDigest
                );
                setAuthCookie(event, session.apiKey);
                return toPublicAuthSession(session);
            } catch (error) {
                if (isUniqueConstraintError(error)) {
                    throw new ApiRequestError(
                        409,
                        'username_taken',
                        '用户名已存在'
                    );
                }

                throw error;
            }
        }
    );
});
