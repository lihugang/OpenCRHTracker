import useConfig from '~/server/config';
import getLogger from '~/server/libs/log4js';
import {
    assertUserNotBanned,
    changeUserPasswordWithApiKey,
    createApiKey,
    createUserWithApiKey,
    getUserByUsername,
    listApiKeysByUser,
    maskApiKey,
    revokeApiKeyByRevokeIdAndUser,
    revokeApiKeyByUser,
    updateLastLoginAt,
    verifyUserPassword,
    type IssuedAuthSession
} from '~/server/services/authStore';
import { redeemMembershipCode } from '~/server/services/membershipCodeStore';
import { getAuthMembershipsSnapshot } from '~/server/services/membershipStore';
import {
    listAuthorizedOauthAppsByUser,
    revokeOauthAuthorizationByUser
} from '~/server/services/oauthStore';
import { sendPushNotificationToSubscription } from '~/server/services/pushNotificationService';
import {
    getQqBindingStatus,
    sendQqBindingCode,
    unbindQq,
    verifyQqBinding
} from '~/server/services/qqBindingService';
import {
    listUserEventSubscriptions,
    removeUserEventSubscription,
    upsertUserEventSubscription
} from '~/server/services/userEventSubscriptionStore';
import {
    getUserPreference,
    listUserFavoriteLookups,
    listUserSubscriptions,
    removeUserFavoriteLookup,
    removeUserSubscription,
    renameUserSubscription,
    updateUserPreference,
    upsertUserFavoriteLookup,
    upsertUserSubscription
} from '~/server/services/userProfileStore';
import ensure from '~/server/utils/api/executor/ensure';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import getApiKeyUsageSummary from '~/server/utils/api/keyUsage/getApiKeyUsageSummary';
import ensurePayloadStringLength from '~/server/utils/api/payload/ensurePayloadStringLength';
import getQuotaSummary from '~/server/utils/api/quota/getQuotaSummary';
import hasScope from '~/server/utils/api/scopes/hasScope';
import type ApiIdentity from '~/server/utils/api/identity/ApiIdentity';
import isScopeSubset from '~/server/utils/api/scopes/isScopeSubset';
import normalizeScopeList from '~/server/utils/api/scopes/normalizeScopeList';
import { createEventSubscriptionListResponse } from '~/server/utils/auth/eventSubscriptions';
import { createAuthSettingsResponse } from '~/server/utils/auth/settings';
import {
    createSubscriptionListResponse,
    normalizeSubscriptionName,
    previewSubscriptionEndpoint
} from '~/server/utils/auth/subscriptions';
import { buildDeviceRegistrationSucceededNotification } from '~/server/utils/notifications/templates/deviceRegistrationSucceeded';
import {
    normalizeApiKeyName,
    validateApiKeyName
} from '~/utils/auth/apiKeyName';
import {
    validatePasswordDigest,
    validateUsername
} from '~/utils/auth/credentials';
import type {
    AuthApiKeyListResponse,
    AuthAuthorizationListResponse,
    AuthAuthorizationRevokeResponse,
    AuthIssueApiKeyResponse,
    AuthMeResponse,
    AuthSettingsResponse,
    AuthSubscriptionListResponse
} from '~/types/auth';
import type {
    AuthMembershipRedeemResponse,
    AuthMembershipsResponse
} from '~/types/membership';
import type {
    AuthEventSubscriptionListResult,
    AuthEventTarget,
    AuthFavoriteTarget,
    AuthFavoritesResult
} from '~/server/types/authTargets';

const qqBindingLogger = getLogger('auth-qq-binding-api');
const subscriptionLogger = getLogger('auth-subscriptions-api');

export interface PostAuthApiKeysBody {
    name?: unknown;
    activeFrom?: unknown;
    expiresAt?: unknown;
    scopes?: unknown;
}

export interface PostAuthCredentialsInput {
    username: string;
    passwordDigest: string;
}

export interface PatchAuthPasswordInput {
    currentPasswordDigest: string;
    newPasswordDigest: string;
}

