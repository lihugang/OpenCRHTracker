import { defineEventHandler } from 'h3';
import useConfig from '~/server/config';
import { getExposedConfig } from '~/server/domain/system';
import executeApi from '~/server/utils/api/executor/executeApi';
import setCacheControl from '~/server/utils/api/response/setCacheControl';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export default defineEventHandler(async (event) => {
    const config = useConfig();

    return executeApi(
        event,
        {
            cors: true,
            requiredScopes: [API_SCOPES.config.read],
            fixedCost: 1,
            successHeaders: (successEvent) =>
                setCacheControl(
                    successEvent,
                    config.api.cache.currentDayMaxAgeSeconds
                )
        },
        async () => getExposedConfig()
    );
});
