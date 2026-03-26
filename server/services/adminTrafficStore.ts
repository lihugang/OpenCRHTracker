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
    AdminTrafficBucket,
    AdminTrafficMetricKey,
    AdminTrafficMetricPeak,
    AdminTrafficMetricTotals,
    AdminTrafficResponse,
    AdminTrafficWindow,
    AdminTrafficWindowSummary
} from '~/types/admin';
import {
    addHyperLogLogHash,
    clearHyperLogLogSketch,
    createHyperLogLogSketch,
    estimateHyperLogLog,
    mergeHyperLogLogSketch,
    type HyperLogLogSketch
} from '~/server/utils/stats/hyperLogLog';

const logger = getLogger('admin-traffic-store');
const ADMIN_TRAFFIC_FILE_VERSION = 1;

interface ExactTrafficBucket {
    mode: 'exact';
    startAt: number;
    webRequests: number;
    apiCalls: number;
    visitorIds: Set<number>;
    activeUserIds: Set<number>;
}

interface EstimatedTrafficBucket {
    mode: 'estimate';
    startAt: number;
    webRequests: number;
    apiCalls: number;
    visitorSketch: HyperLogLogSketch;
    activeUserSketch: HyperLogLogSketch;
}

type MutableTrafficBucket = ExactTrafficBucket | EstimatedTrafficBucket;

interface TrafficWindowState {
    key: AdminTrafficWindow;
    label: string;
    bucketSeconds: number;
    bucketCount: number;
    mode: 'exact' | 'estimate';
    estimatedMetrics: AdminTrafficMetricKey[];
    buckets: MutableTrafficBucket[];
}

interface TrafficStoreContainer {
    startedAt: number;
    windows: TrafficWindowState[];
    dirty: boolean;
    persistenceStarted: boolean;
    flushTimer?: ReturnType<typeof setInterval>;
}

interface GlobalWithTrafficStore {
    __openCrhAdminTrafficStore?: TrafficStoreContainer;
}

interface WebsiteTrafficSample {
    timestamp?: number;
    visitorIdHash: number;
    activeUserIdHash?: number | null;
}

interface ApiTrafficSample {
    timestamp?: number;
}

interface SerializedExactTrafficBucket {
    mode: 'exact';
    startAt: number;
    webRequests: number;
    apiCalls: number;
    visitorIds: number[];
    activeUserIds: number[];
}

interface SerializedEstimatedTrafficBucket {
    mode: 'estimate';
    startAt: number;
    webRequests: number;
    apiCalls: number;
    visitorSketch: string;
    activeUserSketch: string;
}

type SerializedTrafficBucket =
    | SerializedExactTrafficBucket
    | SerializedEstimatedTrafficBucket;

interface SerializedTrafficWindowState {
    key: AdminTrafficWindow;
    bucketSeconds: number;
    bucketCount: number;
    mode: TrafficWindowState['mode'];
    buckets: SerializedTrafficBucket[];
}

interface SerializedTrafficStore {
    version: number;
    savedAt: number;
    startedAt: number;
    windows: SerializedTrafficWindowState[];
}

const WINDOW_CONFIGS: Array<{
    key: AdminTrafficWindow;
    label: string;
    bucketSeconds: number;
    bucketCount: number;
    mode: TrafficWindowState['mode'];
    estimatedMetrics: AdminTrafficMetricKey[];
}> = [
    {
        key: '3h',
        label: '3h',
        bucketSeconds: 10 * 60,
        bucketCount: 18,
        mode: 'exact',
        estimatedMetrics: []
    },
    {
        key: '24h',
        label: '24h',
        bucketSeconds: 30 * 60,
        bucketCount: 48,
        mode: 'exact',
        estimatedMetrics: []
    },
    {
        key: '7d',
        label: '7days',
        bucketSeconds: 2 * 60 * 60,
        bucketCount: 84,
        mode: 'estimate',
        estimatedMetrics: ['uniqueVisitors', 'activeUsers']
    }
];

function getAdminTrafficConfig() {
    return useConfig().data.runtime.adminTraffic;
}

function createMutableBucket(
    mode: TrafficWindowState['mode'],
    startAt = 0
): MutableTrafficBucket {
    if (mode === 'estimate') {
        return {
            mode,
            startAt,
            webRequests: 0,
            apiCalls: 0,
            visitorSketch: createHyperLogLogSketch(),
            activeUserSketch: createHyperLogLogSketch()
        };
    }

    return {
        mode,
        startAt,
        webRequests: 0,
        apiCalls: 0,
        visitorIds: new Set<number>(),
        activeUserIds: new Set<number>()
    };
}

