import { randomUUID } from 'node:crypto';
import type {
    Admin12306RequestBucket,
    Admin12306TraceDetailItem,
    Admin12306TraceDetailResponse,
    Admin12306TraceEvent,
    Admin12306TraceEventLevel,
    Admin12306TraceListItem,
    Admin12306TraceListResponse,
    Admin12306TraceStatus
} from '~/types/admin';
import useConfig from '~/server/config';
import getDayTimestampRange from '~/server/utils/date/getDayTimestampRange';
import {
    formatShanghaiDateString,
    getRelativeDateString
} from '~/server/utils/date/getCurrentDateString';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import {
    readJsonFileIfExists,
    registerRuntimeFlushCallback,
    startRuntimeFlushInterval,
    writeJsonFile
} from '~/server/utils/runtime/persistence';

const REQUEST_BUCKET_SECONDS = 30 * 60;
const REQUEST_BUCKET_COUNT = 48;
const REQUEST_METRICS_FILE_VERSION = 2;
const LEGACY_REQUEST_METRICS_FILE_VERSION = 1;

interface MutableRequestMetricBucket {
    total: number;
    byOperation: Record<string, number>;
}

interface MutableTraceSummary {
    traceId: string;
    subjectKeys: string[];
    title: string;
    subtitle: string;
    primaryTrainCode: string;
    allTrainCodes: string[];
    trainInternalCode: string;
    startAt: number | null;
    taskId: number | null;
    executor: string;
    status: Admin12306TraceStatus;
    startedAt: number;
    endedAt: number | null;
    requestCount: number;
    conflictCount: number;
    functionCount: number;
    events: Admin12306TraceEvent[];
}

