import { defineEventHandler, getQuery } from 'h3';
import { getAdminStationBoardDispatchDetail } from '~/server/services/adminTrainProvenanceStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            cors: true,
            requiredScopes: [API_SCOPES.admin]
        },
        async () => {
            const query = getQuery(event);
            const rawTaskRunId =
                typeof query.taskRunId === 'string'
                    ? query.taskRunId.trim()
                    : '';
            const taskRunId = Number.parseInt(rawTaskRunId, 10);

            ensure(
                Number.isInteger(taskRunId) && taskRunId > 0,
                400,
                'invalid_param',
                'taskRunId 必须是正整数'
            );

            return getAdminStationBoardDispatchDetail(taskRunId);
        }
    );
});
