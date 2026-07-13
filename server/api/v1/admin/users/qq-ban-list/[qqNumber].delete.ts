import { defineEventHandler, getRouterParam } from 'h3';
import { normalizeQqNumber } from '~/server/services/qqBindingService';
import { removeQqBanListEntry } from '~/server/services/userBanSecurityStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.admin]
        },
        async ({ identity }) => {
            const qqNumber = normalizeQqNumber(
                getRouterParam(event, 'qqNumber') ?? ''
            );
            return removeQqBanListEntry(qqNumber, identity.id);
        }
    );
});
