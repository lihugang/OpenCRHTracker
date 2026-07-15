import { defineEventHandler, readBody } from 'h3';
import { createMembershipCodeBatch } from '~/server/services/membershipCodeStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import type { AdminCreateMembershipCodeBatchRequest } from '~/types/admin';

interface AdminCreateMembershipCodeBatchBody {
    groupId?: unknown;
    quantity?: unknown;
    durationDays?: unknown;
}

function parsePositiveSafeInteger(value: unknown, field: string) {
    ensure(
        typeof value === 'number' && Number.isSafeInteger(value) && value > 0,
        400,
        'invalid_param',
        `${field} 必须为正整数`
    );
    return value;
}

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.admin]
        },
        async ({ identity }) => {
            const body =
                (await readBody<AdminCreateMembershipCodeBatchBody | null>(
                    event
                )) ?? {};
            ensure(
                typeof body === 'object' &&
                    body !== null &&
                    !Array.isArray(body),
                400,
                'invalid_param',
                '请求体必须是 JSON 对象'
            );

            const groupId =
                typeof body.groupId === 'string' ? body.groupId.trim() : '';
            ensure(
                groupId.length > 0,
                400,
                'invalid_param',
                'groupId 不能为空'
            );

            const request: AdminCreateMembershipCodeBatchRequest = {
                groupId,
                quantity: parsePositiveSafeInteger(body.quantity, 'quantity'),
                durationDays: parsePositiveSafeInteger(
                    body.durationDays,
                    'durationDays'
                )
            };
            return createMembershipCodeBatch(request, identity.id);
        }
    );
});
