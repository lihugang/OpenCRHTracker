import { useTrainProvenanceDatabase } from '~/server/libs/database/trainProvenance';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import useConfig from '~/server/config';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import uniqueNormalizedCodes from '~/server/utils/12306/uniqueNormalizedCodes';
import getCurrentDateString, {
    formatShanghaiDateString
} from '~/server/utils/date/getCurrentDateString';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

export type TrainProvenanceTaskRunStatus =
    | 'running'
    | 'success'
    | 'failed'
    | 'skipped';

export type TrainProvenanceRequestStatType =
    | 'search_train_code'
    | 'fetch_route_info'
    | 'fetch_emu_by_route'
    | 'fetch_emu_by_seat_code'
    | 'fetch_all_stations'
    | 'fetch_station_board'
    | 'fetch_station_exit_info'
    | 'fetch_station_transport_info';

export type StationPlatformRefreshTrigger = 'route_refresh' | 'station_board';

export type StationPlatformRefreshStatus =
    | 'success'
    | 'partial'
    | 'failed'
    | 'skipped';

export type StationPlatformRefreshEntryStatus =
    | 'updated'
    | 'cache_hit'
    | 'cache_fallback'
    | 'no_data'
    | 'request_failed'
    | 'persist_failed';

type TrainProvenanceSqlKey =
    | 'cleanupExpiredRequestHourlyStats'
    | 'cleanupExpiredTaskRuns'
    | 'incrementRequestHourlyStat'
    | 'insertCouplingScanCandidate'
    | 'insertProvenanceEvent'
    | 'insertStationPlatformRefreshEntry'
    | 'insertStationPlatformRefreshResult'
    | 'insertStationBoardDispatchResult'
    | 'insertStationBoardFetchResult'
    | 'selectRequestHourlyStatsInRange'
    | 'selectCouplingScanCandidatesByTaskRunId'
    | 'selectDepartureStartAtsByDateAndTrainCode'
    | 'selectEventsByDateAndTrainCode'
    | 'selectEventsByTaskRunId'
    | 'selectStationBoardDispatchResultByTaskRunId'
    | 'selectStationBoardDispatchResultsByDate'
    | 'selectStationBoardFetchResultByTaskRunId'
    | 'selectStationBoardFetchResultsByParentSchedulerTaskId'
    | 'selectStationPlatformRefreshEntriesByResultId'
    | 'selectStationPlatformRefreshResultById'
    | 'selectTaskRunById'
    | 'selectTaskRunsByDateAndExecutor'
    | 'selectTaskRunBySchedulerTaskId'
    | 'updateTaskRunFinished'
    | 'upsertTaskRunStart';

interface TrainProvenanceTaskRunRow {
    id: number;
    scheduler_task_id: number;
    executor: string;
    execution_time: number;
    started_at: number;
    finished_at: number | null;
    status: TrainProvenanceTaskRunStatus;
    error_message: string;
    task_args_json: string;
    service_date: string;
    primary_train_code: string;
    primary_start_at: number | null;
    primary_emu_code: string;
}

interface TrainProvenanceEventRow {
    id: number;
    task_run_id: number;
    scheduler_task_id: number;
    executor: string;
    task_status: TrainProvenanceTaskRunStatus;
    created_at: number;
    service_date: string;
    train_code: string;
    start_at: number | null;
    emu_code: string;
    related_train_code: string;
    related_emu_code: string;
    event_type: string;
    result: string;
    linked_scheduler_task_id: number | null;
    linked_task_run_id: number | null;
    payload_json: string;
}

interface CouplingScanCandidateRow {
    id: number;
    task_run_id: number;
    candidate_order: number;
    service_date: string;
    bureau: string;
    model: string;
    candidate_emu_code: string;
    status: string;
    reason: string;
    scanned_train_code: string;
    scanned_internal_code: string;
    scanned_start_at: number | null;
    matched_train_code: string;
    matched_start_at: number | null;
    train_repeat: string;
    detail_json: string;
    created_at: number;
}

interface RequestHourlyStatRow {
    bucket_start: number;
    service_date: string;
    request_type: string;
    is_success: number;
    request_count: number;
    updated_at: number;
}

interface StationBoardDispatchResultRow {
    task_run_id: number;
    service_date: string;
    candidate_group_count: number;
    selected_station_count: number;
    selected_stations_json: string;
    created_task_count: number;
    reused_task_count: number;
    skipped_not_found_count: number;
    skipped_ambiguous_count: number;
    detail_json: string;
    created_at: number;
}