export interface PutAuthSubscriptionInput {
    name?: string;
    endpoint: string;
    expirationTime: number | null;
    keys: {
        p256dh: string;
        auth: string;
    };
}

function resolveCreatableScopes(identityScopes: string[]) {
    const creatableScopes = useConfig().api.permissions.creatableKeyMaxScopes;

    return normalizeScopeList(
        creatableScopes.filter((scope) => hasScope(identityScopes, scope))
    );
}

function resolveDefaultScopes(identityScopes: string[]) {
    const config = useConfig();
    const creatableScopes = resolveCreatableScopes(identityScopes);

    return normalizeScopeList(
        config.api.permissions.issuedKeyDefaultScopes.filter(
            (scope) =>
                hasScope(identityScopes, scope) &&
                hasScope(creatableScopes, scope)
        )
    );
}

function ensureIntegerTimestamp(
    value: unknown,
    field: 'activeFrom' | 'expiresAt'
) {
    ensure(
        typeof value === 'number' &&
            Number.isFinite(value) &&
            Number.isInteger(value) &&
            value > 0,
        400,
        'invalid_param',
        `${field} 必须是正整数 Unix 时间戳`
    );

    return value;
}

function isUniqueConstraintError(error: unknown) {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof (error as { code?: unknown }).code === 'string' &&
        (error as { code: string }).code.startsWith('SQLITE_CONSTRAINT')
    );
}

function getErrorMessage(error: unknown) {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

export function getAuthApiKeys(identity: ApiIdentity): AuthApiKeyListResponse {
    const config = useConfig();
    const records = listApiKeysByUser(identity.id);

    return {
        userId: identity.id,
        quota: getQuotaSummary(identity),
        items: records.map((record) => ({
            name: record.name,
            revokeId: record.revoke_id,
            maskedKeyId: maskApiKey(record.key),
            issuer: record.issuer,
            oauthClientId: record.oauth_client_id,
            activeFrom: record.active_from,
            revokedAt: record.revoked_at,
            expiresAt: record.expires_at,
            dailyTokenLimit: identity.tokenLimit,
            scopes: record.scopes,
            isCurrent: record.key === identity.keyId,
            usage: getApiKeyUsageSummary(record.key)
        })),
        creatableScopes: resolveCreatableScopes(identity.scopes),
        defaultScopes: resolveDefaultScopes(identity.scopes),
        maxLifetimeSeconds: config.user.apiKeyMaxLifetimeSeconds,
        apiKeyNameLength: config.user.apiKeyNameLength
    };
}

export function postAuthApiKeys(
    identity: ApiIdentity,
    body: PostAuthApiKeysBody
): AuthIssueApiKeyResponse {
    const config = useConfig();
    const creatableScopes = config.api.permissions.creatableKeyMaxScopes;

    ensure(
        typeof body.name === 'string',
        400,
        'invalid_param',
        'name 不能为空'
    );
    ensurePayloadStringLength(
        body.name,
        'name',
        config.api.payload.maxStringLength
    );

    const normalizedName = normalizeApiKeyName(body.name);
    const nameError = validateApiKeyName(
        normalizedName,
        config.user.apiKeyNameLength
    );
    if (nameError) {
        throw new ApiRequestError(400, 'invalid_param', nameError);
    }

    const activeFrom = ensureIntegerTimestamp(body.activeFrom, 'activeFrom');
    const expiresAt = ensureIntegerTimestamp(body.expiresAt, 'expiresAt');

    ensure(
        activeFrom < expiresAt,
        400,
        'invalid_param',
        'expiresAt 必须大于 activeFrom'
    );
    ensure(
        expiresAt - activeFrom <= config.user.apiKeyMaxLifetimeSeconds,
        400,
        'invalid_param',
        'API Key 有效期超过服务端配置上限'
    );

    ensure(
        Array.isArray(body.scopes) && body.scopes.length > 0,
        400,
        'invalid_param',
        'scopes 必须是非空字符串数组'
    );

    const rawScopes = body.scopes.map((scope, index) => {
        ensure(
            typeof scope === 'string',
            400,
            'invalid_param',
            `scopes[${index}] 必须是字符串`
        );
        ensurePayloadStringLength(
            scope,
            `scopes[${index}]`,
            config.api.payload.maxStringLength
        );
        return scope;
    });

    let requestedScopes: string[];
    try {
        requestedScopes = normalizeScopeList(rawScopes);
    } catch (error) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            error instanceof Error ? error.message : 'scopes 无效'
        );
    }

    if (!isScopeSubset(requestedScopes, identity.scopes)) {
        throw new ApiRequestError(
            403,
            'forbidden_scope',
            'scopes 必须是当前 API Key 权限范围的子集'
        );
    }

    if (!isScopeSubset(requestedScopes, creatableScopes)) {
        throw new ApiRequestError(
            403,
            'forbidden_scope',
            'scopes 超出服务端允许创建的权限范围'
        );
    }

    const apiKey = createApiKey(identity.id, {
        name: normalizedName,
        issuer: 'api',
        scopes: requestedScopes,
        activeFrom,
        expiresAt
    });

    return {
        userId: identity.id,
        name: apiKey.name,
        revokeId: apiKey.revokeId,
        issuer: apiKey.issuer,
        apiKey: apiKey.apiKey,
        maskedApiKey: apiKey.maskedApiKey,
        activeFrom: apiKey.activeFrom,
        expiresAt: apiKey.expiresAt,
        scopes: apiKey.scopes
    };
}

