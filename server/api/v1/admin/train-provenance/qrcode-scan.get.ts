import { defineEventHandler, getQuery } from 'h3';
import { getAdminTrainProvenanceQrcodeScan } from '~/server/domain/admin/trainProvenance';
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
            const detectedAt =
                typeof query.detectedAt === 'string'
                    ? query.detectedAt.trim()
                    : '';
            ensure(
                /^\d{8}$/.test(date),
                400,
                'invalid_param',
                'date 必须是 YYYYMMDD'
            );
            ensure(
                detectedAt.length > 0,
                400,
                'invalid_param',
                'detectedAt 不能为空'
            );

            return getAdminTrainProvenanceQrcodeScan(
                parseExternalServiceDate(date),
                detectedAt
            );
        }
    );
});