interface RequestMetricDayState {
    date: string;
    buckets: MutableRequestMetricBucket[];
    traces: Map<string, MutableTraceSummary>;
    traceIdsByKey: Map<string, string>;
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

interface SerializedTraceSummary {
    traceId: string;
    subjectKeys: string[];
    title: string;
    subtitle: string;
    primaryTrainCode: string;
    allTrainCodes: string[];
    trainInternalCode: string;
    startAt: number | null;
    taskId: number | null;
    executor: string;
    status: Admin12306TraceStatus;
    startedAt: number;
    endedAt: number | null;
    requestCount: number;
    conflictCount: number;
    functionCount: number;
    events: Admin12306TraceEvent[];
}

interface SerializedRequestMetricDayV2 {
    date: string;
    buckets: SerializedRequestMetricBucket[];
    traces: SerializedTraceSummary[];
}

interface SerializedRequestMetricDayV1 {
    date: string;
    buckets: SerializedRequestMetricBucket[];
}

interface SerializedRequestMetricsStoreV2 {
    version: 2;
    savedAt: number;
    bucketSeconds: number;
    bucketCount: number;
    days: SerializedRequestMetricDayV2[];
}

interface SerializedRequestMetricsStoreV1 {
    version: 1;
    savedAt: number;
    bucketSeconds: number;
    bucketCount: number;
    days: SerializedRequestMetricDayV1[];
}

export interface RequestMetricsSnapshot {
    requestMetricsEnabled: boolean;
    requestBuckets: Admin12306RequestBucket[];
    requestMetricsRetentionDays: number;
    requestMetricsRetained: boolean;
}

interface GlobalWithRequestMetricsStore {
    __openCrh12306RequestMetricsStore?: RequestMetricsStoreContainer;
}

export interface RecordRequestMetricSample {
    timestamp?: number;
    operation: string;
}

export interface Append12306TraceEventSample {
    timestamp?: number;
    kind: Admin12306TraceEvent['kind'];
    level?: Admin12306TraceEventLevel;
    title: string;
    message?: string;
    durationMs?: number | null;
    invocationId?: string;
    parentInvocationId?: string | null;
    traceKey?: string;
    traceTitle?: string;
    traceSubtitle?: string;
    primaryTrainCode?: string;
    allTrainCodes?: string[];
    trainInternalCode?: string;
    startAt?: number | null;
    taskId?: number | null;
    executor?: string;
    context?: Record<string, unknown>;
    requestType?: 'query' | 'search';
    method?: string;
    url?: string;
    operation?: string;
    responseStatus?: number | null;
    businessStatus?: unknown;
    errorCode?: unknown;
    errorMessage?: unknown;
    functionName?: string;
    functionStatus?: 'success' | 'warning' | 'error';
    summaryStatus?: Admin12306TraceStatus;
}

interface List12306TracesOptions {
    date: string;
    trainCode?: string;
    cursor?: string;
    limit: number;
}

interface Get12306TraceDetailOptions {
    date: string;
    traceId: string;
}

interface TraceCursorPoint {
    startedAt: number;
    traceId: string;
}

function getRequestMetricsConfig() {
    return useConfig().data.runtime.requestMetrics12306;
}

export function is12306RequestMetricsEnabled() {
    return getRequestMetricsConfig().enabled;
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
        ),
        traces: new Map<string, MutableTraceSummary>(),
        traceIdsByKey: new Map<string, string>()
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

function normalizeTitle(value: string) {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : '12306 trace';
}

function normalizeOptionalText(value: string | null | undefined) {
    if (typeof value !== 'string') {
        return '';
    }

    return value.trim();
}

function normalizeOptionalInteger(value: number | null | undefined) {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0
        ? value
        : null;
}

function normalizeLevel(value?: Admin12306TraceEventLevel) {
    return value ?? 'INFO';
}

function toStatusFromLevel(level: Admin12306TraceEventLevel): Admin12306TraceStatus {
    switch (level) {
        case 'ERROR':
            return 'error';
        case 'WARN':
            return 'warning';
        default:
            return 'running';
    }
}

function maxStatus(
    left: Admin12306TraceStatus,
    right: Admin12306TraceStatus
): Admin12306TraceStatus {
    const rank: Record<Admin12306TraceStatus, number> = {
        running: 0,
        success: 1,
        warning: 2,
        error: 3
    };

    return rank[left] >= rank[right] ? left : right;
}

function normalizeTrainCodes(codes: string[] | undefined) {
    if (!Array.isArray(codes)) {
        return [] as string[];
    }

    return Array.from(
        new Set(
            codes
                .filter((value): value is string => typeof value === 'string')
                .map((value) => normalizeCode(value))
                .filter((value) => value.length > 0)
        )
    );
}

function normalizeTraceContext(
    context: Record<string, unknown> | undefined
): Record<string, string> {
    if (!context) {
        return {};
    }

    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(context)) {
        if (typeof value === 'undefined' || value === null) {
            continue;
        }

        const normalizedKey = key.trim();
        if (normalizedKey.length === 0) {
            continue;
        }

        const normalizedValue =
            value instanceof Error
                ? `${value.name}: ${value.message}`
                : Array.isArray(value)
                  ? value
                        .map((item) =>
                            item instanceof Error
                                ? `${item.name}: ${item.message}`
                                : String(item)
                        )
                        .join(', ')
                  : String(value);
        const collapsedValue = normalizedValue.replace(/\s+/g, ' ').trim();
        if (collapsedValue.length === 0) {
            continue;
        }

        normalized[normalizedKey] = collapsedValue;
    }

