import { randomUUID } from 'node:crypto';
import type {
    Admin12306CouplingTaskEntryTone,
    Admin12306CouplingTaskResponse,
    Admin12306CouplingTaskResultEntry,
    Admin12306CouplingTaskSummaryItem,
    Admin12306CouplingTaskTrainGroup,
    Admin12306RequestBucket,
    Admin12306TraceDetailItem,
    Admin12306TraceDetailResponse,
    Admin12306TraceEvent,
    Admin12306TraceEventLevel,
    Admin12306TraceListItem,
    Admin12306TraceListResponse,
    Admin12306TraceStatus,
    Admin12306TrainTraceDayItem,
    Admin12306TrainTraceResultStatus,
    Admin12306TrainTraceSearchResponse,
    Admin12306TrainTraceSourceKind,
    Admin12306TrainTraceSourceRow
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

interface Search12306TrainTraceDaysOptions {
    date: string;
    trainCode: string;
}

interface Get12306CouplingTaskOptions {
    date: string;
    taskId: number;
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

function shiftShanghaiDateString(date: string, offsetDays: number) {
    const { startAt } = getDayTimestampRange(date);
    return formatShanghaiDateString(
        (startAt + offsetDays * 24 * 60 * 60) * 1000
    );
}

function parseNormalizedCodes(value: unknown) {
    if (typeof value !== 'string') {
        return [] as string[];
    }

    return Array.from(
        new Set(
            value
                .split(/[\/,]/)
                .map((item) => normalizeCode(item))
                .filter((item) => item.length > 0)
        )
    );
}

function formatHistoricalDateContext(value: unknown) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        return '';
    }

    const timestamp = Number.parseInt(value, 10);
    if (!Number.isInteger(timestamp) || timestamp <= 0) {
        return '';
    }

    return formatShanghaiDateString(timestamp * 1000);
}

function toStatusLabel(
    status: Admin12306TrainTraceResultStatus
): string {
    switch (status) {
        case 'single':
            return '单编组';
        case 'coupled':
            return '重联';
        case 'pending':
            return '未明确';
        default:
            return '未明确';
    }
}

function parseProbeStatusResult(value: unknown): {
    status: Admin12306TrainTraceResultStatus;
    label: string;
} {
    const normalizedValue =
        typeof value === 'string' ? value.trim() : String(value ?? '').trim();

    switch (normalizedValue) {
        case '1':
            return {
                status: 'pending',
                label: '未明确'
            };
        case '2':
            return {
                status: 'single',
                label: '单编组'
            };
        case '3':
            return {
                status: 'coupled',
                label: '重联'
            };
        default:
            return {
                status: 'unknown',
                label: '未明确'
            };
    }
}

function buildCouplingResultLabel(
    emuCodes: string[],
    primaryEmuCode: string
) {
    if (emuCodes.length === 0) {
        return '重联';
    }

    const extraCodes = primaryEmuCode
        ? emuCodes.filter((emuCode) => emuCode !== primaryEmuCode)
        : emuCodes.slice(1);
    if (extraCodes.length === 0) {
        return `重联 ${emuCodes.join(' / ')}`;
    }

    return `重联 ${extraCodes.join(' / ')}`;
}

function buildCouplingDetailText(emuCodes: string[]) {
    if (emuCodes.length < 2) {
        return '';
    }

    return `${emuCodes[0]} 重联 ${emuCodes.slice(1).join(' / ')}`;
}

function formatHistoryValidationReason(value: unknown) {
    const reason =
        typeof value === 'string' ? value.trim() : String(value ?? '').trim();

    switch (reason) {
        case 'matched_internal_code':
            return '按内部车次匹配';
        case 'matched_train_code':
            return '按车次匹配';
        case 'seat_code_missing':
            return '缺少座位码';
        case 'seat_code_request_failed':
            return '座位码请求失败';
        case 'main_emu_code_invalid':
            return '主编组号无效';
        case 'seat_route_not_current_day':
            return '座位码结果不是当日';
        case 'seat_internal_code_mismatch':
            return '座位码内部车次不一致';
        case 'seat_train_code_mismatch':
            return '座位码车次不一致';
        default:
            return reason;
    }
}

function parseContextInteger(value: unknown) {
    if (typeof value === 'number') {
        return Number.isInteger(value) && value >= 0 ? value : null;
    }

    if (typeof value !== 'string') {
        return null;
    }

    const parsedValue = Number.parseInt(value.trim(), 10);
    return Number.isInteger(parsedValue) && parsedValue >= 0
        ? parsedValue
        : null;
}

function parseTrainTraceCouplingTaskId(
    event: Admin12306TraceEvent
): number | null {
    return parseContextInteger(event.context.detectionTaskId);
}

function buildTrainTraceCouplingAction(
    event: Admin12306TraceEvent
): Pick<
    Admin12306TrainTraceSourceRow,
    'clickable' | 'actionType' | 'couplingTaskId' | 'couplingTaskDate'
> {
    const couplingTaskId = parseTrainTraceCouplingTaskId(event);
    if (couplingTaskId === null) {
        return {
            clickable: false,
            actionType: null,
            couplingTaskId: null,
            couplingTaskDate: null
        };
    }

    return {
        clickable: true,
        actionType: 'open_coupling_task',
        couplingTaskId,
        couplingTaskDate: formatShanghaiDateString(event.timestamp * 1000)
    };
}

function buildTrainTraceNoopAction(): Pick<
    Admin12306TrainTraceSourceRow,
    'clickable' | 'actionType' | 'couplingTaskId' | 'couplingTaskDate'
> {
    return {
        clickable: false,
        actionType: null,
        couplingTaskId: null,
        couplingTaskDate: null
    };
}

