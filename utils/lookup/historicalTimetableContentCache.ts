import type { TrackerApiResponse } from '~/types/homepage';
import type { HistoricalTimetableData } from '~/types/lookup';

type RequestFetch = <T>(
    request: string,
    options?: {
        query?: Record<string, number | string | undefined>;
    }
) => Promise<T>;

interface StoredHistoricalTimetableContent {
    version: 1;
    historyId: number;
    data: HistoricalTimetableData;
}

const DATABASE_NAME = 'open-crh-tracker';
const STORE_NAME = 'historical-timetables';
const STORAGE_VERSION = 1;
const memoryCache = new Map<number, HistoricalTimetableData | null>();
const requestCache = new Map<number, Promise<HistoricalTimetableData | null>>();

let storagePromise: Promise<LocalForage | null> | null = null;

function normalizeTrainCode(trainCode: string) {
    return trainCode.trim().toUpperCase();
}

function buildStorageKey(historyId: number) {
    return `history:${historyId}`;
}

function isValidHistoryId(historyId: number) {
    return Number.isInteger(historyId) && historyId > 0;
}

function isHistoricalTimetableData(
    value: unknown
): value is HistoricalTimetableData {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const data = value as Partial<HistoricalTimetableData>;
    return (
        typeof data.historyId === 'number' &&
        Array.isArray(data.stops) &&
        (data.startStation === null || typeof data.startStation === 'string') &&
        (data.endStation === null || typeof data.endStation === 'string') &&
        (data.startOffset === null || typeof data.startOffset === 'number') &&
        (data.endOffset === null || typeof data.endOffset === 'number')
    );
}

function isStoredHistoricalTimetableContent(
    value: unknown,
    historyId: number
): value is StoredHistoricalTimetableContent {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const stored = value as Partial<StoredHistoricalTimetableContent>;
    return (
        stored.version === STORAGE_VERSION &&
        stored.historyId === historyId &&
        isHistoricalTimetableData(stored.data)
    );
}

async function getStorage() {
    if (!import.meta.client) {
        return null;
    }

    storagePromise ??= import('localforage')
        .then((module) =>
            module.default.createInstance({
                name: DATABASE_NAME,
                storeName: STORE_NAME
            })
        )
        .catch(() => null);

    return storagePromise;
}

async function readPersistedContent(historyId: number) {
    const storage = await getStorage();
    if (!storage) {
        return undefined;
    }

    try {
        const stored = await storage.getItem<StoredHistoricalTimetableContent>(
            buildStorageKey(historyId)
        );
        if (!isStoredHistoricalTimetableContent(stored, historyId)) {
            return undefined;
        }

        memoryCache.set(historyId, stored.data);
        return stored.data;
    } catch {
        return undefined;
    }
}

async function writePersistedContent(
    historyId: number,
    data: HistoricalTimetableData
) {
    const storage = await getStorage();
    if (!storage) {
        return;
    }

    try {
        await storage.setItem<StoredHistoricalTimetableContent>(
            buildStorageKey(historyId),
            {
                version: STORAGE_VERSION,
                historyId,
                data
            }
        );
    } catch {
        // IndexedDB can be unavailable or quota-limited; memory cache still works.
    }
}

async function requestHistoricalTimetableContent(
    requestFetch: RequestFetch,
    trainCode: string,
    historyId: number
) {
    const response = await requestFetch<
        TrackerApiResponse<HistoricalTimetableData>
    >(
        `/api/v1/timetable/train/${encodeURIComponent(trainCode)}/history/${encodeURIComponent(String(historyId))}`
    );

    if (!response.ok) {
        memoryCache.set(historyId, null);
        return null;
    }

    memoryCache.set(historyId, response.data);
    await writePersistedContent(historyId, response.data);
    return response.data;
}

export function setHistoricalTimetableContentMemoryCacheValue(
    historyId: number,
    value: HistoricalTimetableData | null
) {
    if (!isValidHistoryId(historyId)) {
        return;
    }

    memoryCache.set(historyId, value);
}

export function getHistoricalTimetableContentMemoryCacheValue(
    historyId: number
) {
    if (!isValidHistoryId(historyId)) {
        return undefined;
    }

    return memoryCache.get(historyId);
}

export async function fetchHistoricalTimetableContentWithCache(
    requestFetch: RequestFetch,
    trainCode: string,
    historyId: number
) {
    const normalizedTrainCode = normalizeTrainCode(trainCode);
    if (normalizedTrainCode.length === 0 || !isValidHistoryId(historyId)) {
        return null;
    }

    const cached = memoryCache.get(historyId);
    if (cached !== undefined) {
        return cached;
    }

    const pending = requestCache.get(historyId);
    if (pending) {
        return pending;
    }

    const request = (async () => {
        const persisted = await readPersistedContent(historyId);
        if (persisted !== undefined) {
            return persisted;
        }

        try {
            return await requestHistoricalTimetableContent(
                requestFetch,
                normalizedTrainCode,
                historyId
            );
        } catch {
            memoryCache.set(historyId, null);
            return null;
        }
    })().finally(() => {
        requestCache.delete(historyId);
    });

    requestCache.set(historyId, request);
    return request;
}
