import { defineEventHandler, getQuery } from 'h3';
import getPerRecordCost from '~/server/utils/api/cost/getPerRecordCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import parseLimit from '~/server/utils/api/query/parseLimit';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            dynamicCostFromData: (data) =>
                getPerRecordCost(data.items.length, 'recordsDaily')
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

            const cursor = typeof query.cursor === 'string' ? query.cursor : '';
            const limit = parseLimit(event);

            return {
                date,
                cursor,
                limit,
                nextCursor: '',
                items: [] as Array<{
                    ts: number;
                    id: string;
                    emuCode: string;
                    trainCode: string;
                    line: string;
                }>
            };
        }
    );
});
