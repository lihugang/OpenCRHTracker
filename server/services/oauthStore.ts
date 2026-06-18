import crypto from 'crypto';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import { useUsersDatabase } from '~/server/libs/database/users';
import {
    createApiKey,
    getUserByUsername,
    revokeApiKeysByOauthClientId,
    revokeApiKeysByUserAndOauthClientId
} from '~/server/services/authStore';
import useConfig from '~/server/config';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import hasScope from '~/server/utils/api/scopes/hasScope';
import buildOidcSubject from '~/server/utils/oauth/subject';
import { signOidcIdToken } from '~/server/utils/oauth/idToken';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import type {
    OAuthAuthorizeRequest,
    OAuthAuthorizeInvalidReason,
    OAuthClient,
    OAuthClientCreateInput,
    OAuthClientPublicItem,
    OAuthClientScopeRequestItem,
    OAuthClientScopeReviewStatus,
    OAuthClientStatus,
    OAuthTokenResponse,
    OidcUserInfo
} from '~/types/auth';

interface OAuthClientRow {
    client_id: string;
    owner_user_id: string;
    name: string;
    description: string | null;
    homepage_url: string | null;
    status: OAuthClientStatus;
    is_trusted: number;
    created_at: number;
    updated_at: number;
}

interface OAuthClientRedirectUriRow {
    client_id: string;
    redirect_uri: string;
}

interface OAuthClientScopeRequestRow {
    client_id: string;
    scope: string;
    review_status: OAuthClientScopeReviewStatus;
    reviewed_by: string | null;
    reviewed_at: number | null;
}

interface OAuthClientAdminGrantRow {
    client_id: string;
    grant_key: string;
    enabled: number;
    updated_by: string | null;
    updated_at: number;
}

interface OAuthAuthorizationCodeRow {
    code_hash: string;
    client_id: string;
    user_id: string;
    redirect_uri: string;
    code_challenge: string;
    code_challenge_method: string;
    nonce: string | null;
    approved_scopes_json: string;
    auth_time: number;
    expires_at: number;
    consumed_at: number | null;
}

interface OAuthConsentRow {
    user_id: string;
    client_id: string;
    scope: string;
    granted_at: number;
    updated_at: number;
}

interface OAuthAuthorizedClientRow extends OAuthConsentRow {}

interface OAuthLoginContinuationRow {
    continuation_id: string;
    request_json: string;
    created_at: number;
    expires_at: number;
    consumed_at: number | null;
}

export interface OAuthContinuationPayload {
    authorizeRequest: OAuthAuthorizeRequest;
}

export interface ValidatedOAuthAuthorizeRequest {
    client: OAuthClient;
    requestedScopes: string[];
    pendingScopes: string[];
}

export interface InvalidOAuthAuthorizeRequest {
    reason: OAuthAuthorizeInvalidReason;
    message: string;
}

export type OAuthAuthorizeValidationResult =
    | {
          ok: true;
          data: ValidatedOAuthAuthorizeRequest;
      }
    | {
          ok: false;
          error: InvalidOAuthAuthorizeRequest;
      };

export interface AuthorizedOAuthAuthorizeRequest extends ValidatedOAuthAuthorizeRequest {
    hasPendingScopes: boolean;
    requiresOwnerBypass: boolean;
}

export interface RevokedOauthAuthorizationResult {
    revokedAt: number;
    revokedConsentCount: number;
    revokedTokenCount: number;
}

type OAuthSqlKey =
    | 'insertOauthClient'
    | 'updateOauthClient'
    | 'deleteOauthClient'
    | 'selectOauthClientById'
    | 'selectOauthClientByIdAndOwner'
    | 'selectOauthClientsByOwner'
    | 'selectAllOauthClients'
    | 'insertOauthClientRedirectUri'
    | 'deleteOauthClientRedirectUris'
    | 'selectOauthClientRedirectUris'
    | 'insertOauthClientScopeRequest'
    | 'deleteOauthClientScopeRequests'
    | 'selectOauthClientScopeRequests'
    | 'updateOauthClientScopeReview'
    | 'selectOauthClientAdminGrants'
    | 'upsertOauthClientAdminGrant'
    | 'insertOauthAuthorizationCode'
    | 'selectOauthAuthorizationCodeByHash'
    | 'consumeOauthAuthorizationCode'
    | 'upsertOauthConsent'
    | 'selectOauthConsents'
    | 'selectOauthAuthorizedClientsByUser'
    | 'deleteOauthConsentsByUserAndClient'
    | 'insertOauthLoginContinuation'
    | 'selectOauthLoginContinuation'
    | 'consumeOauthLoginContinuation';

