import { defineEventHandler, getQuery } from 'h3';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            fixedCost: getFixedCost('exportDaily')
        },
        async () => {
            const query = getQuery(event);
            const date = typeof query.date === 'string' ? query.date : '';
            const format =
                typeof query.format === 'string' ? query.format : 'json';

            ensure(
                /^\d{8}$/.test(date),
                400,
                'invalid_param',
                'date 必须是 YYYYMMDD'
            );
            ensure(
                format === 'csv' || format === 'json',
                400,
                'invalid_param',
                'format 必须是 csv 或 json'
            );

            return {
                date,
                format,
                total: 0,
                content: format === 'json' ? '[]' : ''
            };
        }
    );
});
