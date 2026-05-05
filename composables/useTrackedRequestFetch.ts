type TrackedFetchRequest = string | URL | Request;
type TrackedFetchOptions = Record<string, unknown> | undefined;
export type TrackedRequestFetch = <T>(
    request: TrackedFetchRequest,
    options?: TrackedFetchOptions
) => Promise<T>;

function isInternalApiPath(pathname: string) {
    return pathname === '/api' || pathname.startsWith('/api/');
}

function resolveRequestPathname(request: RequestInfo | URL) {
    if (typeof request === 'string') {
        if (request.startsWith('http://') || request.startsWith('https://')) {
            return new URL(request).pathname;
        }

        return request.split('?')[0] ?? request;
    }

    if (request instanceof URL) {
        return request.pathname;
    }

    if (request instanceof Request) {
        return new URL(request.url).pathname;
    }

    return String(request);
}

function getResponseServerTimingHeader(response: unknown) {
    if (
        typeof response !== 'object' ||
        response === null ||
        !('headers' in response)
    ) {
        return null;
    }

    const headers = (response as { headers?: Headers }).headers;
    return headers?.get('server-timing') ?? null;
}

export default function useTrackedRequestFetch() {
    if (import.meta.client) {
        return $fetch as TrackedRequestFetch;
    }

    const requestFetch = useRequestFetch() as TrackedRequestFetch;
    const rawRequestFetch = $fetch.raw;
    if (!rawRequestFetch) {
        return requestFetch;
    }

    const trackedRequestFetch: TrackedRequestFetch = async <T>(
        request: TrackedFetchRequest,
        options?: TrackedFetchOptions
    ) => {
        const {
            pauseServerTiming,
            recordSsrInternalApiTiming,
            resumeServerTiming
        } = await import(
            '~/server/utils/timing/serverTiming'
        );
        const pathname = resolveRequestPathname(request as RequestInfo | URL);
        if (!isInternalApiPath(pathname)) {
            return await requestFetch<T>(request, options);
        }

        const startedAtMs = Date.now();
        const pausedStore = pauseServerTiming();
        try {
            const response = await rawRequestFetch<T>(
                request as string,
                options
            );
            recordSsrInternalApiTiming(
                pathname,
                getResponseServerTimingHeader(response),
                Math.max(0, Date.now() - startedAtMs)
            );
            return response._data as T;
        } catch (error) {
            const response =
                typeof error === 'object' &&
                error !== null &&
                'response' in error
                    ? (error as { response?: unknown }).response
                    : null;
            recordSsrInternalApiTiming(
                pathname,
                getResponseServerTimingHeader(response),
                Math.max(0, Date.now() - startedAtMs)
            );
            throw error;
        } finally {
            resumeServerTiming(pausedStore);
        }
    };

    return trackedRequestFetch;
}
