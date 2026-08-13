import { defineEventHandler, getQuery } from 'h3';
import { getAdminTrainProvenanceCouplingScanTasks } from '~/server/domain/admin/trainProvenance';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import { parseExternalServiceDate } from '~/server/utils/internal/boundaries';

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
            ensure(
                /^\d{8}$/.test(date),
                400,
                'invalid_param',
                'date 必须是 YYYYMMDD'
            );

            return getAdminTrainProvenanceCouplingScanTasks(
                parseExternalServiceDate(date)
            );
        }
    );
});
