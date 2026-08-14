import {
    create,
    fromBinary,
    toBinary,
    type DescMessage,
    type Message
} from '@bufbuild/protobuf';
import type { V2ClientOperation } from '#shared/api/v2/registry/types';
import type { TrackedRequestFetch } from '~/composables/useTrackedRequestFetch';
import useTrackedRequestFetch from '~/composables/useTrackedRequestFetch';
import { V2ApiError } from '~/utils/api/v2/V2ApiError';

export interface V2RequestInput {
    params?: Record<string, string | number | undefined>;
    query?: Record<
        string,
        string | number | boolean | null | undefined | Array<string | number>
    >;
    body?: object;
}

export interface V2RequestOptions extends Record<string, unknown> {
    signal?: AbortSignal;
    retry?: number;
    cache?: RequestCache;
    onResponse?: (context: { response?: unknown }) => void | Promise<void>;
    onResponseError?: (context: { response?: unknown }) => void | Promise<void>;
}

export interface V2RawRequestOptions extends V2RequestOptions {
    rawContentType?: string;
}

export interface V2ApiSuccess<TData> {
    ok: true;
    data: TData;
    error: '';
}

export interface V2ApiFailure {
    ok: false;
    data: string;
    error: string;
}

export type V2ApiResult<TData> = V2ApiSuccess<TData> | V2ApiFailure;

type FetchErrorLike = {
    response?: {
        status?: unknown;
        _data?: unknown;
        headers?: Headers;
    };
    cause?: unknown;
};

function resolveFetchForMethod(entry: V2ClientOperation): TrackedRequestFetch {
    if (import.meta.server) {
        return useTrackedRequestFetch();
    }

    if (entry.method === 'GET' || entry.method === 'HEAD') {
        return useTrackedRequestFetch();
    }

    return useNuxtApp().$csrfFetch as TrackedRequestFetch;
}

function buildV2Url(entry: V2ClientOperation, input: V2RequestInput) {
    const path = entry.pathTemplate.replace(
        /:([A-Za-z0-9_]+)/g,
        (_placeholder, key: string) => {
            const value = input.params?.[key];
            if (value === undefined || value === null || value === '') {
                throw new V2ApiError(
                    entry.operationName,
                    null,
                    'missing_path_param',
                    `请求缺少路径参数：${key}`
                );
            }
            return encodeURIComponent(String(value));
        }
    );

    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(input.query ?? {})) {
        if (value === undefined || value === null) {
            continue;
        }
        if (Array.isArray(value)) {
            for (const item of value) {
                search.append(key, String(item));
            }
            continue;
        }
        search.append(key, String(value));
    }
    const queryString = search.toString();
    return queryString.length > 0 ? `${path}?${queryString}` : path;
}

function getMediaType(contentType: string | null | undefined) {
    return (contentType ?? '').split(';', 1)[0]!.trim().toLowerCase();
}

function getHttpStatusMessage(status: number | null) {
    if (status === null) {
        return '网络请求失败，请稍后重试。';
    }
    if (status >= 400 && status < 500) {
        return '请求参数错误或没有权限，请检查后重试。';
    }
    if (status >= 500) {
        return '服务器内部错误，请稍后重试。';
    }
    return '请求失败，请稍后重试。';
}

