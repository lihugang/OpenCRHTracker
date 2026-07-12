import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import type { IndexRebuildKind } from '~/server/workers/indexRebuildProtocol';

export type IndexRebuildExecutionStatus = 'running' | 'success' | 'failed';

export interface IndexRebuildExecutionRecord {
    id: number;
    taskId: number | null;
    executor: IndexRebuildKind;
    startedAt: number;
    finishedAt: number | null;
    durationMs: number | null;
    status: IndexRebuildExecutionStatus;
    error: string | null;
}

interface StoredIndexRebuildExecutionRecord extends IndexRebuildExecutionRecord {
    startedAtMs: number;
}

const MAX_RECORDS_PER_EXECUTOR = 100;
const recordsByExecutor = new Map<
    IndexRebuildKind,
    StoredIndexRebuildExecutionRecord[]
>();
let activeDate = getCurrentDateString();
let nextRecordId = 1;

function ensureCurrentDate() {
    const currentDate = getCurrentDateString();
    if (currentDate === activeDate) {
        return;
    }

    recordsByExecutor.clear();
    activeDate = currentDate;
}

export function startIndexRebuildExecution(
    executor: IndexRebuildKind,
    taskId: number | null
) {
    ensureCurrentDate();
    const startedAtMs = Date.now();
    const record: StoredIndexRebuildExecutionRecord = {
        id: nextRecordId,
        taskId,
        executor,
        startedAt: Math.floor(startedAtMs / 1000),
        startedAtMs,
        finishedAt: null,
        durationMs: null,
        status: 'running',
        error: null
    };
    nextRecordId += 1;

    const records = recordsByExecutor.get(executor) ?? [];
    records.unshift(record);
    if (records.length > MAX_RECORDS_PER_EXECUTOR) {
        records.length = MAX_RECORDS_PER_EXECUTOR;
    }
    recordsByExecutor.set(executor, records);
    return record.id;
}

export function finishIndexRebuildExecution(
    recordId: number,
    status: Exclude<IndexRebuildExecutionStatus, 'running'>,
    error: string | null = null
) {
    ensureCurrentDate();
    for (const records of recordsByExecutor.values()) {
        const record = records.find((item) => item.id === recordId);
        if (!record) {
            continue;
        }

        const finishedAtMs = Date.now();
        record.finishedAt = Math.floor(finishedAtMs / 1000);
        record.durationMs = Math.max(0, finishedAtMs - record.startedAtMs);
        record.status = status;
        record.error = error;
        return;
    }
}

export function listTodayIndexRebuildExecutions(
    executor: IndexRebuildKind
): IndexRebuildExecutionRecord[] {
    ensureCurrentDate();
    return (recordsByExecutor.get(executor) ?? []).map(
        ({ startedAtMs: _startedAtMs, ...record }) => record
    );
}
