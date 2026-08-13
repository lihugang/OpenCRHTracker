import { defineEventHandler, getRouterParam } from 'h3';
import { getAdminUserMemberships } from '~/server/domain/admin/users';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.admin]
        },
        async () => {
            const userId = (getRouterParam(event, 'userId') ?? '').trim();
            ensure(userId.length > 0, 400, 'invalid_param', 'userId 不能为空');
            return getAdminUserMemberships(userId);
        }
    );
});
