import { defineEventHandler, getQuery } from 'h3';
import { search12306TrainTraceDays } from '~/server/services/requestMetrics12306Store';
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
                'date 不符合 YYYYMMDD'
            );
            ensure(
                trainCode.length > 0,
                400,
                'invalid_param',
                'trainCode 不能为空'
            );

            return search12306TrainTraceDays({
                date,
                trainCode
            });
        }
    );
});
