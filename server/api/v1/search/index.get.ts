import { defineEventHandler, setHeader } from 'h3';
import useConfig from '~/server/config';
import { getLookupIndex } from '~/server/services/lookupIndexStore';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';

export default defineEventHandler(async (event) => {
    const cacheMaxAge = useConfig().api.cache.searchIndexMaxAgeSeconds;
    setHeader(event, 'Cache-Control', `public, max-age=${cacheMaxAge}`);

    return executeApi(
        event,
        {
            fixedCost: getFixedCost('searchIndex')
        },
        async () => {
            return {
                items: getLookupIndex()
            };
        }
    );
});
