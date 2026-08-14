import { defineV2Operation } from '~/server/utils/api/v2/V2Types';
import {
    GetHealthRequestSchema,
    GetHealthDataSchema,
    GetHealthResponseSchema,
    GetDebugEchoErrorRequestSchema,
    GetDebugEchoErrorDataSchema,
    GetDebugEchoErrorResponseSchema,
    GetExposedConfigRequestSchema,
    GetExposedConfigDataSchema,
    GetExposedConfigResponseSchema
} from '#shared/generated/proto/opencrh/v2/system_pb';
import {
    getDebugEchoErrorV2Adapter,
    getExposedConfigV2Adapter,
    getHealthV2Adapter
} from '~/server/utils/api/v2/adapters/system';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import useConfig from '~/server/config';

export const SYSTEM_MANIFEST_ENTRIES = {
    GetHealth: defineV2Operation({
        operationName: 'GetHealth',
        method: 'GET',
        pathTemplate: '/api/v2/health',
        requestSchema: GetHealthRequestSchema,
        dataSchema: GetHealthDataSchema,
        responseSchema: GetHealthResponseSchema,
        requiredScopes: [],
        cors: true,
        cost: { kind: 'fixed', key: 'health' },
        bodyMode: 'none',
        handler: getHealthV2Adapter
    }),
    GetDebugEchoError: defineV2Operation({
        operationName: 'GetDebugEchoError',
        method: 'GET',
        pathTemplate: '/api/v2/debug/echo-error',
        requestSchema: GetDebugEchoErrorRequestSchema,
        dataSchema: GetDebugEchoErrorDataSchema,
        responseSchema: GetDebugEchoErrorResponseSchema,
        requiredScopes: [API_SCOPES.debug.echoError],
        cors: false,
        cost: { kind: 'fixed', key: 'debugEchoError' },
        bodyMode: 'none',
        handler: getDebugEchoErrorV2Adapter
    }),
    GetExposedConfig: defineV2Operation({
        operationName: 'GetExposedConfig',
        method: 'GET',
        pathTemplate: '/api/v2/exposed-config',
        requestSchema: GetExposedConfigRequestSchema,
        dataSchema: GetExposedConfigDataSchema,
        responseSchema: GetExposedConfigResponseSchema,
        requiredScopes: [API_SCOPES.config.read],
        cors: true,
        cost: { kind: 'none' },
        cache: () => useConfig().api.cache.currentDayMaxAgeSeconds,
        bodyMode: 'none',
        handler: getExposedConfigV2Adapter
    })
} as const;
