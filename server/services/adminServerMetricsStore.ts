import os from 'os';
import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import {
    readJsonFileIfExists,
    registerRuntimeFlushCallback,
    startRuntimeFlushInterval,
    writeJsonFile
} from '~/server/utils/runtime/persistence';
import type {
    AdminServerMetricsBucket,
    AdminServerMetricsPeak,
    AdminServerMetricsResponse,
    AdminServerMetricsWindow,
    AdminServerMetricsWindowSummary
} from '~/types/admin';

const logger = getLogger('admin-server-metrics-store');
const ADMIN_SERVER_METRICS_FILE_VERSION = 1;
const DURATION_HISTOGRAM_BOUNDS_MS = [
    25,
    50,
    100,
    150,
    250,
    500,
    750,
    1000,
    1500,
    2500,
    5000,
    10000,
    30000,
    60000,
    Number.POSITIVE_INFINITY
] as const;

type RequestMetricKind = 'ssr' | 'api';

interface CpuSnapshot {
    idle: number;
    total: number;
}

interface MutableServerMetricsBucket {
    startAt: number;
    systemSampleCount: number;
    cpuSampleCount: number;
    cpuPercentTotal: number;
    memoryUsedRatioTotal: number;
    memoryUsedBytesTotal: number;
    memoryTotalBytesTotal: number;
    load1mSampleCount: number;
    load1mTotal: number;
    ssrRequestCount: number;
    ssrDurationTotalMs: number;
    ssrDurationHistogram: number[];
    apiRequestCount: number;
    apiDurationTotalMs: number;
    apiDurationHistogram: number[];
}

interface ServerMetricsWindowState {
    key: AdminServerMetricsWindow;
    label: string;
    bucketSeconds: number;
    bucketCount: number;
    buckets: MutableServerMetricsBucket[];
}

interface ServerMetricsStoreContainer {
    startedAt: number;
    lastSampleAt: number | null;
    lastCpuSnapshot: CpuSnapshot | null;
    loadAverageSupported: boolean;
    windows: ServerMetricsWindowState[];
    dirty: boolean;
    persistenceStarted: boolean;
    samplingStarted: boolean;
    flushTimer?: ReturnType<typeof setInterval>;
    sampleTimer?: ReturnType<typeof setInterval>;
}

interface SerializedServerMetricsBucket {
    startAt: number;
    systemSampleCount: number;
    cpuSampleCount: number;
    cpuPercentTotal: number;
    memoryUsedRatioTotal: number;
    memoryUsedBytesTotal: number;
    memoryTotalBytesTotal: number;
    load1mSampleCount: number;
    load1mTotal: number;
    ssrRequestCount: number;
    ssrDurationTotalMs: number;
    ssrDurationHistogram: number[];
    apiRequestCount: number;
    apiDurationTotalMs: number;
    apiDurationHistogram: number[];
}

interface SerializedServerMetricsWindowState {
    key: AdminServerMetricsWindow;
    bucketSeconds: number;
    bucketCount: number;
    buckets: SerializedServerMetricsBucket[];
}

interface SerializedServerMetricsStore {
    version: number;
    savedAt: number;
    startedAt: number;
    lastSampleAt: number | null;
    lastCpuSnapshot: CpuSnapshot | null;
    loadAverageSupported: boolean;
    windows: SerializedServerMetricsWindowState[];
}

interface GlobalWithServerMetricsStore {
    __openCrhAdminServerMetricsStore?: ServerMetricsStoreContainer;
}

interface RecordRequestDurationSample {
    kind: RequestMetricKind;
    durationMs: number;
    timestamp?: number;
}

const WINDOW_CONFIGS: Array<{
    key: AdminServerMetricsWindow;
    label: string;
    bucketSeconds: number;
    bucketCount: number;
}> = [
    {
        key: '4h',
        label: '4h',
        bucketSeconds: 5 * 60,
        bucketCount: 48
    },
    {
        key: '24h',
        label: '24h',
        bucketSeconds: 30 * 60,
        bucketCount: 48
    }
];

