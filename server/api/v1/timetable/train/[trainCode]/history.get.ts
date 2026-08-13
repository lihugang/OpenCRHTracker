import { defineEventHandler, getQuery, getRouterParam } from 'h3';
import { getTrainTimetableHistoryPaged } from '~/server/domain/timetable';
import getPerRecordCost from '~/server/utils/api/cost/getPerRecordCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import parseCursor from '~/server/utils/api/query/parseCursor';
import parseLimit from '~/server/utils/api/query/parseLimit';
import { getHistoryResponseCacheControlMaxAge } from '~/server/utils/api/response/getResponseCacheControlMaxAge';
import setCacheControl from '~/server/utils/api/response/setCacheControl';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import {
    parseExternalCursor,
    parseExternalTrainCodeOrThrow,
    formatExternalServiceDate
} from '~/server/utils/internal/boundaries';

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
            const limit = parseLimit(event);
            const result = getTrainTimetableHistoryPaged({
                trainCode: parseExternalTrainCodeOrThrow(
                    trainCode,
                    'trainCode'
                ),
                cursor: parseExternalCursor(query.cursor, 'cursor'),
                limit
            });

            return {
                trainCode,
                cursor: typeof query.cursor === 'string' ? query.cursor : '',
                limit,
                nextCursor:
                    result.nextCursor === null
                        ? ''
                        : `${formatExternalServiceDate(result.nextCursor.serviceDate)}:${result.nextCursor.id}`,
                items: result.items.map((row) => ({
                    id: row.coverageId,
                    historyId: row.timetableId,
                    serviceDateStart: formatExternalServiceDate(
                        row.serviceDayStart
                    ),
                    serviceDateEndExclusive: formatExternalServiceDate(
                        row.serviceDayEndExclusive
                    )
                }))
            };
        }
    );
});
