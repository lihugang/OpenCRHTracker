import { defineEventHandler, readBody } from 'h3';
import { updateAdminUserQuotaOverride } from '~/server/services/adminUserStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import type {
    AdminUpdateUserQuotaRequest,
    AdminUpdateUserQuotaResponse
} from '~/types/admin';

interface AdminUpdateUserQuotaBody {
    userId?: unknown;
    tokenLimit?: unknown;
    refillAmount?: unknown;
}

function asNullablePositiveInteger(
    value: unknown,
    field: 'tokenLimit' | 'refillAmount'
) {
    ensure(
        value === null ||
            (typeof value === 'number' &&
                Number.isFinite(value) &&
                Number.isInteger(value) &&
                value > 0),
        400,
        'invalid_param',
        `${field} 必须为正整数或 null`
    );

    return value;
}

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.admin]
        },
        async () => {
            const body =
                (await readBody<AdminUpdateUserQuotaBody | null>(event)) ?? {};

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
            ensure(
                userId.length > 0,
                400,
                'invalid_param',
                'userId 不能为空'
            );

            const request: AdminUpdateUserQuotaRequest = {
                userId,
                tokenLimit: asNullablePositiveInteger(
                    body.tokenLimit ?? null,
                    'tokenLimit'
                ),
                refillAmount: asNullablePositiveInteger(
                    body.refillAmount ?? null,
                    'refillAmount'
                )
            };

            const response: AdminUpdateUserQuotaResponse =
                updateAdminUserQuotaOverride(request);

            return response;
        }
    );
});
