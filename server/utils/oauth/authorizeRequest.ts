import { getQuery, type H3Event } from 'h3';
import type {
    OAuthAuthorizeContextResponse,
    OAuthAuthorizeRequest
} from '~/types/auth';
import {
    authorizeValidatedRequestForUser,
    canUserAuthorizeScopes,
    createAuthorizationCode,
    createOauthLoginContinuation,
    grantOauthConsents,
    needsConsent,
    validateAuthorizeRequest
} from '~/server/services/oauthStore';
import { getValidApiKey, isUserBanned } from '~/server/services/authStore';
import {
    clearAuthCookie,
    readAuthCookie
} from '~/server/utils/auth/authCookie';
import { setOauthContinuationCookie } from '~/server/utils/oauth/continuationCookie';

export interface OAuthAuthorizeDecisionInput {
    decision: string;
    request: OAuthAuthorizeRequest;
}

export type OAuthAuthorizeDecisionResult =
    | {
          type: 'success';
          location: string;
          recordRateLimitHit: boolean;
      }
    | {
          type: 'error';
          statusCode: number;
          statusMessage: string;
      };

function parseScopeValue(scope: unknown) {
    return typeof scope === 'string' ? scope.split(/\s+/).filter(Boolean) : [];
}

export function parseAuthorizeRequest(event: H3Event): OAuthAuthorizeRequest {
    const query = getQuery(event);

    return {
        responseType:
            typeof query.response_type === 'string' ? query.response_type : '',
        clientId: typeof query.client_id === 'string' ? query.client_id : '',
        redirectUri:
            typeof query.redirect_uri === 'string' ? query.redirect_uri : '',
        scope: parseScopeValue(query.scope),
        state: typeof query.state === 'string' ? query.state : '',
        codeChallenge:
            typeof query.code_challenge === 'string'
                ? query.code_challenge
                : '',
        codeChallengeMethod:
            query.code_challenge_method === 'S256' ? 'S256' : ('S256' as const),
        nonce: typeof query.nonce === 'string' ? query.nonce : ''
    };
}

export function parseAuthorizeRequestBody(
    body: Record<string, string> | null | undefined
): OAuthAuthorizeRequest {
    return {
        responseType: body?.response_type ?? '',
        clientId: body?.client_id ?? '',
        redirectUri: body?.redirect_uri ?? '',
        scope: parseScopeValue(body?.scope),
        state: body?.state ?? '',
        codeChallenge: body?.code_challenge ?? '',
        codeChallengeMethod:
            body?.code_challenge_method === 'S256' ? 'S256' : 'S256',
        nonce: body?.nonce ?? ''
    };
}

export function buildRedirectUrl(
    redirectUri: string,
    values: Record<string, string>
) {
    const url = new URL(redirectUri);
    for (const [key, value] of Object.entries(values)) {
        url.searchParams.set(key, value);
    }
    return url.toString();
}

function canSessionAuthorizeRequest(
    session: NonNullable<ReturnType<typeof getValidApiKey>>,
    request: ReturnType<typeof validateAuthorizeRequest>
) {
    if (!request.ok) {
        return null;
    }

    if (!canUserAuthorizeScopes(session.scopes, request.data.requestedScopes)) {
        return null;
    }

    return authorizeValidatedRequestForUser(request.data, session.userId);
}

function resolveAuthorizeSession(event: H3Event) {
    const authCookie = readAuthCookie(event);
    const session = authCookie ? getValidApiKey(authCookie) : undefined;
    if (session && isUserBanned(session.userId)) {
        clearAuthCookie(event);
        return undefined;
    }

    return session;
}

