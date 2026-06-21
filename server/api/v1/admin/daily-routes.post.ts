import { defineEventHandler, readBody } from 'h3';
import { createAdminDailyRoute } from '~/server/services/adminDailyRouteMaintenanceStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

interface CreateDailyRouteBody {
    date?: unknown;
    trainCode?: unknown;
    emuCode?: unknown;
    timetableId?: unknown;
}

function normalizeTimetableId(value: unknown) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    if (typeof value === 'number' && Number.isInteger(value)) {
        return value;
    }

    if (typeof value === 'string' && /^\d+$/.test(value)) {
        return Number.parseInt(value, 10);
    }

    return Number.NaN;
}

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.admin]
        },
        async () => {
            const body =
                (await readBody<CreateDailyRouteBody | null>(event)) ?? {};

            ensure(
                typeof body === 'object' &&
                    body !== null &&
                    !Array.isArray(body),
                400,
                'invalid_param',
                '请求体必须是 JSON 对象'
            );

            const date = typeof body.date === 'string' ? body.date.trim() : '';
            const trainCode =
                typeof body.trainCode === 'string' ? body.trainCode.trim() : '';
            const emuCode =
                typeof body.emuCode === 'string' ? body.emuCode.trim() : '';
            const timetableId = normalizeTimetableId(body.timetableId);

            ensure(
                /^\d{8}$/.test(date),
                400,
                'invalid_param',
                'date 必须是 YYYYMMDD'
            );
            ensure(
                trainCode.length > 0,
                400,
                'invalid_param',
                'trainCode 不能为空'
            );
            ensure(
                emuCode.length > 0,
                400,
                'invalid_param',
                'emuCode 不能为空'
            );
            ensure(
                timetableId === null ||
                    (Number.isInteger(timetableId) && timetableId > 0),
                400,
                'invalid_param',
                'timetableId 必须是正整数或 null'
            );

            return createAdminDailyRoute(date, trainCode, emuCode, timetableId);
        }
    );
});
