import { defineEventHandler, getQuery, getRouterParam } from 'h3';
import {
    buildNextCursor,
    listHistoryByEmuPaged
} from '~/server/services/emuRoutesStore';
import getPerRecordCost from '~/server/utils/api/cost/getPerRecordCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import parseCursor from '~/server/utils/api/query/parseCursor';
import parseLimit from '~/server/utils/api/query/parseLimit';
import parseOptionalTimestamp from '~/server/utils/api/query/parseOptionalTimestamp';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            dynamicCostFromData: (data) =>
                getPerRecordCost(data.items.length, 'historyEmu')
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
            const rows = listHistoryByEmuPaged(
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
                    ts: row.start_at,
                    id: String(row.id),
                    trainCode: row.train_code,
                    startStation: row.start_station_name,
                    endStation: row.end_station_name,
                    line: ''
                }))
            };
        }
    );
});
