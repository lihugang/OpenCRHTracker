import {
    deleteOauthClient,
    getOauthAuthorizeContext,
    getOauthClient,
    getOauthClients,
    patchOauthClient,
    postOauthClients
} from '~/server/domain/oauth';
import {
    parseAuthorizeRequest,
    resolveAuthorizeSession
} from '~/server/utils/oauth/authorizeRequest';
import { setOauthContinuationCookie } from '~/server/utils/oauth/continuationCookie';
import ensure from '~/server/utils/api/executor/ensure';
import type { V2OperationContext } from '~/server/utils/api/v2/V2Types';

function toOauthClientInput(request: {
    name?: string;
    description?: string;
    homepageUrl?: string;
    redirectUris?: string[];
    requestedScopes?: string[];
}) {
    ensure(
        typeof request.name === 'string' && request.name.trim().length > 0,
        400,
        'invalid_param',
        'name 不能为空'
    );
    ensure(
        Array.isArray(request.redirectUris) && request.redirectUris.length > 0,
        400,
        'invalid_param',
        'redirectUris 不能为空'
    );
    ensure(
        Array.isArray(request.requestedScopes),
        400,
        'invalid_param',
        'requestedScopes 必须为数组'
    );

    return {
        name: request.name!.trim(),
        description:
            typeof request.description === 'string' &&
            request.description.trim().length > 0
                ? request.description.trim()
                : null,
        homepageUrl:
            typeof request.homepageUrl === 'string' &&
            request.homepageUrl.trim().length > 0
                ? request.homepageUrl.trim()
                : null,
        redirectUris: request.redirectUris!.map((item) =>
            String(item ?? '').trim()
        ),
        requestedScopes: request.requestedScopes!.map((item) =>
            String(item ?? '').trim()
        )
    };
}

export async function getOauthAuthorizeContextV2Adapter(
    ctx: V2OperationContext
) {
    const response = getOauthAuthorizeContext(
        parseAuthorizeRequest(ctx.event),
        resolveAuthorizeSession(ctx.event)
    );
    if (response.mode === 'redirect' && response.continuationId) {
        setOauthContinuationCookie(ctx.event, response.continuationId);
    }

    if (response.mode === 'redirect') {
        return {
            result: {
                case: 'redirect',
                value: {
                    location: response.location
                }
            }
        };
    }
    if (response.mode === 'error') {
        return {
            result: {
                case: 'invalidRequest',
                value: {
                    error: response.error,
                    reason: response.reason,
                    message: response.message
                }
            }
        };
    }

    return {
        result: {
            case: 'consent',
            value: {
                client: response.client,
                request: {
                    responseType: response.request.responseType,
                    clientId: response.request.clientId,
                    redirectUri: response.request.redirectUri,
                    scope: response.request.scope,
                    state: response.request.state,
                    codeChallenge: response.request.codeChallenge,
                    codeChallengeMethod: response.request.codeChallengeMethod,
                    nonce: response.request.nonce
                },
                session: response.session,
                scopes: response.scopes,
                hasPendingScopes: response.hasPendingScopes,
                requiresOwnerBypass: response.requiresOwnerBypass
            }
        }
    };
}

export async function getOauthClientsV2Adapter(ctx: V2OperationContext) {
    return getOauthClients(ctx.identity.id);
}

export async function postOauthClientsV2Adapter(ctx: V2OperationContext) {
    const request = ctx.request as {
        name?: string;
        description?: string;
        homepageUrl?: string;
        redirectUris?: string[];
        requestedScopes?: string[];
    };
    return postOauthClients(
        ctx.identity.id,
        toOauthClientInput({
            name: request.name ?? '',
            description: request.description ?? '',
            homepageUrl: request.homepageUrl ?? '',
            redirectUris: request.redirectUris ?? [],
            requestedScopes: request.requestedScopes ?? []
        })
    );
}

export async function getOauthClientV2Adapter(ctx: V2OperationContext) {
    return getOauthClient(ctx.identity.id, ctx.params.clientId ?? '');
}

export async function patchOauthClientV2Adapter(ctx: V2OperationContext) {
    const request = ctx.request as {
        name?: string;
        description?: string;
        homepageUrl?: string;
        redirectUris?: string[];
        requestedScopes?: string[];
    };
    return patchOauthClient(
        ctx.identity.id,
        ctx.params.clientId ?? '',
        toOauthClientInput({
            name: request.name ?? '',
            description: request.description ?? '',
            homepageUrl: request.homepageUrl ?? '',
            redirectUris: request.redirectUris ?? [],
            requestedScopes: request.requestedScopes ?? []
        })
    );
}

export async function deleteOauthClientV2Adapter(ctx: V2OperationContext) {
    return deleteOauthClient(ctx.identity.id, ctx.params.clientId ?? '');
}