const oauthSql = importSqlBatch('users/oauth') as Record<OAuthSqlKey, string>;
const oauthStatements = createPreparedSqlStore<OAuthSqlKey>({
    dbName: 'users',
    scope: 'users/oauth',
    sql: oauthSql
});

const OAUTH_ADMIN_GRANT_KEYS = {
    notificationSend: 'notification_send'
} as const;

function randomId(bytes = 24) {
    return crypto.randomBytes(bytes).toString('base64url');
}

function sha256Base64Url(value: string) {
    return crypto.createHash('sha256').update(value).digest('base64url');
}

function normalizeUrl(value: string) {
    return value.trim();
}

function normalizeScopeRequests(scopeRequests: string[]) {
    return [
        ...new Set(scopeRequests.map((scope) => scope.trim()).filter(Boolean))
    ].sort((left, right) => left.localeCompare(right));
}

function normalizeRedirectUris(redirectUris: string[]) {
    return [
        ...new Set(redirectUris.map((uri) => normalizeUrl(uri)).filter(Boolean))
    ].sort((left, right) => left.localeCompare(right));
}

function toScopeRequestItem(
    row: OAuthClientScopeRequestRow
): OAuthClientScopeRequestItem {
    return {
        scope: row.scope,
        reviewStatus: row.review_status,
        reviewedBy: row.reviewed_by,
        reviewedAt: row.reviewed_at
    };
}

function getOauthClientAdminGrantMap(clientId: string) {
    return new Map(
        oauthStatements
            .all<OAuthClientAdminGrantRow>(
                'selectOauthClientAdminGrants',
                clientId
            )
            .map((row) => [row.grant_key, row])
    );
}

function resolveOauthClientAdminGrants(clientId: string) {
    const grants = getOauthClientAdminGrantMap(clientId);
    const notificationSend = grants.get(
        OAUTH_ADMIN_GRANT_KEYS.notificationSend
    );

    return {
        notificationSend: notificationSend?.enabled === 1,
        notificationSendUpdatedBy: notificationSend?.updated_by ?? null,
        notificationSendUpdatedAt: notificationSend?.updated_at ?? null
    };
}

function hydrateClient(row: OAuthClientRow): OAuthClient {
    const redirectUris = oauthStatements
        .all<OAuthClientRedirectUriRow>(
            'selectOauthClientRedirectUris',
            row.client_id
        )
        .map((item) => ({
            value: item.redirect_uri
        }));
    const scopeRequests = oauthStatements
        .all<OAuthClientScopeRequestRow>(
            'selectOauthClientScopeRequests',
            row.client_id
        )
        .map(toScopeRequestItem);

    return {
        clientId: row.client_id,
        ownerUserId: row.owner_user_id,
        name: row.name,
        description: row.description,
        homepageUrl: row.homepage_url,
        status: row.status,
        isTrusted: row.is_trusted === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        redirectUris,
        scopeRequests,
        adminGrants: resolveOauthClientAdminGrants(row.client_id)
    };
}

function toOwnerVisibleClient(client: OAuthClient): OAuthClientPublicItem {
    return {
        ...client,
        adminGrants: {
            notificationSend: false,
            notificationSendUpdatedBy: null,
            notificationSendUpdatedAt: null
        }
    };
}

function insertRedirectUris(clientId: string, redirectUris: string[]) {
    for (const redirectUri of redirectUris) {
        oauthStatements.run(
            'insertOauthClientRedirectUri',
            clientId,
            redirectUri
        );
    }
}

function insertScopeRequests(clientId: string, requestedScopes: string[]) {
    for (const scope of requestedScopes) {
        oauthStatements.run(
            'insertOauthClientScopeRequest',
            clientId,
            scope,
            'pending',
            null,
            null
        );
    }
}