function toBytes(value: unknown): Uint8Array | null {
    if (value instanceof Uint8Array) {
        return value;
    }
    if (value instanceof ArrayBuffer) {
        return new Uint8Array(value);
    }
    if (ArrayBuffer.isView(value)) {
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    return null;
}

function toText(value: unknown): string | null {
    if (typeof value === 'string') {
        return value;
    }

    const bytes = toBytes(value);
    if (!bytes) {
        return null;
    }

    try {
        return new TextDecoder().decode(bytes);
    } catch {
        return null;
    }
}

function parseJsonEnvelope(value: unknown): {
    ok?: boolean;
    data?: unknown;
    error?: unknown;
} | null {
    if (typeof value === 'string') {
        try {
            return JSON.parse(value) as {
                ok?: boolean;
                data?: unknown;
                error?: unknown;
            };
        } catch {
            return null;
        }
    }

    const text = toText(value);
    if (text !== null) {
        try {
            return JSON.parse(text) as {
                ok?: boolean;
                data?: unknown;
                error?: unknown;
            };
        } catch {
            return null;
        }
    }

    if (typeof value === 'object' && value !== null) {
        return value as {
            ok?: boolean;
            data?: unknown;
            error?: unknown;
        };
    }
    return null;
}

function normalizeFetchError(
    entry: V2ClientOperation,
    error: unknown
): V2ApiError {
    if (error instanceof V2ApiError) {
        return error;
    }

    const fetchError = error as FetchErrorLike;
    const response = fetchError.response;
    if (!response) {
        return new V2ApiError(
            entry.operationName,
            null,
            'network_error',
            '网络请求失败，请稍后重试。',
            { cause: error }
        );
    }

    const status = typeof response.status === 'number' ? response.status : null;
    const mediaType = getMediaType(response.headers?.get('content-type'));

    if (mediaType === 'application/json') {
        const payload = parseJsonEnvelope(response._data);
        if (
            payload &&
            typeof payload.error === 'string' &&
            typeof payload.data === 'string'
        ) {
            return new V2ApiError(
                entry.operationName,
                status,
                payload.error,
                payload.data,
                { cause: error }
            );
        }
    } else if (mediaType === 'application/x-protobuf') {
        const bytes = toBytes(response._data);
        if (bytes) {
            try {
                const message = fromBinary(
                    entry.responseSchema,
                    bytes
                ) as unknown as {
                    outcome?: {
                        case: 'error';
                        value: { code: string; message: string };
                    };
                };
                if (message.outcome?.case === 'error') {
                    return new V2ApiError(
                        entry.operationName,
                        status,
                        message.outcome.value.code,
                        message.outcome.value.message,
                        { cause: error }
                    );
                }
            } catch {
                // Fall through to a generic transport error.
            }
        }
    }

    return new V2ApiError(
        entry.operationName,
        status,
        'http_error',
        getHttpStatusMessage(status),
        { cause: error }
    );
}

function buildFetchOptions(
    entry: V2ClientOperation,
    input: V2RequestInput,
    options: V2RequestOptions,
    onResponse: (context: { response?: unknown }) => void
) {
    if (entry.bodyMode === 'required' && input.body === undefined) {
        throw new V2ApiError(
            entry.operationName,
            null,
            'missing_body',
            '请求缺少必需的消息体'
        );
    }

    const headers = new Headers(
        (options.headers as HeadersInit | undefined) ?? undefined
    );
    headers.set('Accept', 'application/x-protobuf');

    const method = entry.method;
    let body: Uint8Array | undefined;
    if (
        method !== 'GET' &&
        method !== 'HEAD' &&
        entry.bodyMode !== 'none' &&
        input.body !== undefined
    ) {
        headers.set('Content-Type', 'application/x-protobuf');
        body = toBinary(
            entry.requestSchema,
            create(
                entry.requestSchema as DescMessage,
                input.body as never
            ) as Message
        );
    }

    const { onResponse: callerOnResponse, onResponseError, ...rest } = options;
    return {
        ...rest,
        method,
        headers: Object.fromEntries(headers.entries()),
        ...(body === undefined ? {} : { body }),
        responseType: 'arrayBuffer' as const,
        retry: options.retry ?? 0,
        onResponse(context: { response?: unknown }) {
            onResponse(context);
            if (callerOnResponse) {
                void callerOnResponse(context);
            }
        },
        onResponseError(context: { response?: unknown }) {
            if (onResponseError) {
                void onResponseError(context);
            }
        }
    };
}

export async function requestV2<TResponseMessage extends Message, TDomain>(
    entry: V2ClientOperation,
    input: V2RequestInput,
    mapper: (message: TResponseMessage) => TDomain,
    options: V2RequestOptions = {}
): Promise<V2ApiResult<TDomain>> {
    const url = buildV2Url(entry, input);
    const responseHolder: { response: Response | null } = {
        response: null
    };
    const fetchImpl = resolveFetchForMethod(entry);

    try {
        const raw = await fetchImpl<ArrayBuffer>(
            url,
            buildFetchOptions(entry, input, options, (context) => {
                responseHolder.response = context.response as Response;
            })
        );

        const status = responseHolder.response?.status ?? 200;
        const mediaType = getMediaType(
            responseHolder.response?.headers.get('content-type')
        );
        if (mediaType !== 'application/x-protobuf') {
            throw new V2ApiError(
                entry.operationName,
                status,
                'invalid_content_type',
                '接口响应格式不是 protobuf'
            );
        }

        const bytes = toBytes(raw);
        if (!bytes || bytes.byteLength === 0) {
            throw new V2ApiError(
                entry.operationName,
                status,
                'empty_response',
                '接口响应为空'
            );
        }

        let responseMessage: Message;
        try {
            responseMessage = fromBinary(entry.responseSchema, bytes);
        } catch (decodeError) {
            throw new V2ApiError(
                entry.operationName,
                status,
                'decode_error',
                '接口响应无法解码',
                { cause: decodeError }
            );
        }

        const outcome = (
            responseMessage as unknown as {
                outcome?: {
                    case: 'data' | 'error' | undefined;
                    value?: unknown;
                };
            }
        ).outcome;
        if (outcome?.case === 'data') {
            return {
                ok: true,
                data: mapper(outcome.value as TResponseMessage),
                error: ''
            };
        }
        if (outcome?.case === 'error') {
            const value = outcome.value as { code: string; message: string };
            return {
                ok: false,
                data: value.message,
                error: value.code
            };
        }

        throw new V2ApiError(
            entry.operationName,
            status,
            'invalid_outcome',
            '接口响应缺少 outcome'
        );
    } catch (error) {
        throw normalizeFetchError(entry, error);
    }
}

export async function requestV2Raw(
    entry: V2ClientOperation,
    input: V2RequestInput,
    mode: 'blob' | 'arrayBuffer' | 'text',
    options: V2RawRequestOptions = {}
): Promise<Blob | ArrayBuffer | string> {
    const url = buildV2Url(entry, input);
    const responseHolder: { response: Response | null } = {
        response: null
    };
    const fetchImpl = resolveFetchForMethod(entry);
    const headers = new Headers(
        (options.headers as HeadersInit | undefined) ?? undefined
    );
    const requestedContentType =
        options.rawContentType ?? entry.rawContentTypes?.[0];
    if (
        requestedContentType &&
        entry.rawContentTypes &&
        !entry.rawContentTypes.some(
            (contentType) =>
                getMediaType(contentType) === getMediaType(requestedContentType)
        )
    ) {
        throw new V2ApiError(
            entry.operationName,
            null,
            'invalid_raw_content_type',
            '请求的下载响应格式未在接口中登记'
        );
    }
    if (requestedContentType) {
        headers.set('Accept', requestedContentType);
    }
    const {
        rawContentType: _rawContentType,
        onResponse: callerOnResponse,
        onResponseError,
        ...rest
    } = options;

    try {
        const raw = await fetchImpl<Blob | ArrayBuffer | string>(url, {
            ...rest,
            method: entry.method,
            headers: Object.fromEntries(headers.entries()),
            responseType: mode,
            retry: options.retry ?? 0,
            onResponse(context: { response?: unknown }) {
                responseHolder.response = context.response as Response;
                if (callerOnResponse) {
                    void callerOnResponse(context);
                }
            },
            onResponseError(context: { response?: unknown }) {
                if (onResponseError) {
                    void onResponseError(context);
                }
            }
        });

        const status = responseHolder.response?.status ?? 200;
        if (requestedContentType) {
            const mediaType = getMediaType(
                responseHolder.response?.headers.get('content-type')
            );
            if (getMediaType(requestedContentType) !== mediaType) {
                throw new V2ApiError(
                    entry.operationName,
                    status,
                    'invalid_content_type',
                    '下载响应格式不正确'
                );
            }
        }

        return raw;
    } catch (error) {
        throw normalizeFetchError(entry, error);
    }
}