function getAdminServerMetricsConfig() {
    return useConfig().data.runtime.adminServerMetrics;
}

function createDurationHistogram() {
    return Array.from({ length: DURATION_HISTOGRAM_BOUNDS_MS.length }, () => 0);
}

function createEmptyBucket(startAt = 0): MutableServerMetricsBucket {
    return {
        startAt,
        systemSampleCount: 0,
        cpuSampleCount: 0,
        cpuPercentTotal: 0,
        memoryUsedRatioTotal: 0,
        memoryUsedBytesTotal: 0,
        memoryTotalBytesTotal: 0,
        load1mSampleCount: 0,
        load1mTotal: 0,
        ssrRequestCount: 0,
        ssrDurationTotalMs: 0,
        ssrDurationHistogram: createDurationHistogram(),
        apiRequestCount: 0,
        apiDurationTotalMs: 0,
        apiDurationHistogram: createDurationHistogram()
    };
}

function createWindowState(
    config: (typeof WINDOW_CONFIGS)[number]
): ServerMetricsWindowState {
    return {
        ...config,
        buckets: Array.from({ length: config.bucketCount }, () =>
            createEmptyBucket()
        )
    };
}

function createEmptyStore(): ServerMetricsStoreContainer {
    return {
        startedAt: getNowSeconds(),
        lastSampleAt: null,
        lastCpuSnapshot: null,
        loadAverageSupported: process.platform !== 'win32',
        windows: WINDOW_CONFIGS.map(createWindowState),
        dirty: false,
        persistenceStarted: false,
        samplingStarted: false
    };
}

function toBucketStart(timestamp: number, bucketSeconds: number) {
    return timestamp - (timestamp % bucketSeconds);
}

function toBucketIndex(
    bucketStart: number,
    bucketSeconds: number,
    bucketCount: number
) {
    return Math.floor(bucketStart / bucketSeconds) % bucketCount;
}

function resetBucket(bucket: MutableServerMetricsBucket, bucketStart: number) {
    bucket.startAt = bucketStart;
    bucket.systemSampleCount = 0;
    bucket.cpuSampleCount = 0;
    bucket.cpuPercentTotal = 0;
    bucket.memoryUsedRatioTotal = 0;
    bucket.memoryUsedBytesTotal = 0;
    bucket.memoryTotalBytesTotal = 0;
    bucket.load1mSampleCount = 0;
    bucket.load1mTotal = 0;
    bucket.ssrRequestCount = 0;
    bucket.ssrDurationTotalMs = 0;
    bucket.ssrDurationHistogram.fill(0);
    bucket.apiRequestCount = 0;
    bucket.apiDurationTotalMs = 0;
    bucket.apiDurationHistogram.fill(0);
}

function hydrateBucket(
    windowState: ServerMetricsWindowState,
    timestamp: number
): MutableServerMetricsBucket {
    const bucketStart = toBucketStart(timestamp, windowState.bucketSeconds);
    const bucketIndex = toBucketIndex(
        bucketStart,
        windowState.bucketSeconds,
        windowState.bucketCount
    );
    const bucket = windowState.buckets[bucketIndex]!;

    if (bucket.startAt !== bucketStart) {
        resetBucket(bucket, bucketStart);
    }

    return bucket;
}

function getCpuSnapshot(): CpuSnapshot | null {
    const cpuList = os.cpus();
    if (cpuList.length <= 0) {
        return null;
    }

    let idle = 0;
    let total = 0;

    for (const cpu of cpuList) {
        idle += cpu.times.idle;
        total +=
            cpu.times.user +
            cpu.times.nice +
            cpu.times.sys +
            cpu.times.irq +
            cpu.times.idle;
    }

    return {
        idle,
        total
    };
}

