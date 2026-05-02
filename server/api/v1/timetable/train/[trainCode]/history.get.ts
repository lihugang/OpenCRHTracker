import { defineEventHandler, getQuery, getRouterParam } from 'h3';
import {
    formatTimetableHistoryServiceDate,
    listTimetableHistoryCoveragesByTrainCodePaged,
    type TimetableHistoryCoverageRow
} from '~/server/services/timetableHistoryStore';
import getPerRecordCost from '~/server/utils/api/cost/getPerRecordCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import parseCursor from '~/server/utils/api/query/parseCursor';
import parseLimit from '~/server/utils/api/query/parseLimit';
import { getHistoryResponseCacheControlMaxAge } from '~/server/utils/api/response/getResponseCacheControlMaxAge';
import setCacheControl from '~/server/utils/api/response/setCacheControl';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import type { TrainTimetableHistoryListResponse } from '~/types/lookup';

function buildNextCursor(
    rows: Array<Pick<TimetableHistoryCoverageRow, 'service_date_start' | 'id'>>,
    limit: number
) {
    if (rows.length < limit || rows.length === 0) {
        return '';
    }

    const last = rows[rows.length - 1]!;
    return `${formatTimetableHistoryServiceDate(last.service_date_start)}:${last.id}`;
}

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            cors: true,
            requiredScopes: [API_SCOPES.timetable.train.history.read],
            dynamicCostFromData: (data) =>
                getPerRecordCost(data.items.length, 'timetableTrainHistory'),
            successHeaders: (successEvent, data) =>
                setCacheControl(
                    successEvent,
                    getHistoryResponseCacheControlMaxAge(
                        parseCursor(data.cursor, 'cursor')?.serviceDate
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
            const cursor = parseCursor(query.cursor, 'cursor');
            const limit = parseLimit(event);
            const rows = listTimetableHistoryCoveragesByTrainCodePaged(
                trainCode,
                cursor,
                limit
            );

            const response: TrainTimetableHistoryListResponse = {
                trainCode,
                cursor: typeof query.cursor === 'string' ? query.cursor : '',
                limit,
                nextCursor: buildNextCursor(rows, limit),
                items: rows.map((row) => ({
                    id: row.id,
                    historyId: row.content_id,
                    serviceDateStart: formatTimetableHistoryServiceDate(
                        row.service_date_start
                    ),
                    serviceDateEndExclusive: formatTimetableHistoryServiceDate(
                        row.service_date_end_exclusive
                    )
                }))
            };

            return response;
        }
    );
});
