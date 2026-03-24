import { defineEventHandler, getQuery, getRouterParam, setHeader } from 'h3';
import {
    countDailyExportItems,
    getDailyExportContentType,
    getDailyExportFileName,
    readDailyExportText,
    type DailyExportFormat
} from '~/server/services/dailyExportStore';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { getDailyResponseCacheControlMaxAge } from '~/server/utils/api/response/getResponseCacheControlMaxAge';
import setCacheControl from '~/server/utils/api/response/setCacheControl';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';

interface DailyExportResponseData {
    date: string;
    format: DailyExportFormat;
    total: number;
    content: string;
}

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
                    getDailyExportContentType(data.format)
                );
                setHeader(
                    successEvent,
                    'Content-Disposition',
                    `attachment; filename="${data.date}.${data.format}"`
                );
                return data.content;
            },
            successHeaders: (successEvent, data) =>
                setCacheControl(
                    successEvent,
                    getDailyResponseCacheControlMaxAge(data.date)
                )
        },
        async (): Promise<DailyExportResponseData> => {
            const date = getRouterParam(event, 'date');
            const query = getQuery(event);
            const format = (
                typeof query.format === 'string' ? query.format : 'csv'
            ) as DailyExportFormat;

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
                format === 'csv' || format === 'jsonl',
                400,
                'invalid_param',
                'format 必须是 csv 或 jsonl'
            );

            const missingMessage = `${getDailyExportFileName(date, format)} 未生成`;

            ensure(
                date < getCurrentDateString(),
                404,
                'not_found',
                missingMessage
            );

            const content = readDailyExportText(date, format);
            ensure(content !== null, 404, 'not_found', missingMessage);

            return {
                date,
                format,
                total: countDailyExportItems(format, content),
                content
            };
        }
    );
});
