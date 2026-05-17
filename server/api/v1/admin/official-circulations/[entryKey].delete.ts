import { defineEventHandler, getRouterParam } from 'h3';
import { deleteAdminOfficialCirculation } from '~/server/services/adminOfficialCirculationStore';
import ensurePayloadStringLength from '~/server/utils/api/payload/ensurePayloadStringLength';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.admin]
        },
        async () => {
            const entryKey = getRouterParam(event, 'entryKey');

            ensure(
                typeof entryKey === 'string' && entryKey.trim().length > 0,
                400,
                'invalid_param',
                'entryKey 不能为空'
            );
            ensurePayloadStringLength(entryKey, 'entryKey', 128);

            return deleteAdminOfficialCirculation(entryKey);
        }
    );
});
