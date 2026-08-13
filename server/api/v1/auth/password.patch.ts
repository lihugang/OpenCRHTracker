import { defineEventHandler, readBody } from 'h3';
import { patchAuthPassword } from '~/server/domain/auth';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import { setAuthCookie } from '~/server/utils/auth/authCookie';
import toPublicAuthSession from '~/server/utils/auth/toPublicAuthSession';

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

            const nextSession = patchAuthPassword(identity.id, {
                currentPasswordDigest: body.currentPasswordDigest,
                newPasswordDigest: body.newPasswordDigest
            });
            setAuthCookie(event, nextSession.apiKey);
            return toPublicAuthSession(nextSession);
        }
    );
});
