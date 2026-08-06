import { defineEventHandler, getRouterParam, setHeader } from 'h3';
import { getAdminConfigFileDocument } from '~/server/services/adminConfigFileStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export default defineEventHandler(async (event) => {
    setHeader(event, 'Cache-Control', 'no-store');
    setHeader(event, 'Pragma', 'no-cache');

    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.admin]
        },
        async () => {
            const target = getRouterParam(event, 'target') ?? '';
            return await getAdminConfigFileDocument(target);
        }
    );
});
