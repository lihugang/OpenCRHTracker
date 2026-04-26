import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type {
    Admin12306TraceEventLevel,
    Admin12306TraceStatus
} from '~/types/admin';
import {
    append12306TraceEvent,
    type Append12306TraceEventSample
} from '~/server/services/requestMetrics12306Store';
import {
    getCurrentTaskExecutionContext,
    type TaskExecutionContextValue
} from '~/server/services/taskExecutionContext';

export interface TraceSubjectContext {
    traceKey?: string;
    traceTitle?: string;
    traceSubtitle?: string;
    primaryTrainCode?: string;
    allTrainCodes?: string[];
    trainInternalCode?: string;
    startAt?: number | null;
    taskId?: number | null;
    executor?: string;
}

interface TraceContextState extends TraceSubjectContext {
    invocationId: string | null;
}

interface TraceFunctionOptions<T> {
    title: string;
    functionName: string;
    subject?: TraceSubjectContext;
    message?: string;
    context?: Record<string, unknown>;
    getSuccessMessage?: (result: T) => string;
    getSuccessContext?: (result: T) => Record<string, unknown>;
    getSuccessLevel?: (result: T) => Admin12306TraceEventLevel;
    getSuccessStatus?: (result: T) => 'success' | 'warning' | 'error';
    getErrorMessage?: (error: unknown) => string;
    getErrorContext?: (error: unknown) => Record<string, unknown>;
}

interface TraceRequestOptions {
    title: string;
    subject?: TraceSubjectContext;
    context?: Record<string, unknown>;
    durationMs?: number;
    requestType: 'query' | 'search';
    method: string;
    url: string;
    operation: string;
    responseStatus?: number | null;
    businessStatus?: unknown;
    errorCode?: unknown;
    errorMessage?: unknown;
    level?: Admin12306TraceEventLevel;
    message?: string;
}

interface TraceSimpleEventOptions {
    title: string;
    subject?: TraceSubjectContext;
    context?: Record<string, unknown>;
    durationMs?: number;
    operation: string;
    level?: Admin12306TraceEventLevel;
    message?: string;
}

interface TraceDatabaseEventOptions {
    title: string;
    subject?: TraceSubjectContext;
    context?: Record<string, unknown>;
    durationMs?: number;
    operation: string;
    database: string;
    table: string;
    changes?: number | null;
    level?: Admin12306TraceEventLevel;
    message?: string;
}

interface TraceSummaryOptions {
    title: string;
    subject?: TraceSubjectContext;
    context?: Record<string, unknown>;
    durationMs?: number;
    level?: Admin12306TraceEventLevel;
    message?: string;
    status: Admin12306TraceStatus;
}

const traceContextStorage = new AsyncLocalStorage<TraceContextState>();

export function hasCurrent12306TraceContext() {
    return traceContextStorage.getStore() !== undefined;
}

function asErrorMessage(error: unknown) {
    return error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
}

function normalizeTrainCodes(codes: string[] | undefined) {
    if (!Array.isArray(codes) || codes.length === 0) {
        return undefined;
    }

    return Array.from(
        new Set(
            codes
                .filter((value): value is string => typeof value === 'string')
                .map((value) => value.trim().toUpperCase())
                .filter((value) => value.length > 0)
        )
    );
}

function toTraceSubjectSample(
    subject: TraceSubjectContext | undefined,
    currentTask: TaskExecutionContextValue | null
): Pick<
    Append12306TraceEventSample,
    | 'traceKey'
    | 'traceTitle'
    | 'traceSubtitle'
    | 'primaryTrainCode'
    | 'allTrainCodes'
    | 'trainInternalCode'
    | 'startAt'
    | 'taskId'
    | 'executor'
