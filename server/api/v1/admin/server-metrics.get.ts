import { defineEventHandler } from 'h3';
import { getAdminServerMetrics } from '~/server/domain/admin/serverMetrics';
import executeApi from '~/server/utils/api/executor/executeApi';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            cors: true,
            requiredScopes: [API_SCOPES.admin]
        },
        async () => getAdminServerMetrics()
    );
});
