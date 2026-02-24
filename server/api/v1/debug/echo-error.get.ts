import { defineEventHandler, getQuery } from 'h3';
import useConfig from '~/server/config';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';

export default defineEventHandler(async (event) => {
    const config = useConfig();

    return executeApi(
        event,
        {
            fixedCost: getFixedCost('debugEchoError')
        },
        async () => {
            ensure(
                import.meta.dev && config.api.debug.enableEchoError,
                404,
                'not_found',
                '此接口在当前环境不可用'
            );

            const query = getQuery(event);
            const statusCode = Number(query.status ?? '400');
            const errorCode =
                typeof query.code === 'string' && query.code.length > 0
                    ? query.code
                    : 'debug_error';
            const message =
                typeof query.message === 'string' && query.message.length > 0
                    ? query.message
                    : '这是调试错误返回';

            ensure(
                Number.isInteger(statusCode) &&
                    statusCode >= 400 &&
                    statusCode < 600,
                400,
                'invalid_param',
                'status 必须是 400-599 的整数'
            );
            throw new ApiRequestError(statusCode, errorCode, message);
        }
    );
});
