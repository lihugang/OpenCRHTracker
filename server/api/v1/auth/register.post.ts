import { defineEventHandler, readBody } from 'h3';
import { postAuthRegister } from '~/server/domain/auth';
import ensureAuthRateLimit from '~/server/utils/api/authRateLimit/ensureAuthRateLimit';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { setAuthCookie } from '~/server/utils/auth/authCookie';
import toPublicAuthSession from '~/server/utils/auth/toPublicAuthSession';

interface RegisterBody {
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

            const session = postAuthRegister({
                username: body.username,
                passwordDigest: body.passwordDigest
            });
            setAuthCookie(event, session.apiKey);
            return toPublicAuthSession(session);
        }
    );
});
