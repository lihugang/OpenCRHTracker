import type { H3Event } from 'h3';
import type { DescMessage, Message } from '@bufbuild/protobuf';
import type ApiIdentity from '~/server/utils/api/identity/ApiIdentity';
import type { V2OperationName } from '~/server/utils/api/v2/operationNames';

export type V2HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type V2BodyMode = 'none' | 'optional' | 'required';

export interface V2OperationContext {
    event: H3Event;
    identity: ApiIdentity;
    params: Readonly<Record<string, string>>;
    query: Readonly<Record<string, unknown>>;
    request: Message;
}

export type V2CostRule =
    | { kind: 'none' }
    | { kind: 'fixed'; key: string }
    | { kind: 'perRecord'; key: string; count: (data: unknown) => number }
    | { kind: 'custom'; fixed: number; dynamic?: (data: unknown) => number };

export type V2AuthRateLimitKey = 'login' | 'register' | 'oauthAuthorize';

export interface V2RawMediaSpec<TData> {
    kind: 'png' | 'pdf' | 'csv';
    isRequested: (query: Readonly<Record<string, unknown>>) => boolean;
    resolveContentType: (
        query: Readonly<Record<string, unknown>>
    ) => string | null;
    build: (data: TData) => {
        content: string | Uint8Array;
        contentType: string;
        contentDisposition: string;
    };
}

export interface V2MappingsSpec<TData> {
    emuCode?: (data: TData) => readonly number[];
    timetable?: (data: TData) => readonly number[];
    timetableContent?: (data: TData) => readonly number[];
}

export interface V2ManifestEntry<
    TRequest extends DescMessage,
    TData extends DescMessage,
    TResponse extends DescMessage
> {
    operationName: V2OperationName;
    method: V2HttpMethod;
    pathTemplate: string;
    requestSchema: TRequest;
    dataSchema: TData;
    responseSchema: TResponse;
    requiredScopes: string[];
    cors: boolean;
    cost: V2CostRule;
    failureCost?: number;
    cache?: (data: unknown, event: H3Event) => number;
    cacheHeaders?: (data: unknown, event: H3Event) => {
        cacheControl: string;
        cdnCacheControl: string;
    };
    bodyMode: V2BodyMode;
    authRateLimitKey?: V2AuthRateLimitKey;
    quotaBypassAnonymous?: boolean;
    successStatusCode?: number;
    rawMedia?: V2RawMediaSpec<unknown>;
    mappings?: V2MappingsSpec<unknown>;
    jsonData?: (data: unknown) => unknown;
    handler: (context: V2OperationContext) => Promise<unknown> | unknown;
}

export type V2AnyManifestEntry = V2ManifestEntry<any, any, any>;

export type V2Manifest = Record<V2OperationName, V2AnyManifestEntry>;

export function defineV2Operation<
    TRequest extends DescMessage,
    TData extends DescMessage,
    TResponse extends DescMessage
>(
    entry: V2ManifestEntry<TRequest, TData, TResponse>
): V2ManifestEntry<TRequest, TData, TResponse> {
    return entry;
}

export type V2ResponseCodec = 'json' | 'protobuf';

export interface V2TransportFailure {
    statusCode: number;
    errorCode: string;
    userMessage: string;
    retryAfter?: number;
}