export function getAuthorizeContext(
    event: H3Event,
    authorizeRequest: OAuthAuthorizeRequest
): OAuthAuthorizeContextResponse {
    const validated = validateAuthorizeRequest(authorizeRequest);
    if (!validated.ok) {
        return {
            mode: 'error',
            error: 'invalid_request',
            reason: validated.error.reason,
            message: validated.error.message
        };
    }

    const session = resolveAuthorizeSession(event);
    if (!session) {
        const continuationId = createOauthLoginContinuation({
            authorizeRequest
        });
        setOauthContinuationCookie(event, continuationId);

        return {
            mode: 'redirect',
            location: '/login?oauth=1'
        };
    }

    const authorized = canSessionAuthorizeRequest(session, validated);
    if (!authorized) {
        return {
            mode: 'redirect',
            location: buildRedirectUrl(authorizeRequest.redirectUri, {
                error: 'access_denied',
                state: authorizeRequest.state
            })
        };
    }

    if (
        !needsConsent(
            session.userId,
            authorized.client,
            authorized.requestedScopes
        )
    ) {
        const code = createAuthorizationCode({
            clientId: authorized.client.clientId,
            userId: session.userId,
            redirectUri: authorizeRequest.redirectUri,
            approvedScopes: authorized.requestedScopes,
            codeChallenge: authorizeRequest.codeChallenge,
            codeChallengeMethod: authorizeRequest.codeChallengeMethod,
            nonce: authorizeRequest.nonce,
            authTime: session.activeFrom
        });

        return {
            mode: 'redirect',
            location: buildRedirectUrl(authorizeRequest.redirectUri, {
                code,
                state: authorizeRequest.state
            })
        };
    }

    return {
        mode: 'consent',
        client: {
            clientId: authorized.client.clientId,
            name: authorized.client.name,
            description: authorized.client.description,
            homepageUrl: authorized.client.homepageUrl,
            ownerUserId: authorized.client.ownerUserId,
            isTrusted: authorized.client.isTrusted
        },
        request: {
            responseType: authorizeRequest.responseType,
            clientId: authorizeRequest.clientId,
            redirectUri: authorizeRequest.redirectUri,
            scope: authorized.requestedScopes,
            state: authorizeRequest.state,
            codeChallenge: authorizeRequest.codeChallenge,
            codeChallengeMethod: authorizeRequest.codeChallengeMethod,
            nonce: authorizeRequest.nonce
        },
        session: {
            userId: session.userId,
            activeFrom: session.activeFrom
        },
        scopes: authorized.requestedScopes,
        hasPendingScopes: authorized.hasPendingScopes,
        requiresOwnerBypass: authorized.requiresOwnerBypass
    };
}

export function applyAuthorizeDecision(
    event: H3Event,
    input: OAuthAuthorizeDecisionInput
): OAuthAuthorizeDecisionResult {
    const validated = validateAuthorizeRequest(input.request);
    if (!validated.ok) {
        return {
            type: 'success',
            recordRateLimitHit: true,
            location: buildRedirectUrl(input.request.redirectUri, {
                error: 'invalid_request',
                state: input.request.state
            })
        };
    }

    const session = resolveAuthorizeSession(event);
    if (!session) {
        return {
            type: 'success',
            recordRateLimitHit: true,
            location: '/login'
        };
    }

    const authorized = canSessionAuthorizeRequest(session, validated);
    if (!authorized) {
        return {
            type: 'success',
            recordRateLimitHit: true,
            location: buildRedirectUrl(input.request.redirectUri, {
                error: 'access_denied',
                state: input.request.state
            })
        };
    }

    if (input.decision !== 'approve') {
        return {
            type: 'success',
            recordRateLimitHit: true,
            location: buildRedirectUrl(input.request.redirectUri, {
                error: 'access_denied',
                state: input.request.state
            })
        };
    }

    grantOauthConsents(
        session.userId,
        authorized.client.clientId,
        authorized.requestedScopes
    );
    const code = createAuthorizationCode({
        clientId: authorized.client.clientId,
        userId: session.userId,
        redirectUri: input.request.redirectUri,
        approvedScopes: authorized.requestedScopes,
        codeChallenge: input.request.codeChallenge,
        codeChallengeMethod: input.request.codeChallengeMethod,
        nonce: input.request.nonce,
        authTime: session.activeFrom
    });

    return {
        type: 'success',
        recordRateLimitHit: false,
        location: buildRedirectUrl(input.request.redirectUri, {
            code,
            state: input.request.state
        })
    };
}
