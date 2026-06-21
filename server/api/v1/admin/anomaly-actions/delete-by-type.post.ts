import { defineEventHandler, readBody } from 'h3';
import { deleteAnomalyRoutesByType } from '~/server/services/adminAnomalyActionStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

interface DeleteAnomalyRoutesByTypeBody {
    date?: unknown;
    type?: unknown;
}

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.admin]
        },
        async () => {
            const body =
                (await readBody<DeleteAnomalyRoutesByTypeBody | null>(event)) ??
                {};

            ensure(
                typeof body === 'object' &&
                    body !== null &&
                    !Array.isArray(body),
                400,
                'invalid_param',
                '请求体必须是 JSON 对象'
            );

            const date = typeof body.date === 'string' ? body.date.trim() : '';
            const type = typeof body.type === 'string' ? body.type.trim() : '';

            ensure(
                /^\d{8}$/.test(date),
                400,
                'invalid_param',
                'date 必须是 YYYYMMDD'
            );
            ensure(type.length > 0, 400, 'invalid_param', 'type 不能为空');

            return deleteAnomalyRoutesByType(date, type);
        }
    );
});