interface StationBoardFetchResultRow {
    task_run_id: number;
    service_date: string;
    parent_scheduler_task_id: number | null;
    station_name: string;
    station_telecode: string;
    result_status: string;
    row_count: number;
    parsed_entry_count: number;
    saved_entry_count: number;
    consumed_queue_entry_count: number;
    rows_json: string;
    created_at: number;
}

interface StationPlatformRefreshResultRow {
    id: number;
    task_run_id: number;
    service_date: string;
    start_at: number | null;
    primary_train_code: string;
    train_codes_json: string;
    trigger: StationPlatformRefreshTrigger;
    status: StationPlatformRefreshStatus;
    candidate_count: number;
    updated_count: number;
    cache_hit_count: number;
    cache_fallback_count: number;
    no_data_count: number;
    failed_count: number;
    error_message: string;
    created_at: number;
}

interface StationPlatformRefreshEntryRow {
    id: number;
    refresh_result_id: number;
    station_order: number;
    lookup_type: string;
    station_name: string;
    station_telecode: string;
    station_no: number;
    train_date: string;
    station_train_codes_json: string;
    attempted_train_codes_json: string;
    status: StationPlatformRefreshEntryStatus;
    platform_no: number | null;
    wicket: string | null;
    fetched_at: number | null;
    error_message: string;
}

export interface TrainProvenanceTaskRunRecord {
    id: number;
    schedulerTaskId: number;
    executor: string;
    executionTime: number;
    startedAt: number;
    finishedAt: number | null;
    status: TrainProvenanceTaskRunStatus;
    errorMessage: string;
    taskArgs: unknown;
    serviceDate: string;
    primaryTrainCode: string;
    primaryStartAt: number | null;
    primaryEmuCode: string;
}

export interface TrainProvenanceEventRecord {
    id: number;
    taskRunId: number;
    schedulerTaskId: number;
    executor: string;
    taskStatus: TrainProvenanceTaskRunStatus;
    createdAt: number;
    serviceDate: string;
    trainCode: string;
    startAt: number | null;
    emuCode: string;
    relatedTrainCode: string;
    relatedEmuCode: string;
    eventType: string;
    result: string;
    linkedSchedulerTaskId: number | null;
    linkedTaskRunId: number | null;
    payload: unknown;
}

export interface CouplingScanCandidateRecord {
    id: number;
    taskRunId: number;
    candidateOrder: number;
    serviceDate: string;
    bureau: string;
    model: string;
    candidateEmuCode: string;
    status: string;
    reason: string;
    scannedTrainCode: string;
    scannedInternalCode: string;
    scannedStartAt: number | null;
    matchedTrainCode: string;
    matchedStartAt: number | null;
    trainRepeat: string;
    detail: unknown;
    createdAt: number;
}

export interface TrainProvenanceRequestHourlyStatRecord {
    bucketStart: number;
    serviceDate: string;
    requestType: string;
    isSuccess: boolean;
    requestCount: number;
    updatedAt: number;
}

export interface StationBoardDispatchResultRecord {
    taskRunId: number;
    serviceDate: string;
    candidateGroupCount: number;
    selectedStationCount: number;
    selectedStations: unknown;
    createdTaskCount: number;
    reusedTaskCount: number;
    skippedNotFoundCount: number;
    skippedAmbiguousCount: number;
    detail: unknown;
    createdAt: number;
}

export interface StationBoardFetchResultRecord {
    taskRunId: number;
    serviceDate: string;
    parentSchedulerTaskId: number | null;
    stationName: string;
    stationTelecode: string;
    resultStatus: string;
    rowCount: number;
    parsedEntryCount: number;
    savedEntryCount: number;
    consumedQueueEntryCount: number;
    rows: unknown;
    createdAt: number;
}

export interface StationPlatformRefreshEntryRecord {
    id: number;
    refreshResultId: number;
    stationOrder: number;
    lookupType: string;
    stationName: string;
    stationTelecode: string;
    stationNo: number;
    trainDate: string;
    stationTrainCodes: string[];
    attemptedTrainCodes: string[];
    status: StationPlatformRefreshEntryStatus;
    platformNo: number | null;
    wicket: string | null;
    fetchedAt: number | null;
    errorMessage: string;
}

