import { defineEventHandler, setHeader } from 'h3';
import useConfig from '~/server/config';
import { getLookupIndex } from '~/server/services/lookupIndexStore';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export default defineEventHandler(async (event) => {
    const cacheMaxAge = useConfig().api.cache.searchIndexMaxAgeSeconds;
    setHeader(event, 'Cache-Control', `public, max-age=${cacheMaxAge}`);

    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.search.read],
            fixedCost: getFixedCost('searchIndex')
        },
        async () => {
            return {
                items: getLookupIndex()
            };
        }
    );
});
