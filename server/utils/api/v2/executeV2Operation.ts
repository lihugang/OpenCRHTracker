import { createHash } from 'node:crypto';
import {
    create,
    fromBinary,
    fromJson,
    toBinary,
    type Message
} from '@bufbuild/protobuf';
import {
    getHeader,
    getQuery,
    getResponseHeader,
    readRawBody,
    setHeader,
    setResponseStatus,
    type H3Event
} from 'h3';
import useConfig from '~/server/config';
import getLogger from '~/server/libs/log4js';
import applyApiCorsHeaders from '~/server/utils/api/cors/applyApiCorsHeaders';
import asApiRequestError from '~/server/utils/api/errors/asApiRequestError';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import ensureAuthRateLimit from '~/server/utils/api/authRateLimit/ensureAuthRateLimit';
import getAnonymousIdentity from '~/server/utils/api/identity/getAnonymousIdentity';
import type ApiIdentity from '~/server/utils/api/identity/ApiIdentity';
import resolveIdentity from '~/server/utils/api/identity/resolveIdentity';
import recordApiKeyUsage from '~/server/utils/api/keyUsage/recordApiKeyUsage';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import getPerRecordCost from '~/server/utils/api/cost/getPerRecordCost';
import getRemainTokens from '~/server/utils/api/quota/getRemainTokens';
import formatRetryAfterMessage from '~/server/utils/api/quota/formatRetryAfterMessage';
import tryConsumeTokens from '~/server/utils/api/quota/tryConsumeTokens';
import setCacheControl from '~/server/utils/api/response/setCacheControl';
import setCommonHeaders from '~/server/utils/api/response/setCommonHeaders';
import assertRequiredScopes from '~/server/utils/api/scopes/assertRequiredScopes';
import { encodeMessageToJson } from '~/server/utils/api/v2/jsonCodec';
import {
    negotiateResponseCodec,
    parseRequestBodyCodec
} from '~/server/utils/api/v2/negotiation';
import {
    resolveEmuCodeMappings,
    resolveTimetableMappings
} from '~/server/utils/api/v2/resourceMappings';
import {
    normalizeRequestJsonEnums,
    validateRequestMessageEnums
} from '~/server/utils/api/v2/requestValidator';
import type {
    V2AnyManifestEntry,
    V2ResponseCodec,
    V2TransportFailure
} from '~/server/utils/api/v2/V2Types';
import { V2_OPERATION_MANIFEST } from '~/server/utils/api/v2/v2OperationManifest';
import type { V2OperationName } from '~/server/utils/api/v2/operationNames';

const v2ExecutorLogger = getLogger('v2-executor');

interface V2ResponseMeta {
    remain: number;
    cost: number;
    retryAfter?: number;
}

function isTransportFailure(value: unknown): value is V2TransportFailure {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as V2TransportFailure).statusCode === 'number' &&
        typeof (value as V2TransportFailure).errorCode === 'string'
    );
}

function isV2HeadRequest(event: H3Event): boolean {
    return (
        event.method === 'HEAD' ||
        (event.context as { v2OriginalMethod?: string }).v2OriginalMethod ===
            'HEAD'
    );
}

function mergeVaryHeader(event: H3Event, value: string) {
    const existing = getResponseHeader(event, 'vary');
    const parts = new Set<string>();
    if (typeof existing === 'string' && existing.trim().length > 0) {
        for (const part of existing.split(',')) {
            const trimmed = part.trim();
            if (trimmed.length > 0) {
                parts.add(trimmed);
            }
        }
    }

    parts.add(value);
    setHeader(event, 'Vary', [...parts].join(', '));
}

function computeETag(prefix: string, body: string | Uint8Array): string {
    const hash = createHash('sha256')
        .update(
            typeof body === 'string'
                ? body
                : Buffer.from(
                      body instanceof Uint8Array
                          ? body
                          : new Uint8Array(body as ArrayBuffer)
                  )
        )
        .digest('hex')
        .slice(0, 16);
    return `"v2-${prefix}-${hash}"`;
}

function renderJsonError(
    event: H3Event,
    statusCode: number,
    failure: V2TransportFailure,
    meta: V2ResponseMeta
) {
    const responseMeta = {
        ...meta,
        ...(failure.retryAfter === undefined
            ? {}
            : { retryAfter: failure.retryAfter })
    };
    setResponseStatus(event, statusCode);
    setCommonHeaders(event, responseMeta);
    mergeVaryHeader(event, 'Accept');
    setHeader(event, 'Content-Type', 'application/json; charset=utf-8');
    const body = JSON.stringify({
        ok: false,
        data: failure.userMessage,
        error: failure.errorCode
    });
    setHeader(event, 'ETag', computeETag('json', body));

    if (isV2HeadRequest(event)) {
        return null;
    }

    return body;
}

