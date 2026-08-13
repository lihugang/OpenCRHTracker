import { defineEventHandler } from 'h3';
import { postAuthUnbindQqBinding } from '~/server/domain/auth';
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
        async ({ identity }) => postAuthUnbindQqBinding(identity.id)
    )
);
