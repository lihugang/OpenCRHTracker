import { defineEventHandler, getQuery, getRouterParam } from 'h3';
import getPerRecordCost from '~/server/utils/api/cost/getPerRecordCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
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
            const cursor = typeof query.cursor === 'string' ? query.cursor : '';
            const limit = parseLimit(event);

            return {
                emuCode,
                start,
                end,
                cursor,
                limit,
                nextCursor: '',
                items: [] as Array<{
                    ts: number;
                    id: string;
                    trainCode: string;
                    line: string;
                }>
            };
        }
    );
});
