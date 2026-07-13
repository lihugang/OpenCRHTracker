import { defineEventHandler, readBody } from 'h3';
import { updateAdminUserBanState } from '~/server/services/adminUserStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import type {
    AdminUpdateUserBanStateRequest,
    AdminUpdateUserBanStateResponse
} from '~/types/admin';

interface AdminUpdateUserBanStateBody {
    userId?: unknown;
    banned?: unknown;
}

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.admin]
        },
        async ({ identity }) => {
            const body =
                (await readBody<AdminUpdateUserBanStateBody | null>(event)) ??
                {};

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
            ensure(
                typeof body.banned === 'boolean',
                400,
                'invalid_param',
                'banned 必须为布尔值'
            );

            const request: AdminUpdateUserBanStateRequest = {
                userId,
                banned: body.banned
            };
            const response: AdminUpdateUserBanStateResponse =
                updateAdminUserBanState(request, identity.id);

            return response;
        }
    );
});
