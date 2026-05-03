import '~/server/libs/database/trainProvenance';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import useConfig from '~/server/config';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';
import normalizeCode from '~/server/utils/12306/normalizeCode';
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
    | 'fetch_emu_by_seat_code';

type TrainProvenanceSqlKey =
    | 'cleanupExpiredRequestHourlyStats'
    | 'cleanupExpiredTaskRuns'
    | 'incrementRequestHourlyStat'
    | 'insertCouplingScanCandidate'
    | 'insertProvenanceEvent'
    | 'selectRequestHourlyStatsInRange'
    | 'selectCouplingScanCandidatesByTaskRunId'
    | 'selectDepartureStartAtsByDateAndTrainCode'
    | 'selectEventsByDateAndTrainCode'
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
    request_type: TrainProvenanceRequestStatType;
    is_success: number;
    request_count: number;
    updated_at: number;
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
    requestType: TrainProvenanceRequestStatType;
    isSuccess: boolean;
    requestCount: number;
    updatedAt: number;
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
