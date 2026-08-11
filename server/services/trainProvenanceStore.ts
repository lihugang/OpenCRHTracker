import { useTrainProvenanceDatabase } from '~/server/libs/database/trainProvenance';
import { asEmuId, type EmuId } from '~/server/libs/database/emu';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import useConfig from '~/server/config';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';
import {
    trainCodeKey,
    type TrainCodeParts
} from '~/server/utils/12306/trainCode';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import {
    parseInternalJson,
    parseInternalJsonField,
    stringifyInternalJson,
    stringifyInternalJsonField
} from '~/server/utils/internal/storageValues';
import {
    asServiceDay,
    unixSecondsToServiceDay,
    type ServiceDay
} from '~/server/utils/date/serviceDay';

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
    service_date: number;
    primary_train_prefix: string;
    primary_train_number: number;
    primary_start_at: number | null;
    primary_emu_id: number | null;
}

interface TrainProvenanceEventRow {
    id: number;
    task_run_id: number;
    scheduler_task_id: number;
    executor: string;
    task_status: TrainProvenanceTaskRunStatus;
    created_at: number;
    service_date: number;
    train_prefix: string;
    train_number: number;
    start_at: number | null;
    emu_id: number | null;
    related_train_prefix: string;
    related_train_number: number;
    related_emu_id: number | null;
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
    service_date: number;
    bureau: string;
    model: string;
    candidate_emu_id: number;
    status: string;
    reason: string;
    scanned_train_prefix: string;
    scanned_train_number: number;
    scanned_internal_code: string;
    scanned_start_at: number | null;
    matched_train_prefix: string;
    matched_train_number: number;
    matched_start_at: number | null;
    train_repeat: string;
    detail_json: string;
    created_at: number;
}

interface RequestHourlyStatRow {
    bucket_start: number;
    service_date: number;
    request_type: string;
    is_success: number;
    request_count: number;
    updated_at: number;
}

interface StationBoardDispatchResultRow {
    task_run_id: number;
    service_date: number;
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
    service_date: number;
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
    service_date: number;
    start_at: number | null;
    primary_train_prefix: string;
    primary_train_number: number;
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
    train_date: number;
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
    serviceDate: ServiceDay;
    primaryTrainCode: TrainCodeParts | null;
    primaryStartAt: number | null;
    primaryEmuId: EmuId | null;
}

export interface TrainProvenanceEventRecord {
    id: number;
    taskRunId: number;
    schedulerTaskId: number;
    executor: string;
    taskStatus: TrainProvenanceTaskRunStatus;
    createdAt: number;
    serviceDate: ServiceDay;
    trainCode: TrainCodeParts | null;
    startAt: number | null;
    emuId: EmuId | null;
    relatedTrainCode: TrainCodeParts | null;
    relatedEmuId: EmuId | null;
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
    serviceDate: ServiceDay;
    bureau: string;
    model: string;
    candidateEmuId: EmuId;
    status: string;
    reason: string;
    scannedTrainCode: TrainCodeParts | null;
    scannedInternalCode: string;
    scannedStartAt: number | null;
    matchedTrainCode: TrainCodeParts | null;
    matchedStartAt: number | null;
    trainRepeat: string;
    detail: unknown;
    createdAt: number;
}

export interface TrainProvenanceRequestHourlyStatRecord {
    bucketStart: number;
    serviceDate: ServiceDay;
    requestType: string;
    isSuccess: boolean;
    requestCount: number;
    updatedAt: number;
}

export interface StationBoardDispatchResultRecord {
    taskRunId: number;
    serviceDate: ServiceDay;
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
    serviceDate: ServiceDay;
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
    trainDate: ServiceDay;
    stationTrainCodes: TrainCodeParts[];
    attemptedTrainCodes: TrainCodeParts[];
    status: StationPlatformRefreshEntryStatus;
    platformNo: number | null;
    wicket: string | null;
    fetchedAt: number | null;
    errorMessage: string;
}

export interface StationPlatformRefreshResultRecord {
    id: number;
    taskRunId: number;
    serviceDate: ServiceDay;
    startAt: number | null;
    primaryTrainCode: TrainCodeParts | null;
    trainCodes: TrainCodeParts[];
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
    serviceDate: ServiceDay;
    primaryTrainCode: TrainCodeParts | null;
    primaryStartAt?: number | null;
    primaryEmuId?: EmuId | null;
}

export interface RecordTrainProvenanceEventInput {
    taskRunId: number;
    sequenceNo: number;
    createdAt?: number;
    serviceDate: ServiceDay;
    trainCode?: TrainCodeParts | null;
    startAt?: number | null;
    emuId?: EmuId | null;
    relatedTrainCode?: TrainCodeParts | null;
    relatedEmuId?: EmuId | null;
    eventType: string;
    result?: string;
    linkedSchedulerTaskId?: number | null;
    payload?: unknown;
}

