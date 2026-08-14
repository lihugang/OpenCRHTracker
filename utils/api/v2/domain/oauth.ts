import type {
    DeleteOauthClientData,
    GetOauthAuthorizeContextData,
    GetOauthClientsData,
    OAuthClientPublicItem as OAuthClientPublicItemMessage,
    PatchOauthClientData,
    PostOauthClientsData
} from '#shared/generated/proto/opencrh/v2/oauth_pb';
import {
    DeleteOauthClient,
    GetOauthAuthorizeContext,
    GetOauthClients,
    PatchOauthClient,
    PostOauthClients
} from '#shared/api/v2/registry/oauth';
import type {
    OAuthAuthorizeInvalidReason,
    OAuthAuthorizeContextResponse,
    OAuthClientListResponse,
    OAuthClientMutationResponse,
    OAuthClientPublicItem,
    OAuthClientScopeRequestItem,
    OAuthClientStatus,
    OAuthClientUpdateInput
} from '~/types/auth';
import { protoInt64ToNumber } from '~/utils/api/v2/mappers/numbers';
import { requestV2, type V2RequestInput } from '~/utils/api/v2/transport';
import { requireSuccess } from '~/utils/api/v2/domain/common';

function mapClientStatus(value: number): OAuthClientStatus {
    return value === 1 ? 'active' : 'disabled';
}

function mapScopeReviewStatus(
    value: number
): OAuthClientScopeRequestItem['reviewStatus'] {
    switch (value) {
        case 1:
            return 'pending';
        case 2:
            return 'approved';
        case 3:
            return 'rejected';
        default:
            return 'pending';
    }
}

function mapOAuthClient(
    item: OAuthClientPublicItemMessage
): OAuthClientPublicItem {
    return {
        clientId: item.clientId,
        ownerUserId: item.ownerUserId,
        name: item.name,
        description: item.description ?? null,
        homepageUrl: item.homepageUrl ?? null,
        status: mapClientStatus(item.status),
        isTrusted: item.isTrusted,
        createdAt: protoInt64ToNumber(item.createdAt) ?? 0,
        updatedAt: protoInt64ToNumber(item.updatedAt) ?? 0,
        redirectUris: item.redirectUris.map((uri) => ({
            value: uri.value
        })),
        scopeRequests: item.scopeRequests.map((scope) => ({
            scope: scope.scope,
            reviewStatus: mapScopeReviewStatus(scope.reviewStatus),
            reviewedBy: scope.reviewedBy ?? null,
            reviewedAt: protoInt64ToNumber(scope.reviewedAt)
        })),
        adminGrants: {
            notificationSend: item.adminGrants!.notificationSend,
            notificationSendUpdatedBy:
                item.adminGrants!.notificationSendUpdatedBy ?? null,
            notificationSendUpdatedAt: protoInt64ToNumber(
                item.adminGrants!.notificationSendUpdatedAt
            )
        }
    };
}

function mapClientList(data: GetOauthClientsData): OAuthClientListResponse {
    return {
        items: data.items.map(mapOAuthClient),
        allowedScopes: data.allowedScopes
    };
}

function mapClientMutation(
    data: PostOauthClientsData | PatchOauthClientData
): OAuthClientMutationResponse {
    return {
        client: mapOAuthClient(data.client!)
    };
}

function mapAuthorizeContext(
    data: GetOauthAuthorizeContextData
): OAuthAuthorizeContextResponse {
    const result = data.result;
    if (result.case === 'redirect') {
        return {
            mode: 'redirect',
            location: result.value.location
        };
    }
    if (result.case === 'invalidRequest') {
        return {
            mode: 'error',
            error: 'invalid_request',
            reason: result.value.reason as OAuthAuthorizeInvalidReason,
            message: result.value.message
        };
    }
    if (result.case === 'consent') {
        const consent = result.value;
        const client = consent.client!;
        const request = consent.request!;
        const session = consent.session!;
        return {
            mode: 'consent',
            client: {
                clientId: client.clientId,
                name: client.name,
                description: client.description ?? null,
                homepageUrl: client.homepageUrl ?? null,
                ownerUserId: client.ownerUserId,
                isTrusted: client.isTrusted
            },
            request: {
                responseType: request.responseType,
                clientId: request.clientId,
                redirectUri: request.redirectUri,
                scope: request.scope,
                state: request.state,
                codeChallenge: request.codeChallenge,
                codeChallengeMethod: request.codeChallengeMethod as 'S256',
                nonce: request.nonce
            },
            session: {
                userId: session.userId,
                activeFrom: protoInt64ToNumber(session.activeFrom) ?? 0
            },
            scopes: consent.scopes,
            hasPendingScopes: consent.hasPendingScopes,
            requiresOwnerBypass: consent.requiresOwnerBypass
        };
    }
    throw new Error('invalid_oauth_authorize_context');
}

export async function fetchOauthClients(
    input: V2RequestInput = {},
    signal?: AbortSignal
) {
    const result = await requestV2<
        GetOauthClientsData,
        OAuthClientListResponse
    >(GetOauthClients, input, mapClientList, {
        signal,
        retry: 0
    });
    return requireSuccess(GetOauthClients, result);
}

export async function createOauthClient(input: {
    name: string;
    description: string | null;
    homepageUrl: string | null;
    redirectUris: string[];
    requestedScopes: string[];
}) {
    const result = await requestV2<
        PostOauthClientsData,
        OAuthClientMutationResponse
    >(
        PostOauthClients,
        {
            body: {
                name: input.name,
                ...(input.description === null
                    ? {}
                    : { description: input.description }),
                ...(input.homepageUrl === null
                    ? {}
                    : { homepageUrl: input.homepageUrl }),
                redirectUris: input.redirectUris,
                requestedScopes: input.requestedScopes
            }
        },
        mapClientMutation
    );
    return requireSuccess(PostOauthClients, result);
}

export async function updateOauthClient(
    clientId: string,
    input: OAuthClientUpdateInput
) {
    const result = await requestV2<
        PatchOauthClientData,
        OAuthClientMutationResponse
    >(
        PatchOauthClient,
        {
            body: {
                clientId,
                name: input.name,
                ...(input.description === null
                    ? {}
                    : { description: input.description }),
                ...(input.homepageUrl === null
                    ? {}
                    : { homepageUrl: input.homepageUrl }),
                redirectUris: input.redirectUris,
                requestedScopes: input.requestedScopes,
                ...(input.status === undefined
                    ? {}
                    : { status: input.status === 'active' ? 1 : 2 }),
                ...(input.isTrusted === undefined
                    ? {}
                    : { isTrusted: input.isTrusted })
            }
        },
        mapClientMutation
    );
    return requireSuccess(PatchOauthClient, result);
}

export async function deleteOauthClient(clientId: string) {
    const result = await requestV2<
        DeleteOauthClientData,
        { deleted: boolean; clientId: string }
    >(DeleteOauthClient, { params: { clientId } }, (data) => ({
        deleted: data.deleted,
        clientId: data.clientId
    }));
    return requireSuccess(DeleteOauthClient, result);
}

export async function fetchOauthAuthorizeContext(
    query: Record<string, string | number | undefined>,
    signal?: AbortSignal
) {
    const result = await requestV2<
        GetOauthAuthorizeContextData,
        OAuthAuthorizeContextResponse
    >(GetOauthAuthorizeContext, { query }, mapAuthorizeContext, {
        signal,
        retry: 0
    });
    return requireSuccess(GetOauthAuthorizeContext, result);
}
