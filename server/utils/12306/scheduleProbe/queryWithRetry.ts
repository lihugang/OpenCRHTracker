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
    queryFn: () => Promise<T>,
    retryAttempts: number,
    shouldRetry: (data: T) => boolean = (data) => data === null
): Promise<QueryResult<Exclude<T, null>>> {
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
