import { defineEventHandler, readBody } from 'h3';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import {
    createApiKey,
    getUserByUsername,
    updateLastLoginAt,
    verifyUserPassword
} from '~/server/services/authStore';

interface LoginBody {
    username?: string;
    password?: string;
}

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            fixedCost: getFixedCost('authLogin')
        },
        async () => {
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
                typeof body.password === 'string' && body.password.length > 0,
                400,
                'invalid_param',
                'password 不能为空'
            );

            const user = getUserByUsername(body.username);
            if (!user || !verifyUserPassword(user, body.password)) {
                throw new ApiRequestError(
                    401,
                    'invalid_credentials',
                    '用户名或密码错误'
                );
            }

            updateLastLoginAt(user.username);
            const apiKey = createApiKey(user.username);
            return {
                userId: user.username,
                apiKey: apiKey.key,
                createdAt: apiKey.createdAt,
                expiresAt: apiKey.expiresAt,
                dailyTokenLimit: apiKey.dailyTokenLimit
            };
        }
    );
});