function getRequestedScopeReviewStatuses(
    client: OAuthClient,
    requestedScopes: string[]
) {
    const scopeStatusMap = new Map(
        client.scopeRequests.map((item) => [item.scope, item.reviewStatus])
    );

    return requestedScopes.map((scope) => ({
        scope,
        reviewStatus: scopeStatusMap.get(scope)
    }));
}

export function listOauthClientsByOwner(ownerUserId: string) {
    return oauthStatements
        .all<OAuthClientRow>('selectOauthClientsByOwner', ownerUserId)
        .map(hydrateClient)
        .map(toOwnerVisibleClient);
}

export function listAllOauthClients() {
    return oauthStatements
        .all<OAuthClientRow>('selectAllOauthClients')
        .map(hydrateClient);
}

export function getOauthClientById(clientId: string) {
    const row = oauthStatements.get<OAuthClientRow>(
        'selectOauthClientById',
        clientId
    );
    return row ? hydrateClient(row) : undefined;
}

export function getOauthClientByIdAndOwner(
    clientId: string,
    ownerUserId: string
) {
    const row = oauthStatements.get<OAuthClientRow>(
        'selectOauthClientByIdAndOwner',
        clientId,
        ownerUserId
    );
    return row ? toOwnerVisibleClient(hydrateClient(row)) : undefined;
}

export function createOauthClient(
    ownerUserId: string,
    input: OAuthClientCreateInput
): OAuthClientPublicItem {
    const now = getNowSeconds();
    const clientId = randomId(18);
    const redirectUris = normalizeRedirectUris(input.redirectUris);
    const requestedScopes = normalizeScopeRequests(input.requestedScopes);

    const create = useUsersDatabase().transaction(() => {
        oauthStatements.run(
            'insertOauthClient',
            clientId,
            ownerUserId,
            input.name.trim(),
            input.description,
            input.homepageUrl,
            'active',
            0,
            now,
            now
        );
        insertRedirectUris(clientId, redirectUris);
        insertScopeRequests(clientId, requestedScopes);
    });

    create();
    return getOauthClientById(clientId)!;
}

export function updateOauthClientByOwner(
    clientId: string,
    ownerUserId: string,
    input: OAuthClientCreateInput
) {
    const existing = getOauthClientByIdAndOwner(clientId, ownerUserId);
    if (!existing) {
        return undefined;
    }

    const now = getNowSeconds();
    const redirectUris = normalizeRedirectUris(input.redirectUris);
    const requestedScopes = normalizeScopeRequests(input.requestedScopes);
    const update = useUsersDatabase().transaction(() => {
        oauthStatements.run(
            'updateOauthClient',
            input.name.trim(),
            input.description,
            input.homepageUrl,
            existing.status,
            existing.isTrusted ? 1 : 0,
            now,
            clientId
        );
        oauthStatements.run('deleteOauthClientRedirectUris', clientId);
        oauthStatements.run('deleteOauthClientScopeRequests', clientId);
        insertRedirectUris(clientId, redirectUris);
        insertScopeRequests(clientId, requestedScopes);
    });

    update();
    return getOauthClientById(clientId);
}

export function deleteOauthClientByOwner(
    clientId: string,
    ownerUserId: string
) {
    const existing = getOauthClientByIdAndOwner(clientId, ownerUserId);
    if (!existing) {
        return false;
    }

    let deleted = false;
    const deleteClient = useUsersDatabase().transaction(() => {
        revokeApiKeysByOauthClientId(clientId);
        const result = oauthStatements.run(
            'deleteOauthClient',
            clientId,
            ownerUserId
        );
        deleted = result.changes > 0;
    });

    deleteClient();
    return deleted;
}

export function updateOauthClientAdmin(
    clientId: string,
    input: {
        status: OAuthClientStatus;
        isTrusted: boolean;
        adminGrants?: {
            notificationSend?: boolean;
        };
        scopeReviews: Array<{
            scope: string;
            reviewStatus: OAuthClientScopeReviewStatus;
        }>;
        reviewedBy: string;
    }
) {
    const existing = getOauthClientById(clientId);
    if (!existing) {
        return undefined;
    }

    const now = getNowSeconds();
    const update = useUsersDatabase().transaction(() => {
        oauthStatements.run(
            'updateOauthClient',
            existing.name,
            existing.description,
            existing.homepageUrl,
            input.status,
            input.isTrusted ? 1 : 0,
            now,
            clientId
        );

        for (const review of input.scopeReviews) {
            oauthStatements.run(
                'updateOauthClientScopeReview',
                review.reviewStatus,
                input.reviewedBy,
                now,
                clientId,
                review.scope
            );
        }

        if (typeof input.adminGrants?.notificationSend === 'boolean') {
            oauthStatements.run(
                'upsertOauthClientAdminGrant',
                clientId,
                OAUTH_ADMIN_GRANT_KEYS.notificationSend,
                input.adminGrants.notificationSend ? 1 : 0,
                input.reviewedBy,
                now
            );
        }
    });

    update();

    if (input.status === 'disabled') {
        revokeApiKeysByOauthClientId(clientId);
    }

    return getOauthClientById(clientId);
}