    return normalized;
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

function isValidEvent(event: Admin12306TraceEvent) {
    return (
        typeof event === 'object' &&
        event !== null &&
        typeof event.id === 'string' &&
        event.id.trim().length > 0 &&
        Number.isInteger(event.timestamp) &&
        event.timestamp >= 0
    );
}

function isValidTrace(trace: SerializedTraceSummary) {
    if (
        typeof trace !== 'object' ||
        trace === null ||
        typeof trace.traceId !== 'string' ||
        trace.traceId.trim().length === 0 ||
        !Array.isArray(trace.subjectKeys) ||
        typeof trace.title !== 'string' ||
        typeof trace.subtitle !== 'string' ||
        typeof trace.primaryTrainCode !== 'string' ||
        !Array.isArray(trace.allTrainCodes) ||
        typeof trace.trainInternalCode !== 'string' ||
        (trace.startAt !== null &&
            (!Number.isInteger(trace.startAt) || trace.startAt < 0)) ||
        (trace.taskId !== null &&
            (!Number.isInteger(trace.taskId) || trace.taskId < 0)) ||
        typeof trace.executor !== 'string' ||
        !['running', 'success', 'warning', 'error'].includes(trace.status) ||
        !Number.isInteger(trace.startedAt) ||
        trace.startedAt < 0 ||
        (trace.endedAt !== null &&
            (!Number.isInteger(trace.endedAt) || trace.endedAt < 0)) ||
        !Number.isInteger(trace.requestCount) ||
        trace.requestCount < 0 ||
        !Number.isInteger(trace.conflictCount) ||
        trace.conflictCount < 0 ||
        !Number.isInteger(trace.functionCount) ||
        trace.functionCount < 0 ||
        !Array.isArray(trace.events)
    ) {
        return false;
    }

    return trace.events.every((event) => isValidEvent(event));
}

function restoreDayState(date: string): RequestMetricDayState {
    return createEmptyDayState(date);
}

function restoreStoreFromDisk(): RequestMetricsStoreContainer | null {
    const raw = readJsonFileIfExists<
        SerializedRequestMetricsStoreV2 | SerializedRequestMetricsStoreV1
    >(getRequestMetricsConfig().file);

    if (
        !raw ||
        !Number.isInteger(raw.bucketSeconds) ||
        raw.bucketSeconds !== REQUEST_BUCKET_SECONDS ||
        !Number.isInteger(raw.bucketCount) ||
        raw.bucketCount !== REQUEST_BUCKET_COUNT ||
        !Array.isArray(raw.days)
    ) {
        return null;
    }

    if (
        raw.version !== REQUEST_METRICS_FILE_VERSION &&
        raw.version !== LEGACY_REQUEST_METRICS_FILE_VERSION
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

        const dayState = restoreDayState(day.date);
        for (const [index, bucket] of day.buckets.entries()) {
            if (!isValidBucket(bucket)) {
                return null;
            }

            const targetBucket = dayState.buckets[index]!;
            targetBucket.total = bucket.total;
            targetBucket.byOperation = { ...bucket.byOperation };
        }

        if (raw.version === REQUEST_METRICS_FILE_VERSION) {
            const v2Day = day as SerializedRequestMetricDayV2;
            for (const trace of v2Day.traces ?? []) {
                if (!isValidTrace(trace)) {
                    return null;
                }

                const restoredTrace: MutableTraceSummary = {
                    traceId: trace.traceId,
                    subjectKeys: Array.from(
                        new Set(
                            trace.subjectKeys
                                .filter((value) => typeof value === 'string')
                                .map((value) => value.trim())
                                .filter((value) => value.length > 0)
                        )
                    ),
                    title: trace.title,
                    subtitle: trace.subtitle,
                    primaryTrainCode: trace.primaryTrainCode,
                    allTrainCodes: normalizeTrainCodes(trace.allTrainCodes),
                    trainInternalCode: normalizeCode(trace.trainInternalCode),
                    startAt: normalizeOptionalInteger(trace.startAt),
                    taskId: normalizeOptionalInteger(trace.taskId),
                    executor: trace.executor.trim(),
                    status: trace.status,
                    startedAt: trace.startedAt,
                    endedAt: normalizeOptionalInteger(trace.endedAt),
                    requestCount: trace.requestCount,
                    conflictCount: trace.conflictCount,
                    functionCount: trace.functionCount,
                    events: [...trace.events]
                };

                dayState.traces.set(restoredTrace.traceId, restoredTrace);
                for (const key of restoredTrace.subjectKeys) {
                    dayState.traceIdsByKey.set(key, restoredTrace.traceId);
                }
            }
        }

        store.days.set(day.date, dayState);
    }

    pruneRequestMetricDays(store);
    store.dirty = false;
    return store;
}

function serializeStore(
    store: RequestMetricsStoreContainer
): SerializedRequestMetricsStoreV2 {
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
                })),
                traces: Array.from(day.traces.values())
                    .sort(compareTraceSummariesDescending)
                    .map((trace) => ({
                        traceId: trace.traceId,
                        subjectKeys: [...trace.subjectKeys],
                        title: trace.title,
                        subtitle: trace.subtitle,
                        primaryTrainCode: trace.primaryTrainCode,
                        allTrainCodes: [...trace.allTrainCodes],
                        trainInternalCode: trace.trainInternalCode,
                        startAt: trace.startAt,
                        taskId: trace.taskId,
                        executor: trace.executor,
                        status: trace.status,
                        startedAt: trace.startedAt,
                        endedAt: trace.endedAt,
                        requestCount: trace.requestCount,
                        conflictCount: trace.conflictCount,
                        functionCount: trace.functionCount,
                        events: [...trace.events].sort(compareTraceEventsAscending)
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

function pushSubjectKey(subjectKeys: Set<string>, value: string) {
    const normalized = value.trim();
    if (normalized.length > 0) {
        subjectKeys.add(normalized);
    }
}

function buildTraceSubjectKeys(sample: Append12306TraceEventSample) {
    const subjectKeys = new Set<string>();
    const primaryTrainCode = normalizeCode(sample.primaryTrainCode ?? '');
    const trainInternalCode = normalizeCode(sample.trainInternalCode ?? '');
    const startAt = normalizeOptionalInteger(sample.startAt);

    if (sample.traceKey) {
        pushSubjectKey(subjectKeys, `trace:${sample.traceKey}`);
    }
    if (trainInternalCode.length > 0 && startAt !== null) {
        pushSubjectKey(subjectKeys, `internal:${trainInternalCode}@${startAt}`);
    }
    if (trainInternalCode.length > 0) {
        pushSubjectKey(subjectKeys, `internal:${trainInternalCode}`);
    }
    if (primaryTrainCode.length > 0 && startAt !== null) {
        pushSubjectKey(subjectKeys, `train:${primaryTrainCode}@${startAt}`);
    }
    if (primaryTrainCode.length > 0) {
        pushSubjectKey(subjectKeys, `train:${primaryTrainCode}`);
    }
    for (const trainCode of normalizeTrainCodes(sample.allTrainCodes)) {
        if (startAt !== null) {
            pushSubjectKey(subjectKeys, `train:${trainCode}@${startAt}`);
        }
        pushSubjectKey(subjectKeys, `train:${trainCode}`);
    }
    if (sample.taskId !== null && typeof sample.taskId !== 'undefined') {
        pushSubjectKey(subjectKeys, `task:${sample.taskId}`);
    }
    if (
        typeof sample.taskId === 'number' &&
        sample.taskId >= 0 &&
        typeof sample.executor === 'string' &&
        sample.executor.trim().length > 0
    ) {
        pushSubjectKey(subjectKeys, `task:${sample.executor.trim()}:${sample.taskId}`);
    }

    return Array.from(subjectKeys);
}

function compareTraceEventsAscending(
    left: Admin12306TraceEvent,
    right: Admin12306TraceEvent
) {
    return left.timestamp - right.timestamp || left.id.localeCompare(right.id);
}

function compareTraceSummariesDescending(
    left: MutableTraceSummary,
    right: MutableTraceSummary
) {
    const leftTimestamp = left.endedAt ?? left.startedAt;
    const rightTimestamp = right.endedAt ?? right.startedAt;
    return (
        rightTimestamp - leftTimestamp ||
        right.startedAt - left.startedAt ||
        left.traceId.localeCompare(right.traceId)
    );
}

function buildCursor(trace: MutableTraceSummary) {
    return `${trace.startedAt}:${trace.traceId}`;
}

function parseTraceCursor(rawValue: string | undefined): TraceCursorPoint | null {
    if (!rawValue) {
        return null;
    }

    const trimmed = rawValue.trim();
    const separatorIndex = trimmed.indexOf(':');
    if (separatorIndex <= 0 || separatorIndex >= trimmed.length - 1) {
        return null;
    }

    const startedAt = Number(trimmed.slice(0, separatorIndex));
    const traceId = trimmed.slice(separatorIndex + 1).trim();
    if (!Number.isInteger(startedAt) || startedAt < 0 || traceId.length === 0) {
        return null;
    }

    return {
        startedAt,
        traceId
    };
}

function createTraceSummary(
    traceId: string,
    timestamp: number
): MutableTraceSummary {
    return {
        traceId,
        subjectKeys: [],
        title: '',
        subtitle: '',
        primaryTrainCode: '',
        allTrainCodes: [],
        trainInternalCode: '',
        startAt: null,
        taskId: null,
        executor: '',
        status: 'running',
        startedAt: timestamp,
        endedAt: null,
        requestCount: 0,
        conflictCount: 0,
        functionCount: 0,
        events: []
    };
}

function mergeTraceInto(
    dayState: RequestMetricDayState,
    target: MutableTraceSummary,
    source: MutableTraceSummary
) {
    if (target.traceId === source.traceId) {
        return;
    }

    target.subjectKeys = Array.from(
        new Set([...target.subjectKeys, ...source.subjectKeys])
    );
    target.primaryTrainCode =
        target.primaryTrainCode || source.primaryTrainCode;
    target.allTrainCodes = normalizeTrainCodes([
        ...target.allTrainCodes,
        ...source.allTrainCodes
    ]);
    target.trainInternalCode =
        target.trainInternalCode || source.trainInternalCode;
    target.startAt = target.startAt ?? source.startAt;
    target.taskId = target.taskId ?? source.taskId;
    target.executor = target.executor || source.executor;
    target.title = target.title || source.title;
    target.subtitle = target.subtitle || source.subtitle;
    target.status = maxStatus(target.status, source.status);
    target.startedAt = Math.min(target.startedAt, source.startedAt);
    target.endedAt = Math.max(target.endedAt ?? 0, source.endedAt ?? 0) || null;
    target.requestCount += source.requestCount;
    target.conflictCount += source.conflictCount;
    target.functionCount += source.functionCount;
    target.events = [...target.events, ...source.events].sort(
        compareTraceEventsAscending
    );

    for (const key of target.subjectKeys) {
        dayState.traceIdsByKey.set(key, target.traceId);
    }
    dayState.traces.delete(source.traceId);
}

function resolveTraceSummary(
    dayState: RequestMetricDayState,
    sample: Append12306TraceEventSample,
    timestamp: number
) {
    const subjectKeys = buildTraceSubjectKeys(sample);
    const resolvedTraceIds = Array.from(
        new Set(
            subjectKeys
                .map((key) => dayState.traceIdsByKey.get(key) ?? '')
                .filter((value) => value.length > 0)
        )
    );

    let trace: MutableTraceSummary;
    if (resolvedTraceIds.length === 0) {
        trace = createTraceSummary(randomUUID(), timestamp);
        dayState.traces.set(trace.traceId, trace);
    } else {
        trace = dayState.traces.get(resolvedTraceIds[0]!)!;
        for (const extraTraceId of resolvedTraceIds.slice(1)) {
            const source = dayState.traces.get(extraTraceId);
            if (source) {
                mergeTraceInto(dayState, trace, source);
            }
        }
    }

    trace.subjectKeys = Array.from(
        new Set([...trace.subjectKeys, ...subjectKeys])
    );
    for (const key of trace.subjectKeys) {
        dayState.traceIdsByKey.set(key, trace.traceId);
    }

    const primaryTrainCode = normalizeCode(sample.primaryTrainCode ?? '');
    const allTrainCodes = normalizeTrainCodes(sample.allTrainCodes);
    const trainInternalCode = normalizeCode(sample.trainInternalCode ?? '');
    const startAt = normalizeOptionalInteger(sample.startAt);
    const taskId = normalizeOptionalInteger(sample.taskId);
    const executor = normalizeOptionalText(sample.executor);

    if (primaryTrainCode.length > 0) {
        trace.primaryTrainCode = primaryTrainCode;
    }
    if (allTrainCodes.length > 0) {
        trace.allTrainCodes = normalizeTrainCodes([
            ...trace.allTrainCodes,
            ...allTrainCodes,
            ...(trace.primaryTrainCode.length > 0 ? [trace.primaryTrainCode] : []),
            ...(primaryTrainCode.length > 0 ? [primaryTrainCode] : [])
        ]);
    } else if (primaryTrainCode.length > 0) {
        trace.allTrainCodes = normalizeTrainCodes([
            ...trace.allTrainCodes,
            primaryTrainCode
        ]);
    }
    if (trainInternalCode.length > 0) {
        trace.trainInternalCode = trainInternalCode;
    }
    if (startAt !== null) {
        trace.startAt = startAt;
    }
    if (taskId !== null) {
        trace.taskId = taskId;
    }
    if (executor.length > 0) {
        trace.executor = executor;
    }
    if (typeof sample.traceTitle === 'string' && sample.traceTitle.trim().length > 0) {
        trace.title = sample.traceTitle.trim();
    }
    if (
        typeof sample.traceSubtitle === 'string' &&
        sample.traceSubtitle.trim().length > 0
    ) {
        trace.subtitle = sample.traceSubtitle.trim();
    }

    if (trace.title.length === 0) {
        trace.title =
            trace.primaryTrainCode ||
            trace.trainInternalCode ||
            normalizeTitle(sample.title);
    }
    if (trace.subtitle.length === 0) {
        const subtitleParts: string[] = [];
        if (trace.allTrainCodes.length > 1) {
            subtitleParts.push(trace.allTrainCodes.join(' / '));
        }
        if (trace.trainInternalCode.length > 0) {
            subtitleParts.push(`internal ${trace.trainInternalCode}`);
        }
        if (trace.executor.length > 0) {
            subtitleParts.push(trace.executor);
        }
        trace.subtitle = subtitleParts[0] ?? '';
    }

    trace.startedAt = Math.min(trace.startedAt, timestamp);
    return trace;
}

function toTraceListItem(trace: MutableTraceSummary): Admin12306TraceListItem {
    return {
        traceId: trace.traceId,
        title: trace.title,
        subtitle: trace.subtitle,
        primaryTrainCode: trace.primaryTrainCode,
        allTrainCodes: [...trace.allTrainCodes],
        trainInternalCode: trace.trainInternalCode,
        startAt: trace.startAt,
        taskId: trace.taskId,
        executor: trace.executor,
        status: trace.status,
        startedAt: trace.startedAt,
        endedAt: trace.endedAt,
        requestCount: trace.requestCount,
        conflictCount: trace.conflictCount,
        functionCount: trace.functionCount
    };
}

function toTraceDetailItem(trace: MutableTraceSummary): Admin12306TraceDetailItem {
    return {
        ...toTraceListItem(trace),
        events: [...trace.events].sort(compareTraceEventsAscending)
    };
}

function shouldIncludeTrace(
    trace: MutableTraceSummary,
    trainCodeFilter: string
) {
    if (trainCodeFilter.length === 0) {
        return true;
    }

    if (trace.primaryTrainCode.includes(trainCodeFilter)) {
        return true;
    }
    if (trace.trainInternalCode.includes(trainCodeFilter)) {
        return true;
    }
    if (trace.title.toUpperCase().includes(trainCodeFilter)) {
        return true;
    }
    return trace.allTrainCodes.some((trainCode) =>
        trainCode.includes(trainCodeFilter)
    );
}

function appendRequestMetricBucket(
    dayState: RequestMetricDayState,
    timestamp: number,
    operation: string
) {
    const dayRange = getDayTimestampRange(dayState.date);
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
    bucket.total += 1;
    bucket.byOperation[operation] = (bucket.byOperation[operation] ?? 0) + 1;
}

export function record12306RequestMetric(
    sample: RecordRequestMetricSample
): void {
    if (!is12306RequestMetricsEnabled()) {
        return;
    }

    const timestamp = sample.timestamp ?? getNowSeconds();
    const date = formatShanghaiDateString(timestamp * 1000);
    const store = getRequestMetricsStore();
    const retentionDays = getRequestMetricsConfig().retentionDays;

    pruneRequestMetricDays(store);

    if (!isDateRetained(date, retentionDays)) {
        return;
    }

    const dayState = getOrCreateDayState(store, date);
    appendRequestMetricBucket(dayState, timestamp, normalizeOperation(sample.operation));
    store.dirty = true;
}

export function append12306TraceEvent(
    sample: Append12306TraceEventSample
): string | null {
    if (!is12306RequestMetricsEnabled()) {
        return null;
    }

    const timestamp = sample.timestamp ?? getNowSeconds();
    const date = formatShanghaiDateString(timestamp * 1000);
    const store = getRequestMetricsStore();
    const retentionDays = getRequestMetricsConfig().retentionDays;

    pruneRequestMetricDays(store);

    if (!isDateRetained(date, retentionDays)) {
        return null;
    }

    const dayState = getOrCreateDayState(store, date);
    const normalizedOperation = normalizeOperation(
        sample.operation ?? sample.title
    );
    if (sample.kind === 'request') {
        appendRequestMetricBucket(dayState, timestamp, normalizedOperation);
    }

    const hasSubject =
        buildTraceSubjectKeys(sample).length > 0 ||
        sample.kind !== 'request' ||
        !!sample.traceKey;
    if (!hasSubject) {
        store.dirty = true;
        return null;
    }

    const trace = resolveTraceSummary(dayState, sample, timestamp);
    const level = normalizeLevel(sample.level);
    const invocationId =
        normalizeOptionalText(sample.invocationId) || randomUUID();
    const parentInvocationId = normalizeOptionalText(sample.parentInvocationId);
    const baseEvent = {
        id: randomUUID(),
        timestamp,
        level,
        title: normalizeTitle(sample.title),
        message: normalizeOptionalText(sample.message),
        durationMs:
            typeof sample.durationMs === 'number' &&
            Number.isFinite(sample.durationMs) &&
            sample.durationMs >= 0
                ? Math.round(sample.durationMs)
                : null,
        invocationId,
        parentInvocationId: parentInvocationId || null,
        context: normalizeTraceContext(sample.context)
    };

    let event: Admin12306TraceEvent;
    switch (sample.kind) {
        case 'function':
            event = {
                ...baseEvent,
                kind: 'function',
                functionName:
                    normalizeOptionalText(sample.functionName) || normalizedOperation,
                status: sample.functionStatus ?? 'success'
            };
            trace.functionCount += 1;
            break;
        case 'request':
            event = {
                ...baseEvent,
                kind: 'request',
                operation: normalizedOperation,
                requestType: sample.requestType ?? 'query',
                method: normalizeOptionalText(sample.method).toUpperCase() || 'GET',
                url: normalizeOptionalText(sample.url),
                responseStatus: normalizeOptionalInteger(sample.responseStatus),
                businessStatus: normalizeOptionalText(
                    sample.businessStatus === undefined ||
                        sample.businessStatus === null
                        ? ''
                        : String(sample.businessStatus)
                ),
                errorCode: normalizeOptionalText(
                    sample.errorCode === undefined || sample.errorCode === null
                        ? ''
                        : String(sample.errorCode)
                ),
                errorMessage: normalizeOptionalText(
                    sample.errorMessage === undefined ||
                        sample.errorMessage === null
                        ? ''
                        : String(sample.errorMessage)
                )
            };
            trace.requestCount += 1;
            break;
        case 'conflict':
            event = {
                ...baseEvent,
                kind: 'conflict',
                operation: normalizedOperation
            };
            trace.conflictCount += 1;
            break;
        case 'decision':
            event = {
                ...baseEvent,
                kind: 'decision',
                operation: normalizedOperation
            };
            break;
        case 'summary':
            event = {
                ...baseEvent,
                kind: 'summary',
                status: sample.summaryStatus ?? toStatusFromLevel(level)
            };
            break;
        default:
            return null;
    }

    trace.events.push(event);
    trace.events.sort(compareTraceEventsAscending);
    trace.status = maxStatus(trace.status, toStatusFromLevel(level));
    if (event.kind === 'summary') {
        trace.status = maxStatus(trace.status, event.status);
    }
    trace.endedAt = timestamp;
    store.dirty = true;
    return trace.traceId;
}

export function get12306RequestMetricsSnapshot(
    date: string
): RequestMetricsSnapshot {
    const retentionDays = getRequestMetricsConfig().retentionDays;
    const retained = isDateRetained(date, retentionDays);

    if (!is12306RequestMetricsEnabled()) {
        return {
            requestMetricsEnabled: false,
            requestBuckets: buildRequestBuckets(date, null),
            requestMetricsRetentionDays: retentionDays,
            requestMetricsRetained: retained
        };
    }

    const store = getRequestMetricsStore();
    pruneRequestMetricDays(store);
    const dayState = retained ? (store.days.get(date) ?? null) : null;

    return {
        requestMetricsEnabled: true,
        requestBuckets: buildRequestBuckets(date, dayState),
        requestMetricsRetentionDays: retentionDays,
        requestMetricsRetained: retained
    };
}

export function list12306TraceListItems(
    options: List12306TracesOptions
): Admin12306TraceListResponse {
    const retentionDays = getRequestMetricsConfig().retentionDays;
    const retained = isDateRetained(options.date, retentionDays);
    const emptyResponse: Admin12306TraceListResponse = {
        date: options.date,
        cursor: options.cursor ?? '',
        nextCursor: '',
        limit: options.limit,
        total: 0,
        filteredTotal: 0,
        requestMetricsEnabled: is12306RequestMetricsEnabled(),
        requestMetricsRetentionDays: retentionDays,
        requestMetricsRetained: retained,
        items: []
    };

    if (!retained || !is12306RequestMetricsEnabled()) {
        return emptyResponse;
    }

    const store = getRequestMetricsStore();
    pruneRequestMetricDays(store);
    const dayState = store.days.get(options.date);
    if (!dayState) {
        return emptyResponse;
    }

    const trainCodeFilter = normalizeCode(options.trainCode ?? '');
    const traces = Array.from(dayState.traces.values())
        .filter((trace) => shouldIncludeTrace(trace, trainCodeFilter))
        .sort(compareTraceSummariesDescending);
    const cursor = parseTraceCursor(options.cursor);
    const filtered = cursor
        ? traces.filter((trace) => {
              if (trace.startedAt < cursor.startedAt) {
                  return true;
              }

              if (trace.startedAt > cursor.startedAt) {
                  return false;
              }

              return trace.traceId.localeCompare(cursor.traceId) > 0;
          })
        : traces;
    const pageItems = filtered.slice(0, options.limit);
    const nextCursor =
        filtered.length > options.limit && pageItems.at(-1)
            ? buildCursor(pageItems.at(-1)!)
            : '';

    return {
        date: options.date,
        cursor: options.cursor ?? '',
        nextCursor,
        limit: options.limit,
        total: traces.length,
        filteredTotal: traces.length,
        requestMetricsEnabled: true,
        requestMetricsRetentionDays: retentionDays,
        requestMetricsRetained: retained,
        items: pageItems.map((trace) => toTraceListItem(trace))
    };
}

export function get12306TraceDetail(
    options: Get12306TraceDetailOptions
): Admin12306TraceDetailResponse {
    const retentionDays = getRequestMetricsConfig().retentionDays;
    const retained = isDateRetained(options.date, retentionDays);

    if (!retained || !is12306RequestMetricsEnabled()) {
        return {
            date: options.date,
            requestMetricsEnabled: is12306RequestMetricsEnabled(),
            requestMetricsRetentionDays: retentionDays,
            requestMetricsRetained: retained,
            trace: null
        };
    }

    const store = getRequestMetricsStore();
    pruneRequestMetricDays(store);
    const trace = store.days.get(options.date)?.traces.get(options.traceId) ?? null;

    return {
        date: options.date,
        requestMetricsEnabled: true,
        requestMetricsRetentionDays: retentionDays,
        requestMetricsRetained: retained,
        trace: trace ? toTraceDetailItem(trace) : null
    };
}

export function flush12306RequestMetricsToDisk(): void {
    flushRequestMetricsStore();
}

export function get12306RequestMetricBucketSeconds() {
    return REQUEST_BUCKET_SECONDS;
}
