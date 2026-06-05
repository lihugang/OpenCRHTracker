import {
    defineEventHandler,
    getQuery,
    readBody,
    sendRedirect,
    setHeader
} from 'h3';
import {
    authorizeValidatedRequestForUser,
    canUserAuthorizeScopes,
    createAuthorizationCode,
    createOauthLoginContinuation,
    grantOauthConsents,
    needsConsent,
    validateAuthorizeRequest,
    type OAuthAuthorizeRequest
} from '~/server/services/oauthStore';
import { readAuthCookie } from '~/server/utils/auth/authCookie';
import { getValidApiKey } from '~/server/services/authStore';
import {
    setOauthContinuationCookie
} from '~/server/utils/oauth/continuationCookie';

function parseAuthorizeRequest(event: Parameters<typeof defineEventHandler>[0] extends never ? never : any): OAuthAuthorizeRequest {
    const query = getQuery(event);
    const scope =
        typeof query.scope === 'string' ? query.scope.split(/\s+/).filter(Boolean) : [];

    return {
        responseType:
            typeof query.response_type === 'string' ? query.response_type : '',
        clientId: typeof query.client_id === 'string' ? query.client_id : '',
        redirectUri:
            typeof query.redirect_uri === 'string' ? query.redirect_uri : '',
        scope,
        state: typeof query.state === 'string' ? query.state : '',
        codeChallenge:
            typeof query.code_challenge === 'string' ? query.code_challenge : '',
        codeChallengeMethod:
            query.code_challenge_method === 'S256' ? 'S256' : ('S256' as const),
        nonce: typeof query.nonce === 'string' ? query.nonce : ''
    };
}

function buildRedirectUrl(
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
    if (!request) {
        return null;
    }

    if (!canUserAuthorizeScopes(session.scopes, request.requestedScopes)) {
        return null;
    }

    return authorizeValidatedRequestForUser(request, session.userId);
}

function renderConsentPage(input: {
    clientName: string;
    ownerUserId: string;
    redirectUri: string;
    state: string;
    hiddenFields: Record<string, string>;
    scopes: string[];
}) {
    const hiddenInputs = Object.entries(input.hiddenFields)
        .map(
            ([key, value]) =>
                `<input type="hidden" name="${key}" value="${value.replaceAll('"', '&quot;')}" />`
        )
        .join('');
    const scopeItems = input.scopes
        .map((scope) => `<li>${scope}</li>`)
        .join('');

    return `<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OAuth 授权确认</title>
    <style>
        body { font-family: sans-serif; background: #f5f8fb; color: #0f172a; margin: 0; padding: 32px 16px; }
        .card { max-width: 720px; margin: 0 auto; background: #fff; border: 1px solid #dbe4ee; border-radius: 18px; padding: 24px; box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08); }
        h1 { margin: 0 0 12px; font-size: 28px; }
        p { line-height: 1.7; }
        ul { line-height: 1.8; }
        .actions { display: flex; gap: 12px; margin-top: 24px; flex-wrap: wrap; }
        button { border: 0; border-radius: 999px; padding: 12px 18px; font-size: 14px; cursor: pointer; }
        .primary { background: #00529b; color: white; }
        .secondary { background: #eef2f7; color: #0f172a; }
        .meta { color: #475569; font-size: 14px; }
    </style>
</head>
<body>
    <div class="card">
        <p class="meta">OAuth Authorize</p>
        <h1>授权 ${input.clientName}</h1>
        <p>开发者：${input.ownerUserId}</p>
        <p>回调地址：${input.redirectUri}</p>
        <p>该应用正在申请以下权限：</p>
        <ul>${scopeItems}</ul>
        <div class="actions">
            <form method="post">
                ${hiddenInputs}
                <input type="hidden" name="decision" value="approve" />
                <button class="primary" type="submit">允许授权</button>
            </form>
            <form method="post">
                ${hiddenInputs}
                <input type="hidden" name="decision" value="deny" />
                <button class="secondary" type="submit">拒绝</button>
            </form>
        </div>
    </div>
</body>
</html>`;
}

