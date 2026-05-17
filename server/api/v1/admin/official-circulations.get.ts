import { defineEventHandler, getQuery } from 'h3';
import { searchAdminOfficialCirculations } from '~/server/services/adminOfficialCirculationStore';
import ensurePayloadStringLength from '~/server/utils/api/payload/ensurePayloadStringLength';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            cors: true,
            requiredScopes: [API_SCOPES.admin]
        },
        async () => {
            const query = getQuery(event);
            const keyword =
                typeof query.keyword === 'string' ? query.keyword.trim() : '';

            ensure(
                keyword.length > 0,
                400,
                'invalid_param',
                'keyword 不能为空'
            );
            ensurePayloadStringLength(keyword, 'keyword', 64);

            return searchAdminOfficialCirculations(keyword);
        }
    );
});