function createWindowState(
    config: (typeof WINDOW_CONFIGS)[number]
): TrafficWindowState {
    return {
        ...config,
        buckets: Array.from({ length: config.bucketCount }, () =>
            createMutableBucket(config.mode)
        )
    };
}

function createEmptyStore(): TrafficStoreContainer {
    return {
        startedAt: getNowSeconds(),
        windows: WINDOW_CONFIGS.map(createWindowState),
        dirty: false,
        persistenceStarted: false
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

function hydrateBucket(
    windowState: TrafficWindowState,
    timestamp: number
): MutableTrafficBucket {
    const bucketStart = toBucketStart(timestamp, windowState.bucketSeconds);
    const bucketIndex = toBucketIndex(
        bucketStart,
        windowState.bucketSeconds,
        windowState.bucketCount
    );
    const bucket = windowState.buckets[bucketIndex]!;

    if (bucket.startAt !== bucketStart) {
        bucket.startAt = bucketStart;
        bucket.webRequests = 0;
        bucket.apiCalls = 0;
        if (bucket.mode === 'estimate') {
            clearHyperLogLogSketch(bucket.visitorSketch);
            clearHyperLogLogSketch(bucket.activeUserSketch);
        } else {
            bucket.visitorIds.clear();
            bucket.activeUserIds.clear();
        }
    }

    return bucket;
}

function estimateCardinality(sketch: HyperLogLogSketch) {
    return Math.max(0, Math.round(estimateHyperLogLog(sketch)));
}

function createPeak(
    bucket: AdminTrafficBucket,
    value: number
): AdminTrafficMetricPeak {
    return {
        startAt: bucket.startAt,
        endAt: bucket.endAt,
        value
    };
}

function encodeSketch(sketch: HyperLogLogSketch) {
    return Buffer.from(sketch).toString('base64');
}

function decodeSketch(raw: string) {
    const template = createHyperLogLogSketch();
    const buffer = Buffer.from(raw, 'base64');
    if (buffer.length !== template.length) {
        return null;
    }

    template.set(buffer);
    return template;
}

function isNonNegativeInteger(value: unknown) {
    return Number.isInteger(value) && (value as number) >= 0;
}

function restoreTrafficStoreFromDisk(): TrafficStoreContainer | null {
    const raw = readJsonFileIfExists<SerializedTrafficStore>(
        getAdminTrafficConfig().file
    );

    if (
        !raw ||
        raw.version !== ADMIN_TRAFFIC_FILE_VERSION ||
        !Number.isInteger(raw.startedAt) ||
        raw.startedAt <= 0 ||
        !Array.isArray(raw.windows) ||
        raw.windows.length !== WINDOW_CONFIGS.length
    ) {
        return null;
    }

    const store = createEmptyStore();
    store.startedAt = raw.startedAt;

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
            serializedWindow.mode !== config.mode ||
            !Array.isArray(serializedWindow.buckets) ||
            serializedWindow.buckets.length !== config.bucketCount
        ) {
            return null;
        }

        for (const [index, serializedBucket] of serializedWindow.buckets.entries()) {
            const targetBucket = targetWindow.buckets[index]!;

            if (
                typeof serializedBucket !== 'object' ||
                serializedBucket === null ||
                serializedBucket.mode !== targetBucket.mode ||
                !Number.isInteger(serializedBucket.startAt) ||
                !isNonNegativeInteger(serializedBucket.webRequests) ||
                !isNonNegativeInteger(serializedBucket.apiCalls)
            ) {
                return null;
            }

            targetBucket.startAt = serializedBucket.startAt;
            targetBucket.webRequests = serializedBucket.webRequests;
            targetBucket.apiCalls = serializedBucket.apiCalls;

            if (targetBucket.mode === 'estimate') {
                if (
                    typeof (serializedBucket as SerializedEstimatedTrafficBucket)
                        .visitorSketch !== 'string' ||
                    typeof (serializedBucket as SerializedEstimatedTrafficBucket)
                        .activeUserSketch !== 'string'
                ) {
                    return null;
                }

                const visitorSketch = decodeSketch(
                    (serializedBucket as SerializedEstimatedTrafficBucket)
                        .visitorSketch
                );
                const activeUserSketch = decodeSketch(
                    (serializedBucket as SerializedEstimatedTrafficBucket)
                        .activeUserSketch
                );

                if (!visitorSketch || !activeUserSketch) {
                    return null;
                }

                targetBucket.visitorSketch.set(visitorSketch);
                targetBucket.activeUserSketch.set(activeUserSketch);
            } else {
                const visitorIds = (
                    serializedBucket as SerializedExactTrafficBucket
                ).visitorIds;
                const activeUserIds = (
                    serializedBucket as SerializedExactTrafficBucket
                ).activeUserIds;

                if (!Array.isArray(visitorIds) || !Array.isArray(activeUserIds)) {
                    return null;
                }

                targetBucket.visitorIds = new Set<number>();
                targetBucket.activeUserIds = new Set<number>();

                for (const visitorId of visitorIds) {
                    if (!isNonNegativeInteger(visitorId)) {
                        return null;
                    }

                    targetBucket.visitorIds.add(visitorId);
                }

                for (const activeUserId of activeUserIds) {
                    if (!isNonNegativeInteger(activeUserId)) {
                        return null;
                    }

                    targetBucket.activeUserIds.add(activeUserId);
                }
            }
        }
    }

    store.dirty = false;
    return store;
}