export function deleteAuthApiKey(userId: string, revokeId: string) {
    const revoked = revokeApiKeyByRevokeIdAndUser(revokeId, userId);
    if (!revoked) {
        throw new ApiRequestError(
            404,
            'not_found',
            '未找到该 revokeId 对应的可撤销 API Key'
        );
    }

    return {
        userId,
        revoked: true,
        revokeId
    };
}

export function getAuthAuthorizations(
    userId: string
): AuthAuthorizationListResponse {
    return {
        userId,
        items: listAuthorizedOauthAppsByUser(userId)
    };
}

export function deleteAuthAuthorization(
    userId: string,
    clientId: string
): AuthAuthorizationRevokeResponse {
    const revoked = revokeOauthAuthorizationByUser(userId, clientId);
    if (!revoked) {
        throw new ApiRequestError(404, 'not_found', '未找到该应用的授权记录');
    }

    return {
        userId,
        clientId,
        revoked: true
    };
}

export function getAuthEventSubscriptions(
    userId: string
): AuthEventSubscriptionListResult {
    return createEventSubscriptionListResponse(
        userId,
        listUserEventSubscriptions(userId)
    );
}

export function putAuthEventSubscriptions(
    userId: string,
    target: AuthEventTarget
): AuthEventSubscriptionListResult {
    return createEventSubscriptionListResponse(
        userId,
        upsertUserEventSubscription(userId, target)
    );
}

export function deleteAuthEventSubscriptions(
    userId: string,
    target: AuthEventTarget
): AuthEventSubscriptionListResult {
    return createEventSubscriptionListResponse(
        userId,
        removeUserEventSubscription(userId, target)
    );
}

export function getAuthFavorites(userId: string): AuthFavoritesResult {
    return {
        userId,
        maxEntries: useConfig().user.favorites.maxEntries,
        items: listUserFavoriteLookups(userId)
    };
}

export function putAuthFavorites(
    userId: string,
    target: AuthFavoriteTarget,
    tags: string[]
): AuthFavoritesResult {
    return {
        userId,
        maxEntries: useConfig().user.favorites.maxEntries,
        items: upsertUserFavoriteLookup(userId, target, tags)
    };
}