export interface StationPlatformRefreshResultRecord {
    id: number;
    taskRunId: number;
    serviceDate: string;
    startAt: number | null;
    primaryTrainCode: string;
    trainCodes: string[];
    trigger: StationPlatformRefreshTrigger;
    status: StationPlatformRefreshStatus;
    candidateCount: number;
    updatedCount: number;
    cacheHitCount: number;
    cacheFallbackCount: number;
    noDataCount: number;
    failedCount: number;
    errorMessage: string;
    createdAt: number;
    entries: StationPlatformRefreshEntryRecord[];
}

export interface StartTrainProvenanceTaskRunInput {
    schedulerTaskId: number;
    executor: string;
    executionTime: number;
    startedAt: number;
    taskArgs: unknown;
    serviceDate?: string;
    primaryTrainCode?: string;
    primaryStartAt?: number | null;
    primaryEmuCode?: string;
}

export interface RecordTrainProvenanceEventInput {
    taskRunId: number;
    sequenceNo: number;
    createdAt?: number;
    serviceDate?: string;
    trainCode?: string;
    startAt?: number | null;
    emuCode?: string;
    relatedTrainCode?: string;
    relatedEmuCode?: string;
    eventType: string;
    result?: string;
    linkedSchedulerTaskId?: number | null;
    payload?: unknown;
}

export interface RecordCouplingScanCandidateInput {
    taskRunId: number;
    candidateOrder: number;
    serviceDate?: string;
    bureau?: string;
    model?: string;
    candidateEmuCode: string;
    status: string;
    reason?: string;
    scannedTrainCode?: string;
    scannedInternalCode?: string;
    scannedStartAt?: number | null;
    matchedTrainCode?: string;
    matchedStartAt?: number | null;
    trainRepeat?: string;
    detail?: unknown;
    createdAt?: number;
}

export interface Record12306RequestHourlyStatInput {
    requestType: TrainProvenanceRequestStatType;
    isSuccess: boolean;
    timestamp?: number;
}

export interface RecordStationBoardDispatchResultInput {
    taskRunId: number;
    serviceDate: string;
    candidateGroupCount: number;
    selectedStations: unknown;
    createdTaskCount: number;
    reusedTaskCount: number;
    skippedNotFoundCount: number;
    skippedAmbiguousCount: number;
    detail: unknown;
    createdAt?: number;
}

export interface RecordStationBoardFetchResultInput {
    taskRunId: number;
    serviceDate: string;
    parentSchedulerTaskId?: number | null;
    stationName: string;
    stationTelecode: string;
    resultStatus: string;
    rowCount: number;
    parsedEntryCount: number;
    savedEntryCount: number;
    consumedQueueEntryCount: number;
    rows: unknown;
    createdAt?: number;
}

export interface RecordStationPlatformRefreshEntryInput {
    stationOrder: number;
    lookupType: string;
    stationName: string;
    stationTelecode: string;
    stationNo: number;
    trainDate: string;
    stationTrainCodes: string[];
    attemptedTrainCodes: string[];
    status: StationPlatformRefreshEntryStatus;
    platformNo?: number | null;
    wicket?: string | null;
    fetchedAt?: number | null;
    errorMessage?: string;
}

export interface RecordStationPlatformRefreshResultInput {
    taskRunId: number;
    serviceDate: string;
    startAt?: number | null;
    primaryTrainCode: string;
    trainCodes: string[];
    trigger: StationPlatformRefreshTrigger;
    status: StationPlatformRefreshStatus;
    entries: RecordStationPlatformRefreshEntryInput[];
    errorMessage?: string;
    createdAt?: number;
}

const CLEANUP_INTERVAL_SECONDS = 60 * 60;
const REQUEST_STAT_BUCKET_SECONDS = 60 * 60;

const trainProvenanceSql = importSqlBatch('train-provenance/queries') as Record<
    TrainProvenanceSqlKey,
    string
>;
const trainProvenanceStatements = createPreparedSqlStore<TrainProvenanceSqlKey>(
    {
        dbName: 'trainProvenance',
        scope: 'train-provenance/queries',
        sql: trainProvenanceSql
    }
);

let lastCleanupAt = 0;

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function parseNormalizedCodes(text: string): string[] {
    const value = parseJson(text);
    return Array.isArray(value)
        ? uniqueNormalizedCodes(
              value.filter((item): item is string => typeof item === 'string')
          )
        : [];
}

function stringifyJson(value: unknown): string {
    try {
        return JSON.stringify(value ?? null);
    } catch {
        return JSON.stringify({
            error: 'unserializable_payload'
        });
    }
}

