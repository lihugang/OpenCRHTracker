import { defineEventHandler } from 'h3';
import { revokeApiKeyByUser } from '~/server/services/authStore';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { clearAuthCookie } from '~/server/utils/auth/authCookie';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.auth.logout],
            fixedCost: getFixedCost('authLogout')
        },
        async ({ identity }) => {
            ensure(
                typeof identity.keyId === 'string' && identity.keyId.length > 0,
                500,
                'missing_key_id',
                '当前 API Key 缺少必要标识'
            );

            const revoked = revokeApiKeyByUser(identity.keyId, identity.id);

            ensure(revoked, 500, 'revoke_failed', '当前 API Key 吊销失败');

            clearAuthCookie(event);

            return {
                loggedOut: true,
                revoked: true,
                revokeId: identity.revokeId ?? ''
            };
        }
    );
});
