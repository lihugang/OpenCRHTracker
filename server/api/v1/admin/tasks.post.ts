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
                /^[0-9]{8}$/.test(date),
                400,
                'invalid_param',
                'date 必须为 YYYYMMDD 格式'
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
                'trainCodes 至少需要包含一个字符串'
            );

            return {
                type,
                payload: {
                    trainCodes
                }
            };
        }
        case 'detect_coupled_emu_group_now': {
            const bureau =
                typeof payload.bureau === 'string' ? payload.bureau.trim() : '';
            const model =
                typeof payload.model === 'string' ? payload.model.trim() : '';
            ensure(bureau.length > 0, 400, 'invalid_param', 'bureau 不能为空');
            ensure(model.length > 0, 400, 'invalid_param', 'model 不能为空');

            return {
                type,
                payload: {
                    bureau,
                    model
                }
            };
        }
        case 'run_qrcode_detection_now': {
            return {
                type,
                payload: {}
            };
        }
        default:
            ensure(false, 400, 'invalid_param', '不支持的管理员任务类型');
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

            return await createAdminTask(parseRequestBody(body));
        }
    );
});
