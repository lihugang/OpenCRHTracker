import { defineEventHandler, readBody } from 'h3';
import { postAdminTasks } from '~/server/domain/admin/tasks';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

interface CreateAdminTaskBody {
    type?: unknown;
    payload?: unknown;
}

function asPlainObject(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null;
    }
    return value as Record<string, unknown>;
}

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.admin]
        },
        async () => {
            const body =
                (await readBody<CreateAdminTaskBody | null>(event)) ?? {};
            ensure(
                asPlainObject(body) !== null,
                400,
                'invalid_param',
                '请求体必须是 JSON 对象'
            );

            return postAdminTasks(body);
        }
    );
});