function observeDurationHistogram(histogram: number[], durationMs: number) {
    const normalizedDuration = Math.max(0, Math.round(durationMs));

    for (const [index, upperBound] of DURATION_HISTOGRAM_BOUNDS_MS.entries()) {
        if (normalizedDuration <= upperBound) {
            histogram[index] = (histogram[index] ?? 0) + 1;
            return;
        }
    }
}

function approximateP95DurationMs(histogram: number[]): number | null {
    const totalCount = histogram.reduce((total, count) => total + count, 0);
    if (totalCount <= 0) {
        return null;
    }

    const targetCount = Math.ceil(totalCount * 0.95);
    let currentCount = 0;

    for (const [index, count] of histogram.entries()) {
        currentCount += count;
        if (currentCount >= targetCount) {
            const upperBound = DURATION_HISTOGRAM_BOUNDS_MS[index]!;
            if (Number.isFinite(upperBound)) {
                return upperBound;
            }

            const previousBound = DURATION_HISTOGRAM_BOUNDS_MS[index - 1] ?? 0;
            return Number.isFinite(previousBound) ? previousBound : 0;
        }
    }

    return null;
}

function toAveragedValue(total: number, count: number): number | null {
    if (count <= 0) {
        return null;
    }

    return total / count;
}

function toBucketSnapshot(
    bucket: MutableServerMetricsBucket,
    bucketSeconds: number
): AdminServerMetricsBucket {
    return {
        startAt: bucket.startAt,
        endAt: bucket.startAt + bucketSeconds - 1,
        systemSampleCount: bucket.systemSampleCount,
        cpuPercent: toAveragedValue(bucket.cpuPercentTotal, bucket.cpuSampleCount),
        memoryUsedRatio: toAveragedValue(
            bucket.memoryUsedRatioTotal,
            bucket.systemSampleCount
        ),
        memoryUsedBytes: toAveragedValue(
            bucket.memoryUsedBytesTotal,
            bucket.systemSampleCount
        ),
        memoryTotalBytes: toAveragedValue(
            bucket.memoryTotalBytesTotal,
            bucket.systemSampleCount
        ),
        load1m: toAveragedValue(bucket.load1mTotal, bucket.load1mSampleCount),
        ssrRequestCount: bucket.ssrRequestCount,
        ssrAvgDurationMs: toAveragedValue(
            bucket.ssrDurationTotalMs,
            bucket.ssrRequestCount
        ),
        ssrP95DurationMs: approximateP95DurationMs(bucket.ssrDurationHistogram),
        apiRequestCount: bucket.apiRequestCount,
        apiAvgDurationMs: toAveragedValue(
            bucket.apiDurationTotalMs,
            bucket.apiRequestCount
        ),
        apiP95DurationMs: approximateP95DurationMs(bucket.apiDurationHistogram)
    };
}

function createEmptyBucketSnapshot(
    startAt: number,
    bucketSeconds: number
): AdminServerMetricsBucket {
    return {
        startAt,
        endAt: startAt + bucketSeconds - 1,
        systemSampleCount: 0,
        cpuPercent: null,
        memoryUsedRatio: null,
        memoryUsedBytes: null,
        memoryTotalBytes: null,
        load1m: null,
        ssrRequestCount: 0,
        ssrAvgDurationMs: null,
        ssrP95DurationMs: null,
        apiRequestCount: 0,
        apiAvgDurationMs: null,
        apiP95DurationMs: null
    };
}

function createPeak(
    bucket: AdminServerMetricsBucket,
    value: number
): AdminServerMetricsPeak {
    return {
        startAt: bucket.startAt,
        endAt: bucket.endAt,
        value
    };
}

function pickPeak(
    currentPeak: AdminServerMetricsPeak | null,
    bucket: AdminServerMetricsBucket,
    value: number | null
) {
    if (value === null || !Number.isFinite(value)) {
        return currentPeak;
    }

    if (!currentPeak || value > currentPeak.value) {
        return createPeak(bucket, value);
    }

    return currentPeak;
}

