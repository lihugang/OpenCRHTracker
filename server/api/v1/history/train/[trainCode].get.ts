import { defineEventHandler, getQuery, getRouterParam } from 'h3';
import {
    buildNextCursor,
    listHistoryByTrainPaged
} from '~/server/services/emuRoutesStore';
import getPerRecordCost from '~/server/utils/api/cost/getPerRecordCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import parseOptionalTimestamp from '~/server/utils/api/query/parseOptionalTimestamp';
import parseCursor from '~/server/utils/api/query/parseCursor';
import parseLimit from '~/server/utils/api/query/parseLimit';
import { getHistoryResponseCacheControlMaxAge } from '~/server/utils/api/response/getResponseCacheControlMaxAge';
import setCacheControl from '~/server/utils/api/response/setCacheControl';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            cors: true,
            requiredScopes: [API_SCOPES.history.train.read],
            dynamicCostFromData: (data) =>
                getPerRecordCost(data.items.length, 'historyTrain'),
            successHeaders: (successEvent, data) =>
                setCacheControl(
                    successEvent,
                    getHistoryResponseCacheControlMaxAge(
                        data.items[0]?.startAt,
                        data.items.length,
                        data.limit
                    )
                )
        },
        async () => {
            const trainCode = getRouterParam(event, 'trainCode');

            ensure(
                typeof trainCode === 'string' && trainCode.length > 0,
                400,
                'invalid_param',
                'trainCode 不能为空'
            );

            const query = getQuery(event);
            const start = parseOptionalTimestamp(query.start, 'start');
            const end = parseOptionalTimestamp(query.end, 'end');
            const cursor = parseCursor(query.cursor, 'cursor');
            const limit = parseLimit(event);
            const rows = listHistoryByTrainPaged(
                trainCode,
                start ?? 0,
                end ?? Number.MAX_SAFE_INTEGER,
                cursor,
                limit
            );

            return {
                trainCode,
                start,
                end,
                cursor: typeof query.cursor === 'string' ? query.cursor : '',
                limit,
                nextCursor: buildNextCursor(rows, limit),
                items: rows.map((row) => ({
                    startAt: row.start_at,
                    endAt: row.end_at,
                    id: String(row.id),
                    emuCode: row.emu_code,
                    startStation: row.start_station_name,
                    endStation: row.end_station_name,
                    line: []
                }))
            };
        }
    );
});