function getCouplingTaskToneByLevel(
    level: Admin12306TraceEventLevel
): Admin12306CouplingTaskEntryTone {
    switch (level) {
        case 'ERROR':
            return 'danger';
        case 'WARN':
            return 'warning';
        default:
            return 'neutral';
    }
}

function parseEventTrainCodes(event: Admin12306TraceEvent) {
    const trainCodes = parseNormalizedCodes(event.context.trainCodes);
    if (trainCodes.length > 0) {
        return trainCodes;
    }

    const trainCode = normalizeCode(event.context.trainCode ?? '');
    return trainCode ? [trainCode] : [];
}

function buildCouplingTaskEntryKey(trainCodes: string[]) {
    if (trainCodes.length === 0) {
        return 'unassigned';
    }

    return trainCodes.join('/');
}

function getTraceOperation(event: Admin12306TraceEvent) {
    return 'operation' in event ? event.operation : '';
}

function appendDetailPart(parts: string[], value: string) {
    const normalized = value.trim();
    if (normalized.length > 0) {
        parts.push(normalized);
    }
}

function traceMatchesTrainCode(
    trace: MutableTraceSummary,
    queryTrainCode: string
) {
    if (trace.primaryTrainCode === queryTrainCode) {
        return true;
    }

    return trace.allTrainCodes.includes(queryTrainCode);
}

function eventMatchesTrainCode(
    trace: MutableTraceSummary,
    event: Admin12306TraceEvent,
    queryTrainCode: string
) {
    if (event.kind === 'request' && event.operation === 'fetch_emu_info_by_route') {
        const eventTrainCode = normalizeCode(event.context.trainCode ?? '');
        return (
            eventTrainCode.length > 0 &&
            (eventTrainCode === queryTrainCode ||
                (traceMatchesTrainCode(trace, queryTrainCode) &&
                    trace.allTrainCodes.includes(eventTrainCode)))
        );
    }

    if (event.kind === 'decision') {
        if (
            event.operation === 'pending_group_resolved_single' ||
            event.operation === 'coupled_group_detected' ||
            event.operation === 'single_group_upgraded_to_coupled'
        ) {
            const trainCodes = parseNormalizedCodes(event.context.trainCodes);
            return trainCodes.includes(queryTrainCode);
        }

        if (
            event.operation === 'reuse_historical_status' ||
            event.operation === 'resolved_from_status' ||
            event.operation === 'pending_coupling_detection' ||
            event.operation === 'resolved_single_non_multiple' ||
            event.operation === 'main_emu_asset_not_found'
        ) {
            const eventTrainCode = normalizeCode(event.context.trainCode ?? '');
            if (eventTrainCode.length === 0) {
                return traceMatchesTrainCode(trace, queryTrainCode);
            }

            return (
                eventTrainCode === queryTrainCode ||
                (traceMatchesTrainCode(trace, queryTrainCode) &&
                    trace.allTrainCodes.includes(eventTrainCode))
            );
        }
    }

    const trainCode = normalizeCode(event.context.trainCode ?? '');
    if (trainCode === queryTrainCode) {
        return true;
    }

    const trainCodes = parseNormalizedCodes(event.context.trainCodes);
    if (trainCodes.includes(queryTrainCode)) {
        return true;
    }

    return traceMatchesTrainCode(trace, queryTrainCode);
}