function isValidHistogram(rawValue: unknown) {
    if (!Array.isArray(rawValue)) {
        return false;
    }

    if (rawValue.length !== DURATION_HISTOGRAM_BOUNDS_MS.length) {
        return false;
    }

    return rawValue.every(
        (item) => Number.isInteger(item) && (item as number) >= 0
    );
}

function isFiniteNonNegativeNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function serializeStore(
    store: ServerMetricsStoreContainer
): SerializedServerMetricsStore {
    return {
        version: ADMIN_SERVER_METRICS_FILE_VERSION,
        savedAt: getNowSeconds(),
        startedAt: store.startedAt,
        lastSampleAt: store.lastSampleAt,
        lastCpuSnapshot: store.lastCpuSnapshot,
        loadAverageSupported: store.loadAverageSupported,
        windows: store.windows.map((windowState) => ({
            key: windowState.key,
            bucketSeconds: windowState.bucketSeconds,
            bucketCount: windowState.bucketCount,
            buckets: windowState.buckets.map((bucket) => ({
                startAt: bucket.startAt,
                systemSampleCount: bucket.systemSampleCount,
                cpuSampleCount: bucket.cpuSampleCount,
                cpuPercentTotal: bucket.cpuPercentTotal,
                memoryUsedRatioTotal: bucket.memoryUsedRatioTotal,
                memoryUsedBytesTotal: bucket.memoryUsedBytesTotal,
                memoryTotalBytesTotal: bucket.memoryTotalBytesTotal,
                load1mSampleCount: bucket.load1mSampleCount,
                load1mTotal: bucket.load1mTotal,
                ssrRequestCount: bucket.ssrRequestCount,
                ssrDurationTotalMs: bucket.ssrDurationTotalMs,
                ssrDurationHistogram: [...bucket.ssrDurationHistogram],
                apiRequestCount: bucket.apiRequestCount,
                apiDurationTotalMs: bucket.apiDurationTotalMs,
                apiDurationHistogram: [...bucket.apiDurationHistogram]
            }))
        }))
    };
}