function renderCodecError(
    event: H3Event,
    entry: V2AnyManifestEntry,
    codec: V2ResponseCodec,
    statusCode: number,
    failure: V2TransportFailure,
    meta: V2ResponseMeta
) {
    const responseMeta = {
        ...meta,
        ...(failure.retryAfter === undefined
            ? {}
            : { retryAfter: failure.retryAfter })
    };
    setResponseStatus(event, statusCode);
    setCommonHeaders(event, responseMeta);
    mergeVaryHeader(event, 'Accept');

    if (codec === 'protobuf') {
        const responseMessage = create(entry.responseSchema, {
            outcome: {
                case: 'error',
                value: {
                    code: failure.errorCode,
                    message: failure.userMessage
                }
            },
            meta: {
                remain: responseMeta.remain,
                cost: responseMeta.cost,
                ...(responseMeta.retryAfter === undefined
                    ? {}
                    : { retryAfter: responseMeta.retryAfter })
            }
        });
        const body = toBinary(entry.responseSchema, responseMessage);
        setHeader(event, 'Content-Type', 'application/x-protobuf');
        setHeader(event, 'ETag', computeETag('proto', body));

        if (isV2HeadRequest(event)) {
            return null;
        }

        return body;
    }

    const body = JSON.stringify({
        ok: false,
        data: failure.userMessage,
        error: failure.errorCode
    });
    setHeader(event, 'Content-Type', 'application/json; charset=utf-8');
    setHeader(event, 'ETag', computeETag('json', body));

    if (isV2HeadRequest(event)) {
        return null;
    }

    return body;
}

function applyFailureCharge(
    event: H3Event,
    identity: ApiIdentity | null,
    entry: V2AnyManifestEntry,
    alreadyAppliedCost: number
): { meta: V2ResponseMeta; costApplied: number } {
    const resolvedIdentity = identity ?? getAnonymousIdentity(event);
    const targetFailureCost = Math.max(1, Math.floor(entry.failureCost ?? 1));
    const bypass =
        entry.quotaBypassAnonymous && resolvedIdentity.type === 'anonymous';

    if (bypass) {
        return {
            meta: {
                remain: getRemainTokens(resolvedIdentity),
                cost: alreadyAppliedCost
            },
            costApplied: alreadyAppliedCost
        };
    }

    if (alreadyAppliedCost >= targetFailureCost) {
        return {
            meta: {
                remain: getRemainTokens(resolvedIdentity),
                cost: alreadyAppliedCost
            },
            costApplied: alreadyAppliedCost
        };
    }

    const consumed = tryConsumeTokens(
        resolvedIdentity,
        targetFailureCost - alreadyAppliedCost
    );
    const costApplied = alreadyAppliedCost + (consumed.ok ? consumed.cost : 0);

    if (
        resolvedIdentity.type === 'user' &&
        resolvedIdentity.keyId &&
        consumed.ok &&
        consumed.cost > 0
    ) {
        recordApiKeyUsage(resolvedIdentity.keyId, consumed.cost);
    }

    return {
        meta: {
            remain: consumed.remain,
            cost: costApplied,
            ...(consumed.retryAfter === undefined
                ? {}
                : { retryAfter: consumed.retryAfter })
        },
        costApplied
    };
}

function getQuotaExceededMessage(
    identity: ApiIdentity | null,
    retryAfter?: number
) {
    return formatRetryAfterMessage(
        retryAfter,
        identity?.type === 'anonymous' ? 'quota_anonymous' : 'quota_user'
    );
}