export default defineEventHandler(async (event) => {
    if (event.method === 'POST') {
        const body = await readBody<Record<string, string> | null>(event);
        const decision = body?.decision;
        const authCookie = readAuthCookie(event);
        const session = authCookie ? getValidApiKey(authCookie) : undefined;
        const request: OAuthAuthorizeRequest = {
            responseType: body?.response_type ?? '',
            clientId: body?.client_id ?? '',
            redirectUri: body?.redirect_uri ?? '',
            scope: typeof body?.scope === 'string' ? body.scope.split(/\s+/).filter(Boolean) : [],
            state: body?.state ?? '',
            codeChallenge: body?.code_challenge ?? '',
            codeChallengeMethod: body?.code_challenge_method === 'S256' ? 'S256' : 'S256',
            nonce: body?.nonce ?? ''
        };
        const validated = validateAuthorizeRequest(request);
        if (!validated) {
            return sendRedirect(
                event,
                buildRedirectUrl(request.redirectUri, {
                    error: 'invalid_request',
                    state: request.state
                })
            );
        }

        if (!session) {
            return sendRedirect(event, '/login');
        }

        const authorized = canSessionAuthorizeRequest(session, validated);
        if (!authorized) {
            return sendRedirect(
                event,
                buildRedirectUrl(request.redirectUri, {
                    error: 'access_denied',
                    state: request.state
                })
            );
        }

        if (decision !== 'approve') {
            return sendRedirect(
                event,
                buildRedirectUrl(request.redirectUri, {
                    error: 'access_denied',
                    state: request.state
                })
            );
        }

        grantOauthConsents(
            session.userId,
            authorized.client.clientId,
            authorized.requestedScopes
        );
        const code = createAuthorizationCode({
            clientId: authorized.client.clientId,
            userId: session.userId,
            redirectUri: request.redirectUri,
            approvedScopes: authorized.requestedScopes,
            codeChallenge: request.codeChallenge,
            codeChallengeMethod: request.codeChallengeMethod,
            nonce: request.nonce,
            authTime: Number(body?.auth_time ?? 0)
        });

        return sendRedirect(
            event,
            buildRedirectUrl(request.redirectUri, {
                code,
                state: request.state
            })
        );
    }

    const authorizeRequest = parseAuthorizeRequest(event);
    const validated = validateAuthorizeRequest(authorizeRequest);
    if (!validated) {
        return {
            error: 'invalid_request'
        };
    }

    const authCookie = readAuthCookie(event);
    const session = authCookie ? getValidApiKey(authCookie) : undefined;
    if (!session) {
        const continuationId = createOauthLoginContinuation({
            authorizeRequest
        });
        setOauthContinuationCookie(event, continuationId);
        return sendRedirect(event, '/login');
    }

    const authorized = canSessionAuthorizeRequest(session, validated);
    if (!authorized) {
        return sendRedirect(
            event,
            buildRedirectUrl(authorizeRequest.redirectUri, {
                error: 'access_denied',
                state: authorizeRequest.state
            })
        );
    }

    if (!needsConsent(session.userId, authorized.client, authorized.requestedScopes)) {
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

        return sendRedirect(
            event,
            buildRedirectUrl(authorizeRequest.redirectUri, {
                code,
                state: authorizeRequest.state
            })
        );
    }

    setHeader(event, 'content-type', 'text/html; charset=UTF-8');
    return renderConsentPage({
        clientName: authorized.client.name,
        ownerUserId: authorized.client.ownerUserId,
        redirectUri: authorizeRequest.redirectUri,
        state: authorizeRequest.state,
        scopes: authorized.requestedScopes,
        hiddenFields: {
            response_type: authorizeRequest.responseType,
            client_id: authorizeRequest.clientId,
            redirect_uri: authorizeRequest.redirectUri,
            scope: authorized.requestedScopes.join(' '),
            state: authorizeRequest.state,
            code_challenge: authorizeRequest.codeChallenge,
            code_challenge_method: authorizeRequest.codeChallengeMethod,
            nonce: authorizeRequest.nonce,
            auth_time: String(session.activeFrom)
        }
    });
});
