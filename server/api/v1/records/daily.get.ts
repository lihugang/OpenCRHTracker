import { defineEventHandler, getQuery } from 'h3';
import { getDailyRecords } from '~/server/domain/records';
import getPerRecordCost from '~/server/utils/api/cost/getPerRecordCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import parseLimit from '~/server/utils/api/query/parseLimit';
import { getDailyResponseCacheControlMaxAge } from '~/server/utils/api/response/getResponseCacheControlMaxAge';
import setCacheControl from '~/server/utils/api/response/setCacheControl';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import {
    formatExternalEmuCode,
    formatExternalServiceDate,
    formatExternalTrainCode,
    parseExternalCursor,
    parseExternalServiceDate
} from '~/server/utils/internal/boundaries';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            cors: true,
            requiredScopes: [API_SCOPES.records.daily.read],
            dynamicCostFromData: (data) =>
                getPerRecordCost(data.items.length, 'recordsDaily'),
            successHeaders: (successEvent, data) =>
                setCacheControl(
                    successEvent,
                    getDailyResponseCacheControlMaxAge(data.date)
                )
        },
        async () => {
            const query = getQuery(event);
            const date = typeof query.date === 'string' ? query.date : '';

            ensure(
                /^\d{8}$/.test(date),
                400,
                'invalid_param',
                'date 必须是 YYYYMMDD'
            );

            const limit = parseLimit(event);
            const result = getDailyRecords({
                serviceDay: parseExternalServiceDate(date),
                cursor: parseExternalCursor(query.cursor, 'cursor'),
                limit
            });

            return {
                date,
                cursor: typeof query.cursor === 'string' ? query.cursor : '',
                limit,
                nextCursor:
                    result.nextCursor === null
                        ? ''
                        : `${formatExternalServiceDate(result.nextCursor.serviceDate)}:${result.nextCursor.id}`,
                items: result.items.map((row) => ({
                    id: String(row.id),
                    serviceDate: formatExternalServiceDate(row.serviceDay),
                    timetableId: row.timetableId,
                    emuCode: formatExternalEmuCode(row.emuId),
                    trainCode: formatExternalTrainCode(row.trainCode)
                }))
            };
        }
    );
});
