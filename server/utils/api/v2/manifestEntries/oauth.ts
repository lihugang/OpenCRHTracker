import { defineV2Operation } from '~/server/utils/api/v2/V2Types';
import {
    DeleteOauthClientRequestSchema,
    DeleteOauthClientDataSchema,
    DeleteOauthClientResponseSchema,
    GetOauthAuthorizeContextRequestSchema,
    GetOauthAuthorizeContextDataSchema,
    GetOauthAuthorizeContextResponseSchema,
    GetOauthClientRequestSchema,
    GetOauthClientDataSchema,
    GetOauthClientResponseSchema,
    GetOauthClientsRequestSchema,
    GetOauthClientsDataSchema,
    GetOauthClientsResponseSchema,
    PatchOauthClientRequestSchema,
    PatchOauthClientDataSchema,
    PatchOauthClientResponseSchema,
    PostOauthClientsRequestSchema,
    PostOauthClientsDataSchema,
    PostOauthClientsResponseSchema
} from '~/server/generated/proto/opencrh/v2/oauth_pb';
import {
    deleteOauthClientV2Adapter,
    getOauthAuthorizeContextV2Adapter,
    getOauthClientV2Adapter,
    getOauthClientsV2Adapter,
    patchOauthClientV2Adapter,
    postOauthClientsV2Adapter
} from '~/server/utils/api/v2/adapters/oauth';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export const OAUTH_MANIFEST_ENTRIES = {
    GetOauthAuthorizeContext: defineV2Operation({
        operationName: 'GetOauthAuthorizeContext',
        method: 'GET',
        pathTemplate: '/api/v2/oauth/authorize/context',
        requestSchema: GetOauthAuthorizeContextRequestSchema,
        dataSchema: GetOauthAuthorizeContextDataSchema,
        responseSchema: GetOauthAuthorizeContextResponseSchema,
        requiredScopes: [],
        cors: false,
        cost: { kind: 'none' },
        bodyMode: 'none',
        authRateLimitKey: 'oauthAuthorize',
        handler: getOauthAuthorizeContextV2Adapter
    }),
    GetOauthClients: defineV2Operation({
        operationName: 'GetOauthClients',
        method: 'GET',
        pathTemplate: '/api/v2/oauth/clients',
        requestSchema: GetOauthClientsRequestSchema,
        dataSchema: GetOauthClientsDataSchema,
        responseSchema: GetOauthClientsResponseSchema,
        requiredScopes: ['api.auth.api-keys.read'],
        cors: false,
        cost: { kind: 'none' },
        bodyMode: 'none',
        handler: getOauthClientsV2Adapter
    }),
    PostOauthClients: defineV2Operation({
        operationName: 'PostOauthClients',
        method: 'POST',
        pathTemplate: '/api/v2/oauth/clients',
        requestSchema: PostOauthClientsRequestSchema,
        dataSchema: PostOauthClientsDataSchema,
        responseSchema: PostOauthClientsResponseSchema,
        requiredScopes: [API_SCOPES.auth.oauthClients.write],
        cors: false,
        cost: { kind: 'fixed', key: 'authCreateOauthClient' },
        bodyMode: 'optional',
        handler: postOauthClientsV2Adapter
    }),
    GetOauthClient: defineV2Operation({
        operationName: 'GetOauthClient',
        method: 'GET',
        pathTemplate: '/api/v2/oauth/clients/:clientId',
        requestSchema: GetOauthClientRequestSchema,
        dataSchema: GetOauthClientDataSchema,
        responseSchema: GetOauthClientResponseSchema,
        requiredScopes: ['api.auth.api-keys.read'],
        cors: false,
        cost: { kind: 'none' },
        bodyMode: 'none',
        handler: getOauthClientV2Adapter
    }),
    PatchOauthClient: defineV2Operation({
        operationName: 'PatchOauthClient',
        method: 'PATCH',
        pathTemplate: '/api/v2/oauth/clients/:clientId',
        requestSchema: PatchOauthClientRequestSchema,
        dataSchema: PatchOauthClientDataSchema,
        responseSchema: PatchOauthClientResponseSchema,
        requiredScopes: [API_SCOPES.auth.oauthClients.write],
        cors: false,
        cost: { kind: 'none' },
        bodyMode: 'optional',
        handler: patchOauthClientV2Adapter
    }),
    DeleteOauthClient: defineV2Operation({
        operationName: 'DeleteOauthClient',
        method: 'DELETE',
        pathTemplate: '/api/v2/oauth/clients/:clientId',
        requestSchema: DeleteOauthClientRequestSchema,
        dataSchema: DeleteOauthClientDataSchema,
        responseSchema: DeleteOauthClientResponseSchema,
        requiredScopes: [API_SCOPES.auth.oauthClients.delete],
        cors: false,
        cost: { kind: 'fixed', key: 'authDeleteOauthClient' },
        bodyMode: 'none',
        handler: deleteOauthClientV2Adapter
    })
} as const;