function normalizeOptionalInteger(value: unknown): number | null {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0
        ? value
        : null;
}

function normalizeServiceDate(
    serviceDate: string | undefined,
    startAt?: number | null
): string {
    if (typeof serviceDate === 'string' && /^\d{8}$/.test(serviceDate)) {
        return serviceDate;
    }

    if (
        typeof startAt === 'number' &&
        Number.isInteger(startAt) &&
        startAt > 0
    ) {
        return formatShanghaiDateString(startAt * 1000);
    }

    return getCurrentDateString();
}

function toTaskRunRecord(
    row: TrainProvenanceTaskRunRow
): TrainProvenanceTaskRunRecord {
    return {
        id: row.id,
        schedulerTaskId: row.scheduler_task_id,
        executor: row.executor,
        executionTime: row.execution_time,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        status: row.status,
        errorMessage: row.error_message,
        taskArgs: parseJson(row.task_args_json),
        serviceDate: row.service_date,
        primaryTrainCode: row.primary_train_code,
        primaryStartAt: row.primary_start_at,
        primaryEmuCode: row.primary_emu_code
    };
}

function toEventRecord(
    row: TrainProvenanceEventRow
): TrainProvenanceEventRecord {
    return {
        id: row.id,
        taskRunId: row.task_run_id,
        schedulerTaskId: row.scheduler_task_id,
        executor: row.executor,
        taskStatus: row.task_status,
        createdAt: row.created_at,
        serviceDate: row.service_date,
        trainCode: row.train_code,
        startAt: row.start_at,
        emuCode: row.emu_code,
        relatedTrainCode: row.related_train_code,
        relatedEmuCode: row.related_emu_code,
        eventType: row.event_type,
        result: row.result,
        linkedSchedulerTaskId: row.linked_scheduler_task_id,
        linkedTaskRunId: row.linked_task_run_id,
        payload: parseJson(row.payload_json)
    };
}

function toCouplingScanCandidateRecord(
    row: CouplingScanCandidateRow
): CouplingScanCandidateRecord {
    return {
        id: row.id,
        taskRunId: row.task_run_id,
        candidateOrder: row.candidate_order,
        serviceDate: row.service_date,
        bureau: row.bureau,
        model: row.model,
        candidateEmuCode: row.candidate_emu_code,
        status: row.status,
        reason: row.reason,
        scannedTrainCode: row.scanned_train_code,
        scannedInternalCode: row.scanned_internal_code,
        scannedStartAt: row.scanned_start_at,
        matchedTrainCode: row.matched_train_code,
        matchedStartAt: row.matched_start_at,
        trainRepeat: row.train_repeat,
        detail: parseJson(row.detail_json),
        createdAt: row.created_at
    };
}

function toRequestHourlyStatRecord(
    row: RequestHourlyStatRow
): TrainProvenanceRequestHourlyStatRecord {
    return {
        bucketStart: row.bucket_start,
        serviceDate: row.service_date,
        requestType: row.request_type,
        isSuccess: row.is_success === 1,
        requestCount: row.request_count,
        updatedAt: row.updated_at
    };
}

function toHourlyBucketStart(timestamp: number): number {
    return timestamp - (timestamp % REQUEST_STAT_BUCKET_SECONDS);
}

function toStationBoardDispatchResultRecord(
    row: StationBoardDispatchResultRow
): StationBoardDispatchResultRecord {
    return {
        taskRunId: row.task_run_id,
        serviceDate: row.service_date,
        candidateGroupCount: row.candidate_group_count,
        selectedStationCount: row.selected_station_count,
        selectedStations: parseJson(row.selected_stations_json),
        createdTaskCount: row.created_task_count,
        reusedTaskCount: row.reused_task_count,
        skippedNotFoundCount: row.skipped_not_found_count,
        skippedAmbiguousCount: row.skipped_ambiguous_count,
        detail: parseJson(row.detail_json),
        createdAt: row.created_at
    };
}

function toStationBoardFetchResultRecord(
    row: StationBoardFetchResultRow
): StationBoardFetchResultRecord {
    return {
        taskRunId: row.task_run_id,
        serviceDate: row.service_date,
        parentSchedulerTaskId: row.parent_scheduler_task_id,
        stationName: row.station_name,
        stationTelecode: row.station_telecode,
        resultStatus: row.result_status,
        rowCount: row.row_count,
        parsedEntryCount: row.parsed_entry_count,
        savedEntryCount: row.saved_entry_count,
        consumedQueueEntryCount: row.consumed_queue_entry_count,
        rows: parseJson(row.rows_json),
        createdAt: row.created_at
    };
}