function restoreStoreFromDisk(): ServerMetricsStoreContainer | null {
    const raw = readJsonFileIfExists<SerializedServerMetricsStore>(
        getAdminServerMetricsConfig().file
    );

    if (
        !raw ||
        raw.version !== ADMIN_SERVER_METRICS_FILE_VERSION ||
        !Number.isInteger(raw.startedAt) ||
        raw.startedAt <= 0 ||
        (raw.lastSampleAt !== null &&
            (!Number.isInteger(raw.lastSampleAt) || raw.lastSampleAt <= 0)) ||
        typeof raw.loadAverageSupported !== 'boolean' ||
        !Array.isArray(raw.windows) ||
        raw.windows.length !== WINDOW_CONFIGS.length
    ) {
        return null;
    }

    const store = createEmptyStore();
    store.startedAt = raw.startedAt;
    store.lastSampleAt = raw.lastSampleAt;
    store.loadAverageSupported = raw.loadAverageSupported;

    if (
        raw.lastCpuSnapshot &&
        isFiniteNonNegativeNumber(raw.lastCpuSnapshot.idle) &&
        isFiniteNonNegativeNumber(raw.lastCpuSnapshot.total)
    ) {
        store.lastCpuSnapshot = {
            idle: raw.lastCpuSnapshot.idle,
            total: raw.lastCpuSnapshot.total
        };
    }

    for (const config of WINDOW_CONFIGS) {
        const serializedWindow = raw.windows.find(
            (windowItem) => windowItem.key === config.key
        );
        const targetWindow = store.windows.find(
            (windowItem) => windowItem.key === config.key
        );

        if (
            !serializedWindow ||
            !targetWindow ||
            serializedWindow.bucketSeconds !== config.bucketSeconds ||
            serializedWindow.bucketCount !== config.bucketCount ||
            !Array.isArray(serializedWindow.buckets) ||
            serializedWindow.buckets.length !== config.bucketCount
        ) {
            return null;
        }

        for (const [index, serializedBucket] of serializedWindow.buckets.entries()) {
            if (
                typeof serializedBucket !== 'object' ||
                serializedBucket === null ||
                !Number.isInteger(serializedBucket.startAt) ||
                serializedBucket.startAt < 0 ||
                !Number.isInteger(serializedBucket.systemSampleCount) ||
                serializedBucket.systemSampleCount < 0 ||
                !Number.isInteger(serializedBucket.cpuSampleCount) ||
                serializedBucket.cpuSampleCount < 0 ||
                !isFiniteNonNegativeNumber(serializedBucket.cpuPercentTotal) ||
                !isFiniteNonNegativeNumber(
                    serializedBucket.memoryUsedRatioTotal
                ) ||
                !isFiniteNonNegativeNumber(
                    serializedBucket.memoryUsedBytesTotal
                ) ||
                !isFiniteNonNegativeNumber(
                    serializedBucket.memoryTotalBytesTotal
                ) ||
                !Number.isInteger(serializedBucket.load1mSampleCount) ||
                serializedBucket.load1mSampleCount < 0 ||
                !isFiniteNonNegativeNumber(serializedBucket.load1mTotal) ||
                !Number.isInteger(serializedBucket.ssrRequestCount) ||
                serializedBucket.ssrRequestCount < 0 ||
                !isFiniteNonNegativeNumber(serializedBucket.ssrDurationTotalMs) ||
                !isValidHistogram(serializedBucket.ssrDurationHistogram) ||
                !Number.isInteger(serializedBucket.apiRequestCount) ||
                serializedBucket.apiRequestCount < 0 ||
                !isFiniteNonNegativeNumber(serializedBucket.apiDurationTotalMs) ||
                !isValidHistogram(serializedBucket.apiDurationHistogram)
            ) {
                return null;
            }

            const targetBucket = targetWindow.buckets[index]!;
            targetBucket.startAt = serializedBucket.startAt;
            targetBucket.systemSampleCount = serializedBucket.systemSampleCount;
            targetBucket.cpuSampleCount = serializedBucket.cpuSampleCount;
            targetBucket.cpuPercentTotal = serializedBucket.cpuPercentTotal;
            targetBucket.memoryUsedRatioTotal =
                serializedBucket.memoryUsedRatioTotal;
            targetBucket.memoryUsedBytesTotal =
                serializedBucket.memoryUsedBytesTotal;
            targetBucket.memoryTotalBytesTotal =
                serializedBucket.memoryTotalBytesTotal;
            targetBucket.load1mSampleCount =
                serializedBucket.load1mSampleCount;
            targetBucket.load1mTotal = serializedBucket.load1mTotal;
            targetBucket.ssrRequestCount = serializedBucket.ssrRequestCount;
            targetBucket.ssrDurationTotalMs =
                serializedBucket.ssrDurationTotalMs;
            targetBucket.ssrDurationHistogram = [
                ...serializedBucket.ssrDurationHistogram
            ];
            targetBucket.apiRequestCount = serializedBucket.apiRequestCount;
            targetBucket.apiDurationTotalMs =
                serializedBucket.apiDurationTotalMs;
            targetBucket.apiDurationHistogram = [
                ...serializedBucket.apiDurationHistogram
            ];
        }
    }

    store.dirty = false;
    return store;
}

function flushStore(store: ServerMetricsStoreContainer) {
    if (!store.dirty) {
        return;
    }

    writeJsonFile(getAdminServerMetricsConfig().file, serializeStore(store));
    store.dirty = false;
}

function ensurePersistenceStarted(store: ServerMetricsStoreContainer) {
    if (store.persistenceStarted) {
        return;
    }

    store.persistenceStarted = true;
    store.flushTimer = startRuntimeFlushInterval(
        getAdminServerMetricsConfig().flushIntervalMinutes * 60 * 1000,
        () => flushStore(store)
    );
    registerRuntimeFlushCallback(() => flushStore(store));
}

