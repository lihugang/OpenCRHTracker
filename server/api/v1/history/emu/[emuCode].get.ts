import { defineEventHandler, getQuery, getRouterParam } from 'h3';
import { getEmuHistory } from '~/server/domain/history';
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
    formatExternalServiceDate,
    formatExternalTrainCode,
    parseExternalCursor,
    parseExternalEmuCode
} from '~/server/utils/internal/boundaries';

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
            ensure(
                emuCode.trim().length > 0,
                400,
                'invalid_param',
                'emuCode 不能为空'
            );

            const emuId = parseExternalEmuCode(emuCode);
            ensure(emuId !== null, 404, 'not_found', '未找到该动车组');

            const query = getQuery(event);
            const start = parseOptionalTimestamp(query.start, 'start');
            const end = parseOptionalTimestamp(query.end, 'end');
            const cursor = parseExternalCursor(query.cursor, 'cursor');
            const limit = parseLimit(event);
            const result = getEmuHistory({
                emuId,
                start: start ?? 0,
                end: end ?? Number.MAX_SAFE_INTEGER,
                cursor,
                limit
            });

            return {
                emuCode,
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
                    trainCode: formatExternalTrainCode(row.trainCode)
                }))
            };
        }
    );
});
