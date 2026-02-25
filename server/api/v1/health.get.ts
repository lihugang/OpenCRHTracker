import { defineEventHandler } from 'h3';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            fixedCost: getFixedCost('health')
        },
        async () => {
            return {
                status: 'ok',
                timestamp: getNowSeconds()
            };
        }
    );
});