function serializeTrafficStore(
    store: TrafficStoreContainer
): SerializedTrafficStore {
    return {
        version: ADMIN_TRAFFIC_FILE_VERSION,
        savedAt: getNowSeconds(),
        startedAt: store.startedAt,
        windows: store.windows.map((windowState) => ({
            key: windowState.key,
            bucketSeconds: windowState.bucketSeconds,
            bucketCount: windowState.bucketCount,
            mode: windowState.mode,
            buckets: windowState.buckets.map((bucket) =>
                bucket.mode === 'estimate'
                    ? {
                          mode: 'estimate',
                          startAt: bucket.startAt,
                          webRequests: bucket.webRequests,
                          apiCalls: bucket.apiCalls,
                          visitorSketch: encodeSketch(bucket.visitorSketch),
                          activeUserSketch: encodeSketch(
                              bucket.activeUserSketch
                          )
                      }
                    : {
                          mode: 'exact',
                          startAt: bucket.startAt,
                          webRequests: bucket.webRequests,
                          apiCalls: bucket.apiCalls,
                          visitorIds: [...bucket.visitorIds],
                          activeUserIds: [...bucket.activeUserIds]
                      }
            )
        }))
    };
}

function flushAdminTrafficStore() {
    const store = getTrafficStore();
    if (!store.dirty) {
        return;
    }

    writeJsonFile(getAdminTrafficConfig().file, serializeTrafficStore(store));
    store.dirty = false;
}

function ensurePersistenceStarted(store: TrafficStoreContainer) {
    if (store.persistenceStarted) {
        return;
    }

    store.persistenceStarted = true;
    store.flushTimer = startRuntimeFlushInterval(
        getAdminTrafficConfig().flushIntervalMinutes * 60 * 1000,
        flushAdminTrafficStore
    );
    registerRuntimeFlushCallback(flushAdminTrafficStore);
}

function getTrafficStore() {
    const globalScope = globalThis as GlobalWithTrafficStore;
    if (!globalScope.__openCrhAdminTrafficStore) {
        const restoredStore = restoreTrafficStoreFromDisk();
        globalScope.__openCrhAdminTrafficStore =
            restoredStore ?? createEmptyStore();
        if (!restoredStore) {
            logger.info('admin traffic store initialized from empty state');
        }
    }

    const store = globalScope.__openCrhAdminTrafficStore;
    ensurePersistenceStarted(store);
    return store;
}

