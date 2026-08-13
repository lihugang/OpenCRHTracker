import { defineEventHandler, getRouterParam } from 'h3';
import { deleteAdminTimetableHistoryCoverage } from '~/server/domain/admin/timetableHistory';
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
            const coverageId = getRouterParam(event, 'coverageId') ?? '';

            ensure(
                /^\d+$/.test(coverageId),
                400,
                'invalid_param',
                'coverageId 必须是正整数'
            );

            return deleteAdminTimetableHistoryCoverage(
                Number.parseInt(coverageId, 10)
            );
        }
    );
});