function recordSystemSampleWithStore(
    store: ServerMetricsStoreContainer,
    timestamp = getNowSeconds()
) {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = Math.max(0, totalMemory - freeMemory);
    const memoryUsedRatio = totalMemory > 0 ? usedMemory / totalMemory : 0;
    const cpuSnapshot = getCpuSnapshot();
    let cpuPercent: number | null = null;

    if (cpuSnapshot && store.lastCpuSnapshot) {
        const deltaTotal = cpuSnapshot.total - store.lastCpuSnapshot.total;
        const deltaIdle = cpuSnapshot.idle - store.lastCpuSnapshot.idle;
        if (deltaTotal > 0) {
            cpuPercent = ((deltaTotal - deltaIdle) / deltaTotal) * 100;
        }
    }

    if (cpuSnapshot) {
        store.lastCpuSnapshot = cpuSnapshot;
    }

    const rawLoad1m = os.loadavg()[0] ?? null;
    const load1m =
        store.loadAverageSupported &&
        rawLoad1m !== null &&
        Number.isFinite(rawLoad1m)
            ? rawLoad1m
            : null;

    for (const windowState of store.windows) {
        const bucket = hydrateBucket(windowState, timestamp);

        bucket.systemSampleCount += 1;
        bucket.memoryUsedRatioTotal += memoryUsedRatio;
        bucket.memoryUsedBytesTotal += usedMemory;
        bucket.memoryTotalBytesTotal += totalMemory;

        if (cpuPercent !== null && Number.isFinite(cpuPercent)) {
            bucket.cpuSampleCount += 1;
            bucket.cpuPercentTotal += Math.max(0, cpuPercent);
        }

        if (load1m !== null) {
            bucket.load1mSampleCount += 1;
            bucket.load1mTotal += Math.max(0, load1m);
        }
    }

    store.lastSampleAt = timestamp;
    store.dirty = true;
}

function ensureSamplingStarted(store: ServerMetricsStoreContainer) {
    if (store.samplingStarted) {
        return;
    }

    store.samplingStarted = true;
    recordSystemSampleWithStore(store);

    const timer = setInterval(
        () => recordSystemSampleWithStore(store),
        getAdminServerMetricsConfig().sampleIntervalSeconds * 1000
    );
    timer.unref?.();
    store.sampleTimer = timer;
}

function getStore() {
    const globalScope = globalThis as GlobalWithServerMetricsStore;
    if (!globalScope.__openCrhAdminServerMetricsStore) {
        const restoredStore = restoreStoreFromDisk();
        globalScope.__openCrhAdminServerMetricsStore =
            restoredStore ?? createEmptyStore();
        if (!restoredStore) {
            logger.info('admin server metrics store initialized from empty state');
        }
    }

    const store = globalScope.__openCrhAdminServerMetricsStore;
    ensurePersistenceStarted(store);
    ensureSamplingStarted(store);
    return store;
}

