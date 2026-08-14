import { createHash } from 'node:crypto';
import { getReferenceModelsByTrainCodes } from '~/server/services/referenceModelIndexStore';
import { getPreferredTrainCirculation } from '~/server/services/trainCirculationIndexStore';
import {
    getTodayScheduleTimetableByTrainCode,
    getTodayScheduleServiceDay,
    getTodayStationTimetableByStationNameWithSupplement,
    type TodayScheduleStationIndexRow
} from '~/server/services/todayScheduleCache';
import { getSupplementTrainTimetableByTrainCode } from '~/server/services/supplementTrainRegistryStore';
import {
    getHistoricalTimetableContent,
    type HistoricalTimetableContent,
    type HistoricalTimetableStop
} from '~/server/services/historicalTimetableResolver';
import {
    listTimetableHistoryCoveragesByTrainCode,
    listTimetableHistoryCoveragesByTrainCodePaged,
    type TimetableHistoryCoverageRow
} from '~/server/services/timetableHistoryStore';
import {
    renderTrainCirculationImage,
    type TrainCirculationImageFormat
} from '~/server/services/trainCirculationImageService';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import resolveBureauNameByCode from '~/utils/railway/resolveBureauNameByCode';
import type { TrainCodeParts } from '~/server/utils/12306/trainCode';
import { formatExternalTrainCode } from '~/server/utils/internal/boundaries';
import type { ServiceDay } from '~/server/utils/date/serviceDay';
import type { ExternalCursorPoint } from '~/server/utils/internal/boundaries';

export interface CurrentTimetableDomainStop {
    stationNo: number;
    stationName: string;
    arriveAt: number | null;
    departAt: number | null;
    stationTrainCode: TrainCodeParts;
    wicket: string;
    distance: number | null;
    platformNo: number | null;
    isStart: boolean;
    isEnd: boolean;
}

export interface CurrentTimetableDomainResult {
    updatedAt: number | null;
    requestTrainCode: TrainCodeParts;
    trainCode: TrainCodeParts;
    internalCode: string;
    allCodes: TrainCodeParts[];
    bureauCode: string;
    bureauName: string;
    trainDepartment: string;
    passengerDepartment: string;
    referenceModels: Awaited<ReturnType<typeof getReferenceModelsByTrainCodes>>;
    startStation: string;
    endStation: string;
    startAt: number;
    endAt: number;
    circulation: ReturnType<typeof getPreferredTrainCirculation>;
    stops: CurrentTimetableDomainStop[];
}

export async function getCurrentTrainTimetable(
    trainCode: TrainCodeParts
): Promise<CurrentTimetableDomainResult> {
    const scheduleTimetable = getTodayScheduleTimetableByTrainCode(trainCode);
    const supplementTimetable = scheduleTimetable
        ? null
        : getSupplementTrainTimetableByTrainCode(trainCode);
    const timetable = scheduleTimetable ?? supplementTimetable;

    if (!timetable || timetable.stops.length === 0) {
        throw new ApiRequestError(404, 'not_found', '当前暂无时刻表');
    }

    return {
        updatedAt: timetable.updatedAt,
        requestTrainCode: trainCode,
        trainCode: timetable.trainCode,
        internalCode: timetable.trainInternalCode,
        allCodes: timetable.allCodes,
        bureauCode: timetable.bureauCode,
        bureauName: resolveBureauNameByCode(timetable.bureauCode),
        trainDepartment: timetable.trainDepartment,
        passengerDepartment: timetable.passengerDepartment,
        referenceModels: await getReferenceModelsByTrainCodes(
            timetable.allCodes
        ),
        startStation: timetable.startStation,
        endStation: timetable.endStation,
        startAt: timetable.startAt,
        endAt: timetable.endAt,
        circulation:
            supplementTimetable !== null
                ? null
                : getPreferredTrainCirculation({
                      trainInternalCode: timetable.trainInternalCode,
                      allCodes: timetable.allCodes
                  }),
        stops: timetable.stops.map((stop) => ({
            stationNo: stop.stationNo,
            stationName: stop.stationName,
            arriveAt: stop.arriveAt,
            departAt: stop.departAt,
            stationTrainCode: stop.stationTrainCode,
            wicket: stop.wicket,
            distance: stop.distance,
            platformNo: stop.platformNo,
            isStart: stop.isStart,
            isEnd: stop.isEnd
        }))
    };
}

