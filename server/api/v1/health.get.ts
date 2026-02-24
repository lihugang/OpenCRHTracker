import { defineEventHandler } from 'h3';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            fixedCost: getFixedCost('health')
        },
        async () => {
            return {
                status: 'ok',
                timestamp: Math.floor(Date.now() / 1000)
            };
        }
    );
});