export interface RecordCouplingScanCandidateInput {
    taskRunId: number;
    candidateOrder: number;
    serviceDate: ServiceDay;
    bureau?: string;
    model?: string;
    candidateEmuId: EmuId;
    status: string;
    reason?: string;
    scannedTrainCode?: TrainCodeParts | null;
    scannedInternalCode?: string;
    scannedStartAt?: number | null;
    matchedTrainCode?: TrainCodeParts | null;
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
    serviceDate: ServiceDay;
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
    serviceDate: ServiceDay;
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
    trainDate: ServiceDay;
    stationTrainCodes: TrainCodeParts[];
    attemptedTrainCodes: TrainCodeParts[];
    status: StationPlatformRefreshEntryStatus;
    platformNo?: number | null;
    wicket?: string | null;
    fetchedAt?: number | null;
    errorMessage?: string;
}

export interface RecordStationPlatformRefreshResultInput {
    taskRunId: number;
    serviceDate: ServiceDay;
    startAt?: number | null;
    primaryTrainCode: TrainCodeParts;
    trainCodes: TrainCodeParts[];
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
    return parseInternalJson(text);
}

function stringifyJson(value: unknown): string {
    return stringifyInternalJson(value ?? null);
}

function stringifyTrainCodes(
    value: readonly TrainCodeParts[]
): string {
    return stringifyInternalJsonField(value, 'trainCodes');
}

function uniqueTrainCodeValues(
    values: readonly TrainCodeParts[]
): TrainCodeParts[] {
    const seen = new Set<string>();
    const result: TrainCodeParts[] = [];
    for (const value of values) {
        const key = trainCodeKey(value);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(value);
    }
    return result;
}

function parseTrainCodes(text: string): TrainCodeParts[] {
    const value = parseInternalJsonField(text, 'trainCodes');
    return Array.isArray(value)
        ? value.map((item) => {
              if (
                  typeof item !== 'object' ||
                  item === null ||
                  typeof (item as { prefix?: unknown }).prefix !== 'string' ||
                  typeof (item as { number?: unknown }).number !== 'number'
              ) {
                  throw new Error('invalid_internal_train_code');
              }
              return item as TrainCodeParts;
          })
        : [];
}

function toTrainCodeOrNull(
    prefix: string,
    number: number
): TrainCodeParts | null {
    if (prefix.length === 0 && number === 0) {
        return null;
    }
    return { prefix, number };
}

