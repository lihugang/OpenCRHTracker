import { defineEventHandler, getQuery, getRouterParam } from 'h3';
import { get12306TraceDetail } from '~/server/services/requestMetrics12306Store';
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
            const traceId = getRouterParam(event, 'traceId')?.trim() ?? '';

            ensure(
                /^\d{8}$/.test(date),
                400,
                'invalid_param',
                'date 不符合 YYYYMMDD'
            );
            ensure(traceId.length > 0, 400, 'invalid_param', 'traceId 为空');

            return get12306TraceDetail({
                date,
                traceId
            });
        }
    );
});
