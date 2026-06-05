import type { FavoriteLookupItem } from '~/types/lookup';
import type { NotificationTargetType } from '~/types/notifications';

export type AuthApiKeyIssuer = 'webapp' | 'api' | 'oauth';

export interface AuthApiKeyNameLength {
    minLength: number;
    maxLength: number;
}

export interface AuthSession {
    userId: string;
    revokeId: string;
    issuer: AuthApiKeyIssuer;
    maskedApiKey: string;
    scopes: string[];
    activeFrom: number;
    expiresAt: number;
    dailyTokenLimit: number;
}

export interface AuthQuotaSummary {
    tokenLimit: number;
    remain: number;
    refillAmount: number;
    refillIntervalSeconds: number;
    nextRefillAt: number | null;
}

export interface AuthApiKeyUsageSummary {
    last1Hour: number;
    last8Hours: number;
    last1Day: number;
    bucketSeconds: number;
}

export interface AuthSubscriptionItem {
    id: string;
    name: string;
    endpoint: string;
    endpointPreview: string;
    expirationTime: number | null;
    createdAt: number;
    updatedAt: number;
    userAgent: string;
}

export interface AuthUserPreference {
    saveSearchHistory: boolean;
}

export interface AuthMeResponse {
    user: {
        userId: string;
    };
    apiKey: {
        revokeId: string;
        issuer: AuthApiKeyIssuer;
        maskedApiKey: string;
        activeFrom: number;
        expiresAt: number;
        dailyTokenLimit: number;
        scopes: string[];
    };
    quota: AuthQuotaSummary;
}

export interface AuthApiKeyListItem {
    name: string;
    revokeId: string;
    maskedKeyId: string;
    issuer: AuthApiKeyIssuer;
    oauthClientId: string | null;
    activeFrom: number;
    revokedAt: number | null;
    expiresAt: number;
    dailyTokenLimit: number;
    scopes: string[];
    isCurrent: boolean;
    usage: AuthApiKeyUsageSummary | null;
}

export interface AuthApiKeyListResponse {
    userId: string;
    quota: AuthQuotaSummary;
    items: AuthApiKeyListItem[];
    creatableScopes: string[];
    defaultScopes: string[];
    maxLifetimeSeconds: number;
    apiKeyNameLength: AuthApiKeyNameLength;
}

export interface AuthIssueApiKeyResponse {
    userId: string;
    name: string;
    revokeId: string;
    issuer: AuthApiKeyIssuer;
    oauthClientId?: string | null;
    apiKey: string;
    maskedApiKey: string;
    activeFrom: number;
    expiresAt: number;
    scopes: string[];
}

export type OAuthClientStatus = 'active' | 'disabled';
export type OAuthClientScopeReviewStatus = 'pending' | 'approved' | 'rejected';

export interface OAuthClientRedirectUriItem {
    value: string;
}

export interface OAuthClientScopeRequestItem {
    scope: string;
    reviewStatus: OAuthClientScopeReviewStatus;
    reviewedBy: string | null;
    reviewedAt: number | null;
}

export interface OAuthClientPublicItem {
    clientId: string;
    ownerUserId: string;
    name: string;
    description: string | null;
    homepageUrl: string | null;
    status: OAuthClientStatus;
    isTrusted: boolean;
    createdAt: number;
    updatedAt: number;
    redirectUris: OAuthClientRedirectUriItem[];
    scopeRequests: OAuthClientScopeRequestItem[];
}

export interface OAuthClient extends OAuthClientPublicItem {}

export interface OAuthClientCreateInput {
    name: string;
    description: string | null;
    homepageUrl: string | null;
    redirectUris: string[];
    requestedScopes: string[];
}

export interface OAuthClientUpdateInput extends OAuthClientCreateInput {
    status?: OAuthClientStatus;
    isTrusted?: boolean;
}

export interface OAuthClientListResponse {
    items: OAuthClientPublicItem[];
    allowedScopes: string[];
}

export interface OAuthClientMutationResponse {
    client: OAuthClientPublicItem;
}

export interface OidcDiscoveryDocument {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    userinfo_endpoint: string;
    jwks_uri: string;
    response_types_supported: string[];
    grant_types_supported: string[];
    subject_types_supported: string[];
    id_token_signing_alg_values_supported: string[];
    code_challenge_methods_supported: string[];
    token_endpoint_auth_methods_supported: string[];
    scopes_supported: string[];
}

export interface OidcJwk {
    kty: 'RSA';
    use: 'sig';
    kid: string;
    alg: 'RS256';
    n: string;
    e: string;
}

export interface OidcJwksDocument {
    keys: OidcJwk[];
}

export interface OidcUserInfo {
    sub: string;
    preferred_username?: string;
}

export interface OAuthTokenResponse {
    access_token: string;
    token_type: 'Bearer';
    expires_in: number;
    id_token: string;
    scope: string;
}

export interface OAuthAuthorizeRequest {
    responseType: string;
    clientId: string;
    redirectUri: string;
    scope: string[];
    state: string;
    codeChallenge: string;
    codeChallengeMethod: 'S256';
    nonce: string;
}

export interface OAuthAuthorizeContextClient {
    clientId: string;
    name: string;
    description: string | null;
    homepageUrl: string | null;
    ownerUserId: string;
    isTrusted: boolean;
}

export interface OAuthAuthorizeContextSession {
    userId: string;
    activeFrom: number;
}

export type OAuthAuthorizeInvalidReason =
    | 'unsupported_response_type'
    | 'invalid_client'
    | 'inactive_client'
    | 'invalid_redirect_uri'
    | 'unsupported_code_challenge_method'
    | 'unknown_scope'
    | 'rejected_scope';

export type OAuthAuthorizeContextResponse =
    | {
          mode: 'redirect';
          location: string;
      }
    | {
          mode: 'error';
          error: 'invalid_request';
          reason: OAuthAuthorizeInvalidReason;
          message: string;
      }
    | {
          mode: 'consent';
          client: OAuthAuthorizeContextClient;
          request: OAuthAuthorizeRequest;
          session: OAuthAuthorizeContextSession;
          scopes: string[];
          hasPendingScopes: boolean;
          requiresOwnerBypass: boolean;
      };

export interface OAuthAuthorizeDecisionResponse {
    location: string;
}

export interface AuthFavoritesResponse {
    userId: string;
    maxEntries: number;
    items: FavoriteLookupItem[];
}

export interface AuthSettingsResponse {
    userId: string;
    userPreference: AuthUserPreference;
}

export interface AuthAuthorizationItem {
    clientId: string;
    name: string;
    description: string | null;
    homepageUrl: string | null;
    ownerUserId: string;
    status: OAuthClientStatus;
    isTrusted: boolean;
    grantedScopes: string[];
    grantedAt: number;
    updatedAt: number;
}

export interface AuthAuthorizationListResponse {
    userId: string;
    items: AuthAuthorizationItem[];
}

export interface AuthAuthorizationRevokeResponse {
    userId: string;
    clientId: string;
    revoked: true;
}

export interface AuthSubscriptionListResponse {
    userId: string;
    maxDevices: number;
    vapidPublicKey: string;
    syncTimeoutSeconds: number;
    items: AuthSubscriptionItem[];
}

export interface AuthEventSubscriptionItem {
    targetType: NotificationTargetType;
    targetId: string;
    label: string;
    path: string;
    createdAt: number;
    updatedAt: number;
}

export interface AuthEventSubscriptionListResponse {
    userId: string;
    maxEntries: number;
    items: AuthEventSubscriptionItem[];
}