function buildTrainTraceSourceRow(
    trace: MutableTraceSummary,
    event: Admin12306TraceEvent,
    queryTrainCode: string
): (Admin12306TrainTraceSourceRow & {
    resultStatus: Admin12306TrainTraceResultStatus;
    relatedEmuCodes: string[];
}) | null {
    if (!eventMatchesTrainCode(trace, event, queryTrainCode)) {
        return null;
    }

    if (event.kind === 'request' && event.operation === 'fetch_emu_info_by_route') {
        const queriedTrainCode = normalizeCode(event.context.trainCode ?? '');
        const emuCode = normalizeCode(event.context.emuCode ?? '');
        const detailParts: string[] = [];

        if (queriedTrainCode.length > 0 && queriedTrainCode !== queryTrainCode) {
            appendDetailPart(detailParts, `实际命中 ${queriedTrainCode}`);
        }
        if (emuCode.length === 0) {
            appendDetailPart(
                detailParts,
                event.errorMessage || event.title || '12306 未返回编组信息'
            );
        }

        return {
            id: event.id,
            timestamp: event.timestamp,
            source: '按车次获取动车组信息',
            result: emuCode || '未检出',
            detail: detailParts.join(' · '),
            kind: 'route_query',
            level: event.level,
            ...buildTrainTraceNoopAction(),
            resultStatus: 'unknown',
            relatedEmuCodes: emuCode ? [emuCode] : []
        };
    }

    if (event.kind === 'decision' || event.kind === 'conflict') {
        if (event.operation === 'skip_historical_recent_same_assignment_not_running') {
            const historicalTrainCodes = parseNormalizedCodes(
                event.context.historicalRecentMatchedTrainCodes
            );
            const notRunningTrainCodes = parseNormalizedCodes(
                event.context.notRunningTrainCodes
            );
            const detailParts: string[] = [];

            appendDetailPart(
                detailParts,
                historicalTrainCodes.length > 0
                    ? `历史命中 ${historicalTrainCodes.join(' / ')}`
                    : ''
            );
            appendDetailPart(
                detailParts,
                notRunningTrainCodes.length > 0
                    ? `今日未开行 ${notRunningTrainCodes.join(' / ')}`
                    : ''
            );

            return {
                id: event.id,
                timestamp: event.timestamp,
                source: '历史担当校验',
                result: '今日不开行',
                detail: detailParts.join(' · '),
                kind: 'history_validation',
                level: event.level,
                ...buildTrainTraceNoopAction(),
                resultStatus: 'unknown',
                relatedEmuCodes: []
            };
        }

        if (event.operation === 'seat_verify_pass') {
            const detailParts: string[] = [];
            const reason = formatHistoryValidationReason(event.context.reason);

            appendDetailPart(
                detailParts,
                reason ? `复核方式 ${reason}` : ''
            );
            appendDetailPart(
                detailParts,
                normalizeCode(event.context.runningTrainCode ?? '')
                    ? `今日运行 ${normalizeCode(event.context.runningTrainCode ?? '')}`
                    : ''
            );
            appendDetailPart(
                detailParts,
                normalizeCode(event.context.seatTrainCode ?? '')
                    ? `座位码车次 ${normalizeCode(event.context.seatTrainCode ?? '')}`
                    : ''
            );
            appendDetailPart(
                detailParts,
                normalizeCode(event.context.seatInternalCode ?? '')
                    ? `座位码内部车次 ${normalizeCode(event.context.seatInternalCode ?? '')}`
                    : ''
            );

            return {
                id: event.id,
                timestamp: event.timestamp,
                source: '历史担当校验',
                result: '复核通过',
                detail: detailParts.join(' · '),
                kind: 'history_validation',
                level: event.level,
                ...buildTrainTraceNoopAction(),
                resultStatus: 'unknown',
                relatedEmuCodes: []
            };
        }

        if (event.operation === 'seat_verify_unavailable_continue') {
            const historicalTrainCodes = parseNormalizedCodes(
                event.context.historicalRecentMatchedTrainCodes
            );
            const detailParts: string[] = [];
            const reason = formatHistoryValidationReason(event.context.reason);

            appendDetailPart(detailParts, reason);
            appendDetailPart(
                detailParts,
                normalizeCode(event.context.runningTrainCode ?? '')
                    ? `今日运行 ${normalizeCode(event.context.runningTrainCode ?? '')}`
                    : ''
            );
            appendDetailPart(
                detailParts,
                historicalTrainCodes.length > 0
                    ? `历史命中 ${historicalTrainCodes.join(' / ')}`
                    : ''
            );

            return {
                id: event.id,
                timestamp: event.timestamp,
                source: '历史担当校验',
                result: '座位码不可用',
                detail: detailParts.join(' · '),
                kind: 'history_validation',
                level: event.level,
                ...buildTrainTraceNoopAction(),
                resultStatus: 'unknown',
                relatedEmuCodes: []
            };
        }

        if (
            event.operation === 'seat_verify_mismatch_requeue' ||
            event.operation === 'seat_verify_mismatch_exhausted'
        ) {
            const historicalTrainCodes = parseNormalizedCodes(
                event.context.historicalRecentMatchedTrainCodes
            );
            const detailParts: string[] = [];
            const reason = formatHistoryValidationReason(event.context.reason);

            appendDetailPart(detailParts, reason);
            appendDetailPart(
                detailParts,
                normalizeCode(event.context.runningTrainCode ?? '')
                    ? `今日运行 ${normalizeCode(event.context.runningTrainCode ?? '')}`
                    : ''
            );
            appendDetailPart(
                detailParts,
                normalizeCode(event.context.seatTrainCode ?? '')
                    ? `座位码车次 ${normalizeCode(event.context.seatTrainCode ?? '')}`
                    : ''
            );
            appendDetailPart(
                detailParts,
                normalizeCode(event.context.seatInternalCode ?? '')
                    ? `座位码内部车次 ${normalizeCode(event.context.seatInternalCode ?? '')}`
                    : ''
            );
            appendDetailPart(
                detailParts,
                historicalTrainCodes.length > 0
                    ? `历史命中 ${historicalTrainCodes.join(' / ')}`
                    : ''
            );

            if (event.operation === 'seat_verify_mismatch_requeue') {
                appendDetailPart(
                    detailParts,
                    event.context.nextTaskId
                        ? `已延迟重试 #${String(event.context.nextTaskId).trim()}`
                        : ''
                );
            }

            return {
                id: event.id,
                timestamp: event.timestamp,
                source: '历史担当校验',
                result:
                    event.operation === 'seat_verify_mismatch_requeue'
                        ? '复核冲突，延迟重试'
                        : '复核冲突，重试耗尽',
                detail: detailParts.join(' · '),
                kind: 'history_validation',
                level: event.level,
                ...buildTrainTraceNoopAction(),
                resultStatus: 'unknown',
                relatedEmuCodes: []
            };
        }

        if (
            event.operation ===
            'continue_historical_recent_same_assignment_request_failed'
        ) {
            const historicalTrainCodes = parseNormalizedCodes(
                event.context.historicalRecentMatchedTrainCodes
            );
            const requestFailedTrainCodes = parseNormalizedCodes(
                event.context.requestFailedTrainCodes
            );
            const notRunningTrainCodes = parseNormalizedCodes(
                event.context.notRunningTrainCodes
            );
            const detailParts: string[] = [];

            appendDetailPart(
                detailParts,
                historicalTrainCodes.length > 0
                    ? `历史命中 ${historicalTrainCodes.join(' / ')}`
                    : ''
            );
            appendDetailPart(
                detailParts,
                requestFailedTrainCodes.length > 0
                    ? `请求失败 ${requestFailedTrainCodes.join(' / ')}`
                    : ''
            );
            appendDetailPart(
                detailParts,
                notRunningTrainCodes.length > 0
                    ? `未开行 ${notRunningTrainCodes.join(' / ')}`
                    : ''
            );

            return {
                id: event.id,
                timestamp: event.timestamp,
                source: '历史担当校验',
                result: '运行校验请求失败',
                detail: detailParts.join(' · '),
                kind: 'history_validation',
                level: event.level,
                ...buildTrainTraceNoopAction(),
                resultStatus: 'unknown',
                relatedEmuCodes: []
            };
        }

        if (event.operation === 'reuse_historical_status_incomplete') {
            const detailParts: string[] = [];
            const historicalDate = formatHistoricalDateContext(
                event.context.historicalStartAt
            );
            const mainEmuCode = normalizeCode(event.context.mainEmuCode ?? '');

            appendDetailPart(
                detailParts,
                historicalDate ? `历史日期 ${historicalDate}` : ''
            );
            appendDetailPart(
                detailParts,
                mainEmuCode ? `主编组 ${mainEmuCode}` : ''
            );

            return {
                id: event.id,
                timestamp: event.timestamp,
                source: '历史担当校验',
                result: '历史状态不完整',
                detail: detailParts.join(' · '),
                kind: 'history_validation',
                level: event.level,
                ...buildTrainTraceNoopAction(),
                resultStatus: 'unknown',
                relatedEmuCodes: mainEmuCode ? [mainEmuCode] : []
            };
        }
    }

    if (event.kind !== 'decision') {
        return null;
    }

    if (
        event.operation === 'reuse_historical_status' ||
        event.operation === 'resolved_from_status'
    ) {
        const parsedStatus = parseProbeStatusResult(event.context.status);
        const detailParts: string[] = [];
        const mainEmuCode = normalizeCode(event.context.mainEmuCode ?? '');
        const emuCodeList = parseNormalizedCodes(event.context.emuCodeList);
        const historicalDate = formatHistoricalDateContext(
            event.context.historicalStartAt
        );

        if (parsedStatus.status === 'coupled') {
            appendDetailPart(detailParts, buildCouplingDetailText(emuCodeList));
        }
        appendDetailPart(
            detailParts,
            historicalDate ? `复用 ${historicalDate}` : ''
        );
        appendDetailPart(
            detailParts,
            parsedStatus.status !== 'coupled' && mainEmuCode
                ? `主编组 ${mainEmuCode}`
                : ''
        );

        return {
            id: event.id,
            timestamp: event.timestamp,
            source: '复用重联状态',
            result: parsedStatus.label,
            detail: detailParts.join(' · '),
            kind: 'reuse_status',
            level: event.level,
            ...buildTrainTraceNoopAction(),
            resultStatus: parsedStatus.status,
            relatedEmuCodes:
                emuCodeList.length > 0
                    ? emuCodeList
                    : (mainEmuCode ? [mainEmuCode] : [])
        };
    }

    if (event.operation === 'pending_coupling_detection') {
        const mainEmuCode = normalizeCode(event.context.mainEmuCode ?? '');

        return {
            id: event.id,
            timestamp: event.timestamp,
            source: '复用重联状态',
            result: '未明确',
            detail: mainEmuCode ? `主编组 ${mainEmuCode}` : '',
            kind: 'reuse_status',
            level: event.level,
            ...buildTrainTraceNoopAction(),
            resultStatus: 'pending',
            relatedEmuCodes: mainEmuCode ? [mainEmuCode] : []
        };
    }

    if (
        event.operation === 'resolved_single_non_multiple' ||
        event.operation === 'main_emu_asset_not_found'
    ) {
        const mainEmuCode = normalizeCode(event.context.mainEmuCode ?? '');

        return {
            id: event.id,
            timestamp: event.timestamp,
            source: '车辆资产判断',
            result: '单编组',
            detail: mainEmuCode ? `主编组 ${mainEmuCode}` : '',
            kind: 'asset_resolve',
            level: event.level,
            ...buildTrainTraceNoopAction(),
            resultStatus: 'single',
            relatedEmuCodes: mainEmuCode ? [mainEmuCode] : []
        };
    }

    if (event.operation === 'pending_group_resolved_single') {
        const emuCodes = parseNormalizedCodes(event.context.emuCodes);

        return {
            id: event.id,
            timestamp: event.timestamp,
            source: '重联扫描任务',
            result: '未检出',
            detail: emuCodes.length > 0 ? `主编组 ${emuCodes[0]}` : '',
            kind: 'coupling_scan',
            level: event.level,
            ...buildTrainTraceCouplingAction(event),
            resultStatus: 'single',
            relatedEmuCodes: emuCodes
        };
    }

    if (
        event.operation === 'coupled_group_detected' ||
        event.operation === 'single_group_upgraded_to_coupled'
    ) {
        const emuCodes = parseNormalizedCodes(event.context.emuCodes);
        const primaryEmuCode = emuCodes[0] ?? '';

        return {
            id: event.id,
            timestamp: event.timestamp,
            source: '重联扫描任务',
            result: buildCouplingResultLabel(emuCodes, primaryEmuCode),
            detail:
                event.operation === 'single_group_upgraded_to_coupled'
                    ? '单编组结果已升级'
                    : '',
            kind: 'coupling_scan',
            level: event.level,
            ...buildTrainTraceCouplingAction(event),
            resultStatus: 'coupled',
            relatedEmuCodes: emuCodes
        };
    }

    return null;
}

