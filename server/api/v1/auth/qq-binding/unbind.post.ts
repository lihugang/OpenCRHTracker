import { defineEventHandler } from 'h3';
import { unbindQq } from '~/server/services/qqBindingService';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export default defineEventHandler(async (event) =>
    executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.auth.qqBinding.unbind],
            fixedCost: getFixedCost('authUnbindQqBinding')
        },
        async ({ identity }) => unbindQq(identity.id)
    )
);
