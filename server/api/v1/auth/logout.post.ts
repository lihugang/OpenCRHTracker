import { defineEventHandler } from 'h3';
import { postAuthLogout } from '~/server/domain/auth';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
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
            const response = postAuthLogout(identity);
            clearAuthCookie(event);
            return response;
        }
    );
});