export interface TimetableHistoryCoverageDomainItem {
    coverageId: number;
    timetableId: number;
    serviceDayStart: ServiceDay;
    serviceDayEndExclusive: ServiceDay;
}

export interface TimetableHistoryPageDomainResult {
    items: TimetableHistoryCoverageDomainItem[];
    cursor: ExternalCursorPoint | null;
    limit: number;
    nextCursor: ExternalCursorPoint | null;
}

function toCoverageDomainItem(
    row: TimetableHistoryCoverageRow
): TimetableHistoryCoverageDomainItem {
    return {
        coverageId: row.id,
        timetableId: row.content_id,
        serviceDayStart: row.service_date_start,
        serviceDayEndExclusive: row.service_date_end_exclusive
    };
}

export function getTrainTimetableHistoryPaged(input: {
    trainCode: TrainCodeParts;
    cursor: ExternalCursorPoint | null;
    limit: number;
}): TimetableHistoryPageDomainResult {
    const rows = listTimetableHistoryCoveragesByTrainCodePaged(
        input.trainCode,
        input.cursor,
        input.limit
    );

    const nextCursor =
        rows.length < input.limit || rows.length === 0
            ? null
            : {
                  serviceDate: rows[rows.length - 1]!.service_date_start,
                  id: rows[rows.length - 1]!.id
              };

    return {
        items: rows.map(toCoverageDomainItem),
        cursor: input.cursor,
        limit: input.limit,
        nextCursor
    };
}

export function getTrainTimetableHistory(trainCode: TrainCodeParts) {
    return listTimetableHistoryCoveragesByTrainCode(trainCode).map(
        toCoverageDomainItem
    );
}

export function getTrainTimetableHistoryDetail(
    timetableId: number
): HistoricalTimetableContent {
    const content = getHistoricalTimetableContent(timetableId);
    if (content === null) {
        throw new ApiRequestError(404, 'not_found', '历史时刻表不存在');
    }
    return content;
}

export interface StationTimetableCursorDomain {
    clockSortAt: number;
    sortAt: number;
    trainCode: TrainCodeParts;
    stationNo: number;
    startAt: number;
}

export interface StationTimetableDomainItem {
    trainCode: TrainCodeParts;
    allCodes: TrainCodeParts[];
    arriveAt: number | null;
    departAt: number | null;
    platformNo: number | null;
    startStation: string;
    endStation: string;
    updatedAt: number | null;
    referenceModels: Awaited<ReturnType<typeof getReferenceModelsByTrainCodes>>;
}

export function getStationTimetableRows(stationName: string) {
    const rows =
        getTodayStationTimetableByStationNameWithSupplement(stationName);
    if (rows.length === 0) {
        throw new ApiRequestError(404, 'not_found', '当前暂无该车站的时刻表');
    }
    return rows;
}

export function findStationTimetableStartIndex(
    rows: readonly TodayScheduleStationIndexRow[],
    cursor: StationTimetableCursorDomain | null
) {
    if (cursor === null) {
        return 0;
    }

    const exactIndex = rows.findIndex(
        (row) => compareStationRowWithCursor(row, cursor) === 0
    );
    if (exactIndex >= 0) {
        return exactIndex + 1;
    }

    const nextIndex = rows.findIndex(
        (row) => compareStationRowWithCursor(row, cursor) > 0
    );
    return nextIndex >= 0 ? nextIndex : rows.length;
}

export function buildStationTimetableNextCursor(
    row: TodayScheduleStationIndexRow
): StationTimetableCursorDomain {
    return {
        clockSortAt: row.clockSortAt,
        sortAt: row.sortAt,
        trainCode: row.trainCode,
        stationNo: row.stationNo,
        startAt: row.startAt
    };
}

export interface StationTimetableV2CursorPoint {
    serviceDate: ServiceDay;
    id: number;
}

export interface StationTimetableDomainResult {
    serviceDay: ServiceDay;
    cursor: StationTimetableV2CursorPoint | null;
    limit: number;
    nextCursor: StationTimetableV2CursorPoint | null;
    items: StationTimetableDomainItem[];
}

