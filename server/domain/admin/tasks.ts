import {
    createAdminTask,
    getAdminTaskOverview
} from '~/server/services/adminTaskStore';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import type { AdminCreateTaskRequest } from '~/types/admin';

export function getAdminTasks() {
    return getAdminTaskOverview();
}

export function postAdminTasks(body: {
    type?: unknown;
    payload?: unknown;
}) {
    return createAdminTask(parseAdminTaskRequestBody(body));
}

function asPlainObject(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null;
    }
    return value as Record<string, unknown>;
}

function parseAdminTaskRequestBody(body: {
    type?: unknown;
    payload?: unknown;
}): AdminCreateTaskRequest {
    const type = typeof body.type === 'string' ? body.type.trim() : '';
    const payload = asPlainObject(body.payload);

    if (payload === null) {
        throw new ApiRequestError(400, 'invalid_param', 'payload 必须是 JSON 对象');
    }

    switch (type) {
        case 'regenerate_daily_export': {
            const date =
                typeof payload.date === 'string' ? payload.date.trim() : '';
            if (!/^[0-9]{8}$/.test(date)) {
                throw new ApiRequestError(
                    400,
                    'invalid_param',
                    'date 必须为 YYYYMMDD 格式'
                );
            }
            return { type, payload: { date } };
        }
        case 'refresh_route_info_now': {
            const trainCodes = Array.isArray(payload.trainCodes)
                ? payload.trainCodes.filter(
                      (item): item is string => typeof item === 'string'
                  )
                : [];
            if (trainCodes.length === 0) {
                throw new ApiRequestError(
                    400,
                    'invalid_param',
                    'trainCodes 至少需要包含一个字符串'
                );
            }
            return { type, payload: { trainCodes } };
        }
        case 'refresh_train_circulation_now': {
            const trainCode =
                typeof payload.trainCode === 'string'
                    ? payload.trainCode.trim()
                    : '';
            if (trainCode.length === 0) {
                throw new ApiRequestError(
                    400,
                    'invalid_param',
                    'trainCode 必须为非空字符串'
                );
            }
            return { type, payload: { trainCode } };
        }
        case 'refresh_all_routes_and_requeue_probe_now':
            return { type, payload: {} };
        case 'detect_coupled_emu_group_now': {
            const bureau =
                typeof payload.bureau === 'string' ? payload.bureau.trim() : '';
            const model =
                typeof payload.model === 'string' ? payload.model.trim() : '';
            if (bureau.length === 0) {
                throw new ApiRequestError(
                    400,
                    'invalid_param',
                    'bureau 不能为空'
                );
            }
            if (model.length === 0) {
                throw new ApiRequestError(
                    400,
                    'invalid_param',
                    'model 不能为空'
                );
            }
            return { type, payload: { bureau, model } };
        }
        case 'run_qrcode_detection_now':
            return { type, payload: {} };
        case 'dispatch_station_board_tasks_now':
            return { type, payload: {} };
        default:
            throw new ApiRequestError(
                400,
                'invalid_param',
                '不支持的管理员任务类型'
            );
    }
}
