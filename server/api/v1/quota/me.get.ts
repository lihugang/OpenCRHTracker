import { defineEventHandler } from 'h3';
import useConfig from '~/server/config';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import getRemainTokens from '~/server/utils/api/quota/getRemainTokens';

export default defineEventHandler(async (event) => {
    const config = useConfig();

    return executeApi(
        event,
        {
            fixedCost: getFixedCost('quotaMe')
        },
        async ({ identity }) => {
            return {
                identity: {
                    type: identity.type,
                    id: identity.id
                },
                quota: {
                    tokenLimit: identity.tokenLimit,
                    remain: getRemainTokens(identity),
                    refillAmount: config.quota.refillAmount,
                    refillIntervalSeconds: config.quota.refillIntervalSeconds
                }
            };
        }
    );
});