export function buildStationTimetableCursorId(
    row: TodayScheduleStationIndexRow
): number {
    const digest = createHash('sha256').update(row.stableKey).digest();
    return Number(BigInt.asUintN(53, digest.readBigUInt64BE(0)));
}

export function findStationTimetableV2StartIndex(
    rows: readonly TodayScheduleStationIndexRow[],
    serviceDay: ServiceDay,
    id: number
): number {
    if (serviceDay !== getTodayScheduleServiceDay()) {
        return rows.length;
    }

    const exactIndex = rows.findIndex(
        (row) => buildStationTimetableCursorId(row) === id
    );
    return exactIndex >= 0 ? exactIndex + 1 : rows.length;
}

export async function getStationTimetable(input: {
    stationName: string;
    cursor: StationTimetableV2CursorPoint | null;
    limit: number;
}): Promise<StationTimetableDomainResult> {
    const rows = getStationTimetableRows(input.stationName);
    const serviceDay = getTodayScheduleServiceDay();
    const startIndex =
        input.cursor === null
            ? 0
            : findStationTimetableV2StartIndex(
                  rows,
                  input.cursor.serviceDate,
                  input.cursor.id
              );
    const pageRows = rows.slice(startIndex, startIndex + input.limit);
    const lastRow = pageRows.at(-1);
    const hasMore = startIndex + pageRows.length < rows.length;
    const nextCursor =
        hasMore && lastRow
            ? {
                  serviceDate: serviceDay,
                  id: buildStationTimetableCursorId(lastRow)
              }
            : null;
    const items = await getStationTimetableItems(pageRows);

    return {
        serviceDay,
        cursor: input.cursor,
        limit: input.limit,
        nextCursor,
        items
    };
}

function compareStationRowWithCursor(
    row: TodayScheduleStationIndexRow,
    cursor: StationTimetableCursorDomain
) {
    if (row.clockSortAt !== cursor.clockSortAt) {
        return row.clockSortAt - cursor.clockSortAt;
    }
    if (row.sortAt !== cursor.sortAt) {
        return row.sortAt - cursor.sortAt;
    }

    const left = formatExternalTrainCode(row.trainCode);
    const right = formatExternalTrainCode(cursor.trainCode);
    const trainCodeCompare = left.localeCompare(right);
    if (trainCodeCompare !== 0) {
        return trainCodeCompare;
    }
    if (row.stationNo !== cursor.stationNo) {
        return row.stationNo - cursor.stationNo;
    }
    return row.startAt - cursor.startAt;
}

export async function getStationTimetableItems(
    rows: readonly TodayScheduleStationIndexRow[]
): Promise<StationTimetableDomainItem[]> {
    const referenceModelsByCodeSet = new Map<
        string,
        Awaited<ReturnType<typeof getReferenceModelsByTrainCodes>>
    >();

    return Promise.all(
        rows.map(async (row) => {
            const cacheKey = [...row.allCodes]
                .sort((left, right) =>
                    formatExternalTrainCode(left).localeCompare(
                        formatExternalTrainCode(right)
                    )
                )
                .map(formatExternalTrainCode)
                .join('|');
            const cached = referenceModelsByCodeSet.get(cacheKey);
            if (cached) {
                return {
                    trainCode: row.trainCode,
                    allCodes: row.allCodes,
                    arriveAt: row.arriveAt,
                    departAt: row.departAt,
                    platformNo: row.platformNo,
                    startStation: row.startStation,
                    endStation: row.endStation,
                    updatedAt: row.updatedAt,
                    referenceModels: cached
                };
            }

            const referenceModels = await getReferenceModelsByTrainCodes(
                row.allCodes
            );
            referenceModelsByCodeSet.set(cacheKey, referenceModels);
            return {
                trainCode: row.trainCode,
                allCodes: row.allCodes,
                arriveAt: row.arriveAt,
                departAt: row.departAt,
                platformNo: row.platformNo,
                startStation: row.startStation,
                endStation: row.endStation,
                updatedAt: row.updatedAt,
                referenceModels
            };
        })
    );
}

export function getTrainCirculationImage(
    trainCode: TrainCodeParts,
    binaryRequested: boolean,
    format: TrainCirculationImageFormat
) {
    return renderTrainCirculationImage(trainCode, binaryRequested, format);
}
