import { defineEventHandler, getQuery } from 'h3';
import {
    buildNextCursor,
    listDailyRecordsPaged
} from '~/server/services/emuRoutesStore';
import getPerRecordCost from '~/server/utils/api/cost/getPerRecordCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import parseCursor from '~/server/utils/api/query/parseCursor';
import parseLimit from '~/server/utils/api/query/parseLimit';
import { getDailyResponseCacheControlMaxAge } from '~/server/utils/api/response/getResponseCacheControlMaxAge';
import setCacheControl from '~/server/utils/api/response/setCacheControl';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import getDayTimestampRange from '~/server/utils/date/getDayTimestampRange';

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

            const cursor = parseCursor(query.cursor, 'cursor');
            const limit = parseLimit(event);
            const dayRange = getDayTimestampRange(date);
            const rows = listDailyRecordsPaged(
                dayRange.startAt,
                dayRange.endAt,
                cursor,
                limit
            );

            return {
                date,
                cursor: typeof query.cursor === 'string' ? query.cursor : '',
                limit,
                nextCursor: buildNextCursor(rows, limit),
                items: rows.map((row) => ({
                    startAt: row.start_at,
                    id: String(row.id),
                    emuCode: row.emu_code,
                    trainCode: row.train_code,
                    startStation: row.start_station_name,
                    endStation: row.end_station_name,
                    line: []
                }))
            };
        }
    );
});
