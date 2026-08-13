import { defineEventHandler, getRouterParam } from 'h3';
import { deleteAdminQqBanEntry } from '~/server/domain/admin/users';
import { normalizeQqNumber } from '~/server/services/qqBindingService';
import executeApi from '~/server/utils/api/executor/executeApi';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.admin]
        },
        async ({ identity }) =>
            deleteAdminQqBanEntry(
                normalizeQqNumber(getRouterParam(event, 'qqNumber') ?? ''),
                identity.id
            )
    );
});
