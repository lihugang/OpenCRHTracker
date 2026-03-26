import type { Admin12306RequestBucket } from '~/types/admin';
import useConfig from '~/server/config';
import getDayTimestampRange from '~/server/utils/date/getDayTimestampRange';
import {
    formatShanghaiDateString,
    getRelativeDateString
} from '~/server/utils/date/getCurrentDateString';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import {
    readJsonFileIfExists,
    registerRuntimeFlushCallback,
    startRuntimeFlushInterval,
    writeJsonFile
} from '~/server/utils/runtime/persistence';

const REQUEST_BUCKET_SECONDS = 30 * 60;
const REQUEST_BUCKET_COUNT = 48;
const REQUEST_METRICS_FILE_VERSION = 1;

interface MutableRequestMetricBucket {
    total: number;
    byOperation: Record<string, number>;
}

interface RequestMetricDayState {
    date: string;
    buckets: MutableRequestMetricBucket[];
}

interface RequestMetricsStoreContainer {
    days: Map<string, RequestMetricDayState>;
    dirty: boolean;
    persistenceStarted: boolean;
    flushTimer?: ReturnType<typeof setInterval>;
}

interface SerializedRequestMetricBucket {
    total: number;
    byOperation: Record<string, number>;
}

interface SerializedRequestMetricDay {
    date: string;
    buckets: SerializedRequestMetricBucket[];
}

interface SerializedRequestMetricsStore {
    version: number;
    savedAt: number;
    bucketSeconds: number;
    bucketCount: number;
    days: SerializedRequestMetricDay[];
}

interface RequestMetricsSnapshot {
    requestBuckets: Admin12306RequestBucket[];
    requestMetricsRetentionDays: number;
    requestMetricsRetained: boolean;
}

interface GlobalWithRequestMetricsStore {
    __openCrh12306RequestMetricsStore?: RequestMetricsStoreContainer;
}

interface RecordRequestMetricSample {
    timestamp?: number;
    operation: string;
}

function getRequestMetricsConfig() {
    return useConfig().data.runtime.requestMetrics12306;
}

function createEmptyBucket(): MutableRequestMetricBucket {
    return {
        total: 0,
        byOperation: {}
    };
}

function createEmptyDayState(date: string): RequestMetricDayState {
    return {
        date,
        buckets: Array.from({ length: REQUEST_BUCKET_COUNT }, () =>
            createEmptyBucket()
        )
    };
}

function createEmptyStore(): RequestMetricsStoreContainer {
    return {
        days: new Map<string, RequestMetricDayState>(),
        dirty: false,
        persistenceStarted: false
    };
}

function normalizeOperation(operation: string) {
    const normalized = operation.trim();
    return normalized.length > 0 ? normalized : 'unknown';
}

function createRetainedDateSet(retentionDays: number) {
    return new Set(
        Array.from({ length: retentionDays }, (_, index) =>
            getRelativeDateString(-index)
        )
    );
}

function isValidDateString(value: unknown): value is string {
    return typeof value === 'string' && /^\d{8}$/.test(value);
}

function isValidBucket(
    bucket: SerializedRequestMetricBucket
): bucket is SerializedRequestMetricBucket {
    if (
        typeof bucket !== 'object' ||
        bucket === null ||
        !Number.isInteger(bucket.total) ||
        bucket.total < 0 ||
        typeof bucket.byOperation !== 'object' ||
        bucket.byOperation === null ||
        Array.isArray(bucket.byOperation)
    ) {
        return false;
    }

    for (const [key, value] of Object.entries(bucket.byOperation)) {
        if (key.trim().length === 0 || !Number.isInteger(value) || value < 0) {
            return false;
        }
    }

    return true;
}

function restoreStoreFromDisk(): RequestMetricsStoreContainer | null {
    const raw = readJsonFileIfExists<SerializedRequestMetricsStore>(
        getRequestMetricsConfig().file
    );

    if (
        !raw ||
        raw.version !== REQUEST_METRICS_FILE_VERSION ||
        raw.bucketSeconds !== REQUEST_BUCKET_SECONDS ||
        raw.bucketCount !== REQUEST_BUCKET_COUNT ||
        !Array.isArray(raw.days)
    ) {
        return null;
    }

    const store = createEmptyStore();

    for (const day of raw.days) {
        if (
            typeof day !== 'object' ||
            day === null ||
            !isValidDateString(day.date) ||
            !Array.isArray(day.buckets) ||
            day.buckets.length !== REQUEST_BUCKET_COUNT
        ) {
            return null;
        }

        const dayState = createEmptyDayState(day.date);

        for (const [index, bucket] of day.buckets.entries()) {
            if (!isValidBucket(bucket)) {
                return null;
            }

            const targetBucket = dayState.buckets[index]!;
            targetBucket.total = bucket.total;
            targetBucket.byOperation = { ...bucket.byOperation };
        }

        store.days.set(day.date, dayState);
    }

    pruneRequestMetricDays(store);
    store.dirty = false;
    return store;
}

