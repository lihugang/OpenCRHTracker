import { defineEventHandler, getQuery, getRouterParam, setHeader } from 'h3';
import { getDailyExport } from '~/server/domain/exports';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { getDailyResponseCacheControlMaxAge } from '~/server/utils/api/response/getResponseCacheControlMaxAge';
import setCacheControl from '~/server/utils/api/response/setCacheControl';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';

function parseBinaryFlag(value: unknown): boolean {
    if (value === undefined) {
        return false;
    }
    if (value === '1' || value === 'true') {
        return true;
    }
    if (value === '0' || value === 'false') {
        return false;
    }

    throw new Error('binary');
}

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            cors: true,
            requiredScopes: [API_SCOPES.exports.daily.read],
            fixedCost: getFixedCost('exportDaily'),
            rawSuccessResponse: (successEvent, data) => {
                const successQuery = getQuery(successEvent);
                const binaryRequested =
                    successQuery.binary === '1' ||
                    successQuery.binary === 'true';
                if (!binaryRequested) {
                    return null;
                }

                setHeader(
                    successEvent,
                    'Content-Type',
                    'text/csv; charset=utf-8'
                );
                setHeader(
                    successEvent,
                    'Content-Disposition',
                    `attachment; filename="${data.date}.csv"`
                );
                return data.content;
            },
            successHeaders: (successEvent, data) =>
                setCacheControl(
                    successEvent,
                    getDailyResponseCacheControlMaxAge(data.date)
                )
        },
        async () => {
            const date = getRouterParam(event, 'date');
            const query = getQuery(event);

            try {
                parseBinaryFlag(query.binary);
            } catch {
                ensure(false, 400, 'invalid_param', 'binary 必须是 true/false');
            }

            ensure(
                typeof date === 'string' && /^\d{8}$/.test(date),
                400,
                'invalid_param',
                'date 必须是 YYYYMMDD'
            );

            ensure(
                date < getCurrentDateString(),
                404,
                'not_found',
                `${date}.csv 未生成`
            );

            const result = getDailyExport(date);

            return {
                date,
                format: 'csv',
                total: result.total,
                content: result.content
            };
        }
    );
});