function resolveOauthTokenScopes(
    client: OAuthClient,
    approvedScopes: string[]
) {
    const scopes = [...approvedScopes];

    if (client.adminGrants.notificationSend) {
        scopes.push(API_SCOPES.notifications.send);
    }

    return normalizeScopeRequests(scopes);
}

export function createOauthLoginContinuation(
    payload: OAuthContinuationPayload
) {
    const continuationId = randomId(18);
    const now = getNowSeconds();
    oauthStatements.run(
        'insertOauthLoginContinuation',
        continuationId,
        JSON.stringify(payload),
        now,
        now + useConfig().oauth.loginContinuationTtlSeconds
    );
    return continuationId;
}

export function consumeOauthLoginContinuation(continuationId: string) {
    const now = getNowSeconds();
    const row = oauthStatements.get<OAuthLoginContinuationRow>(
        'selectOauthLoginContinuation',
        continuationId
    );
    if (!row || row.consumed_at !== null || row.expires_at <= now) {
        return undefined;
    }

    const result = oauthStatements.run(
        'consumeOauthLoginContinuation',
        now,
        continuationId
    );
    if (result.changes <= 0) {
        return undefined;
    }

    return JSON.parse(row.request_json) as OAuthContinuationPayload;
}

export function getGrantedConsentScopes(userId: string, clientId: string) {
    return oauthStatements
        .all<OAuthConsentRow>('selectOauthConsents', userId, clientId)
        .map((row) => row.scope);
}

export function grantOauthConsents(
    userId: string,
    clientId: string,
    scopes: string[]
) {
    const now = getNowSeconds();
    for (const scope of scopes) {
        oauthStatements.run(
            'upsertOauthConsent',
            userId,
            clientId,
            scope,
            now,
            now
        );
    }
}

export function listAuthorizedOauthAppsByUser(userId: string) {
    const rows = oauthStatements.all<OAuthAuthorizedClientRow>(
        'selectOauthAuthorizedClientsByUser',
        userId
    );
    const rowsByClientId = new Map<string, OAuthAuthorizedClientRow[]>();

    for (const row of rows) {
        const group = rowsByClientId.get(row.client_id) ?? [];
        group.push(row);
        rowsByClientId.set(row.client_id, group);
    }

    return [...rowsByClientId.entries()]
        .map(([clientId, consentRows]) => {
            const client = getOauthClientById(clientId);
            if (!client) {
                return null;
            }

            const grantedScopes = normalizeScopeRequests(
                consentRows.map((row) => row.scope)
            );
            const grantedAt = Math.min(
                ...consentRows.map((row) => row.granted_at)
            );
            const updatedAt = Math.max(
                ...consentRows.map((row) => row.updated_at)
            );

            return {
                clientId: client.clientId,
                name: client.name,
                description: client.description,
                homepageUrl: client.homepageUrl,
                ownerUserId: client.ownerUserId,
                status: client.status,
                isTrusted: client.isTrusted,
                grantedScopes,
                grantedAt,
                updatedAt
            };
        })
        .filter((item) => item !== null)
        .sort(
            (left, right) =>
                right.updatedAt - left.updatedAt ||
                left.clientId.localeCompare(right.clientId)
        );
}

