import { defineEventHandler, getQuery, getRouterParam } from 'h3';
import useConfig from '~/server/config';
import {
    buildStationTimetableNextCursor,
    enqueueStationTimetablePlatformRefresh,
    findStationTimetableStartIndex,
    getStationTimetableItems,
    getStationTimetableRows
} from '~/server/domain/timetable';
import getPerRecordCost from '~/server/utils/api/cost/getPerRecordCost';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import parseLimit from '~/server/utils/api/query/parseLimit';
import setCacheControl from '~/server/utils/api/response/setCacheControl';
import getStationTimetableCacheMaxAge from '~/server/utils/api/response/getStationTimetableCacheMaxAge';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import {
    formatExternalTrainCode,
    parseExternalTrainCodeOrThrow
} from '~/server/utils/internal/boundaries';
import type { TrainCodeParts } from '~/server/utils/12306/trainCode';
import type { StationTimetableCursorDomain } from '~/server/domain/timetable';
import { getTodayScheduleServiceDay } from '~/server/services/todayScheduleCache';

export default defineEventHandler(async (event) => {
    const cacheMaxAge = useConfig().api.cache.timetableMaxAgeSeconds;

    return executeApi(
        event,
        {
            cors: true,
            requiredScopes: [API_SCOPES.timetable.station.read],
            dynamicCostFromData: (data) =>
                getPerRecordCost(data.items.length, 'timetableStation'),
            successHeaders: (successEvent, data) =>
                setCacheControl(
                    successEvent,
                    getStationTimetableCacheMaxAge(data, cacheMaxAge)
                )
        },
        async () => {
            const rawStationName = getRouterParam(event, 'stationName');
            const stationName = decodeStationName(rawStationName);

            ensure(
                stationName.length > 0,
                400,
                'invalid_param',
                'stationName 不能为空'
            );

            const query = getQuery(event);
            const cursor = parseStationTimetableCursor(query.cursor, 'cursor');
            const limit = parseLimit(event);
            const rows = getStationTimetableRows(stationName);

            const startIndex =
                cursor === null
                    ? 0
                    : findStationTimetableStartIndex(rows, cursor);
            const pageRows = rows.slice(startIndex, startIndex + limit);
            enqueueStationTimetablePlatformRefresh(
                getTodayScheduleServiceDay(),
                pageRows
            );
            const lastRow = pageRows.at(-1);
            const hasMore = startIndex + pageRows.length < rows.length;
            const nextCursor =
                hasMore && lastRow
                    ? formatStationCursor(
                          buildStationTimetableNextCursor(lastRow)
                      )
                    : '';
            const domainItems = await getStationTimetableItems(pageRows);

            return {
                stationName,
                cursor: typeof query.cursor === 'string' ? query.cursor : '',
                limit,
                nextCursor,
                items: domainItems.map((row) => ({
                    trainCode: formatExternalTrainCode(row.trainCode),
                    allCodes: row.allCodes.map(formatExternalTrainCode),
                    arriveAt: row.arriveAt,
                    departAt: row.departAt,
                    platformNo: row.platformNo,
                    startStation: row.startStation,
                    endStation: row.endStation,
                    updatedAt: row.updatedAt,
                    referenceModels: row.referenceModels
                }))
            };
        }
    );
});

function decodeStationName(rawStationName: string | undefined) {
    if (typeof rawStationName !== 'string') {
        return '';
    }

    try {
        return decodeURIComponent(rawStationName).trim();
    } catch {
        return rawStationName.trim();
    }
}

function parseStationTimetableCursor(
    raw: unknown,
    label: string
): StationTimetableCursorDomain | null {
    if (raw === undefined || raw === null || raw === '') {
        return null;
    }
    if (typeof raw !== 'string') {
        throw new ApiRequestError(
            400,
            'invalid_param',
            `${label} 必须是字符串`
        );
    }

    const match = raw.trim().match(/^(\d+):(\d+):([^:]+):(\d+):(\d+)$/);
    if (!match) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            `${label} 必须是 "sortAt:trainCode:stationNo:startAt" 格式`
        );
    }

    const [
        ,
        clockSortAtText,
        sortAtText,
        trainCodeText,
        stationNoText,
        startAtText
    ] = match;
    const clockSortAt = Number(clockSortAtText);
    const sortAt = Number(sortAtText);
    let trainCode: TrainCodeParts;
    try {
        trainCode = parseExternalTrainCodeOrThrow(
            trainCodeText,
            `${label}.trainCode`
        );
    } catch {
        throw new ApiRequestError(400, 'invalid_param', `${label} 包含非法值`);
    }
    const stationNo = Number(stationNoText);
    const startAt = Number(startAtText);

    if (
        !Number.isInteger(clockSortAt) ||
        clockSortAt < 0 ||
        !Number.isInteger(sortAt) ||
        sortAt < 0 ||
        !Number.isInteger(stationNo) ||
        stationNo <= 0 ||
        !Number.isInteger(startAt) ||
        startAt < 0
    ) {
        throw new ApiRequestError(400, 'invalid_param', `${label} 包含非法值`);
    }

    return {
        clockSortAt,
        sortAt,
        trainCode,
        stationNo,
        startAt
    };
}

function formatStationCursor(cursor: StationTimetableCursorDomain) {
    return [
        cursor.clockSortAt,
        cursor.sortAt,
        formatExternalTrainCode(cursor.trainCode),
        cursor.stationNo,
        cursor.startAt
    ].join(':');
}
