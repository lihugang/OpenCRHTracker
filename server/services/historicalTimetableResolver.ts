import normalizeCode from '~/server/utils/12306/normalizeCode';
import { formatShanghaiDateString } from '~/server/utils/date/getCurrentDateString';
import { getShanghaiDayStartUnixSeconds } from '~/server/utils/date/shanghaiDateTime';
import {
    getLatestTimetableHistoryCoverageByTrainCodeAtOrBeforeDate,
    getTimetableHistoryContentById,
    getTimetableHistoryCoverageByTrainCodeAtDate
} from '~/server/services/timetableHistoryStore';

interface StoredCanonicalTimetableStop {
    stationNo: number;
    stationName: string;
    arriveAt: number | null;
    departAt: number | null;
    stationTrainCode: string;
}

interface StoredCanonicalTimetablePayload {
    stops: StoredCanonicalTimetableStop[];
}

export interface HistoricalTimetableStop {
    stationNo: number;
    stationName: string;
    arriveAt: number | null;
    departAt: number | null;
    stationTrainCode: string;
    isStart: boolean;
    isEnd: boolean;
}

export interface HistoricalTimetableContent {
    id: number;
    startStation: string | null;
    endStation: string | null;
    startOffset: number | null;
    endOffset: number | null;
    stops: HistoricalTimetableStop[];
}

export interface HistoricalTimetableSummary {
    timetableId: number;
    startStation: string | null;
    endStation: string | null;
    startOffset: number | null;
    endOffset: number | null;
}

export interface HydratedHistoricalRouteSummary {
    service_date: string;
    timetable_id: number | null;
    start_station_name: string | null;
    end_station_name: string | null;
    start_at: number | null;
    end_at: number | null;
}

export interface TimetableIdentityLink {
    serviceDate: string;
    timetableId: number | null;
    resolution: 'exact' | 'latest_fallback' | 'unresolved';
}

export interface HistoricalRouteSummaryMatchInput {
    serviceDate: string;
    startStationName: string;
    endStationName: string;
    startAt: number;
    endAt: number;
}

const timetableContentCache = new Map<number, HistoricalTimetableContent | null>();

function normalizeOptionalInteger(value: unknown): number | null {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0
        ? value
        : null;
}

function normalizeStationText(value: string | null | undefined) {
    if (typeof value !== 'string') {
        return '';
    }

    return value.trim();
}

function parseStoredCanonicalPayload(rawJson: string): StoredCanonicalTimetablePayload {
    const parsed = JSON.parse(rawJson) as { stops?: unknown };
    const rawStops = Array.isArray(parsed.stops) ? parsed.stops : [];
    const stops: StoredCanonicalTimetableStop[] = [];

    for (const rawStop of rawStops) {
        if (typeof rawStop !== 'object' || rawStop === null) {
            continue;
        }

        const stop = rawStop as Record<string, unknown>;
        const stationNo = normalizeOptionalInteger(stop.stationNo);
        const stationName =
            typeof stop.stationName === 'string' ? stop.stationName.trim() : '';
        if (stationNo === null || stationName.length === 0) {
            continue;
        }

        stops.push({
            stationNo,
            stationName,
            arriveAt: normalizeOptionalInteger(stop.arriveAt),
            departAt: normalizeOptionalInteger(stop.departAt),
            stationTrainCode:
                typeof stop.stationTrainCode === 'string'
                    ? stop.stationTrainCode.trim().toUpperCase()
                    : ''
        });
    }

    return {
        stops
    };
}

function buildHistoricalTimetableContent(contentId: number, rawJson: string) {
    const payload = parseStoredCanonicalPayload(rawJson);
    const stops = payload.stops.map<HistoricalTimetableStop>((stop, index) => ({
        stationNo: stop.stationNo,
        stationName: stop.stationName,
        arriveAt: stop.arriveAt,
        departAt: stop.departAt,
        stationTrainCode: stop.stationTrainCode,
        isStart: index === 0,
        isEnd: index === payload.stops.length - 1
    }));
    const firstStop = stops[0] ?? null;
    const lastStop = stops[stops.length - 1] ?? null;

    return {
        id: contentId,
        startStation: firstStop?.stationName ?? null,
        endStation: lastStop?.stationName ?? null,
        startOffset: firstStop?.departAt ?? firstStop?.arriveAt ?? null,
        endOffset: lastStop?.arriveAt ?? lastStop?.departAt ?? null,
        stops
    } satisfies HistoricalTimetableContent;
}

function getServiceDateFromUnixSeconds(startAt: number) {
    return formatShanghaiDateString(startAt * 1000);
}

function buildAbsoluteTimestamp(serviceDate: string, offset: number | null) {
    if (offset === null) {
        return null;
    }

    return getShanghaiDayStartUnixSeconds(serviceDate) + offset;
}

