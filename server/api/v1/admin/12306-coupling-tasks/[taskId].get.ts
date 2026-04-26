import { defineEventHandler, getQuery, getRouterParam } from 'h3';
import { get12306CouplingTask } from '~/server/services/requestMetrics12306Store';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.admin]
        },
        async () => {
            const query = getQuery(event);
            const date =
                typeof query.date === 'string' ? query.date.trim() : '';
            const rawTaskId = getRouterParam(event, 'taskId')?.trim() ?? '';
            const taskId = Number.parseInt(rawTaskId, 10);

            ensure(
                /^\d{8}$/.test(date),
                400,
                'invalid_param',
                'date 必须是 YYYYMMDD'
            );
            ensure(
                Number.isInteger(taskId) && taskId > 0,
                400,
                'invalid_param',
                'taskId 必须是正整数'
            );

            return get12306CouplingTask({
                date,
                taskId
            });
        }
    );
});