> {
    return {
        traceKey: subject?.traceKey,
        traceTitle: subject?.traceTitle,
        traceSubtitle: subject?.traceSubtitle,
        primaryTrainCode: subject?.primaryTrainCode?.trim().toUpperCase() ?? '',
        allTrainCodes: normalizeTrainCodes(subject?.allTrainCodes),
        trainInternalCode:
            subject?.trainInternalCode?.trim().toUpperCase() ?? '',
        startAt:
            typeof subject?.startAt === 'number' &&
            Number.isInteger(subject.startAt) &&
            subject.startAt >= 0
                ? subject.startAt
                : null,
        taskId:
            typeof subject?.taskId === 'number' &&
            Number.isInteger(subject.taskId) &&
            subject.taskId >= 0
                ? subject.taskId
                : currentTask?.taskId ?? null,
        executor: subject?.executor?.trim() || currentTask?.executor || ''
    };
}

function mergeSubjectContext(subject?: TraceSubjectContext): TraceSubjectContext {
    const current = traceContextStorage.getStore();
    const currentTask = getCurrentTaskExecutionContext();

    return {
        traceKey: subject?.traceKey ?? current?.traceKey,
        traceTitle: subject?.traceTitle ?? current?.traceTitle,
        traceSubtitle: subject?.traceSubtitle ?? current?.traceSubtitle,
        primaryTrainCode:
            subject?.primaryTrainCode ?? current?.primaryTrainCode ?? '',
        allTrainCodes:
            normalizeTrainCodes(subject?.allTrainCodes) ??
            normalizeTrainCodes(current?.allTrainCodes) ??
            [],
        trainInternalCode:
            subject?.trainInternalCode ?? current?.trainInternalCode ?? '',
        startAt:
            typeof subject?.startAt !== 'undefined'
                ? subject.startAt
                : (current?.startAt ?? null),
        taskId:
            typeof subject?.taskId !== 'undefined'
                ? subject.taskId
                : (current?.taskId ?? currentTask?.taskId ?? null),
        executor:
            subject?.executor ??
            current?.executor ??
            currentTask?.executor ??
            ''
    };
}

function appendEvent(sample: Append12306TraceEventSample) {
    const currentTask = getCurrentTaskExecutionContext();
    const currentTraceContext = traceContextStorage.getStore();
    return append12306TraceEvent({
        ...sample,
        invocationId:
            sample.invocationId ??
            currentTraceContext?.invocationId ??
            randomUUID(),
        parentInvocationId:
            typeof sample.parentInvocationId === 'undefined'
                ? currentTraceContext?.invocationId ?? null
                : sample.parentInvocationId,
        ...toTraceSubjectSample(
            mergeSubjectContext({
                traceKey: sample.traceKey,
                traceTitle: sample.traceTitle,
                traceSubtitle: sample.traceSubtitle,
                primaryTrainCode: sample.primaryTrainCode,
                allTrainCodes: sample.allTrainCodes,
                trainInternalCode: sample.trainInternalCode,
                startAt: sample.startAt,
                taskId: sample.taskId,
                executor: sample.executor
            }),
            currentTask
        )
    });
}

export function runWith12306TraceScope<T>(
    subject: TraceSubjectContext,
    callback: () => Promise<T> | T
) {
    const current = traceContextStorage.getStore();
    const nextState: TraceContextState = {
        ...mergeSubjectContext(subject),
        invocationId: current?.invocationId ?? null
    };

    return traceContextStorage.run(nextState, callback);
}