export function getHistoricalTimetableContent(
    timetableId: number
): HistoricalTimetableContent | null {
    if (!Number.isInteger(timetableId) || timetableId <= 0) {
        return null;
    }

    const cached = timetableContentCache.get(timetableId);
    if (cached !== undefined) {
        return cached;
    }

    const row = getTimetableHistoryContentById(timetableId);
    if (!row) {
        timetableContentCache.set(timetableId, null);
        return null;
    }

    const content = buildHistoricalTimetableContent(
        timetableId,
        row.timetable_json
    );
    timetableContentCache.set(timetableId, content);
    return content;
}

export function getHistoricalTimetableSummary(
    timetableId: number
): HistoricalTimetableSummary | null {
    const content = getHistoricalTimetableContent(timetableId);
    if (!content) {
        return null;
    }

    return {
        timetableId,
        startStation: content.startStation,
        endStation: content.endStation,
        startOffset: content.startOffset,
        endOffset: content.endOffset
    };
}

export function listHistoricalTimetableSummariesByIds(
    timetableIds: readonly number[]
) {
    const summaries = new Map<number, HistoricalTimetableSummary | null>();

    for (const timetableId of timetableIds) {
        if (summaries.has(timetableId)) {
            continue;
        }

        summaries.set(timetableId, getHistoricalTimetableSummary(timetableId));
    }

    return summaries;
}

export function hydrateHistoricalRouteSummary(
    serviceDate: string,
    timetableId: number | null
): HydratedHistoricalRouteSummary {
    if (!/^\d{8}$/.test(serviceDate) || timetableId === null) {
        return {
            service_date: serviceDate,
            timetable_id: timetableId,
            start_station_name: null,
            end_station_name: null,
            start_at: null,
            end_at: null
        };
    }

    const summary = getHistoricalTimetableSummary(timetableId);
    if (!summary) {
        return {
            service_date: serviceDate,
            timetable_id: timetableId,
            start_station_name: null,
            end_station_name: null,
            start_at: null,
            end_at: null
        };
    }

    return {
        service_date: serviceDate,
        timetable_id: timetableId,
        start_station_name: summary.startStation,
        end_station_name: summary.endStation,
        start_at: buildAbsoluteTimestamp(serviceDate, summary.startOffset),
        end_at: buildAbsoluteTimestamp(serviceDate, summary.endOffset)
    };
}

export function resolveTimetableIdentityLink(
    trainCode: string,
    startAt: number
): TimetableIdentityLink {
    const serviceDate = getServiceDateFromUnixSeconds(startAt);
    const exactTimetableId = resolveTimetableIdByTrainCodeAndServiceDate(
        trainCode,
        serviceDate
    );
    if (exactTimetableId !== null) {
        return {
            serviceDate,
            timetableId: exactTimetableId,
            resolution: 'exact'
        };
    }

    const latestCoverage =
        getLatestTimetableHistoryCoverageByTrainCodeAtOrBeforeDate(
            normalizeCode(trainCode),
            serviceDate
        );
    if (latestCoverage) {
        return {
            serviceDate,
            timetableId: latestCoverage.content_id,
            resolution: 'latest_fallback'
        };
    }

    return {
        serviceDate,
        timetableId: null,
        resolution: 'unresolved'
    };
}

export function resolveTimetableIdByTrainCodeAndServiceDate(
    trainCode: string,
    serviceDate: string
) {
    const coverage = getTimetableHistoryCoverageByTrainCodeAtDate(
        normalizeCode(trainCode),
        serviceDate
    );
    return coverage?.content_id ?? null;
}

export function resolveTimetableIdByTrainCodeAndStartAt(
    trainCode: string,
    startAt: number
) {
    return resolveTimetableIdByTrainCodeAndServiceDate(
        trainCode,
        getServiceDateFromUnixSeconds(startAt)
    );
}

export function doesHistoricalRouteSummaryMatch(
    timetableId: number,
    input: HistoricalRouteSummaryMatchInput
) {
    const hydratedSummary = hydrateHistoricalRouteSummary(
        input.serviceDate,
        timetableId
    );

    return (
        normalizeStationText(hydratedSummary.start_station_name) ===
            normalizeStationText(input.startStationName) &&
        normalizeStationText(hydratedSummary.end_station_name) ===
            normalizeStationText(input.endStationName) &&
        hydratedSummary.start_at === input.startAt &&
        hydratedSummary.end_at === input.endAt
    );
}

export function resolveFallbackTimetableIdByLatestSummary(
    trainCode: string,
    input: HistoricalRouteSummaryMatchInput
) {
    const latestCoverage =
        getLatestTimetableHistoryCoverageByTrainCodeAtOrBeforeDate(
            normalizeCode(trainCode),
            input.serviceDate
        );
    if (!latestCoverage) {
        return null;
    }

    return doesHistoricalRouteSummaryMatch(latestCoverage.content_id, input)
        ? latestCoverage.content_id
        : null;
}
