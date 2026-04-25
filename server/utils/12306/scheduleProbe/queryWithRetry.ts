import {
    with12306TraceFunction,
    type TraceSubjectContext
} from '~/server/services/requestMetrics12306Trace';

interface QuerySuccess<T> {
    ok: true;
    data: T;
    attempts: number;
}

interface QueryFailure {
    ok: false;
    attempts: number;
}

export type QueryResult<T> = QuerySuccess<T> | QueryFailure;

interface QueryWithRetryTraceOptions {
    title?: string;
    functionName?: string;
    subject?: TraceSubjectContext;
    context?: Record<string, unknown>;
}

export default async function queryWithRetry<T>(
    queryFn: () => Promise<T>,
    retryAttempts: number,
    shouldRetry: (data: T) => boolean = (data) => data === null,
    traceOptions: QueryWithRetryTraceOptions = {}
): Promise<QueryResult<Exclude<T, null>>> {
    return with12306TraceFunction<QueryResult<Exclude<T, null>>>(
        {
            title: traceOptions.title ?? '12306 重试查询',
            functionName: traceOptions.functionName ?? 'queryWithRetry',
            subject: traceOptions.subject,
            context: {
                retryAttempts,
                ...(traceOptions.context ?? {})
            },
            getSuccessContext: (result) => ({
                attempts: result.attempts,
                ok: result.ok
            }),
            getSuccessLevel: (result) => (result.ok ? 'INFO' : 'WARN'),
            getSuccessStatus: (result) => (result.ok ? 'success' : 'warning')
        },
        async () => {
            const maxAttempts = Math.max(1, retryAttempts);
            for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
                const data = await queryFn();
                if (!shouldRetry(data)) {
                    return {
                        ok: true,
                        data: data as Exclude<T, null>,
                        attempts: attempt
                    };
                }
            }

            return {
                ok: false,
                attempts: maxAttempts
            };
        }
    );
}
