type TrackedFetchRequest = string | URL | Request;
type TrackedFetchOptions = Record<string, unknown> | undefined;
export type TrackedRequestFetch = <T>(
    request: TrackedFetchRequest,
    options?: TrackedFetchOptions
) => Promise<T>;

type FetchHookContext = Record<string, unknown> & {
    response?: unknown;
};

type FetchHook =
    | ((context: FetchHookContext) => void | Promise<void>)
    | Array<(context: FetchHookContext) => void | Promise<void>>;

interface HookableFetchOptions extends Record<string, unknown> {
    onResponse?: FetchHook;
    onResponseError?: FetchHook;
}

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

function getErrorResponse(error: unknown) {
    if (
        typeof error !== 'object' ||
        error === null ||
        !('response' in error)
    ) {
        return null;
    }

    return (error as { response?: unknown }).response ?? null;
}

async function runFetchHooks(hooks: FetchHook | undefined, context: FetchHookContext) {
    if (!hooks) {
        return;
    }

    if (Array.isArray(hooks)) {
        for (const hook of hooks) {
            await hook(context);
        }

        return;
    }

    await hooks(context);
}

function withTimingHooks(
    options: TrackedFetchOptions,
    recordTiming: (response: unknown) => void
) {
    const resolvedOptions = (options ?? {}) as HookableFetchOptions;

    return {
        ...resolvedOptions,
        async onResponse(context: FetchHookContext) {
            recordTiming(context.response ?? null);
            await runFetchHooks(resolvedOptions.onResponse, context);
        },
        async onResponseError(context: FetchHookContext) {
            recordTiming(context.response ?? null);
            await runFetchHooks(resolvedOptions.onResponseError, context);
        }
    } satisfies HookableFetchOptions;
}

export default function useTrackedRequestFetch() {
    if (import.meta.client) {
        return $fetch as TrackedRequestFetch;
    }

    const requestFetch = useRequestFetch() as TrackedRequestFetch;

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
        let timingRecorded = false;

        const recordTiming = (response: unknown) => {
            if (timingRecorded) {
                return;
            }

            timingRecorded = true;
            recordSsrInternalApiTiming(
                pathname,
                getResponseServerTimingHeader(response),
                Math.max(0, Date.now() - startedAtMs)
            );
        };

        try {
            const response = await requestFetch<T>(
                request,
                withTimingHooks(options, recordTiming)
            );
            recordTiming(null);
            return response;
        } catch (error) {
            recordTiming(getErrorResponse(error));
            throw error;
        } finally {
            resumeServerTiming(pausedStore);
        }
    };

    return trackedRequestFetch;
}