async function decodeRequest(
    event: H3Event,
    entry: V2AnyManifestEntry,
    rawBody: Buffer | null
): Promise<{ request: Message; bodyCodec: 'json' | 'protobuf' | null }> {
    const hasBody = rawBody !== null && rawBody.byteLength > 0;
    if (!hasBody) {
        if (entry.bodyMode === 'required') {
            const failure: V2TransportFailure = {
                statusCode: 400,
                errorCode: 'invalid_param',
                userMessage: '请求体不能为空'
            };
            throw failure;
        }
        return { request: create(entry.requestSchema, {}), bodyCodec: null };
    }

    const contentType = getHeader(event, 'content-type');
    const bodyCodec = parseRequestBodyCodec(contentType);
    if (bodyCodec === null) {
        const failure: V2TransportFailure = {
            statusCode: 415,
            errorCode: 'unsupported_media_type',
            userMessage:
                'Content-Type 必须是 application/json 或 application/x-protobuf'
        };
        throw failure;
    }

    if (entry.bodyMode === 'none') {
        const failure: V2TransportFailure = {
            statusCode: 415,
            errorCode: 'unsupported_media_type',
            userMessage: '该接口不接受请求体'
        };
        throw failure;
    }

    try {
        if (bodyCodec === 'json') {
            const text = rawBody.toString('utf8');
            const parsedValue = JSON.parse(text) as unknown;
            const normalizedValue = normalizeRequestJsonEnums(
                entry.requestSchema,
                parsedValue
            );
            const request = fromJson(
                entry.requestSchema,
                normalizedValue as never,
                {
                    ignoreUnknownFields: true
                }
            );
            validateRequestMessageEnums(entry.requestSchema, request);
            return {
                request,
                bodyCodec
            };
        }

        const request = fromBinary(
            entry.requestSchema,
            new Uint8Array(
                rawBody.buffer,
                rawBody.byteOffset,
                rawBody.byteLength
            )
        );
        validateRequestMessageEnums(entry.requestSchema, request);
        return {
            request,
            bodyCodec
        };
    } catch (error) {
        const failure: V2TransportFailure = {
            statusCode: 400,
            errorCode: 'invalid_body',
            userMessage:
                error instanceof Error
                    ? `请求体无法解码：${error.message}`
                    : '请求体无法解码'
        };
        throw failure;
    }
}

