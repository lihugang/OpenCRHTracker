import type { TrackerApiResponse } from '~/types/homepage';
import type {
    EmuHistoryRecord,
    HistoricalTimetableData,
    LookupHistoryListItem,
    TrainHistoryRecord
} from '~/types/lookup';

type RequestFetch = <T>(
    request: string,
    options?: {
        query?: Record<string, number | string | undefined>;
    }
) => Promise<T>;

export interface HydratedHistoryFields {
    serviceDate: string;
    timetableId: number | null;
    startAt: number | null;
    endAt: number | null;
    startStation: string | null;
    endStation: string | null;
}

export interface HydratedTrainHistoryRecord
    extends TrainHistoryRecord,
        HydratedHistoryFields {}

export interface HydratedEmuHistoryRecord
    extends EmuHistoryRecord,
        HydratedHistoryFields {}

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DEFAULT_CONCURRENCY = 6;
const timetableContentCache = new Map<number, HistoricalTimetableData | null>();
const timetableContentRequestCache = new Map<
    number,
    Promise<HistoricalTimetableData | null>
>();

function normalizeTrainCode(trainCode: string) {
    return trainCode.trim().toUpperCase();
}

function buildTimetableContentCacheKey(historyId: number) {
    return historyId;
}

function getShanghaiDayStartUnixSeconds(serviceDate: string) {
    if (!/^\d{8}$/.test(serviceDate)) {
        return null;
    }

    const year = Number.parseInt(serviceDate.slice(0, 4), 10);
    const month = Number.parseInt(serviceDate.slice(4, 6), 10);
    const day = Number.parseInt(serviceDate.slice(6, 8), 10);
    const pseudoUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
    return Math.floor((pseudoUtcMs - SHANGHAI_OFFSET_MS) / 1000);
}

async function fetchHistoricalTimetableContent(
    requestFetch: RequestFetch,
    trainCode: string,
    historyId: number
) {
    const normalizedTrainCode = normalizeTrainCode(trainCode);
    if (normalizedTrainCode.length === 0) {
        return null;
    }

    // The backend resolves immutable historical timetable content by historyId,
    // so alias train codes can safely reuse the same cached response.
    const cacheKey = buildTimetableContentCacheKey(historyId);
    const cached = timetableContentCache.get(cacheKey);
    if (cached !== undefined) {
        return cached;
    }

    const pending = timetableContentRequestCache.get(cacheKey);
    if (pending) {
        return pending;
    }

    const request = requestFetch<TrackerApiResponse<HistoricalTimetableData>>(
        `/api/v1/timetable/train/${encodeURIComponent(normalizedTrainCode)}/history/${encodeURIComponent(String(historyId))}`
    )
        .then((response) => {
            if (!response.ok) {
                timetableContentCache.set(cacheKey, null);
                return null;
            }

            timetableContentCache.set(cacheKey, response.data);
            return response.data;
        })
        .catch(() => {
            timetableContentCache.set(cacheKey, null);
            return null;
        })
        .finally(() => {
            timetableContentRequestCache.delete(cacheKey);
        });

    timetableContentRequestCache.set(cacheKey, request);
    return request;
}

async function mapWithConcurrency<TInput, TOutput>(
    items: readonly TInput[],
    mapper: (item: TInput) => Promise<TOutput>,
    concurrency = DEFAULT_CONCURRENCY
) {
    if (items.length === 0) {
        return [] as TOutput[];
    }

    const results = new Array<TOutput>(items.length);
    let nextIndex = 0;

    async function worker() {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            results[currentIndex] = await mapper(items[currentIndex]!);
        }
    }

    await Promise.all(
        Array.from({ length: Math.min(concurrency, items.length) }, () =>
            worker()
        )
    );
    return results;
}

async function resolveHydratedHistoryFields(
    requestFetch: RequestFetch,
    trainCode: string,
    serviceDate: string,
    timetableId: number | null
): Promise<HydratedHistoryFields> {
    if (timetableId === null) {
        return {
            serviceDate,
            timetableId,
            startAt: null,
            endAt: null,
            startStation: null,
            endStation: null
        };
    }

    const dayStart = getShanghaiDayStartUnixSeconds(serviceDate);
    const timetable = await fetchHistoricalTimetableContent(
        requestFetch,
        trainCode,
        timetableId
    );
    if (dayStart === null || !timetable) {
        return {
            serviceDate,
            timetableId,
            startAt: null,
            endAt: null,
            startStation: null,
            endStation: null
        };
    }

    return {
        serviceDate,
        timetableId,
        startAt:
            timetable.startOffset === null ? null : dayStart + timetable.startOffset,
        endAt: timetable.endOffset === null ? null : dayStart + timetable.endOffset,
        startStation: timetable.startStation,
        endStation: timetable.endStation
    };
}

export async function hydrateTrainHistoryRecords(
    requestFetch: RequestFetch,
    trainCode: string,
    items: readonly TrainHistoryRecord[]
) {
    return mapWithConcurrency(items, async (item) => ({
        ...item,
        ...(await resolveHydratedHistoryFields(
            requestFetch,
            trainCode,
            item.serviceDate,
            item.timetableId
        ))
    })) as Promise<HydratedTrainHistoryRecord[]>;
}

export async function hydrateEmuHistoryRecords(
    requestFetch: RequestFetch,
    items: readonly EmuHistoryRecord[]
) {
    return mapWithConcurrency(items, async (item) => ({
        ...item,
        ...(await resolveHydratedHistoryFields(
            requestFetch,
            item.trainCode,
            item.serviceDate,
            item.timetableId
        ))
    })) as Promise<HydratedEmuHistoryRecord[]>;
}

export function toLookupHistoryListItems(
    type: 'train' | 'emu',
    items: readonly (HydratedTrainHistoryRecord | HydratedEmuHistoryRecord)[]
) {
    return items.map<LookupHistoryListItem>((item) => ({
        id: item.id,
        serviceDate: item.serviceDate,
        timetableId: item.timetableId,
        startAt: item.startAt,
        endAt: item.endAt,
        code: type === 'train' ? (item as HydratedTrainHistoryRecord).emuCode : (item as HydratedEmuHistoryRecord).trainCode,
        startStation: item.startStation,
        endStation: item.endStation
    }));
}