export function revokeOauthAuthorizationByUser(
    userId: string,
    clientId: string
): RevokedOauthAuthorizationResult | undefined {
    const existingConsentRows = oauthStatements.all<OAuthAuthorizedClientRow>(
        'selectOauthAuthorizedClientsByUser',
        userId
    );
    const hasAuthorization = existingConsentRows.some(
        (row) => row.client_id === clientId
    );

    if (!hasAuthorization) {
        return undefined;
    }

    let revokedConsentCount = 0;
    let revokedTokenCount = 0;
    let revokedAt = getNowSeconds();
    const revoke = useUsersDatabase().transaction(() => {
        const consentResult = oauthStatements.run(
            'deleteOauthConsentsByUserAndClient',
            userId,
            clientId
        );
        revokedConsentCount = consentResult.changes;

        const tokenResult = revokeApiKeysByUserAndOauthClientId(
            userId,
            clientId
        );
        revokedAt = tokenResult.revokedAt;
        revokedTokenCount = tokenResult.revokedCount;
    });

    revoke();

    return {
        revokedAt,
        revokedConsentCount,
        revokedTokenCount
    };
}

export function createAuthorizationCode(input: {
    clientId: string;
    userId: string;
    redirectUri: string;
    approvedScopes: string[];
    codeChallenge: string;
    codeChallengeMethod: 'S256';
    nonce: string;
    authTime: number;
}) {
    const code = randomId(24);
    const now = getNowSeconds();
    oauthStatements.run(
        'insertOauthAuthorizationCode',
        sha256Base64Url(code),
        input.clientId,
        input.userId,
        input.redirectUri,
        input.codeChallenge,
        input.codeChallengeMethod,
        input.nonce,
        JSON.stringify(input.approvedScopes),
        input.authTime,
        now + useConfig().oauth.authorizationCodeTtlSeconds
    );
    return code;
}

function verifyPkce(verifier: string, challenge: string) {
    return sha256Base64Url(verifier) === challenge;
}

function toOidcTokenHash(value: string) {
    const digest = crypto.createHash('sha256').update(value).digest();
    return digest.subarray(0, digest.length / 2).toString('base64url');
}

export function exchangeAuthorizationCode(input: {
    clientId: string;
    code: string;
    redirectUri: string;
    codeVerifier: string;
}) {
    const codeHash = sha256Base64Url(input.code);
    const now = getNowSeconds();
    const row = oauthStatements.get<OAuthAuthorizationCodeRow>(
        'selectOauthAuthorizationCodeByHash',
        codeHash
    );
    if (!row) {
        return undefined;
    }

    if (
        row.client_id !== input.clientId ||
        row.redirect_uri !== input.redirectUri ||
        row.consumed_at !== null ||
        row.expires_at <= now ||
        row.code_challenge_method !== 'S256' ||
        !verifyPkce(input.codeVerifier, row.code_challenge)
    ) {
        return undefined;
    }

    const client = getOauthClientById(row.client_id);
    if (!client || client.status !== 'active') {
        return undefined;
    }

    const consumeResult = oauthStatements.run(
        'consumeOauthAuthorizationCode',
        now,
        codeHash
    );
    if (consumeResult.changes <= 0) {
        return undefined;
    }

    const approvedScopes = JSON.parse(row.approved_scopes_json) as string[];
    const tokenScopes = resolveOauthTokenScopes(client, approvedScopes);
    const accessToken = createApiKey(row.user_id, {
        issuer: 'oauth',
        oauthClientId: row.client_id,
        scopes: tokenScopes,
        name: `OAuth ${client.name}`,
        activeFrom: now,
        expiresAt: now + useConfig().oauth.accessTokenTtlSeconds
    });
    const user = getUserByUsername(row.user_id);
    if (!user) {
        return undefined;
    }

    const canReadProfile = hasScope(tokenScopes, API_SCOPES.auth.me);
    const nonce = row.nonce?.trim() ? row.nonce : undefined;

    const idToken = signOidcIdToken({
        iss: useConfig().oauth.issuer,
        sub: buildOidcSubject(user),
        aud: client.clientId,
        azp: client.clientId,
        exp: now + useConfig().oauth.idTokenTtlSeconds,
        iat: now,
        auth_time: row.auth_time,
        at_hash: toOidcTokenHash(accessToken.apiKey),
        nonce,
        preferred_username: canReadProfile ? row.user_id : undefined
    });

    const response: OAuthTokenResponse = {
        access_token: accessToken.apiKey,
        token_type: 'Bearer',
        expires_in: useConfig().oauth.accessTokenTtlSeconds,
        id_token: idToken,
        scope: tokenScopes.join(' ')
    };

    return response;
}