function toStationPlatformRefreshEntryRecord(
    row: StationPlatformRefreshEntryRow
): StationPlatformRefreshEntryRecord {
    return {
        id: row.id,
        refreshResultId: row.refresh_result_id,
        stationOrder: row.station_order,
        lookupType: row.lookup_type,
        stationName: row.station_name,
        stationTelecode: row.station_telecode,
        stationNo: row.station_no,
        trainDate: row.train_date,
        stationTrainCodes: parseNormalizedCodes(row.station_train_codes_json),
        attemptedTrainCodes: parseNormalizedCodes(
            row.attempted_train_codes_json
        ),
        status: row.status,
        platformNo: row.platform_no,
        wicket: row.wicket,
        fetchedAt: row.fetched_at,
        errorMessage: row.error_message
    };
}

function toStationPlatformRefreshResultRecord(
    row: StationPlatformRefreshResultRow,
    entries: StationPlatformRefreshEntryRecord[]
): StationPlatformRefreshResultRecord {
    return {
        id: row.id,
        taskRunId: row.task_run_id,
        serviceDate: row.service_date,
        startAt: row.start_at,
        primaryTrainCode: row.primary_train_code,
        trainCodes: parseNormalizedCodes(row.train_codes_json),
        trigger: row.trigger,
        status: row.status,
        candidateCount: row.candidate_count,
        updatedCount: row.updated_count,
        cacheHitCount: row.cache_hit_count,
        cacheFallbackCount: row.cache_fallback_count,
        noDataCount: row.no_data_count,
        failedCount: row.failed_count,
        errorMessage: row.error_message,
        createdAt: row.created_at,
        entries
    };
}

export function getTrainProvenanceRuntimeConfig() {
    return useConfig().data.runtime.trainProvenance;
}

export function isTrainProvenanceEnabled() {
    return getTrainProvenanceRuntimeConfig().enabled;
}

export function cleanupExpiredTrainProvenance(
    nowSeconds = getNowSeconds()
): number {
    const retentionDays = getTrainProvenanceRuntimeConfig().retentionDays;
    const cutoffSeconds = nowSeconds - retentionDays * 24 * 60 * 60;
    const taskRunResult = trainProvenanceStatements.run(
        'cleanupExpiredTaskRuns',
        cutoffSeconds
    );
    const requestStatResult = trainProvenanceStatements.run(
        'cleanupExpiredRequestHourlyStats',
        cutoffSeconds
    );
    lastCleanupAt = nowSeconds;
    return taskRunResult.changes + requestStatResult.changes;
}

export function maybeCleanupExpiredTrainProvenance(
    nowSeconds = getNowSeconds()
) {
    if (nowSeconds - lastCleanupAt < CLEANUP_INTERVAL_SECONDS) {
        return 0;
    }

    return cleanupExpiredTrainProvenance(nowSeconds);
}

export function startTrainProvenanceTaskRun(
    input: StartTrainProvenanceTaskRunInput
): TrainProvenanceTaskRunRecord {
    maybeCleanupExpiredTrainProvenance(input.startedAt);

    const serviceDate = normalizeServiceDate(
        input.serviceDate,
        input.primaryStartAt ?? null
    );
    trainProvenanceStatements.run(
        'upsertTaskRunStart',
        input.schedulerTaskId,
        input.executor.trim(),
        input.executionTime,
        input.startedAt,
        stringifyJson(input.taskArgs),
        serviceDate,
        normalizeCode(input.primaryTrainCode ?? ''),
        normalizeOptionalInteger(input.primaryStartAt),
        normalizeCode(input.primaryEmuCode ?? '')
    );

    const row = trainProvenanceStatements.get<TrainProvenanceTaskRunRow>(
        'selectTaskRunBySchedulerTaskId',
        input.schedulerTaskId
    );
    if (!row) {
        throw new Error(
            `train_provenance_task_run_not_found schedulerTaskId=${input.schedulerTaskId}`
        );
    }

    return toTaskRunRecord(row);
}

export function finishTrainProvenanceTaskRun(
    taskRunId: number,
    status: Exclude<TrainProvenanceTaskRunStatus, 'running'>,
    errorMessage = '',
    finishedAt = getNowSeconds()
) {
    maybeCleanupExpiredTrainProvenance(finishedAt);
    trainProvenanceStatements.run(
        'updateTaskRunFinished',
        finishedAt,
        status,
        errorMessage,
        taskRunId
    );
}

