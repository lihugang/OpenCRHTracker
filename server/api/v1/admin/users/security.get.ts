import { defineEventHandler } from 'h3';
import { getAdminUsersSecurity } from '~/server/domain/admin/users';
import executeApi from '~/server/utils/api/executor/executeApi';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            cors: true,
            requiredScopes: [API_SCOPES.admin]
        },
        async () => getAdminUsersSecurity()
    );
});