export function buildUserInfo(
    userId: string,
    canReadProfile: boolean
): OidcUserInfo | undefined {
    const user = getUserByUsername(userId);
    if (!user) {
        return undefined;
    }

    return canReadProfile
        ? {
              sub: buildOidcSubject(user),
              preferred_username: user.username
          }
        : {
              sub: buildOidcSubject(user)
          };
}

export function validateAuthorizeRequest(
    input: OAuthAuthorizeRequest
): OAuthAuthorizeValidationResult {
    if (input.responseType !== 'code') {
        return {
            ok: false,
            error: {
                reason: 'unsupported_response_type',
                message: `仅支持 response_type=code，当前收到 ${input.responseType || '(empty)'}。`
            }
        };
    }

    const client = getOauthClientById(input.clientId);
    if (!client) {
        return {
            ok: false,
            error: {
                reason: 'invalid_client',
                message: `未找到 client_id=${input.clientId || '(empty)'} 对应的 OAuth 客户端。`
            }
        };
    }

    if (client.status !== 'active') {
        return {
            ok: false,
            error: {
                reason: 'inactive_client',
                message: `OAuth 客户端 ${client.clientId} 当前未启用。`
            }
        };
    }

    const redirectUris = client.redirectUris.map((item) => item.value);
    if (!redirectUris.includes(input.redirectUri)) {
        return {
            ok: false,
            error: {
                reason: 'invalid_redirect_uri',
                message:
                    '请求中的 redirect_uri 未在该 OAuth 客户端的回调地址列表中登记。'
            }
        };
    }

    if (input.codeChallengeMethod !== 'S256') {
        return {
            ok: false,
            error: {
                reason: 'unsupported_code_challenge_method',
                message: `仅支持 code_challenge_method=S256，当前收到 ${input.codeChallengeMethod || '(empty)'}。`
            }
        };
    }

    const requestedScopes = normalizeScopeRequests(input.scope);
    const scopeReviews = getRequestedScopeReviewStatuses(
        client,
        requestedScopes
    );
    const hasUnknownScope = scopeReviews.some(
        (item) => typeof item.reviewStatus !== 'string'
    );
    if (hasUnknownScope) {
        const unknownScope = scopeReviews.find(
            (item) => typeof item.reviewStatus !== 'string'
        )?.scope;
        return {
            ok: false,
            error: {
                reason: 'unknown_scope',
                message: `请求的 scope ${unknownScope || '(unknown)'} 未在该客户端登记。`
            }
        };
    }

    const hasRejectedScope = scopeReviews.some(
        (item) => item.reviewStatus === 'rejected'
    );
    if (hasRejectedScope) {
        const rejectedScope = scopeReviews.find(
            (item) => item.reviewStatus === 'rejected'
        )?.scope;
        return {
            ok: false,
            error: {
                reason: 'rejected_scope',
                message: `请求的 scope ${rejectedScope || '(unknown)'} 已被管理员拒绝。`
            }
        };
    }

    const pendingScopes = scopeReviews
        .filter((item) => item.reviewStatus === 'pending')
        .map((item) => item.scope);

    return {
        ok: true,
        data: {
            client,
            requestedScopes,
            pendingScopes
        }
    };
}

export function authorizeValidatedRequestForUser(
    validated: ValidatedOAuthAuthorizeRequest,
    userId: string
): AuthorizedOAuthAuthorizeRequest | null {
    const hasPendingScopes = validated.pendingScopes.length > 0;
    const isClientOwner = validated.client.ownerUserId === userId;

    if (hasPendingScopes && !isClientOwner) {
        return null;
    }

    return {
        ...validated,
        hasPendingScopes,
        requiresOwnerBypass: hasPendingScopes
    };
}

export function canUserAuthorizeScopes(
    grantedScopes: string[],
    requestedScopes: string[]
) {
    return requestedScopes.every((scope) => hasScope(grantedScopes, scope));
}

export function needsConsent(
    userId: string,
    client: OAuthClient,
    requestedScopes: string[]
) {
    if (client.isTrusted) {
        return false;
    }

    const grantedScopes = getGrantedConsentScopes(userId, client.clientId);
    return requestedScopes.some((scope) => !grantedScopes.includes(scope));
}