function normalizeOptionalInteger(
    value: number | null | undefined
): number | null {
    if (value === null || value === undefined) {
        return null;
    }
    if (!Number.isInteger(value) || value < 0) {
        throw new Error(`invalid_integer ${value}`);
    }
    return value;
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
        serviceDate: asServiceDay(row.service_date),
        primaryTrainCode: toTrainCodeOrNull(
            row.primary_train_prefix,
            row.primary_train_number
        ),
        primaryStartAt: row.primary_start_at,
        primaryEmuId:
            row.primary_emu_id === null
                ? null
                : asEmuId(row.primary_emu_id)
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
        serviceDate: asServiceDay(row.service_date),
        trainCode: toTrainCodeOrNull(row.train_prefix, row.train_number),
        startAt: row.start_at,
        emuId: row.emu_id === null ? null : asEmuId(row.emu_id),
        relatedTrainCode: toTrainCodeOrNull(
            row.related_train_prefix,
            row.related_train_number
        ),
        relatedEmuId:
            row.related_emu_id === null ? null : asEmuId(row.related_emu_id),
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
        serviceDate: asServiceDay(row.service_date),
        bureau: row.bureau,
        model: row.model,
        candidateEmuId: asEmuId(row.candidate_emu_id),
        status: row.status,
        reason: row.reason,
        scannedTrainCode: toTrainCodeOrNull(
            row.scanned_train_prefix,
            row.scanned_train_number
        ),
        scannedInternalCode: row.scanned_internal_code,
        scannedStartAt: row.scanned_start_at,
        matchedTrainCode: toTrainCodeOrNull(
            row.matched_train_prefix,
            row.matched_train_number
        ),
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
        serviceDate: asServiceDay(row.service_date),
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
        serviceDate: asServiceDay(row.service_date),
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
        serviceDate: asServiceDay(row.service_date),
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
        trainDate: asServiceDay(row.train_date),
        stationTrainCodes: parseTrainCodes(row.station_train_codes_json),
        attemptedTrainCodes: parseTrainCodes(row.attempted_train_codes_json),
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
        serviceDate: asServiceDay(row.service_date),
        startAt: row.start_at,
        primaryTrainCode: toTrainCodeOrNull(
            row.primary_train_prefix,
            row.primary_train_number
        ),
        trainCodes: parseTrainCodes(row.train_codes_json),
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

    const serviceDate = input.serviceDate;
    const primaryTrain = input.primaryTrainCode;
    trainProvenanceStatements.run(
        'upsertTaskRunStart',
        input.schedulerTaskId,
        input.executor.trim(),
        input.executionTime,
        input.startedAt,
        stringifyJson(input.taskArgs),
        serviceDate,
        primaryTrain?.prefix ?? '',
        primaryTrain?.number ?? 0,
        normalizeOptionalInteger(input.primaryStartAt),
        input.primaryEmuId ?? null
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
    const eventTrain = input.trainCode ?? null;
    const relatedTrain = input.relatedTrainCode ?? null;
    const eventServiceDate = input.serviceDate;

    trainProvenanceStatements.run(
        'insertProvenanceEvent',
        input.taskRunId,
        input.sequenceNo,
        createdAt,
        eventServiceDate,
        eventTrain?.prefix ?? '',
        eventTrain?.number ?? 0,
        normalizeOptionalInteger(input.startAt),
        input.emuId ?? null,
        relatedTrain?.prefix ?? '',
        relatedTrain?.number ?? 0,
        input.relatedEmuId ?? null,
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
    const candidateServiceDate = input.serviceDate;
    const candidateTrain = input.scannedTrainCode ?? null;
    const matchedTrain = input.matchedTrainCode ?? null;

    trainProvenanceStatements.run(
        'insertCouplingScanCandidate',
        input.taskRunId,
        input.candidateOrder,
        candidateServiceDate,
        (input.bureau ?? '').trim(),
        (input.model ?? '').trim(),
        input.candidateEmuId,
        input.status.trim(),
        input.reason?.trim() ?? '',
        candidateTrain?.prefix ?? '',
        candidateTrain?.number ?? 0,
        input.scannedInternalCode?.trim() ?? '',
        normalizeOptionalInteger(input.scannedStartAt),
        matchedTrain?.prefix ?? '',
        matchedTrain?.number ?? 0,
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
        unixSecondsToServiceDay(bucketStart),
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
        input.serviceDate,
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
        input.serviceDate,
        normalizeOptionalInteger(input.parentSchedulerTaskId),
        input.stationName.trim(),
        input.stationTelecode.trim().toUpperCase(),
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
    const trainCodes = uniqueTrainCodeValues([
        input.primaryTrainCode,
        ...input.trainCodes
    ]);
    const primaryTrain = input.primaryTrainCode;
    const serviceDate = input.serviceDate;
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
            serviceDate,
            normalizeOptionalInteger(input.startAt),
            primaryTrain.prefix,
            primaryTrain.number,
            stringifyTrainCodes(trainCodes),
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
                entry.stationTelecode.trim().toUpperCase(),
                Number.isInteger(entry.stationNo)
                    ? Math.max(0, entry.stationNo)
                    : 0,
                entry.trainDate,
                stringifyTrainCodes(entry.stationTrainCodes),
                stringifyTrainCodes(entry.attemptedTrainCodes),
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
    serviceDate: ServiceDay,
    executor: string
) {
    maybeCleanupExpiredTrainProvenance();
    const normalizedExecutor = executor.trim();
    if (normalizedExecutor.length === 0) {
        return [];
    }

    return trainProvenanceStatements
        .all<TrainProvenanceTaskRunRow>(
            'selectTaskRunsByDateAndExecutor',
            serviceDate,
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

export function listStationBoardDispatchResultsByDate(
    serviceDate: ServiceDay
) {
    maybeCleanupExpiredTrainProvenance();

    return trainProvenanceStatements
        .all<StationBoardDispatchResultRow>(
            'selectStationBoardDispatchResultsByDate',
            serviceDate
        )
        .map(toStationBoardDispatchResultRecord);
}

export function listStationBoardFetchResultsByParentSchedulerTaskId(
    serviceDate: ServiceDay,
    parentSchedulerTaskId: number
) {
    maybeCleanupExpiredTrainProvenance();
    if (
        !Number.isInteger(parentSchedulerTaskId) ||
        parentSchedulerTaskId <= 0
    ) {
        return [];
    }

    return trainProvenanceStatements
        .all<StationBoardFetchResultRow>(
            'selectStationBoardFetchResultsByParentSchedulerTaskId',
            serviceDate,
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
    serviceDate: ServiceDay,
    trainCode: TrainCodeParts
): number[] {
    maybeCleanupExpiredTrainProvenance();

    return trainProvenanceStatements
        .all<{ start_at: number }>(
            'selectDepartureStartAtsByDateAndTrainCode',
            serviceDate,
            trainCode.prefix,
            trainCode.number
        )
        .map((row) => row.start_at)
        .filter((value) => Number.isInteger(value));
}

export function listTrainProvenanceEventsByDateAndTrainCode(
    serviceDate: ServiceDay,
    trainCode: TrainCodeParts,
    startAt: number | null
) {
    maybeCleanupExpiredTrainProvenance();

    return trainProvenanceStatements
        .all<TrainProvenanceEventRow>(
            'selectEventsByDateAndTrainCode',
            serviceDate,
            trainCode.prefix,
            trainCode.number,
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
