import { defineEventHandler, getQuery } from 'h3';
import { getDebugEchoError } from '~/server/domain/system';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.debug.echoError],
            fixedCost: getFixedCost('debugEchoError')
        },
        async () => {
            const query = getQuery(event);
            const statusCode = Number(query.status ?? '400');
            const errorCode =
                typeof query.code === 'string' && query.code.length > 0
                    ? query.code
                    : 'debug_error';

            ensure(
                Number.isInteger(statusCode) &&
                    statusCode >= 400 &&
                    statusCode < 600,
                400,
                'invalid_param',
                'status 必须是 400-599 的整数'
            );

            return getDebugEchoError({
                status: statusCode,
                code: errorCode
            });
        }
    );
});