export function recordTrainProvenanceEvent(
    input: RecordTrainProvenanceEventInput
) {
    const createdAt = input.createdAt ?? getNowSeconds();
    maybeCleanupExpiredTrainProvenance(createdAt);

    trainProvenanceStatements.run(
        'insertProvenanceEvent',
        input.taskRunId,
        input.sequenceNo,
        createdAt,
        normalizeServiceDate(input.serviceDate, input.startAt ?? null),
        normalizeCode(input.trainCode ?? ''),
        normalizeOptionalInteger(input.startAt),
        normalizeCode(input.emuCode ?? ''),
        normalizeCode(input.relatedTrainCode ?? ''),
        normalizeCode(input.relatedEmuCode ?? ''),
        input.eventType.trim(),
        input.result?.trim() ?? '',
        normalizeOptionalInteger(input.linkedSchedulerTaskId),
        stringifyJson(input.payload)
    );
}

export function recordCouplingScanCandidate(
    input: RecordCouplingScanCandidateInput
) {
    const createdAt = input.createdAt ?? getNowSeconds();
    maybeCleanupExpiredTrainProvenance(createdAt);

    trainProvenanceStatements.run(
        'insertCouplingScanCandidate',
        input.taskRunId,
        input.candidateOrder,
        normalizeServiceDate(input.serviceDate, input.scannedStartAt ?? null),
        (input.bureau ?? '').trim(),
        normalizeCode(input.model ?? ''),
        normalizeCode(input.candidateEmuCode),
        input.status.trim(),
        input.reason?.trim() ?? '',
        normalizeCode(input.scannedTrainCode ?? ''),
        normalizeCode(input.scannedInternalCode ?? ''),
        normalizeOptionalInteger(input.scannedStartAt),
        normalizeCode(input.matchedTrainCode ?? ''),
        normalizeOptionalInteger(input.matchedStartAt),
        input.trainRepeat?.trim() ?? '',
        stringifyJson(input.detail),
        createdAt
    );
}

export function record12306RequestHourlyStat(
    input: Record12306RequestHourlyStatInput
) {
    const timestamp = input.timestamp ?? getNowSeconds();
    const bucketStart = toHourlyBucketStart(timestamp);
    maybeCleanupExpiredTrainProvenance(timestamp);

    trainProvenanceStatements.run(
        'incrementRequestHourlyStat',
        bucketStart,
        formatShanghaiDateString(bucketStart * 1000),
        input.requestType,
        input.isSuccess ? 1 : 0,
        timestamp
    );
}

export function recordStationBoardDispatchResult(
    input: RecordStationBoardDispatchResultInput
) {
    const createdAt = input.createdAt ?? getNowSeconds();
    maybeCleanupExpiredTrainProvenance(createdAt);

    trainProvenanceStatements.run(
        'insertStationBoardDispatchResult',
        input.taskRunId,
        normalizeServiceDate(input.serviceDate),
        input.candidateGroupCount,
        Array.isArray(input.selectedStations)
            ? input.selectedStations.length
            : 0,
        stringifyJson(input.selectedStations),
        input.createdTaskCount,
        input.reusedTaskCount,
        input.skippedNotFoundCount,
        input.skippedAmbiguousCount,
        stringifyJson(input.detail),
        createdAt
    );
}

export function recordStationBoardFetchResult(
    input: RecordStationBoardFetchResultInput
) {
    const createdAt = input.createdAt ?? getNowSeconds();
    maybeCleanupExpiredTrainProvenance(createdAt);

    trainProvenanceStatements.run(
        'insertStationBoardFetchResult',
        input.taskRunId,
        normalizeServiceDate(input.serviceDate),
        normalizeOptionalInteger(input.parentSchedulerTaskId),
        input.stationName.trim(),
        normalizeCode(input.stationTelecode),
        input.resultStatus.trim(),
        input.rowCount,
        input.parsedEntryCount,
        input.savedEntryCount,
        input.consumedQueueEntryCount,
        stringifyJson(input.rows),
        createdAt
    );
}

