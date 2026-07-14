import { defineEventHandler, readBody } from 'h3';
import { clearAdminUserRiskState } from '~/server/services/adminUserStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

interface AdminClearUserRiskBody {
    userId?: unknown;
}

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.admin]
        },
        async ({ identity }) => {
            const body =
                (await readBody<AdminClearUserRiskBody | null>(event)) ?? {};
            ensure(
                typeof body === 'object' &&
                    body !== null &&
                    !Array.isArray(body),
                400,
                'invalid_param',
                '请求体必须是 JSON 对象'
            );

            const userId =
                typeof body.userId === 'string' ? body.userId.trim() : '';
            ensure(userId.length > 0, 400, 'invalid_param', 'userId 不能为空');

            return clearAdminUserRiskState(userId, identity.id);
        }
    );
});
