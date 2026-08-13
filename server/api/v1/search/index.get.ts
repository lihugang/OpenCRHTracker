import { defineEventHandler } from 'h3';
import useConfig from '~/server/config';
import { getSearchIndex } from '~/server/domain/search';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import setCacheControl from '~/server/utils/api/response/setCacheControl';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export default defineEventHandler(async (event) => {
    const cacheMaxAge = useConfig().api.cache.searchIndexMaxAgeSeconds;

    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.search.read],
            fixedCost: getFixedCost('searchIndex'),
            successHeaders: (successEvent) =>
                setCacheControl(successEvent, cacheMaxAge)
        },
        async () => getSearchIndex()
    );
});
