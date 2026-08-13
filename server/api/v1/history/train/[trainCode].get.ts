import { defineEventHandler, getQuery, getRouterParam } from 'h3';
import { getTrainHistory } from '~/server/domain/history';
import getPerRecordCost from '~/server/utils/api/cost/getPerRecordCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import parseCursor from '~/server/utils/api/query/parseCursor';
import parseOptionalTimestamp from '~/server/utils/api/query/parseOptionalTimestamp';
import parseLimit from '~/server/utils/api/query/parseLimit';
import { getHistoryResponseCacheControlMaxAge } from '~/server/utils/api/response/getResponseCacheControlMaxAge';
import setCacheControl from '~/server/utils/api/response/setCacheControl';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import {
    formatExternalEmuCode,
    formatExternalServiceDate,
    parseExternalCursor,
    parseExternalTrainCodeOrThrow
} from '~/server/utils/internal/boundaries';

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
            const start = parseOptionalTimestamp(query.start, 'start');
            const end = parseOptionalTimestamp(query.end, 'end');
            const cursor = parseExternalCursor(query.cursor, 'cursor');
            const limit = parseLimit(event);
            const result = getTrainHistory({
                trainCode: parseExternalTrainCodeOrThrow(trainCode, 'trainCode'),
                start: start ?? 0,
                end: end ?? Number.MAX_SAFE_INTEGER,
                cursor,
                limit
            });

            return {
                trainCode,
                start,
                end,
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
                    emuCode: formatExternalEmuCode(row.emuId)
                }))
            };
        }
    );
});
