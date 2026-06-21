import { defineEventHandler, getRouterParam } from 'h3';
import { deleteAdminDailyRoute } from '~/server/services/adminDailyRouteMaintenanceStore';
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
            const id = getRouterParam(event, 'id') ?? '';

            ensure(/^\d+$/.test(id), 400, 'invalid_param', 'id 必须是正整数');

            return deleteAdminDailyRoute(id);
        }
    );
});
