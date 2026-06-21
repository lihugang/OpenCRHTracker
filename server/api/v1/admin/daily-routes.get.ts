import { defineEventHandler, getQuery } from 'h3';
import { searchAdminDailyRoutes } from '~/server/services/adminDailyRouteMaintenanceStore';
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
            const query = getQuery(event);
            const date =
                typeof query.date === 'string' ? query.date.trim() : '';
            const trainCode =
                typeof query.trainCode === 'string'
                    ? query.trainCode.trim()
                    : '';
            const emuCode =
                typeof query.emuCode === 'string' ? query.emuCode.trim() : '';

            ensure(
                /^\d{8}$/.test(date),
                400,
                'invalid_param',
                'date 必须是 YYYYMMDD'
            );
            ensure(
                trainCode.length > 0 || emuCode.length > 0,
                400,
                'invalid_param',
                'trainCode 与 emuCode 至少填写一个'
            );

            return searchAdminDailyRoutes(date, trainCode, emuCode);
        }
    );
});
