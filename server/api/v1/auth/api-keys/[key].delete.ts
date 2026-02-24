import { defineEventHandler, getRouterParam } from 'h3';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import { revokeApiKeyByUser } from '~/server/services/authStore';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requireApiKey: true,
            fixedCost: getFixedCost('authRevokeApiKey')
        },
        async ({ identity }) => {
            const key = getRouterParam(event, 'key');
            ensure(
                typeof key === 'string' && key.length > 0,
                400,
                'invalid_param',
                '需要提供要撤销的 key'
            );

            const revoked = revokeApiKeyByUser(key, identity.id);
            if (!revoked) {
                throw new ApiRequestError(
                    404,
                    'not_found',
                    '未找到可撤销的 key'
                );
            }

            return {
                userId: identity.id,
                revoked: true,
                key
            };
        }
    );
});