function serializeStore(
    store: RequestMetricsStoreContainer
): SerializedRequestMetricsStore {
    return {
        version: REQUEST_METRICS_FILE_VERSION,
        savedAt: getNowSeconds(),
        bucketSeconds: REQUEST_BUCKET_SECONDS,
        bucketCount: REQUEST_BUCKET_COUNT,
        days: Array.from(store.days.values())
            .sort((left, right) => left.date.localeCompare(right.date))
            .map((day) => ({
                date: day.date,
                buckets: day.buckets.map((bucket) => ({
                    total: bucket.total,
                    byOperation: { ...bucket.byOperation }
                }))
            }))
    };
}

function flushRequestMetricsStore() {
    const store = getRequestMetricsStore();
    if (!store.dirty) {
        return;
    }

    pruneRequestMetricDays(store);
    writeJsonFile(getRequestMetricsConfig().file, serializeStore(store));
    store.dirty = false;
}

function ensurePersistenceStarted(store: RequestMetricsStoreContainer) {
    if (store.persistenceStarted) {
        return;
    }

    store.persistenceStarted = true;
    store.flushTimer = startRuntimeFlushInterval(
        getRequestMetricsConfig().flushIntervalMinutes * 60 * 1000,
        flushRequestMetricsStore
    );
    registerRuntimeFlushCallback(flushRequestMetricsStore);
}

function getRequestMetricsStore() {
    const globalScope = globalThis as GlobalWithRequestMetricsStore;
    if (!globalScope.__openCrh12306RequestMetricsStore) {
        globalScope.__openCrh12306RequestMetricsStore =
            restoreStoreFromDisk() ?? createEmptyStore();
    }

    const store = globalScope.__openCrh12306RequestMetricsStore;
    ensurePersistenceStarted(store);
    return store;
}

function pruneRequestMetricDays(store: RequestMetricsStoreContainer) {
    const retainedDates = createRetainedDateSet(
        getRequestMetricsConfig().retentionDays
    );

    for (const date of store.days.keys()) {
        if (!retainedDates.has(date)) {
            store.days.delete(date);
        }
    }
}

function isDateRetained(date: string, retentionDays: number) {
    return createRetainedDateSet(retentionDays).has(date);
}

function getOrCreateDayState(
    store: RequestMetricsStoreContainer,
    date: string
): RequestMetricDayState {
    const existing = store.days.get(date);
    if (existing) {
        return existing;
    }

    const created = createEmptyDayState(date);
    store.days.set(date, created);
    return created;
}

function buildRequestBuckets(
    date: string,
    dayState: RequestMetricDayState | null
): Admin12306RequestBucket[] {
    const dayRange = getDayTimestampRange(date);

    return Array.from({ length: REQUEST_BUCKET_COUNT }, (_, index) => {
        const startAt = dayRange.startAt + index * REQUEST_BUCKET_SECONDS;
        const bucket = dayState?.buckets[index];

        return {
            startAt,
            endAt: startAt + REQUEST_BUCKET_SECONDS - 1,
            total: bucket?.total ?? 0,
            byOperation: bucket ? { ...bucket.byOperation } : {}
        };
    });
}

export function record12306RequestMetric(
    sample: RecordRequestMetricSample
): void {
    const timestamp = sample.timestamp ?? getNowSeconds();
    const date = formatShanghaiDateString(timestamp * 1000);
    const store = getRequestMetricsStore();
    const retentionDays = getRequestMetricsConfig().retentionDays;

    pruneRequestMetricDays(store);

    if (!isDateRetained(date, retentionDays)) {
        return;
    }

    const dayState = getOrCreateDayState(store, date);
    const dayRange = getDayTimestampRange(date);
    const bucketIndex = Math.floor(
        (timestamp - dayRange.startAt) / REQUEST_BUCKET_SECONDS
    );

    if (
        bucketIndex < 0 ||
        bucketIndex >= REQUEST_BUCKET_COUNT ||
        !dayState.buckets[bucketIndex]
    ) {
        return;
    }

    const bucket = dayState.buckets[bucketIndex]!;
    const operation = normalizeOperation(sample.operation);

    bucket.total += 1;
    bucket.byOperation[operation] = (bucket.byOperation[operation] ?? 0) + 1;
    store.dirty = true;
}

export function get12306RequestMetricsSnapshot(
    date: string
): RequestMetricsSnapshot {
    const store = getRequestMetricsStore();
    const retentionDays = getRequestMetricsConfig().retentionDays;

    pruneRequestMetricDays(store);

    const retained = isDateRetained(date, retentionDays);
    const dayState = retained ? (store.days.get(date) ?? null) : null;

    return {
        requestBuckets: buildRequestBuckets(date, dayState),
        requestMetricsRetentionDays: retentionDays,
        requestMetricsRetained: retained
    };
}

export function flush12306RequestMetricsToDisk(): void {
    flushRequestMetricsStore();
}

export function get12306RequestMetricBucketSeconds() {
    return REQUEST_BUCKET_SECONDS;
}
