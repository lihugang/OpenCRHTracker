import { defineEventHandler, readBody } from 'h3';
import { changeUserPasswordWithApiKey } from '~/server/services/authStore';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import { setAuthCookie } from '~/server/utils/auth/authCookie';
import toPublicAuthSession from '~/server/utils/auth/toPublicAuthSession';
import { validatePasswordDigest } from '~/utils/auth/credentials';

interface ChangePasswordBody {
    currentPasswordDigest?: string;
    newPasswordDigest?: string;
}

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.auth.password.update],
            fixedCost: getFixedCost('authChangePassword')
        },
        async ({ identity }) => {
            const body = await readBody<ChangePasswordBody>(event);
            ensure(
                body && typeof body === 'object',
                400,
                'invalid_param',
                '请求体必须是 JSON 对象'
            );
            ensure(
                typeof body.currentPasswordDigest === 'string' &&
                    body.currentPasswordDigest.length > 0,
                400,
                'invalid_param',
                'currentPasswordDigest 不能为空'
            );
            ensure(
                typeof body.newPasswordDigest === 'string' &&
                    body.newPasswordDigest.length > 0,
                400,
                'invalid_param',
                'newPasswordDigest 不能为空'
            );

            const currentPasswordDigestError = validatePasswordDigest(
                body.currentPasswordDigest
            );
            if (currentPasswordDigestError) {
                throw new ApiRequestError(
                    400,
                    'invalid_param',
                    currentPasswordDigestError
                );
            }

            const newPasswordDigestError = validatePasswordDigest(
                body.newPasswordDigest
            );
            if (newPasswordDigestError) {
                throw new ApiRequestError(
                    400,
                    'invalid_param',
                    newPasswordDigestError
                );
            }

            ensure(
                body.currentPasswordDigest !== body.newPasswordDigest,
                400,
                'invalid_param',
                '新密码不能与旧密码相同'
            );

            const nextSession = changeUserPasswordWithApiKey(
                identity.id,
                body.currentPasswordDigest,
                body.newPasswordDigest
            );
            if (!nextSession) {
                throw new ApiRequestError(
                    401,
                    'invalid_credentials',
                    '旧密码错误'
                );
            }

            setAuthCookie(event, nextSession.apiKey);
            return toPublicAuthSession(nextSession);
        }
    );
});