function buildWindowSnapshot(
    windowState: ServerMetricsWindowState,
    startedAt: number,
    asOf: number
): AdminServerMetricsWindowSummary {
    const lastBucketStart = toBucketStart(asOf, windowState.bucketSeconds);
    const firstBucketStart =
        lastBucketStart -
        (windowState.bucketCount - 1) * windowState.bucketSeconds;

    let cpuPercentBucket: AdminServerMetricsPeak | null = null;
    let memoryUsedRatioBucket: AdminServerMetricsPeak | null = null;
    let load1mBucket: AdminServerMetricsPeak | null = null;
    let ssrAvgDurationMsBucket: AdminServerMetricsPeak | null = null;
    let ssrP95DurationMsBucket: AdminServerMetricsPeak | null = null;
    let apiAvgDurationMsBucket: AdminServerMetricsPeak | null = null;
    let apiP95DurationMsBucket: AdminServerMetricsPeak | null = null;

    const buckets = Array.from(
        { length: windowState.bucketCount },
        (_, index): AdminServerMetricsBucket => {
            const startAt =
                firstBucketStart + index * windowState.bucketSeconds;
            const bucketIndex = toBucketIndex(
                startAt,
                windowState.bucketSeconds,
                windowState.bucketCount
            );
            const storedBucket = windowState.buckets[bucketIndex]!;
            const bucket =
                storedBucket.startAt === startAt
                    ? toBucketSnapshot(storedBucket, windowState.bucketSeconds)
                    : createEmptyBucketSnapshot(
                          startAt,
                          windowState.bucketSeconds
                      );

            cpuPercentBucket = pickPeak(
                cpuPercentBucket,
                bucket,
                bucket.cpuPercent
            );
            memoryUsedRatioBucket = pickPeak(
                memoryUsedRatioBucket,
                bucket,
                bucket.memoryUsedRatio
            );
            load1mBucket = pickPeak(load1mBucket, bucket, bucket.load1m);
            ssrAvgDurationMsBucket = pickPeak(
                ssrAvgDurationMsBucket,
                bucket,
                bucket.ssrAvgDurationMs
            );
            ssrP95DurationMsBucket = pickPeak(
                ssrP95DurationMsBucket,
                bucket,
                bucket.ssrP95DurationMs
            );
            apiAvgDurationMsBucket = pickPeak(
                apiAvgDurationMsBucket,
                bucket,
                bucket.apiAvgDurationMs
            );
            apiP95DurationMsBucket = pickPeak(
                apiP95DurationMsBucket,
                bucket,
                bucket.apiP95DurationMs
            );

            return bucket;
        }
    );

    const fullCoverageSeconds =
        windowState.bucketSeconds * windowState.bucketCount;
    const coverageSeconds = Math.min(
        fullCoverageSeconds,
        Math.max(0, asOf - startedAt)
    );

    return {
        key: windowState.key,
        label: windowState.label,
        bucketSeconds: windowState.bucketSeconds,
        bucketCount: windowState.bucketCount,
        coverageSeconds,
        isPartial: coverageSeconds < fullCoverageSeconds,
        latest: buckets[buckets.length - 1] ?? null,
        peaks: {
            cpuPercentBucket,
            memoryUsedRatioBucket,
            load1mBucket,
            ssrAvgDurationMsBucket,
            ssrP95DurationMsBucket,
            apiAvgDurationMsBucket,
            apiP95DurationMsBucket
        },
        buckets
    };
}

export function initializeAdminServerMetricsSampling(): void {
    getStore();
}

export function recordAdminServerMetricsRequestDuration(
    sample: RecordRequestDurationSample
): void {
    const store = getStore();
    const timestamp = sample.timestamp ?? getNowSeconds();
    const durationMs = Math.max(0, sample.durationMs);

    for (const windowState of store.windows) {
        const bucket = hydrateBucket(windowState, timestamp);
        if (sample.kind === 'ssr') {
            bucket.ssrRequestCount += 1;
            bucket.ssrDurationTotalMs += durationMs;
            observeDurationHistogram(bucket.ssrDurationHistogram, durationMs);
        } else {
            bucket.apiRequestCount += 1;
            bucket.apiDurationTotalMs += durationMs;
            observeDurationHistogram(bucket.apiDurationHistogram, durationMs);
        }
    }

    store.dirty = true;
}

export function getAdminServerMetricsSnapshot(
    asOf = getNowSeconds()
): AdminServerMetricsResponse {
    const store = getStore();

    return {
        startedAt: store.startedAt,
        asOf,
        lastSampleAt: store.lastSampleAt,
        loadAverageSupported: store.loadAverageSupported,
        windows: store.windows.map((windowState) =>
            buildWindowSnapshot(windowState, store.startedAt, asOf)
        )
    };
}

export function flushAdminServerMetricsStoreToDisk(): void {
    flushStore(getStore());
}
