import { defineEventHandler, readBody } from 'h3';
import { postAdminQqBanEntry } from '~/server/domain/admin/users';
import { normalizeQqNumber } from '~/server/services/qqBindingService';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

interface AddQqBanListBody {
    qqNumber?: unknown;
}

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.admin]
        },
        async ({ identity }) => {
            const body = await readBody<AddQqBanListBody | null>(event);
            ensure(
                body && typeof body === 'object' && !Array.isArray(body),
                400,
                'invalid_param',
                '请求体必须是 JSON 对象'
            );

            return postAdminQqBanEntry(
                normalizeQqNumber(body.qqNumber),
                identity.id
            );
        }
    );
});
