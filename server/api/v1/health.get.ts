import { defineEventHandler } from 'h3';
import { getHealth } from '~/server/domain/system';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            cors: true,
            fixedCost: getFixedCost('health')
        },
        async () => getHealth()
    );
});
