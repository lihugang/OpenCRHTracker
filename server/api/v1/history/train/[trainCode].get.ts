import { defineEventHandler, getQuery, getRouterParam } from 'h3';
import {
    buildNextCursor,
    listHistoryByTrainPaged
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
                getPerRecordCost(data.items.length, 'historyTrain')
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
                    ts: row.start_at,
                    id: String(row.id),
                    emuCode: row.emu_code,
                    line: ''
                }))
            };
        }
    );
});