export async function with12306TraceFunction<T>(
    options: TraceFunctionOptions<T>,
    callback: () => Promise<T> | T
): Promise<T> {
    const parent = traceContextStorage.getStore();
    const invocationId = randomUUID();
    const subject = mergeSubjectContext(options.subject);
    const startedAtMs = Date.now();

    return traceContextStorage.run(
        {
            ...subject,
            invocationId
        },
        async () => {
            try {
                const result = await callback();
                appendEvent({
                    kind: 'function',
                    title: options.title,
                    functionName: options.functionName,
                    functionStatus:
                        options.getSuccessStatus?.(result) ?? 'success',
                    level: options.getSuccessLevel?.(result) ?? 'INFO',
                    message:
                        options.getSuccessMessage?.(result) ?? options.message ?? '',
                    context: {
                        ...(options.context ?? {}),
                        ...(options.getSuccessContext?.(result) ?? {})
                    },
                    durationMs: Date.now() - startedAtMs,
                    invocationId,
                    parentInvocationId: parent?.invocationId ?? null,
                    ...toTraceSubjectSample(
                        subject,
                        getCurrentTaskExecutionContext()
                    )
                });
                return result;
            } catch (error) {
                appendEvent({
                    kind: 'function',
                    title: options.title,
                    functionName: options.functionName,
                    functionStatus: 'error',
                    level: 'ERROR',
                    message:
                        options.getErrorMessage?.(error) ??
                        options.message ??
                        asErrorMessage(error),
                    context: {
                        ...(options.context ?? {}),
                        ...(options.getErrorContext?.(error) ?? {}),
                        error: asErrorMessage(error)
                    },
                    durationMs: Date.now() - startedAtMs,
                    invocationId,
                    parentInvocationId: parent?.invocationId ?? null,
                    ...toTraceSubjectSample(
                        subject,
                        getCurrentTaskExecutionContext()
                    )
                });
                throw error;
            }
        }
    );
}

export function record12306TraceRequest(options: TraceRequestOptions) {
    appendEvent({
        kind: 'request',
        title: options.title,
        message: options.message,
        context: options.context,
        durationMs: options.durationMs,
        requestType: options.requestType,
        method: options.method,
        url: options.url,
        operation: options.operation,
        responseStatus: options.responseStatus,
        businessStatus: options.businessStatus,
        errorCode: options.errorCode,
        errorMessage: options.errorMessage,
        level: options.level ?? 'INFO',
        ...toTraceSubjectSample(
            mergeSubjectContext(options.subject),
            getCurrentTaskExecutionContext()
        )
    });
}

export function record12306TraceConflict(options: TraceSimpleEventOptions) {
    appendEvent({
        kind: 'conflict',
        title: options.title,
        message: options.message,
        context: options.context,
        durationMs: options.durationMs,
        operation: options.operation,
        level: options.level ?? 'WARN',
        ...toTraceSubjectSample(
            mergeSubjectContext(options.subject),
            getCurrentTaskExecutionContext()
        )
    });
}

export function record12306TraceDecision(options: TraceSimpleEventOptions) {
    appendEvent({
        kind: 'decision',
        title: options.title,
        message: options.message,
        context: options.context,
        durationMs: options.durationMs,
        operation: options.operation,
        level: options.level ?? 'INFO',
        ...toTraceSubjectSample(
            mergeSubjectContext(options.subject),
            getCurrentTaskExecutionContext()
        )
    });
}

export function record12306TraceDatabase(options: TraceDatabaseEventOptions) {
    if (!hasCurrent12306TraceContext()) {
        return;
    }

    appendEvent({
        kind: 'database',
        title: options.title,
        message: options.message,
        context: options.context,
        durationMs: options.durationMs,
        operation: options.operation,
        database: options.database,
        table: options.table,
        changes: options.changes,
        level: options.level ?? 'INFO',
        ...toTraceSubjectSample(
            mergeSubjectContext(options.subject),
            getCurrentTaskExecutionContext()
        )
    });
}

export function record12306TraceSummary(options: TraceSummaryOptions) {
    appendEvent({
        kind: 'summary',
        title: options.title,
        message: options.message,
        context: options.context,
        durationMs: options.durationMs,
        level: options.level ?? 'INFO',
        summaryStatus: options.status,
        ...toTraceSubjectSample(
            mergeSubjectContext(options.subject),
            getCurrentTaskExecutionContext()
        )
    });
}
