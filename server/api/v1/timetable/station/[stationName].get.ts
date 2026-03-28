import { defineEventHandler, getQuery, getRouterParam } from 'h3';
import useConfig from '~/server/config';
import { getReferenceModelsByTrainCodes } from '~/server/services/referenceModelIndexStore';
import {
    getTodayStationTimetableByStationName,
    type TodayScheduleStationIndexRow
} from '~/server/services/todayScheduleCache';
import getPerRecordCost from '~/server/utils/api/cost/getPerRecordCost';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import parseLimit from '~/server/utils/api/query/parseLimit';
import setCacheControl from '~/server/utils/api/response/setCacheControl';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import type { StationTimetableResponse } from '~/types/lookup';

interface StationTimetableCursor {
    clockSortAt: number;
    sortAt: number;
    trainCode: string;
    stationNo: number;
    startAt: number;
}

export default defineEventHandler(async (event) => {
    const cacheMaxAge = useConfig().api.cache.timetableMaxAgeSeconds;

    return executeApi(
        event,
        {
            cors: true,
            requiredScopes: [API_SCOPES.timetable.station.read],
            dynamicCostFromData: (data) =>
                getPerRecordCost(data.items.length, 'timetableStation'),
            successHeaders: (successEvent) =>
                setCacheControl(successEvent, cacheMaxAge)
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
            const rows = getTodayStationTimetableByStationName(stationName);

            ensure(
                rows.length > 0,
                404,
                'not_found',
                '当前暂无该车站的时刻表'
            );

            const startIndex =
                cursor === null ? 0 : findStartIndexFromCursor(rows, cursor);
            const pageRows = rows.slice(startIndex, startIndex + limit);
            const lastRow = pageRows.at(-1);
            const nextCursor =
                startIndex + pageRows.length < rows.length && lastRow
                    ? buildNextCursor(lastRow)
                    : '';
            const referenceModelsByCodeSet = new Map<string, ReturnType<
                typeof getReferenceModelsByTrainCodes
            >>();

            const response: StationTimetableResponse = {
                stationName,
                cursor: typeof query.cursor === 'string' ? query.cursor : '',
                limit,
                nextCursor,
                items: pageRows.map((row) => ({
                    trainCode: row.trainCode,
                    allCodes: [...row.allCodes],
                    arriveAt: row.arriveAt,
                    departAt: row.departAt,
                    startStation: row.startStation,
                    endStation: row.endStation,
                    updatedAt: row.updatedAt,
                    referenceModels: getReferenceModelsForRow(
                        row,
                        referenceModelsByCodeSet
                    )
                }))
            };

            return response;
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

function getReferenceModelsForRow(
    row: TodayScheduleStationIndexRow,
    referenceModelsByCodeSet: Map<
        string,
        ReturnType<typeof getReferenceModelsByTrainCodes>
    >
) {
    const cacheKey = [...row.allCodes].sort((left, right) =>
        left.localeCompare(right)
    ).join('|');
    const cachedReferenceModels = referenceModelsByCodeSet.get(cacheKey);
    if (cachedReferenceModels) {
        return cachedReferenceModels;
    }

    const referenceModels = getReferenceModelsByTrainCodes(row.allCodes);
    referenceModelsByCodeSet.set(cacheKey, referenceModels);
    return referenceModels;
}

function parseStationTimetableCursor(
    raw: unknown,
    label: string
): StationTimetableCursor | null {
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
    const trainCode = trainCodeText?.trim()?.toUpperCase() ?? '';
    const stationNo = Number(stationNoText);
    const startAt = Number(startAtText);

    if (
        !Number.isInteger(clockSortAt) ||
        clockSortAt < 0 ||
        !Number.isInteger(sortAt) ||
        sortAt < 0 ||
        trainCode.length === 0 ||
        !Number.isInteger(stationNo) ||
        stationNo <= 0 ||
        !Number.isInteger(startAt) ||
        startAt < 0
    ) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            `${label} 包含非法值`
        );
    }

    return {
        clockSortAt,
        sortAt,
        trainCode,
        stationNo,
        startAt
    };
}

function buildNextCursor(row: TodayScheduleStationIndexRow) {
    return [
        row.clockSortAt,
        row.sortAt,
        row.trainCode,
        row.stationNo,
        row.startAt
    ].join(':');
}

function findStartIndexFromCursor(
    rows: TodayScheduleStationIndexRow[],
    cursor: StationTimetableCursor
) {
    const exactIndex = rows.findIndex(
        (row) => compareRowWithCursor(row, cursor) === 0
    );
    if (exactIndex >= 0) {
        return exactIndex + 1;
    }

    const nextIndex = rows.findIndex(
        (row) => compareRowWithCursor(row, cursor) > 0
    );
    return nextIndex >= 0 ? nextIndex : rows.length;
}

function compareRowWithCursor(
    row: TodayScheduleStationIndexRow,
    cursor: StationTimetableCursor
) {
    if (row.clockSortAt !== cursor.clockSortAt) {
        return row.clockSortAt - cursor.clockSortAt;
    }

    if (row.sortAt !== cursor.sortAt) {
        return row.sortAt - cursor.sortAt;
    }

    const trainCodeCompare = row.trainCode.localeCompare(cursor.trainCode);
    if (trainCodeCompare !== 0) {
        return trainCodeCompare;
    }

    if (row.stationNo !== cursor.stationNo) {
        return row.stationNo - cursor.stationNo;
    }

    return row.startAt - cursor.startAt;
}