export function recordStationPlatformRefreshResult(
    input: RecordStationPlatformRefreshResultInput
): number {
    const createdAt = input.createdAt ?? getNowSeconds();
    const trainCodes = uniqueNormalizedCodes([
        input.primaryTrainCode,
        ...input.trainCodes
    ]);
    const primaryTrainCode =
        normalizeCode(input.primaryTrainCode) || trainCodes[0] || '';
    const updatedCount = input.entries.filter(
        (entry) => entry.status === 'updated'
    ).length;
    const cacheHitCount = input.entries.filter(
        (entry) => entry.status === 'cache_hit'
    ).length;
    const cacheFallbackCount = input.entries.filter(
        (entry) => entry.status === 'cache_fallback'
    ).length;
    const noDataCount = input.entries.filter(
        (entry) => entry.status === 'no_data'
    ).length;
    const failedCount = input.entries.filter(
        (entry) =>
            entry.status === 'request_failed' ||
            entry.status === 'persist_failed'
    ).length;

    maybeCleanupExpiredTrainProvenance(createdAt);
    const transaction = useTrainProvenanceDatabase().transaction(() => {
        const result = trainProvenanceStatements.run(
            'insertStationPlatformRefreshResult',
            input.taskRunId,
            normalizeServiceDate(input.serviceDate, input.startAt ?? null),
            normalizeOptionalInteger(input.startAt),
            primaryTrainCode,
            stringifyJson(trainCodes),
            input.trigger,
            input.status,
            input.entries.length,
            updatedCount,
            cacheHitCount,
            cacheFallbackCount,
            noDataCount,
            failedCount,
            input.errorMessage?.trim() ?? '',
            createdAt
        );
        const refreshResultId = Number(result.lastInsertRowid);

        for (const entry of input.entries) {
            trainProvenanceStatements.run(
                'insertStationPlatformRefreshEntry',
                refreshResultId,
                Number.isInteger(entry.stationOrder)
                    ? Math.max(0, entry.stationOrder)
                    : 0,
                entry.lookupType.trim(),
                entry.stationName.trim(),
                normalizeCode(entry.stationTelecode),
                Number.isInteger(entry.stationNo)
                    ? Math.max(0, entry.stationNo)
                    : 0,
                entry.trainDate.trim(),
                stringifyJson(uniqueNormalizedCodes(entry.stationTrainCodes)),
                stringifyJson(uniqueNormalizedCodes(entry.attemptedTrainCodes)),
                entry.status,
                normalizeOptionalInteger(entry.platformNo),
                entry.wicket?.trim() || null,
                normalizeOptionalInteger(entry.fetchedAt),
                entry.errorMessage?.trim() ?? ''
            );
        }

        return refreshResultId;
    });

    return transaction();
}

export function getTrainProvenanceTaskRunById(taskRunId: number) {
    maybeCleanupExpiredTrainProvenance();
    if (!Number.isInteger(taskRunId) || taskRunId <= 0) {
        return null;
    }

    const row = trainProvenanceStatements.get<TrainProvenanceTaskRunRow>(
        'selectTaskRunById',
        taskRunId
    );
    return row ? toTaskRunRecord(row) : null;
}

export function listTrainProvenanceTaskRunsByDateAndExecutor(
    date: string,
    executor: string
) {
    maybeCleanupExpiredTrainProvenance();
    const normalizedExecutor = executor.trim();
    if (!/^\d{8}$/.test(date) || normalizedExecutor.length === 0) {
        return [];
    }

    return trainProvenanceStatements
        .all<TrainProvenanceTaskRunRow>(
            'selectTaskRunsByDateAndExecutor',
            date,
            normalizedExecutor
        )
        .map(toTaskRunRecord);
}

export function getStationBoardDispatchResultByTaskRunId(taskRunId: number) {
    maybeCleanupExpiredTrainProvenance();
    if (!Number.isInteger(taskRunId) || taskRunId <= 0) {
        return null;
    }

    const row = trainProvenanceStatements.get<StationBoardDispatchResultRow>(
        'selectStationBoardDispatchResultByTaskRunId',
        taskRunId
    );
    return row ? toStationBoardDispatchResultRecord(row) : null;
}

export function listStationBoardDispatchResultsByDate(date: string) {
    maybeCleanupExpiredTrainProvenance();
    if (!/^\d{8}$/.test(date)) {
        return [];
    }

    return trainProvenanceStatements
        .all<StationBoardDispatchResultRow>(
            'selectStationBoardDispatchResultsByDate',
            date
        )
        .map(toStationBoardDispatchResultRecord);
}