export default async function executeV2Operation(
    event: H3Event,
    operationName: V2OperationName
) {
    const entry = V2_OPERATION_MANIFEST[operationName];
    if (!entry) {
        throw new Error(`v2 operation not registered: ${operationName}`);
    }

    if (entry.cors) {
        applyApiCorsHeaders(event);
    }

    if (event.method === 'OPTIONS') {
        setResponseStatus(event, 204);
        return null;
    }

    const failures: V2TransportFailure[] = [];
    let codec: V2ResponseCodec = 'json';

    try {
        codec = negotiateResponseCodec(getHeader(event, 'accept'));
    } catch (error) {
        if (isTransportFailure(error)) {
            failures.push(error);
        } else {
            throw error;
        }
    }

    let identity: ApiIdentity | null = null;
    let resolvedIdentity: ApiIdentity | null = null;

    try {
        if (entry.authRateLimitKey) {
            ensureAuthRateLimit(event, entry.authRateLimitKey);
        }
        resolvedIdentity = resolveIdentity(event);
        assertRequiredScopes(resolvedIdentity, entry.requiredScopes);
        identity = resolvedIdentity;
    } catch (error) {
        const apiError = asApiRequestError(error);
        failures.push({
            statusCode: apiError.statusCode,
            errorCode: apiError.errorCode,
            userMessage: apiError.userMessage,
            ...(apiError.retryAfter === undefined
                ? {}
                : { retryAfter: apiError.retryAfter })
        });
    }

    let rawBody: Buffer | null = null;
    let request: Message | null = null;
    let bodyCodec: 'json' | 'protobuf' | null = null;

    try {
        if (event.method !== 'GET' && event.method !== 'HEAD') {
            rawBody = (await readRawBody(event, false)) ?? null;
        }
    } catch (error) {
        const apiError = asApiRequestError(error);
        failures.push({
            statusCode: apiError.statusCode,
            errorCode: apiError.errorCode,
            userMessage: apiError.userMessage,
            ...(apiError.retryAfter === undefined
                ? {}
                : { retryAfter: apiError.retryAfter })
        });
    }

    if (failures.length === 0) {
        try {
            const decoded = await decodeRequest(event, entry, rawBody);
            request = decoded.request;
            bodyCodec = decoded.bodyCodec;
        } catch (error) {
            if (isTransportFailure(error)) {
                failures.push(error);
            } else {
                throw error;
            }
        }
    }

    if (failures.length > 0) {
        const { meta } = applyFailureCharge(event, identity, entry, 0);
        if (failures.length > 1) {
            const first = failures[0]!;
            return renderJsonError(event, 400, first, meta);
        }

        const single = failures[0]!;
        if (single.statusCode === 406 || single.statusCode === 415) {
            return renderJsonError(event, single.statusCode, single, meta);
        }

        return renderCodecError(
            event,
            entry,
            codec,
            single.statusCode,
            single,
            meta
        );
    }

    const resolvedIdentityNonNull = resolvedIdentity!;
    const minimumRequestCost = 1;
    const shouldBypassQuota =
        entry.quotaBypassAnonymous === true &&
        resolvedIdentityNonNull.type === 'anonymous';

    let remain = getRemainTokens(resolvedIdentityNonNull);
    let costApplied = 0;

    const consumeToTargetCost = (rawTargetCost: number) => {
        if (shouldBypassQuota) {
            return {
                ok: true,
                remain,
                cost: 0
            };
        }

        const targetCost = Math.max(
            minimumRequestCost,
            Math.floor(rawTargetCost)
        );
        if (targetCost <= costApplied) {
            return {
                ok: true,
                remain,
                cost: 0
            };
        }

        return tryConsumeTokens(
            resolvedIdentityNonNull,
            targetCost - costApplied
        );
    };

    let recordedApiKeyUsage = 0;
    const recordChargedUsage = () => {
        if (
            resolvedIdentityNonNull.type !== 'user' ||
            !resolvedIdentityNonNull.keyId ||
            costApplied <= recordedApiKeyUsage
        ) {
            return;
        }

        const pendingCost = costApplied - recordedApiKeyUsage;
        recordApiKeyUsage(resolvedIdentityNonNull.keyId, pendingCost);
        recordedApiKeyUsage = costApplied;
    };

    let quotaFailure: {
        statusCode: number;
        errorCode: string;
        userMessage: string;
        retryAfter?: number;
    } | null = null;

    const fixedTarget =
        entry.cost.kind === 'fixed'
            ? getFixedCost(entry.cost.key as never)
            : entry.cost.kind === 'custom'
              ? entry.cost.fixed
              : 0;
    const fixedConsume = consumeToTargetCost(fixedTarget);
    if (!fixedConsume.ok) {
        quotaFailure = fixedConsume.impossible
            ? {
                  statusCode: 403,
                  errorCode: 'cost_exceeds_quota_limit',
                  userMessage: '当前身份额度上限不足，无法调用该接口'
              }
            : {
                  statusCode: 429,
                  errorCode: 'quota_exceeded',
                  userMessage: getQuotaExceededMessage(
                      resolvedIdentityNonNull,
                      fixedConsume.retryAfter
                  ),
                  retryAfter: fixedConsume.retryAfter
              };
    } else {
        remain = fixedConsume.remain;
        costApplied += fixedConsume.cost;
    }

    let data: unknown = null;
    let dataError: V2TransportFailure | null = null;

    if (!quotaFailure) {
        try {
            data = await entry.handler({
                event,
                identity: resolvedIdentityNonNull,
                params: (event.context.params ?? {}) as Readonly<
                    Record<string, string>
                >,
                query: getQuery(event) as Readonly<Record<string, unknown>>,
                request: request!
            });
        } catch (error) {
            if (!(error instanceof ApiRequestError)) {
                v2ExecutorLogger.error(
                    `v2 handler unexpected error operation=${operationName} error=${
                        error instanceof Error
                            ? (error.stack ?? error.message)
                            : String(error)
                    }`
                );
            }
            const apiError = asApiRequestError(error);
            dataError = {
                statusCode: apiError.statusCode,
                errorCode: apiError.errorCode,
                userMessage: apiError.userMessage,
                ...(apiError.retryAfter === undefined
                    ? {}
                    : { retryAfter: apiError.retryAfter })
            };
        }
    }

    let dynamicCost = 0;
    if (!quotaFailure && !dataError) {
        if (entry.cost.kind === 'perRecord') {
            dynamicCost = getPerRecordCost(
                entry.cost.count(data),
                entry.cost.key as never
            );
        } else if (entry.cost.kind === 'custom' && entry.cost.dynamic) {
            dynamicCost = entry.cost.dynamic(data);
        }
    }
    if (!quotaFailure && !dataError && dynamicCost > 0) {
        const dynamicConsume = consumeToTargetCost(fixedTarget + dynamicCost);
        if (!dynamicConsume.ok) {
            recordChargedUsage();
            quotaFailure = dynamicConsume.impossible
                ? {
                      statusCode: 403,
                      errorCode: 'cost_exceeds_quota_limit',
                      userMessage: '当前身份额度上限不足，无法调用该接口'
                  }
                : {
                      statusCode: 429,
                      errorCode: 'quota_exceeded',
                      userMessage: getQuotaExceededMessage(
                          resolvedIdentityNonNull,
                          dynamicConsume.retryAfter
                      ),
                      retryAfter: dynamicConsume.retryAfter
                  };
        } else {
            remain = dynamicConsume.remain;
            costApplied += dynamicConsume.cost;
        }
    }

    const meta: V2ResponseMeta = {
        remain,
        cost: costApplied,
        ...(quotaFailure?.retryAfter === undefined
            ? {}
            : { retryAfter: quotaFailure.retryAfter })
    };

    if (quotaFailure) {
        recordChargedUsage();
        return renderCodecError(
            event,
            entry,
            codec,
            quotaFailure.statusCode,
            quotaFailure,
            meta
        );
    }

    if (dataError) {
        const { meta: failureMeta, costApplied: failureCostApplied } =
            applyFailureCharge(
                event,
                resolvedIdentityNonNull,
                entry,
                costApplied
            );
        costApplied = failureCostApplied;
        recordChargedUsage();
        return renderCodecError(
            event,
            entry,
            codec,
            dataError.statusCode,
            dataError,
            failureMeta
        );
    }

    recordChargedUsage();

    if (entry.cache) {
        setCacheControl(event, entry.cache(data as never));
    }
    if (entry.cacheHeaders) {
        const headers = entry.cacheHeaders(data as never);
        setHeader(event, 'Cache-Control', headers.cacheControl);
        setHeader(event, 'CDN-Cache-Control', headers.cdnCacheControl);
    }

    if (entry.rawMedia && entry.rawMedia.isRequested(getQuery(event))) {
        const raw = entry.rawMedia.build(data as never);
        mergeVaryHeader(event, 'Accept');
        setHeader(event, 'Content-Type', raw.contentType);
        if (raw.contentDisposition.length > 0) {
            setHeader(event, 'Content-Disposition', raw.contentDisposition);
        }
        const rawMediaType = raw.contentType
            .split(';', 1)[0]!
            .trim()
            .replace('/', '-');
        setHeader(
            event,
            'ETag',
            computeETag(`raw-${rawMediaType}`, raw.content)
        );
        setCommonHeaders(event, meta);
        setResponseStatus(event, entry.successStatusCode ?? 200);

        if (isV2HeadRequest(event)) {
            return null;
        }

        return raw.content;
    }

    let plainData = data as Record<string, unknown>;
    if (entry.mappings?.emuCode) {
        const emuMappings = resolveEmuCodeMappings(
            entry.mappings.emuCode(data as never)
        );
        if (emuMappings !== undefined) {
            plainData = { ...plainData, emuCodeMappings: emuMappings };
        }
    }
    if (entry.mappings?.timetable) {
        const timetableMappings = resolveTimetableMappings(
            entry.mappings.timetable(data as never)
        );
        if (timetableMappings !== undefined) {
            plainData = { ...plainData, timetableMappings };
        }
    }

    let dataMessage: Message;
    try {
        const normalizedData = normalizeRequestJsonEnums(
            entry.dataSchema,
            plainData as never
        );
        dataMessage = create(entry.dataSchema, normalizedData as never);
    } catch (error) {
        console.error(
            `v2 response encoding failed operation=${operationName} phase=data`,
            error
        );
        const failure: V2TransportFailure = {
            statusCode: 500,
            errorCode: 'internal_error',
            userMessage: '服务器无法编码响应'
        };
        return renderCodecError(event, entry, codec, 500, failure, meta);
    }
    setCommonHeaders(event, meta);
    mergeVaryHeader(event, 'Accept');
    setResponseStatus(event, entry.successStatusCode ?? 200);

    if (codec === 'protobuf') {
        let body: Uint8Array;
        try {
            const responseMessage = create(entry.responseSchema, {
                outcome: {
                    case: 'data',
                    value: dataMessage
                },
                meta: {
                    remain: meta.remain,
                    cost: meta.cost,
                    ...(meta.retryAfter === undefined
                        ? {}
                        : { retryAfter: meta.retryAfter })
                }
            });
            body = toBinary(entry.responseSchema, responseMessage);
        } catch (error) {
            console.error(
                `v2 response encoding failed operation=${operationName} phase=protobuf`,
                error
            );
            const failure: V2TransportFailure = {
                statusCode: 500,
                errorCode: 'internal_error',
                userMessage: '服务器无法编码响应'
            };
            return renderCodecError(event, entry, codec, 500, failure, meta);
        }
        setHeader(event, 'Content-Type', 'application/x-protobuf');
        setHeader(event, 'ETag', computeETag('proto', body));

        if (isV2HeadRequest(event)) {
            return null;
        }

        return body;
    }

    const dataJson = entry.jsonData
        ? entry.jsonData(plainData)
        : encodeMessageToJson(entry.dataSchema as never, dataMessage as never);
    const body = JSON.stringify({
        ok: true,
        data: dataJson,
        error: ''
    });
    setHeader(event, 'Content-Type', 'application/json; charset=utf-8');
    setHeader(event, 'ETag', computeETag('json', body));

    if (isV2HeadRequest(event)) {
        return null;
    }

    return body;
}
