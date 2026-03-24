import { defineEventHandler, readBody } from 'h3';
import { createAdminTask } from '~/server/services/adminTaskStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import type { AdminCreateTaskRequest } from '~/types/admin';

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

function parseRequestBody(body: CreateAdminTaskBody): AdminCreateTaskRequest {
    const type = typeof body.type === 'string' ? body.type.trim() : '';
    const payload = asPlainObject(body.payload);

    ensure(payload !== null, 400, 'invalid_param', 'payload 必须是 JSON 对象');

    switch (type) {
        case 'regenerate_daily_export': {
            const date =
                typeof payload.date === 'string' ? payload.date.trim() : '';
            ensure(
                /^\d{8}$/.test(date),
                400,
                'invalid_param',
                'date 必须是 YYYYMMDD'
            );

            return {
                type,
                payload: {
                    date
                }
            };
        }
        case 'refresh_route_info_now': {
            const trainCodes = Array.isArray(payload.trainCodes)
                ? payload.trainCodes.filter(
                      (item): item is string => typeof item === 'string'
                  )
                : [];
            ensure(
                trainCodes.length > 0,
                400,
                'invalid_param',
                'trainCodes 至少需要包含一个车次'
            );

            return {
                type,
                payload: {
                    trainCodes
                }
            };
        }
        default:
            ensure(false, 400, 'invalid_param', 'type 必须是受支持的任务类型');
    }
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

            return createAdminTask(parseRequestBody(body));
        }
    );
});
