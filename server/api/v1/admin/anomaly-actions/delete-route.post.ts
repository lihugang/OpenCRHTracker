import { defineEventHandler, readBody } from 'h3';
import { deleteAnomalyRoute } from '~/server/services/adminAnomalyActionStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

interface DeleteAnomalyRouteBody {
    date?: unknown;
    routeId?: unknown;
}

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.admin]
        },
        async () => {
            const body =
                (await readBody<DeleteAnomalyRouteBody | null>(event)) ?? {};

            ensure(
                typeof body === 'object' &&
                    body !== null &&
                    !Array.isArray(body),
                400,
                'invalid_param',
                '请求体必须是 JSON 对象'
            );

            const date = typeof body.date === 'string' ? body.date.trim() : '';
            const routeId =
                typeof body.routeId === 'string' ? body.routeId.trim() : '';

            ensure(
                /^\d{8}$/.test(date),
                400,
                'invalid_param',
                'date 必须是 YYYYMMDD'
            );
            ensure(
                routeId.length > 0,
                400,
                'invalid_param',
                'routeId 不能为空'
            );

            return deleteAnomalyRoute(date, routeId);
        }
    );
});
