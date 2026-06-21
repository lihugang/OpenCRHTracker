import { defineEventHandler, getQuery } from 'h3';
import { listAdminDailyRouteTimetableCandidates } from '~/server/services/adminDailyRouteMaintenanceStore';
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

            ensure(
                /^\d{8}$/.test(date),
                400,
                'invalid_param',
                'date 必须是 YYYYMMDD'
            );
            ensure(
                trainCode.length > 0,
                400,
                'invalid_param',
                'trainCode 不能为空'
            );

            return listAdminDailyRouteTimetableCandidates(date, trainCode);
        }
    );
});
