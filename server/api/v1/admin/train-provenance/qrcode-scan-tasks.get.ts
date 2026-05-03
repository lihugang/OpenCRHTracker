import { defineEventHandler, getQuery } from 'h3';
import { getAdminQrcodeScanTaskList } from '~/server/services/adminTrainProvenanceStore';
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
            const date =
                typeof query.date === 'string' ? query.date.trim() : '';

            ensure(
                /^\d{8}$/.test(date),
                400,
                'invalid_param',
                'date 蹇呴』鏄?YYYYMMDD'
            );

            return getAdminQrcodeScanTaskList(date);
        }
    );
});
