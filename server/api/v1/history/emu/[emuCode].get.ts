import { defineEventHandler, getQuery, getRouterParam } from 'h3';
import {
    buildNextCursor,
    listHistoryLightByEmuPaged
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
            requiredScopes: [API_SCOPES.history.emu.read],
            dynamicCostFromData: (data) =>
                getPerRecordCost(data.items.length, 'historyEmu'),
            successHeaders: (successEvent, data) =>
                setCacheControl(
                    successEvent,
                    getHistoryResponseCacheControlMaxAge(
                        parseCursor(data.cursor, 'cursor')?.serviceDate
                    )
                )
        },
        async () => {
            const emuCode = getRouterParam(event, 'emuCode');

            ensure(
                typeof emuCode === 'string' && emuCode.length > 0,
                400,
                'invalid_param',
                'emuCode 不能为空'
            );

            const query = getQuery(event);
            const start = parseOptionalTimestamp(query.start, 'start');
            const end = parseOptionalTimestamp(query.end, 'end');
            const cursor = parseCursor(query.cursor, 'cursor');
            const limit = parseLimit(event);
            const rows = listHistoryLightByEmuPaged(
                emuCode,
                start ?? 0,
                end ?? Number.MAX_SAFE_INTEGER,
                cursor,
                limit
            );

            return {
                emuCode,
                start,
                end,
                cursor: typeof query.cursor === 'string' ? query.cursor : '',
                limit,
                nextCursor: buildNextCursor(rows, limit),
                items: rows.map((row) => ({
                    id: String(row.id),
                    serviceDate: row.service_date,
                    timetableId: row.timetable_id,
                    trainCode: row.train_code
                }))
            };
        }
    );
});
