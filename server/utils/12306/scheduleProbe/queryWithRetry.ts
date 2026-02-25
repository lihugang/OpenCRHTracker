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

export default async function queryWithRetry<T>(
    queryFn: () => Promise<T | null>,
    retryAttempts: number
): Promise<QueryResult<T>> {
    const maxAttempts = Math.max(1, retryAttempts);
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const data = await queryFn();
        if (data !== null) {
            return {
                ok: true,
                data,
                attempts: attempt
            };
        }
    }

    return {
        ok: false,
        attempts: maxAttempts
    };
}
