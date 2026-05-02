import { defineEventHandler, getRouterParam, setHeader } from 'h3';
import { getHistoricalTimetableContent } from '~/server/services/historicalTimetableResolver';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import type { HistoricalTimetableData } from '~/types/lookup';

const IMMUTABLE_CACHE_SECONDS = 365 * 24 * 60 * 60;

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            cors: true,
            requiredScopes: [API_SCOPES.timetable.train.history.read],
            fixedCost: getFixedCost('timetableTrainHistory'),
            successHeaders: (successEvent) => {
                setHeader(
                    successEvent,
                    'Cache-Control',
                    `public, max-age=${IMMUTABLE_CACHE_SECONDS}, immutable`
                );
                setHeader(
                    successEvent,
                    'CDN-Cache-Control',
                    `public, s-maxage=${IMMUTABLE_CACHE_SECONDS}, immutable`
                );
            }
        },
        async () => {
            const trainCode = getRouterParam(event, 'trainCode');
            ensure(
                typeof trainCode === 'string' && trainCode.length > 0,
                400,
                'invalid_param',
                'trainCode 不能为空'
            );

            const rawHistoryId = getRouterParam(event, 'historyId');
            const historyId =
                typeof rawHistoryId === 'string' ? Number(rawHistoryId) : NaN;

            ensure(
                Number.isInteger(historyId) && historyId > 0,
                400,
                'invalid_param',
                'historyId 必须是正整数'
            );

            const timetable = getHistoricalTimetableContent(historyId);
            ensure(
                timetable !== null,
                404,
                'not_found',
                '历史时刻表不存在'
            );

            setHeader(event, 'ETag', `"history-timetable-${historyId}"`);

            const response: HistoricalTimetableData = {
                historyId,
                startStation: timetable.startStation,
                endStation: timetable.endStation,
                startOffset: timetable.startOffset,
                endOffset: timetable.endOffset,
                stops: timetable.stops.map((stop) => ({
                    stationNo: stop.stationNo,
                    stationName: stop.stationName,
                    arriveOffset: stop.arriveAt,
                    departOffset: stop.departAt,
                    stationTrainCode: stop.stationTrainCode,
                    isStart: stop.isStart,
                    isEnd: stop.isEnd
                }))
            };

            return response;
        }
    );
});