function compareTrainTraceSourceRows(
    left: Admin12306TrainTraceSourceRow,
    right: Admin12306TrainTraceSourceRow
) {
    return left.timestamp - right.timestamp || left.id.localeCompare(right.id);
}

function shouldKeepDistinctTrainTraceRow(
    current: Admin12306TrainTraceSourceRow,
    previous: Admin12306TrainTraceSourceRow | null
) {
    if (!previous) {
        return true;
    }

    return !(
        previous.timestamp === current.timestamp &&
        previous.source === current.source &&
        previous.result === current.result &&
        previous.detail === current.detail &&
        previous.kind === current.kind &&
        previous.clickable === current.clickable &&
        previous.actionType === current.actionType &&
        previous.couplingTaskId === current.couplingTaskId &&
        previous.couplingTaskDate === current.couplingTaskDate
    );
}

function buildTrainTraceDayItem(
    date: string,
    traces: MutableTraceSummary[],
    queryTrainCode: string
): Admin12306TrainTraceDayItem | null {
    const sourceRows = traces
        .flatMap((trace) =>
            trace.events.map((event) => buildTrainTraceSourceRow(trace, event, queryTrainCode))
        )
        .filter(
            (
                row
            ): row is Admin12306TrainTraceSourceRow & {
                resultStatus: Admin12306TrainTraceResultStatus;
                relatedEmuCodes: string[];
            } => row !== null
        )
        .sort(compareTrainTraceSourceRows);

    const distinctRows: Admin12306TrainTraceSourceRow[] = [];
    const matchedTrainCodes = new Set<string>();
    const relatedEmuCodes = new Set<string>();
    let resolvedStatus: Admin12306TrainTraceResultStatus = 'unknown';

    for (const trace of traces) {
        if (trace.primaryTrainCode.length > 0) {
            matchedTrainCodes.add(trace.primaryTrainCode);
        }
        for (const trainCode of trace.allTrainCodes) {
            matchedTrainCodes.add(trainCode);
        }
    }

    for (const row of sourceRows) {
        if (shouldKeepDistinctTrainTraceRow(row, distinctRows.at(-1) ?? null)) {
            distinctRows.push({
                id: row.id,
                timestamp: row.timestamp,
                source: row.source,
                result: row.result,
                detail: row.detail,
                kind: row.kind,
                level: row.level,
                clickable: row.clickable,
                actionType: row.actionType,
                couplingTaskId: row.couplingTaskId,
                couplingTaskDate: row.couplingTaskDate
            });
        }

        if (row.resultStatus !== 'unknown') {
            resolvedStatus = row.resultStatus;
        }

        for (const emuCode of row.relatedEmuCodes) {
            relatedEmuCodes.add(emuCode);
        }
    }

    if (distinctRows.length === 0) {
        return null;
    }

    return {
        date,
        queryTrainCode,
        matchedTrainCodes: Array.from(matchedTrainCodes),
        relatedEmuCodes: Array.from(relatedEmuCodes),
        traceCount: traces.length,
        resultStatus: resolvedStatus,
        resultLabel: toStatusLabel(resolvedStatus),
        rows: distinctRows
    };
}

