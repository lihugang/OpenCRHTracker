import { defineEventHandler, readBody } from 'h3';
import { runAdminConfigFileAction } from '~/server/services/adminConfigFileStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import type { AdminConfigFileActionRequest } from '~/types/admin';

interface AdminConfigFileActionBody {
    target?: unknown;
    action?: unknown;
}

function asPlainObject(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null;
    }

    return value as Record<string, unknown>;
}

function parseRequestBody(
    body: AdminConfigFileActionBody
): AdminConfigFileActionRequest {
    const target = typeof body.target === 'string' ? body.target.trim() : '';
    const action = typeof body.action === 'string' ? body.action.trim() : '';

    ensure(
        target === 'config' || target === 'EMUList' || target === 'QRCode',
        400,
        'invalid_param',
        'target 必须是 config、EMUList 或 QRCode'
    );
    ensure(
        action === 'reload_local' || action === 'refresh_remote',
        400,
        'invalid_param',
        'action 必须是 reload_local 或 refresh_remote'
    );

    return {
        target,
        action
    };
}

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.admin]
        },
        async () => {
            const body =
                (await readBody<AdminConfigFileActionBody | null>(event)) ?? {};
            ensure(
                asPlainObject(body) !== null,
                400,
                'invalid_param',
                '请求体必须是 JSON 对象'
            );

            return await runAdminConfigFileAction(parseRequestBody(body));
        }
    );
});
