import { defineEventHandler, getQuery } from 'h3';
import { list12306TraceListItems } from '~/server/services/requestMetrics12306Store';
import parseLimit from '~/server/utils/api/query/parseLimit';
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
            const cursor =
                typeof query.cursor === 'string' ? query.cursor.trim() : '';
            const limit = parseLimit(event);

            ensure(
                /^\d{8}$/.test(date),
                400,
                'invalid_param',
                'date 不符合 YYYYMMDD'
            );

            return list12306TraceListItems({
                date,
                trainCode,
                cursor,
                limit
            });
        }
    );
});