function buildWindowSnapshot(
    windowState: TrafficWindowState,
    startedAt: number,
    asOf: number
): AdminTrafficWindowSummary {
    const lastBucketStart = toBucketStart(asOf, windowState.bucketSeconds);
    const firstBucketStart =
        lastBucketStart -
        (windowState.bucketCount - 1) * windowState.bucketSeconds;
    const visitorIds = new Set<number>();
    const activeUserIds = new Set<number>();
    const visitorSketch =
        windowState.mode === 'estimate' ? createHyperLogLogSketch() : null;
    const activeUserSketch =
        windowState.mode === 'estimate' ? createHyperLogLogSketch() : null;
    const totals: AdminTrafficMetricTotals = {
        webRequests: 0,
        apiCalls: 0,
        uniqueVisitors: 0,
        activeUsers: 0
    };
    let webRequestsBucket: AdminTrafficMetricPeak | null = null;
    let apiCallsBucket: AdminTrafficMetricPeak | null = null;
    let uniqueVisitorsBucket: AdminTrafficMetricPeak | null = null;
    let activeUsersBucket: AdminTrafficMetricPeak | null = null;

    const buckets = Array.from(
        { length: windowState.bucketCount },
        (_, index): AdminTrafficBucket => {
            const startAt = firstBucketStart + index * windowState.bucketSeconds;
            const bucketIndex = toBucketIndex(
                startAt,
                windowState.bucketSeconds,
                windowState.bucketCount
            );
            const storedBucket = windowState.buckets[bucketIndex]!;
            const bucket: AdminTrafficBucket =
                storedBucket.startAt === startAt
                    ? {
                          startAt,
                          endAt: startAt + windowState.bucketSeconds - 1,
                          webRequests: storedBucket.webRequests,
                          apiCalls: storedBucket.apiCalls,
                          uniqueVisitors:
                              storedBucket.mode === 'estimate'
                                  ? estimateCardinality(
                                        storedBucket.visitorSketch
                                    )
                                  : storedBucket.visitorIds.size,
                          activeUsers:
                              storedBucket.mode === 'estimate'
                                  ? estimateCardinality(
                                        storedBucket.activeUserSketch
                                    )
                                  : storedBucket.activeUserIds.size
                      }
                    : {
                          startAt,
                          endAt: startAt + windowState.bucketSeconds - 1,
                          webRequests: 0,
                          apiCalls: 0,
                          uniqueVisitors: 0,
                          activeUsers: 0
                      };

            totals.webRequests += bucket.webRequests;
            totals.apiCalls += bucket.apiCalls;

            if (storedBucket.startAt === startAt) {
                if (storedBucket.mode === 'estimate') {
                    mergeHyperLogLogSketch(
                        visitorSketch!,
                        storedBucket.visitorSketch
                    );
                    mergeHyperLogLogSketch(
                        activeUserSketch!,
                        storedBucket.activeUserSketch
                    );
                } else {
                    for (const visitorId of storedBucket.visitorIds) {
                        visitorIds.add(visitorId);
                    }

                    for (const activeUserId of storedBucket.activeUserIds) {
                        activeUserIds.add(activeUserId);
                    }
                }
            }

            if (
                !webRequestsBucket ||
                bucket.webRequests > webRequestsBucket.value
            ) {
                webRequestsBucket = createPeak(bucket, bucket.webRequests);
            }

            if (!apiCallsBucket || bucket.apiCalls > apiCallsBucket.value) {
                apiCallsBucket = createPeak(bucket, bucket.apiCalls);
            }

            if (
                !uniqueVisitorsBucket ||
                bucket.uniqueVisitors > uniqueVisitorsBucket.value
            ) {
                uniqueVisitorsBucket = createPeak(
                    bucket,
                    bucket.uniqueVisitors
                );
            }

            if (
                !activeUsersBucket ||
                bucket.activeUsers > activeUsersBucket.value
            ) {
                activeUsersBucket = createPeak(bucket, bucket.activeUsers);
            }

            return bucket;
        }
    );

    totals.uniqueVisitors =
        windowState.mode === 'estimate'
            ? estimateCardinality(visitorSketch!)
            : visitorIds.size;
    totals.activeUsers =
        windowState.mode === 'estimate'
            ? estimateCardinality(activeUserSketch!)
            : activeUserIds.size;

    const fullCoverageSeconds = windowState.bucketSeconds * windowState.bucketCount;
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
        estimatedMetrics: [...windowState.estimatedMetrics],
        totals,
        peaks: {
            ...totals,
            webRequestsBucket,
            apiCallsBucket,
            uniqueVisitorsBucket,
            activeUsersBucket
        },
        buckets
    };
}

export function recordAdminTrafficWebsiteRequest(
    sample: WebsiteTrafficSample
): void {
    const store = getTrafficStore();
    const timestamp = sample.timestamp ?? getNowSeconds();

    for (const windowState of store.windows) {
        const bucket = hydrateBucket(windowState, timestamp);
        bucket.webRequests += 1;
        if (bucket.mode === 'estimate') {
            addHyperLogLogHash(bucket.visitorSketch, sample.visitorIdHash);
        } else {
            bucket.visitorIds.add(sample.visitorIdHash);
        }

        if (
            sample.activeUserIdHash !== null &&
            sample.activeUserIdHash !== undefined
        ) {
            if (bucket.mode === 'estimate') {
                addHyperLogLogHash(
                    bucket.activeUserSketch,
                    sample.activeUserIdHash
                );
            } else {
                bucket.activeUserIds.add(sample.activeUserIdHash);
            }
        }
    }

    store.dirty = true;
}

export function recordAdminTrafficApiCall(sample: ApiTrafficSample = {}): void {
    const store = getTrafficStore();
    const timestamp = sample.timestamp ?? getNowSeconds();

    for (const windowState of store.windows) {
        const bucket = hydrateBucket(windowState, timestamp);
        bucket.apiCalls += 1;
    }

    store.dirty = true;
}

export function getAdminTrafficSnapshot(
    asOf = getNowSeconds()
): AdminTrafficResponse {
    const store = getTrafficStore();

    return {
        startedAt: store.startedAt,
        asOf,
        windows: store.windows.map((windowState) =>
            buildWindowSnapshot(windowState, store.startedAt, asOf)
        )
    };
}

export function flushAdminTrafficStoreToDisk(): void {
    flushAdminTrafficStore();
}