export function deleteAuthFavorites(
    userId: string,
    target: AuthFavoriteTarget
): AuthFavoritesResult {
    const items = removeUserFavoriteLookup(userId, target);

    if (target.kind === 'train' || target.kind === 'emu') {
        try {
            removeUserEventSubscription(
                userId,
                target.kind === 'train'
                    ? { kind: 'train', trainCode: target.trainCode }
                    : { kind: 'emu', emuId: target.emuId }
            );
        } catch (error) {
            if (
                !(
                    error instanceof ApiRequestError &&
                    error.errorCode === 'not_found'
                )
            ) {
                throw error;
            }
        }
    }

    return {
        userId,
        maxEntries: useConfig().user.favorites.maxEntries,
        items
    };
}

export function postAuthLogin(
    input: PostAuthCredentialsInput
): IssuedAuthSession {
    const passwordDigestError = validatePasswordDigest(input.passwordDigest);
    if (passwordDigestError) {
        throw new ApiRequestError(400, 'invalid_param', passwordDigestError);
    }

    const user = getUserByUsername(input.username);
    if (!user || !verifyUserPassword(user, input.passwordDigest)) {
        throw new ApiRequestError(
            401,
            'invalid_credentials',
            '用户名或密码错误'
        );
    }

    assertUserNotBanned(user.username);
    updateLastLoginAt(user.username);

    return createApiKey(user.username);
}

export function postAuthRegister(
    input: PostAuthCredentialsInput
): IssuedAuthSession {
    const usernameError = validateUsername(input.username);
    if (usernameError) {
        throw new ApiRequestError(400, 'invalid_param', usernameError);
    }

    const passwordDigestError = validatePasswordDigest(input.passwordDigest);
    if (passwordDigestError) {
        throw new ApiRequestError(400, 'invalid_param', passwordDigestError);
    }

    if (getUserByUsername(input.username)) {
        throw new ApiRequestError(409, 'username_taken', '用户名已存在');
    }

    try {
        return createUserWithApiKey(input.username, input.passwordDigest);
    } catch (error) {
        if (isUniqueConstraintError(error)) {
            throw new ApiRequestError(409, 'username_taken', '用户名已存在');
        }

        throw error;
    }
}

export function postAuthLogout(identity: ApiIdentity) {
    ensure(
        typeof identity.keyId === 'string' && identity.keyId.length > 0,
        500,
        'missing_key_id',
        '当前 API Key 缺少必要标识'
    );

    const revoked = revokeApiKeyByUser(identity.keyId, identity.id);

    ensure(revoked, 500, 'revoke_failed', '当前 API Key 吊销失败');

    return {
        loggedOut: true,
        revoked: true,
        revokeId: identity.revokeId ?? ''
    };
}

export function getAuthMe(identity: ApiIdentity): AuthMeResponse {
    return {
        user: {
            userId: identity.id
        },
        apiKey: {
            revokeId: identity.revokeId ?? '',
            issuer: identity.issuer ?? 'webapp',
            maskedApiKey: maskApiKey(identity.apiKey ?? ''),
            activeFrom: identity.activeFrom ?? 0,
            expiresAt: identity.expiresAt ?? 0,
            dailyTokenLimit: identity.tokenLimit,
            scopes: identity.scopes
        },
        quota: getQuotaSummary(identity)
    };
}

export function getAuthMemberships(userId: string): AuthMembershipsResponse {
    return getAuthMembershipsSnapshot(userId);
}

export function postAuthRedeemMembership(
    userId: string,
    code: string
): AuthMembershipRedeemResponse {
    return redeemMembershipCode(code, userId);
}

export function patchAuthPassword(
    userId: string,
    input: PatchAuthPasswordInput
): IssuedAuthSession {
    const currentPasswordDigestError = validatePasswordDigest(
        input.currentPasswordDigest
    );
    if (currentPasswordDigestError) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            currentPasswordDigestError
        );
    }

    const newPasswordDigestError = validatePasswordDigest(
        input.newPasswordDigest
    );
    if (newPasswordDigestError) {
        throw new ApiRequestError(400, 'invalid_param', newPasswordDigestError);
    }

    ensure(
        input.currentPasswordDigest !== input.newPasswordDigest,
        400,
        'invalid_param',
        '新密码不能与旧密码相同'
    );

    const nextSession = changeUserPasswordWithApiKey(
        userId,
        input.currentPasswordDigest,
        input.newPasswordDigest
    );
    if (!nextSession) {
        throw new ApiRequestError(401, 'invalid_credentials', '旧密码错误');
    }

    return nextSession;
}

