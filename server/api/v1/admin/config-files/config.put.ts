import { defineEventHandler, readBody, setHeader } from 'h3';
import { updateAdminRuntimeConfig } from '~/server/services/adminConfigFileStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import type { AdminRuntimeConfigUpdateRequest } from '~/types/admin';

interface AdminRuntimeConfigUpdateBody {
    content?: unknown;
    expectedRevision?: unknown;
}

export default defineEventHandler(async (event) => {
    setHeader(event, 'Cache-Control', 'no-store');
    setHeader(event, 'Pragma', 'no-cache');

    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.admin]
        },
        async ({ identity }) => {
            const body =
                (await readBody<AdminRuntimeConfigUpdateBody | null>(event)) ??
                {};
            ensure(
                typeof body === 'object' &&
                    body !== null &&
                    !Array.isArray(body),
                400,
                'invalid_param',
                '请求体必须是 JSON 对象'
            );
            ensure(
                typeof body.content === 'string' && body.content.length > 0,
                400,
                'invalid_param',
                'content 必须为非空字符串'
            );
            ensure(
                typeof body.expectedRevision === 'string' &&
                    /^[a-f0-9]{64}$/.test(body.expectedRevision),
                400,
                'invalid_param',
                'expectedRevision 必须为有效的 SHA-256 revision'
            );

            const request: AdminRuntimeConfigUpdateRequest = {
                content: body.content,
                expectedRevision: body.expectedRevision
            };
            return await updateAdminRuntimeConfig(request, identity.id);
        }
    );
});