export function listStationBoardFetchResultsByParentSchedulerTaskId(
    date: string,
    parentSchedulerTaskId: number
) {
    maybeCleanupExpiredTrainProvenance();
    if (!/^\d{8}$/.test(date)) {
        return [];
    }
    if (
        !Number.isInteger(parentSchedulerTaskId) ||
        parentSchedulerTaskId <= 0
    ) {
        return [];
    }

    return trainProvenanceStatements
        .all<StationBoardFetchResultRow>(
            'selectStationBoardFetchResultsByParentSchedulerTaskId',
            date,
            parentSchedulerTaskId
        )
        .map(toStationBoardFetchResultRecord);
}

export function getStationBoardFetchResultByTaskRunId(taskRunId: number) {
    maybeCleanupExpiredTrainProvenance();
    if (!Number.isInteger(taskRunId) || taskRunId <= 0) {
        return null;
    }

    const row = trainProvenanceStatements.get<StationBoardFetchResultRow>(
        'selectStationBoardFetchResultByTaskRunId',
        taskRunId
    );
    return row ? toStationBoardFetchResultRecord(row) : null;
}

export function getStationPlatformRefreshResultById(resultId: number) {
    maybeCleanupExpiredTrainProvenance();
    if (!Number.isInteger(resultId) || resultId <= 0) {
        return null;
    }

    const row = trainProvenanceStatements.get<StationPlatformRefreshResultRow>(
        'selectStationPlatformRefreshResultById',
        resultId
    );
    if (!row) {
        return null;
    }

    const entries = trainProvenanceStatements
        .all<StationPlatformRefreshEntryRow>(
            'selectStationPlatformRefreshEntriesByResultId',
            resultId
        )
        .map(toStationPlatformRefreshEntryRecord);
    return toStationPlatformRefreshResultRecord(row, entries);
}

export function listTrainProvenanceDepartureStartAts(
    date: string,
    trainCode: string
): number[] {
    maybeCleanupExpiredTrainProvenance();
    const normalizedTrainCode = normalizeCode(trainCode);
    if (!/^\d{8}$/.test(date) || normalizedTrainCode.length === 0) {
        return [];
    }

    return trainProvenanceStatements
        .all<{ start_at: number }>(
            'selectDepartureStartAtsByDateAndTrainCode',
            date,
            normalizedTrainCode
        )
        .map((row) => row.start_at)
        .filter((value) => Number.isInteger(value));
}

export function listTrainProvenanceEventsByDateAndTrainCode(
    date: string,
    trainCode: string,
    startAt: number | null
) {
    maybeCleanupExpiredTrainProvenance();
    const normalizedTrainCode = normalizeCode(trainCode);
    if (!/^\d{8}$/.test(date) || normalizedTrainCode.length === 0) {
        return [];
    }

    return trainProvenanceStatements
        .all<TrainProvenanceEventRow>(
            'selectEventsByDateAndTrainCode',
            date,
            normalizedTrainCode,
            normalizeOptionalInteger(startAt),
            normalizeOptionalInteger(startAt)
        )
        .map(toEventRecord);
}

export function listCouplingScanCandidatesByTaskRunId(taskRunId: number) {
    maybeCleanupExpiredTrainProvenance();
    if (!Number.isInteger(taskRunId) || taskRunId <= 0) {
        return [];
    }

    return trainProvenanceStatements
        .all<CouplingScanCandidateRow>(
            'selectCouplingScanCandidatesByTaskRunId',
            taskRunId
        )
        .map(toCouplingScanCandidateRecord);
}

export function listTrainProvenanceEventsByTaskRunId(taskRunId: number) {
    maybeCleanupExpiredTrainProvenance();
    if (!Number.isInteger(taskRunId) || taskRunId <= 0) {
        return [];
    }

    return trainProvenanceStatements
        .all<TrainProvenanceEventRow>('selectEventsByTaskRunId', taskRunId)
        .map(toEventRecord);
}

export function list12306RequestHourlyStatsInRange(
    startAt: number,
    endAt: number
) {
    maybeCleanupExpiredTrainProvenance();
    if (
        !Number.isInteger(startAt) ||
        !Number.isInteger(endAt) ||
        startAt < 0 ||
        endAt <= startAt
    ) {
        return [];
    }

    return trainProvenanceStatements
        .all<RequestHourlyStatRow>(
            'selectRequestHourlyStatsInRange',
            startAt,
            endAt
        )
        .map(toRequestHourlyStatRecord);
}
