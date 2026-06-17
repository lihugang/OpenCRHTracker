import type {
    EmuHistoryRecord,
    LookupHistoryListItem,
    TrainHistoryRecord
} from '~/types/lookup';
import { fetchHistoricalTimetableContentWithCache } from '~/utils/lookup/historicalTimetableContentCache';
import getShanghaiDayStartUnixSeconds from '~/utils/time/getShanghaiDayStartUnixSeconds';

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
    extends TrainHistoryRecord, HydratedHistoryFields {}

export interface HydratedEmuHistoryRecord
    extends EmuHistoryRecord, HydratedHistoryFields {}

const DEFAULT_CONCURRENCY = 6;

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
    const timetable = await fetchHistoricalTimetableContentWithCache(
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
            timetable.startOffset === null
                ? null
                : dayStart + timetable.startOffset,
        endAt:
            timetable.endOffset === null
                ? null
                : dayStart + timetable.endOffset,
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
        code:
            type === 'train'
                ? (item as HydratedTrainHistoryRecord).emuCode
                : (item as HydratedEmuHistoryRecord).trainCode,
        startStation: item.startStation,
        endStation: item.endStation
    }));
}