function parseContextText(value: unknown) {
    return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function parseTraceRawArgs(trace: MutableTraceSummary | null) {
    const fallback = {
        bureau: '',
        model: ''
    };

    if (!trace) {
        return fallback;
    }

    const rawArgs =
        trace.events.find(
            (event) =>
                typeof event.context.rawArgs === 'string' &&
                event.context.rawArgs.trim().length > 0
        )?.context.rawArgs ?? '';

    if (typeof rawArgs !== 'string' || rawArgs.trim().length === 0) {
        return fallback;
    }

    try {
        const parsed = JSON.parse(rawArgs) as {
            bureau?: unknown;
            model?: unknown;
        };

        return {
            bureau:
                typeof parsed.bureau === 'string' ? parsed.bureau.trim() : '',
            model:
                typeof parsed.model === 'string'
                    ? normalizeCode(parsed.model)
                    : ''
        };
    } catch {
        return fallback;
    }
}

function buildCouplingTaskSummaryItem(
    event: Admin12306TraceEvent
): Admin12306CouplingTaskSummaryItem | null {
    const operation = getTraceOperation(event);
    const detailParts: string[] = [];
    const bureau = parseContextText(event.context.bureau);
    const model = normalizeCode(event.context.model ?? '');

    appendDetailPart(detailParts, bureau ? `担当局 ${bureau}` : '');
    appendDetailPart(detailParts, model ? `车型 ${model}` : '');

    if (operation === 'coupling_scan_skip_recent_detection') {
        const cooldownSeconds = parseContextInteger(
            event.context.cooldownSeconds
        );

        appendDetailPart(
            detailParts,
            cooldownSeconds !== null ? `冷却 ${cooldownSeconds} 秒` : ''
        );

        return {
            id: event.id,
            timestamp: event.timestamp,
            title: '最近已执行重联扫描',
            detail: detailParts.join(' · '),
            level: event.level
        };
    }

    if (operation === 'coupling_scan_candidate_group_not_found') {
        return {
            id: event.id,
            timestamp: event.timestamp,
            title: '未找到候选动车组',
            detail: detailParts.join(' · '),
            level: event.level
        };
    }

    if (operation === 'coupling_scan_task_summary') {
        const candidates = parseContextInteger(event.context.candidates);
        const pendingGroups = parseContextInteger(event.context.pendingGroups);
        const matchedGroups = parseContextInteger(event.context.matchedGroups);
        const finalizedSingleGroups = parseContextInteger(
            event.context.finalizedSingleGroups
        );
        const skippedAssigned = parseContextInteger(
            event.context.skippedAssigned
        );
        const scannedCount = parseContextInteger(event.context.scannedCount);
        const warningCount = parseContextInteger(event.context.warningCount);

        appendDetailPart(
            detailParts,
            candidates !== null ? `候选 ${candidates}` : ''
        );
        appendDetailPart(
            detailParts,
            pendingGroups !== null ? `待检 ${pendingGroups}` : ''
        );
        appendDetailPart(
            detailParts,
            matchedGroups !== null ? `重联 ${matchedGroups}` : ''
        );
        appendDetailPart(
            detailParts,
            finalizedSingleGroups !== null
                ? `单编组 ${finalizedSingleGroups}`
                : ''
        );
        appendDetailPart(
            detailParts,
            skippedAssigned !== null ? `跳过 ${skippedAssigned}` : ''
        );
        appendDetailPart(
            detailParts,
            scannedCount !== null ? `已扫 ${scannedCount}` : ''
        );
        appendDetailPart(
            detailParts,
            warningCount !== null ? `告警 ${warningCount}` : ''
        );

        return {
            id: event.id,
            timestamp: event.timestamp,
            title: '任务汇总',
            detail: detailParts.join(' · '),
            level: event.level
        };
    }

    return null;
}

function getCouplingTaskEntryTone(
    event: Admin12306TraceEvent
): Admin12306CouplingTaskEntryTone {
    if (event.kind === 'decision' && getTraceOperation(event) === 'coupled_group_detected') {
        return 'success';
    }

    return getCouplingTaskToneByLevel(event.level);
}

function buildCouplingTaskResultEntry(
    event: Admin12306TraceEvent
): Admin12306CouplingTaskResultEntry | null {
    const operation = getTraceOperation(event);
    const trainCodes = parseEventTrainCodes(event);
    const groupKey = buildCouplingTaskEntryKey(trainCodes);
    const startAt = parseContextInteger(event.context.startAt);

    if (operation === 'pending_group_resolved_single') {
        const emuCodes = parseNormalizedCodes(event.context.emuCodes);
        const detailParts: string[] = [];

        appendDetailPart(
            detailParts,
            emuCodes[0] ? `${emuCodes[0]} 单编组` : ''
        );

        return {
            id: event.id,
            timestamp: event.timestamp,
            title: '重联扫描结果',
            result: '未检出',
            detail: detailParts.join(' · '),
            startAt,
            groupKey,
            emuCodes,
            level: event.level,
            tone: getCouplingTaskEntryTone(event)
        };
    }

    if (
        operation === 'coupled_group_detected' ||
        operation === 'single_group_upgraded_to_coupled'
    ) {
        const emuCodes = parseNormalizedCodes(event.context.emuCodes);
        const primaryEmuCode = emuCodes[0] ?? '';
        const detailParts: string[] = [];

        appendDetailPart(detailParts, buildCouplingDetailText(emuCodes));
        appendDetailPart(
            detailParts,
            operation === 'single_group_upgraded_to_coupled'
                ? '由单编组升级为重联'
                : ''
        );

        return {
            id: event.id,
            timestamp: event.timestamp,
            title: '重联扫描结果',
            result: buildCouplingResultLabel(emuCodes, primaryEmuCode),
            detail: detailParts.join(' · '),
            startAt,
            groupKey,
            emuCodes,
            level: event.level,
            tone: getCouplingTaskEntryTone(event)
        };
    }

    if (operation === 'coupling_scan_skipped_assigned') {
        const candidateEmuCode = normalizeCode(
            event.context.candidateEmuCode ?? ''
        );
        const detailParts: string[] = [];
        const groupKeys = parseContextText(event.context.groupKeys);

        appendDetailPart(
            detailParts,
            trainCodes.length > 0 ? `关联车次 ${trainCodes.join(' / ')}` : ''
        );
        appendDetailPart(
            detailParts,
            groupKeys ? `编组键 ${groupKeys}` : ''
        );

        return {
            id: event.id,
            timestamp: event.timestamp,
            title: '跳过已分配候选',
            result: candidateEmuCode || '已跳过',
            detail: detailParts.join(' · '),
            startAt,
            groupKey,
            emuCodes: candidateEmuCode ? [candidateEmuCode] : [],
            level: event.level,
            tone: getCouplingTaskEntryTone(event)
        };
    }

    if (operation === 'coupling_scan_candidate_missing_seat_code') {
        const candidateEmuCode = normalizeCode(
            event.context.candidateEmuCode ?? ''
        );

        return {
            id: event.id,
            timestamp: event.timestamp,
            title: '候选缺少席位码',
            result: candidateEmuCode || '未提供',
            detail: '',
            startAt,
            groupKey,
            emuCodes: candidateEmuCode ? [candidateEmuCode] : [],
            level: event.level,
            tone: getCouplingTaskEntryTone(event)
        };
    }

    if (operation === 'coupling_scan_candidate_request_failed') {
        const candidateEmuCode = normalizeCode(
            event.context.candidateEmuCode ?? ''
        );
        const seatCode = parseContextText(event.context.seatCode);

        return {
            id: event.id,
            timestamp: event.timestamp,
            title: '候选席位码请求失败',
            result: candidateEmuCode || '请求失败',
            detail: seatCode ? `席位码 ${seatCode}` : '',
            startAt,
            groupKey,
            emuCodes: candidateEmuCode ? [candidateEmuCode] : [],
            level: event.level,
            tone: getCouplingTaskEntryTone(event)
        };
    }

    if (operation === 'coupling_scan_unmatched_current_group') {
        const candidateEmuCode = normalizeCode(
            event.context.candidateEmuCode ?? ''
        );
        const scannedEmuCode = normalizeCode(event.context.scannedEmuCode ?? '');
        const scannedTrainCode = normalizeCode(
            event.context.scannedTrainCode ?? ''
        );
        const detailParts: string[] = [];

        appendDetailPart(
            detailParts,
            scannedEmuCode ? `扫描编组 ${scannedEmuCode}` : ''
        );
        appendDetailPart(
            detailParts,
            candidateEmuCode ? `候选编组 ${candidateEmuCode}` : ''
        );
        appendDetailPart(
            detailParts,
            parseContextText(event.context.scannedTrainInternalCode)
                ? `内部车次 ${parseContextText(event.context.scannedTrainInternalCode)}`
                : ''
        );

        return {
            id: event.id,
            timestamp: event.timestamp,
            title: '扫描结果未匹配当前待检车次',
            result: scannedTrainCode || candidateEmuCode || '未匹配',
            detail: detailParts.join(' · '),
            startAt,
            groupKey,
            emuCodes: [candidateEmuCode, scannedEmuCode].filter(Boolean),
            level: event.level,
            tone: getCouplingTaskEntryTone(event)
        };
    }

    if (operation === 'over_limit_prune_train_repeat_zero') {
        const originalEmuCodes = parseNormalizedCodes(
            event.context.originalEmuCodes
        );
        const removedEmuCodes = parseNormalizedCodes(event.context.removedEmuCodes);
        const remainingEmuCodes = parseNormalizedCodes(
            event.context.remainingEmuCodes
        );
        const detailParts: string[] = [];

        appendDetailPart(
            detailParts,
            remainingEmuCodes.length > 0
                ? `保留 ${remainingEmuCodes.join(' / ')}`
                : ''
        );
        appendDetailPart(
            detailParts,
            originalEmuCodes.length > 0
                ? `原始 ${originalEmuCodes.join(' / ')}`
                : ''
        );

        return {
            id: event.id,
            timestamp: event.timestamp,
            title: '超限编组裁剪',
            result:
                removedEmuCodes.length > 0
                    ? `移除 ${removedEmuCodes.join(' / ')}`
                    : '已裁剪',
            detail: detailParts.join(' · '),
            startAt,
            groupKey,
            emuCodes:
                remainingEmuCodes.length > 0
                    ? remainingEmuCodes
                    : originalEmuCodes,
            level: event.level,
            tone: getCouplingTaskEntryTone(event)
        };
    }

    if (operation === 'over_limit_after_prune_continue') {
        const originalEmuCodes = parseNormalizedCodes(
            event.context.originalEmuCodes
        );
        const remainingEmuCodes = parseNormalizedCodes(
            event.context.remainingEmuCodes
        );

        return {
            id: event.id,
            timestamp: event.timestamp,
            title: '超限编组仍继续保留',
            result:
                remainingEmuCodes.length > 0
                    ? remainingEmuCodes.join(' / ')
                    : '仍超限',
            detail:
                originalEmuCodes.length > 0
                    ? `原始 ${originalEmuCodes.join(' / ')}`
                    : '',
            startAt,
            groupKey,
            emuCodes:
                remainingEmuCodes.length > 0
                    ? remainingEmuCodes
                    : originalEmuCodes,
            level: event.level,
            tone: getCouplingTaskEntryTone(event)
        };
    }

    if (operation === 'all_emu_codes_pruned') {
        const originalEmuCodes = parseNormalizedCodes(
            event.context.originalEmuCodes
        );
        const targetGroupKey = parseContextText(event.context.groupKey);

        return {
            id: event.id,
            timestamp: event.timestamp,
            title: '编组全部被裁剪',
            result:
                originalEmuCodes.length > 0
                    ? originalEmuCodes.join(' / ')
                    : '全部裁剪',
            detail: targetGroupKey ? `编组键 ${targetGroupKey}` : '',
            startAt,
            groupKey,
            emuCodes: originalEmuCodes,
            level: event.level,
            tone: getCouplingTaskEntryTone(event)
        };
    }

    return null;
}

function compareCouplingTaskGroups(
    left: Admin12306CouplingTaskTrainGroup,
    right: Admin12306CouplingTaskTrainGroup
) {
    if (left.isUnassigned !== right.isUnassigned) {
        return left.isUnassigned ? 1 : -1;
    }

    return (
        left.primaryTrainCode.localeCompare(right.primaryTrainCode) ||
        left.key.localeCompare(right.key)
    );
}

function compareCouplingTaskSummaryItems(
    left: Admin12306CouplingTaskSummaryItem,
    right: Admin12306CouplingTaskSummaryItem
) {
    return left.timestamp - right.timestamp || left.id.localeCompare(right.id);
}

function compareCouplingTaskResultEntries(
    left: Admin12306CouplingTaskResultEntry,
    right: Admin12306CouplingTaskResultEntry
) {
    return left.timestamp - right.timestamp || left.id.localeCompare(right.id);
}

function get12306CouplingTaskMeta(
    date: string,
    taskId: number,
    trace: MutableTraceSummary | null
) {
    if (!trace) {
        return null;
    }

    const rawArgs = parseTraceRawArgs(trace);

    return {
        taskId,
        date,
        executor: trace.executor,
        status: trace.status,
        startedAt: trace.startedAt,
        endedAt: trace.endedAt,
        bureau: rawArgs.bureau,
        model: rawArgs.model
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

function isProbeTrainDepartureTrace(trace: MutableTraceSummary) {
    return trace.executor === 'probe_train_departure';
}

function getProbeTrainDepartureTitle(trace: MutableTraceSummary) {
    if (trace.allTrainCodes.length > 0) {
        return trace.allTrainCodes.join(' / ');
    }

    if (trace.primaryTrainCode.length > 0) {
        return trace.primaryTrainCode;
    }

    return trace.title;
}

function isProbeTrainDepartureNotRunning(trace: MutableTraceSummary) {
    const expectedTrainCodes = normalizeTrainCodes(trace.allTrainCodes);
    if (expectedTrainCodes.length === 0) {
        return false;
    }

    const queriedTrainCodes = new Set<string>();
    const missingCarCodeTrainCodes = new Set<string>();
    const successfulTrainCodes = new Set<string>();

    for (const event of trace.events) {
        if (
            event.kind !== 'request' ||
            event.operation !== 'fetch_emu_info_by_route'
        ) {
            continue;
        }

        const trainCode = normalizeCode(event.context.trainCode ?? '');
        if (trainCode.length === 0) {
            continue;
        }

        queriedTrainCodes.add(trainCode);

        if (normalizeCode(event.context.emuCode ?? '').length > 0) {
            successfulTrainCodes.add(trainCode);
            continue;
        }

        if (event.errorMessage === 'missing content.data or content.data.carCode') {
            missingCarCodeTrainCodes.add(trainCode);
        }
    }

    return expectedTrainCodes.every(
        (trainCode) =>
            queriedTrainCodes.has(trainCode) &&
            missingCarCodeTrainCodes.has(trainCode) &&
            !successfulTrainCodes.has(trainCode)
    );
}

function getProbeTrainDepartureSubtitle(trace: MutableTraceSummary) {
    if (trace.conflictCount > 0) {
        return '冲突';
    }

    if (isProbeTrainDepartureNotRunning(trace)) {
        return '今日不开行';
    }

    return '成功';
}

function toDisplayTraceSummary(trace: MutableTraceSummary) {
    if (!isProbeTrainDepartureTrace(trace)) {
        return {
            title: trace.title,
            subtitle: trace.subtitle
        };
    }

    return {
        title: getProbeTrainDepartureTitle(trace),
        subtitle: getProbeTrainDepartureSubtitle(trace)
    };
}

function toTraceListItem(trace: MutableTraceSummary): Admin12306TraceListItem {
    const displayTrace = toDisplayTraceSummary(trace);

    return {
        traceId: trace.traceId,
        title: displayTrace.title,
        subtitle: displayTrace.subtitle,
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

export function get12306CouplingTask(
    options: Get12306CouplingTaskOptions
): Admin12306CouplingTaskResponse {
    const retentionDays = getRequestMetricsConfig().retentionDays;
    const retained = isDateRetained(options.date, retentionDays);
    const emptyResponse: Admin12306CouplingTaskResponse = {
        date: options.date,
        taskId: options.taskId,
        requestMetricsEnabled: is12306RequestMetricsEnabled(),
        requestMetricsRetentionDays: retentionDays,
        requestMetricsRetained: retained,
        task: null,
        summaries: [],
        groups: []
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

    const traces = Array.from(dayState.traces.values());
    const taskTrace =
        traces.find(
            (trace) =>
                trace.executor === 'detect_coupled_emu_group' &&
                trace.taskId === options.taskId
        ) ??
        traces.find(
            (trace) =>
                trace.executor === 'detect_coupled_emu_group' &&
                trace.events.some(
                    (event) =>
                        parseTrainTraceCouplingTaskId(event) === options.taskId
                )
        ) ??
        null;

    const summaries: Admin12306CouplingTaskSummaryItem[] = [];
    const groupMap = new Map<string, Admin12306CouplingTaskTrainGroup>();

    for (const trace of traces) {
        for (const event of trace.events) {
            if (parseTrainTraceCouplingTaskId(event) !== options.taskId) {
                continue;
            }

            const summaryItem = buildCouplingTaskSummaryItem(event);
            if (summaryItem) {
                summaries.push(summaryItem);
                continue;
            }

            const resultEntry = buildCouplingTaskResultEntry(event);
            if (!resultEntry) {
                continue;
            }

            const trainCodes = parseEventTrainCodes(event);
            const groupKey = buildCouplingTaskEntryKey(trainCodes);
            const group =
                groupMap.get(groupKey) ??
                (() => {
                    const nextGroup: Admin12306CouplingTaskTrainGroup = {
                        key: groupKey,
                        primaryTrainCode: trainCodes[0] ?? '未关联车次',
                        trainCodes,
                        isUnassigned: trainCodes.length === 0,
                        items: []
                    };
                    groupMap.set(groupKey, nextGroup);
                    return nextGroup;
                })();

            group.items.push(resultEntry);
        }
    }

    summaries.sort(compareCouplingTaskSummaryItems);
    const groups = Array.from(groupMap.values())
        .map((group) => ({
            ...group,
            items: [...group.items].sort(compareCouplingTaskResultEntries)
        }))
        .sort(compareCouplingTaskGroups);

    return {
        ...emptyResponse,
        task: get12306CouplingTaskMeta(options.date, options.taskId, taskTrace),
        summaries,
        groups
    };
}

export function search12306TrainTraceDays(
    options: Search12306TrainTraceDaysOptions
): Admin12306TrainTraceSearchResponse {
    const retentionDays = getRequestMetricsConfig().retentionDays;
    const queryTrainCode = normalizeCode(options.trainCode);
    const requestedDateRetained = isDateRetained(options.date, retentionDays);
    const searchableDates = requestedDateRetained
        ? Array.from({ length: retentionDays }, (_, index) =>
              shiftShanghaiDateString(options.date, -index)
          ).filter((date) => isDateRetained(date, retentionDays))
        : [];
    const emptyResponse: Admin12306TrainTraceSearchResponse = {
        date: options.date,
        queryTrainCode,
        searchedDayCount: searchableDates.length,
        matchedDayCount: 0,
        requestMetricsEnabled: is12306RequestMetricsEnabled(),
        requestMetricsRetentionDays: retentionDays,
        requestMetricsRetained: requestedDateRetained,
        items: []
    };

    if (
        queryTrainCode.length === 0 ||
        !requestedDateRetained ||
        !is12306RequestMetricsEnabled()
    ) {
        return emptyResponse;
    }

    const store = getRequestMetricsStore();
    pruneRequestMetricDays(store);

    const items: Admin12306TrainTraceDayItem[] = [];
    for (const date of searchableDates) {
        const dayState = store.days.get(date);
        if (!dayState) {
            continue;
        }

        const traces = Array.from(dayState.traces.values())
            .filter((trace) => shouldIncludeTrace(trace, queryTrainCode))
            .sort(compareTraceSummariesDescending);
        if (traces.length === 0) {
            continue;
        }

        const dayItem = buildTrainTraceDayItem(date, traces, queryTrainCode);
        if (dayItem) {
            items.push(dayItem);
        }
    }

    items.sort((left, right) => right.date.localeCompare(left.date));

    return {
        ...emptyResponse,
        matchedDayCount: items.length,
        items
    };
}

export function flush12306RequestMetricsToDisk(): void {
    flushRequestMetricsStore();
}

export function get12306RequestMetricBucketSeconds() {
    return REQUEST_BUCKET_SECONDS;
}