export async function postAuthSendQqBindingCode(
    userId: string,
    qqNumber: string
) {
    try {
        return await sendQqBindingCode(userId, userId, qqNumber);
    } catch (error) {
        if (!(error instanceof ApiRequestError) || error.statusCode >= 500) {
            qqBindingLogger.error(
                `qq_binding_send_code_failed userId=${userId} error=${formatErrorForLog(error)}`
            );
        }

        throw error;
    }
}

export function postAuthUnbindQqBinding(userId: string) {
    return unbindQq(userId);
}

export function postAuthVerifyQqBinding(
    userId: string,
    qqNumber: unknown,
    code: unknown
) {
    return verifyQqBinding(userId, qqNumber, code);
}

export function getAuthSettings(userId: string): AuthSettingsResponse {
    return createAuthSettingsResponse(
        userId,
        getUserPreference(userId),
        getQqBindingStatus(userId)
    );
}

export function patchAuthSettings(
    userId: string,
    saveSearchHistory: boolean
): AuthSettingsResponse {
    return createAuthSettingsResponse(
        userId,
        updateUserPreference(userId, { saveSearchHistory }),
        getQqBindingStatus(userId)
    );
}

export function getAuthSubscriptions(
    userId: string
): AuthSubscriptionListResponse {
    return createSubscriptionListResponse(
        userId,
        listUserSubscriptions(userId)
    );
}

export async function putAuthSubscriptions(
    userId: string,
    input: PutAuthSubscriptionInput,
    userAgent: string
): Promise<AuthSubscriptionListResponse> {
    const result = upsertUserSubscription(
        userId,
        {
            name: normalizeSubscriptionName(input.name),
            endpoint: input.endpoint.trim(),
            expirationTime: input.expirationTime,
            keys: {
                p256dh: input.keys.p256dh.trim(),
                auth: input.keys.auth.trim()
            }
        },
        userAgent
    );

    if (result.action === 'created') {
        try {
            const notificationResult = await sendPushNotificationToSubscription(
                userId,
                result.item,
                buildDeviceRegistrationSucceededNotification()
            );

            if (!notificationResult.delivered) {
                subscriptionLogger.warn(
                    `subscription_registration_notification_failed userId=${userId} endpoint=${previewSubscriptionEndpoint(result.item.endpoint)} message=${notificationResult.message}`
                );
            }
        } catch (error) {
            subscriptionLogger.error(
                `subscription_registration_notification_failed_unexpected userId=${userId} endpoint=${previewSubscriptionEndpoint(result.item.endpoint)} message=${getErrorMessage(error)}`
            );
        }
    }

    return createSubscriptionListResponse(
        userId,
        listUserSubscriptions(userId)
    );
}

export function deleteAuthSubscription(
    userId: string,
    subscriptionId: string
): AuthSubscriptionListResponse {
    return createSubscriptionListResponse(
        userId,
        removeUserSubscription(userId, subscriptionId)
    );
}

export function patchAuthSubscription(
    userId: string,
    subscriptionId: string,
    name: string
): AuthSubscriptionListResponse {
    return createSubscriptionListResponse(
        userId,
        renameUserSubscription(
            userId,
            subscriptionId,
            normalizeSubscriptionName(name)
        )
    );
}

function formatErrorForLog(error: unknown) {
    if (error instanceof Error) {
        const details: Record<string, unknown> = {
            name: error.name,
            message: error.message,
            stack: error.stack
        };

        Object.assign(details, error);

        try {
            return JSON.stringify(details);
        } catch {
            return `${error.name}: ${error.message}\n${error.stack ?? ''}`;
        }
    }

    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}
