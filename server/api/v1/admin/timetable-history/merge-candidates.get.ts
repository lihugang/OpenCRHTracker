import { defineEventHandler, getQuery } from 'h3';
import { getAdminTimetableHistoryMergeCandidates } from '~/server/domain/admin/timetableHistory';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import { parseExternalTrainCodeOrThrow } from '~/server/utils/internal/boundaries';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.admin]
        },
        async () => {
            const query = getQuery(event);
            const trainCode =
                typeof query.trainCode === 'string'
                    ? query.trainCode.trim()
                    : '';

            ensure(
                trainCode.length > 0,
                400,
                'invalid_param',
                'trainCode 不能为空'
            );

            return getAdminTimetableHistoryMergeCandidates(
                parseExternalTrainCodeOrThrow(trainCode, 'trainCode')
            );
        }
    );
});
