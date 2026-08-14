import type {
    DescMessage,
    Message,
    MessageInitShape
} from '@bufbuild/protobuf';
import {
    DeleteAuthApiKey,
    DeleteAuthAuthorization,
    DeleteAuthEventSubscriptions,
    DeleteAuthFavorites,
    DeleteAuthSubscription,
    GetAuthApiKeys,
    GetAuthAuthorizations,
    GetAuthEventSubscriptions,
    GetAuthFavorites,
    GetAuthMe,
    GetAuthMemberships,
    GetAuthSettings,
    GetAuthSubscriptions,
    PatchAuthPassword,
    PatchAuthSettings,
    PatchAuthSubscription,
    PostAuthApiKeys,
    PostAuthLogin,
    PostAuthLogout,
    PostAuthRedeemMembership,
    PostAuthRegister,
    PostAuthSendQqBindingCode,
    PostAuthUnbindQqBinding,
    PostAuthVerifyQqBinding,
    PutAuthEventSubscriptions,
    PutAuthFavorites,
    PutAuthSubscriptions
} from '#shared/api/v2/registry/auth';
import type {
    EventSubscriptionTarget,
    FavoriteTarget,
    GetAuthApiKeysData,
    GetAuthAuthorizationsData,
    GetAuthEventSubscriptionsData,
    GetAuthFavoritesData,
    GetAuthMeData,
    GetAuthMembershipsData,
    GetAuthSettingsData,
    GetAuthSubscriptionsData,
    DeleteAuthApiKeyData,
    DeleteAuthAuthorizationData,
    DeleteAuthEventSubscriptionsData,
    DeleteAuthFavoritesData,
    DeleteAuthSubscriptionData,
    PostAuthApiKeysData,
    PostAuthLoginData,
    PostAuthLogoutData,
    PostAuthRegisterData,
    PatchAuthPasswordData,
    PatchAuthSubscriptionData,
    PostAuthRedeemMembershipData,
    PostAuthSendQqBindingCodeData,
    PostAuthUnbindQqBindingData,
    PostAuthVerifyQqBindingData,
    PutAuthEventSubscriptionsData,
    PutAuthFavoritesData,
    PutAuthSubscriptionsData
} from '#shared/generated/proto/opencrh/v2/auth_pb';
import type {
    AuthApiKeyListResponse,
    AuthApiKeyIssuer,
    AuthAuthorizationItem,
    AuthAuthorizationListResponse,
    AuthAuthorizationRevokeResponse,
    AuthEventSubscriptionListResponse,
    AuthFavoritesResponse,
    AuthMeResponse,
    AuthQqBindingStatus,
    AuthSession,
    AuthIssueApiKeyResponse,
    AuthSettingsResponse,
    AuthSubscriptionListResponse,
    AuthUserPreference
} from '~/types/auth';
import type {
    AuthMembershipsResponse,
    AuthMembershipRedeemResponse
} from '~/types/membership';
import type { FavoriteLookupInput, FavoriteLookupItem } from '~/types/lookup';
import type { NotificationTarget } from '~/types/notifications';
import {
    requireSuccess,
    mapIssuer,
    mapQuota,
    mapSessionData
} from '~/utils/api/v2/domain/common';
import {
    formatProtoTrainCode,
    toProtoTrainCode
} from '~/utils/api/v2/mappers/trainCode';
import { protoInt64ToNumber } from '~/utils/api/v2/mappers/numbers';
import {
    requestV2,
    type V2ApiResult,
    type V2RequestInput
} from '~/utils/api/v2/transport';

function toTrainCodeInput(code: string) {
    return toProtoTrainCode(code);
}

type FavoriteTargetInput = NonNullable<
    MessageInitShape<typeof PutAuthFavorites.requestSchema>['target']
>;

type EventSubscriptionTargetInput = NonNullable<
    MessageInitShape<typeof PutAuthEventSubscriptions.requestSchema>['target']
>;

function toFavoriteTargetInput(target: {
    type: FavoriteLookupInput['type'];
    code: string;
    emuId?: number | null;
}): FavoriteTargetInput | null {
    if (target.type === 'train') {
        const train = toTrainCodeInput(target.code);
        return train ? { target: { case: 'train', value: train } } : null;
    }
    if (target.type === 'emu') {
        return target.emuId && Number.isInteger(target.emuId)
            ? { target: { case: 'emuId', value: target.emuId } }
            : null;
    }
    return {
        target: { case: 'stationName', value: target.code.trim() }
    };
}

function toEventSubscriptionTargetInput(
    target: NotificationTarget,
    emuId?: number | null
): EventSubscriptionTargetInput | null {
    if (target.targetType === 'train') {
        const train = toTrainCodeInput(target.targetId);
        return train ? { target: { case: 'train', value: train } } : null;
    }
    if (target.targetType === 'emu') {
        return emuId && Number.isInteger(emuId)
            ? { target: { case: 'emuId', value: emuId } }
            : null;
    }
    const topicId = Number(target.targetId);
    return Number.isInteger(topicId) && topicId > 0
        ? { target: { case: 'topicId', value: topicId } }
        : null;
}

function mapFavoriteItem(
    item: {
        target?: FavoriteTarget | undefined;
        tags: string[];
        starredAt: bigint | number;
    },
    emuCodeMappings: Record<number, string>
): FavoriteLookupItem | null {
    const target = item.target?.target;
    if (!target) {
        return null;
    }
    if (target.case === 'train') {
        return {
            type: 'train',
            code: formatProtoTrainCode(target.value),
            tags: item.tags,
            starredAt: protoInt64ToNumber(item.starredAt) ?? 0
        };
    }
    if (target.case === 'emuId') {
        const emuId = target.value;
        return {
            type: 'emu',
            code: emuCodeMappings[emuId] ?? String(emuId),
            tags: item.tags,
            starredAt: protoInt64ToNumber(item.starredAt) ?? 0
        };
    }
    if (target.case === 'stationName') {
        return {
            type: 'station',
            code: target.value,
            tags: item.tags,
            starredAt: protoInt64ToNumber(item.starredAt) ?? 0
        };
    }
    return null;
}

function mapFavoritesData(
    data: GetAuthFavoritesData | PutAuthFavoritesData | DeleteAuthFavoritesData
): AuthFavoritesResponse {
    return {
        userId: data.userId,
        maxEntries: data.maxEntries,
        items: data.items
            .map((item) => mapFavoriteItem(item, data.emuCodeMappings))
            .filter((item): item is FavoriteLookupItem => item !== null)
    };
}

function mapEventSubscriptionItem(
    item: {
        target?: EventSubscriptionTarget | undefined;
        label: string;
        path: string;
        createdAt: bigint | number;
        updatedAt: bigint | number;
    },
    emuCodeMappings: Record<number, string>
): AuthEventSubscriptionListResponse['items'][number] | null {
    const target = item.target?.target;
    if (!target) {
        return null;
    }
    if (target.case === 'train') {
        return {
            targetType: 'train',
            targetId: formatProtoTrainCode(target.value),
            label: item.label,
            path: item.path,
            createdAt: protoInt64ToNumber(item.createdAt) ?? 0,
            updatedAt: protoInt64ToNumber(item.updatedAt) ?? 0
        };
    }
    if (target.case === 'emuId') {
        const emuId = target.value;
        return {
            targetType: 'emu',
            targetId: emuCodeMappings[emuId] ?? String(emuId),
            label: item.label,
            path: item.path,
            createdAt: protoInt64ToNumber(item.createdAt) ?? 0,
            updatedAt: protoInt64ToNumber(item.updatedAt) ?? 0
        };
    }
    if (target.case === 'topicId') {
        return {
            targetType: 'feedback',
            targetId: String(target.value),
            label: item.label,
            path: item.path,
            createdAt: protoInt64ToNumber(item.createdAt) ?? 0,
            updatedAt: protoInt64ToNumber(item.updatedAt) ?? 0
        };
    }
    return null;
}

function mapEventSubscriptionsData(
    data:
        | GetAuthEventSubscriptionsData
        | PutAuthEventSubscriptionsData
        | DeleteAuthEventSubscriptionsData
): AuthEventSubscriptionListResponse {
    return {
        userId: data.userId,
        maxEntries: data.maxEntries,
        items: data.items
            .map((item) => mapEventSubscriptionItem(item, data.emuCodeMappings))
            .filter(
                (
                    item
                ): item is AuthEventSubscriptionListResponse['items'][number] =>
                    item !== null
            )
    };
}

function mapSubscriptionListData(
    data:
        | GetAuthSubscriptionsData
        | PutAuthSubscriptionsData
        | PatchAuthSubscriptionData
        | DeleteAuthSubscriptionData
): AuthSubscriptionListResponse {
    return {
        userId: data.userId,
        maxDevices: data.maxDevices,
        vapidPublicKey: data.vapidPublicKey,
        syncTimeoutSeconds: data.syncTimeoutSeconds,
        items: data.items.map((item) => ({
            id: item.id,
            name: item.name,
            endpoint: item.endpoint,
            endpointPreview: item.endpointPreview,
            expirationTime: protoInt64ToNumber(item.expirationTime),
            createdAt: protoInt64ToNumber(item.createdAt) ?? 0,
            updatedAt: protoInt64ToNumber(item.updatedAt) ?? 0,
            userAgent: item.userAgent
        }))
    };
}

function mapMeData(data: GetAuthMeData): AuthMeResponse {
    return {
        user: {
            userId: data.user!.userId
        },
        apiKey: {
            revokeId: data.apiKey!.revokeId,
            issuer: mapIssuer(data.apiKey!.issuer),
            maskedApiKey: data.apiKey!.maskedApiKey,
            activeFrom: protoInt64ToNumber(data.apiKey!.activeFrom) ?? 0,
            expiresAt: protoInt64ToNumber(data.apiKey!.expiresAt) ?? 0,
            dailyTokenLimit: data.apiKey!.dailyTokenLimit,
            scopes: data.apiKey!.scopes
        },
        quota: mapQuota(data.quota!)
    };
}

function mapQqBindingStatus(data: {
    enabled: boolean;
    bound: boolean;
    qqNumber?: string | undefined;
}): AuthQqBindingStatus {
    return {
        enabled: data.enabled,
        bound: data.bound,
        qqNumber: data.qqNumber ?? null
    };
}

function mapSettingsData(data: GetAuthSettingsData): AuthSettingsResponse {
    return {
        userId: data.userId,
        userPreference: {
            saveSearchHistory: data.userPreference!.saveSearchHistory
        },
        qqBinding: mapQqBindingStatus(data.qqBinding!)
    };
}

function mapApiKeyIssuer(value: number): AuthApiKeyIssuer {
    switch (value) {
        case 1:
            return 'webapp';
        case 3:
            return 'oauth';
        default:
            return 'api';
    }
}

function mapApiKeyListData(data: GetAuthApiKeysData): AuthApiKeyListResponse {
    return {
        userId: data.userId,
        quota: mapQuota(data.quota!),
        items: data.items.map((item) => ({
            name: item.name,
            revokeId: item.revokeId,
            maskedKeyId: item.maskedKeyId,
            issuer: mapApiKeyIssuer(item.issuer),
            oauthClientId: item.oauthClientId ?? null,
            activeFrom: protoInt64ToNumber(item.activeFrom) ?? 0,
            revokedAt: protoInt64ToNumber(item.revokedAt),
            expiresAt: protoInt64ToNumber(item.expiresAt) ?? 0,
            dailyTokenLimit: item.dailyTokenLimit,
            scopes: item.scopes,
            isCurrent: item.isCurrent,
            usage: item.usage
                ? {
                      last1Hour: item.usage.last1Hour,
                      last8Hours: item.usage.last8Hours,
                      last1Day: item.usage.last1Day,
                      bucketSeconds: item.usage.bucketSeconds
                  }
                : null
        })),
        creatableScopes: data.creatableScopes,
        defaultScopes: data.defaultScopes,
        maxLifetimeSeconds: protoInt64ToNumber(data.maxLifetimeSeconds) ?? 0,
        apiKeyNameLength: {
            minLength: data.apiKeyNameLength!.minLength,
            maxLength: data.apiKeyNameLength!.maxLength
        }
    };
}

function mapIssueApiKeyData(
    data: PostAuthApiKeysData
): AuthIssueApiKeyResponse {
    return {
        userId: data.userId,
        name: data.name,
        revokeId: data.revokeId,
        issuer: mapApiKeyIssuer(data.issuer),
        oauthClientId: data.oauthClientId ?? null,
        apiKey: data.apiKey,
        maskedApiKey: data.maskedApiKey,
        activeFrom: protoInt64ToNumber(data.activeFrom) ?? 0,
        expiresAt: protoInt64ToNumber(data.expiresAt) ?? 0,
        scopes: data.scopes
    };
}

function mapAuthorizationItem(item: {
    clientId: string;
    name: string;
    description?: string | undefined;
    homepageUrl?: string | undefined;
    ownerUserId: string;
    status: number;
    isTrusted: boolean;
    grantedScopes: string[];
    grantedAt: bigint | number;
    updatedAt: bigint | number;
}): AuthAuthorizationItem {
    return {
        clientId: item.clientId,
        name: item.name,
        description: item.description ?? null,
        homepageUrl: item.homepageUrl ?? null,
        ownerUserId: item.ownerUserId,
        status: item.status === 0 ? 'active' : 'disabled',
        isTrusted: item.isTrusted,
        grantedScopes: item.grantedScopes,
        grantedAt: protoInt64ToNumber(item.grantedAt) ?? 0,
        updatedAt: protoInt64ToNumber(item.updatedAt) ?? 0
    };
}

function mapAuthorizationsData(
    data: GetAuthAuthorizationsData
): AuthAuthorizationListResponse {
    return {
        userId: data.userId,
        items: data.items.map(mapAuthorizationItem)
    };
}

function mapMembershipsData(
    data: GetAuthMembershipsData
): AuthMembershipsResponse {
    const mapCatalogGroup = (group: {
        id: string;
        name: string;
        description: string;
        enabled: boolean;
        visible: boolean;
        assignable: boolean;
        sortOrder: number;
        quota?:
            | {
                  tokenLimit?: number | undefined;
                  refillAmount?: number | undefined;
              }
            | undefined;
        permissionGroups: Array<{
            id: string;
            name: string;
            scopes: string[];
        }>;
        subscriptionUrl?: string | undefined;
    }) => ({
        id: group.id,
        name: group.name,
        description: group.description,
        enabled: group.enabled,
        visible: group.visible,
        assignable: group.assignable,
        sortOrder: group.sortOrder,
        quota: {
            tokenLimit: group.quota?.tokenLimit ?? null,
            refillAmount: group.quota?.refillAmount ?? null
        },
        permissionGroups: group.permissionGroups.map((entry) => ({
            id: entry.id,
            name: entry.name,
            scopes: entry.scopes
        })),
        subscriptionUrl: group.subscriptionUrl ?? null
    });

    return {
        userId: data.userId,
        asOf: protoInt64ToNumber(data.asOf) ?? 0,
        items: data.items.map((item) => ({
            groupId: item.groupId,
            group: mapCatalogGroup(item.group!),
            status: mapMembershipStatus(
                item.status
            ) as AuthMembershipsResponse['items'][number]['status'],
            startsAt: protoInt64ToNumber(item.startsAt) ?? 0,
            expiresAt: protoInt64ToNumber(item.expiresAt) ?? 0
        })),
        catalog: data.catalog.map(mapCatalogGroup),
        accountScopes: data.accountScopes,
        effectiveQuota: {
            tokenLimit: data.effectiveQuota!.tokenLimit,
            refillAmount: data.effectiveQuota!.refillAmount,
            refillIntervalSeconds: data.effectiveQuota!.refillIntervalSeconds
        },
        quotaBreakdown: {
            baseline: {
                tokenLimit: data.quotaBreakdown?.baseline?.tokenLimit ?? 0,
                refillAmount: data.quotaBreakdown?.baseline?.refillAmount ?? 0
            },
            sponsorship: {
                tokenLimit:
                    data.quotaBreakdown?.sponsorship?.tokenLimit ?? null,
                refillAmount:
                    data.quotaBreakdown?.sponsorship?.refillAmount ?? null
            }
        }
    };
}

function mapMembershipStatus(value: number) {
    switch (value) {
        case 1:
            return 'active' as const;
        case 2:
            return 'scheduled' as const;
        case 3:
            return 'expired' as const;
        case 4:
            return 'revoked' as const;
        case 5:
            return 'disabled' as const;
        default:
            return 'unknown' as const;
    }
}

async function requestAuth<TMessage extends Message, TDomain>(
    entry: {
        operationName: string;
        method: string;
        pathTemplate: string;
        requestSchema: DescMessage;
        responseSchema: DescMessage;
        bodyMode: string;
        responseKind: string;
    },
    input: V2RequestInput,
    mapper: (data: TMessage) => TDomain,
    options?: { signal?: AbortSignal; retry?: number }
): Promise<TDomain> {
    const result = await requestV2<TMessage, TDomain>(
        entry as never,
        input,
        mapper,
        options
    );
    return requireSuccess(entry as never, result);
}

export async function fetchAuthMe(signal?: AbortSignal) {
    return requestAuth<GetAuthMeData, AuthMeResponse>(
        GetAuthMe,
        {},
        mapMeData,
        { signal, retry: 0 }
    );
}

export async function login(username: string, passwordDigest: string) {
    const result = await requestV2<PostAuthLoginData, AuthSession>(
        PostAuthLogin,
        { body: { username, passwordDigest } },
        mapSessionData
    );
    return requireSuccess(PostAuthLogin, result);
}

export async function register(username: string, passwordDigest: string) {
    const result = await requestV2<PostAuthRegisterData, AuthSession>(
        PostAuthRegister,
        { body: { username, passwordDigest } },
        mapSessionData
    );
    return requireSuccess(PostAuthRegister, result);
}

export async function logout() {
    const result = await requestV2<PostAuthLogoutData, boolean>(
        PostAuthLogout,
        {},
        (data) => data.loggedOut || data.revoked
    );
    return requireSuccess(PostAuthLogout, result);
}

export async function changePassword(
    currentPasswordDigest: string,
    newPasswordDigest: string
) {
    const result = await requestV2<PatchAuthPasswordData, AuthSession>(
        PatchAuthPassword,
        {
            body: {
                currentPasswordDigest,
                newPasswordDigest
            }
        },
        mapSessionData
    );
    return requireSuccess(PatchAuthPassword, result);
}

export async function fetchAuthSettings(signal?: AbortSignal) {
    return requestAuth<GetAuthSettingsData, AuthSettingsResponse>(
        GetAuthSettings,
        {},
        mapSettingsData,
        { signal, retry: 0 }
    );
}

export async function updateAuthSettings(userPreference: AuthUserPreference) {
    const result = await requestV2<GetAuthSettingsData, AuthSettingsResponse>(
        PatchAuthSettings,
        { body: { userPreference } },
        mapSettingsData
    );
    return requireSuccess(PatchAuthSettings, result);
}

export async function sendQqBindingCode(qqNumber: string) {
    const result = await requestV2<
        PostAuthSendQqBindingCodeData,
        { expiresAt: number | null; nextSendAt: number | null }
    >(PostAuthSendQqBindingCode, { body: { qqNumber } }, (data) => ({
        expiresAt: protoInt64ToNumber(data.expiresAt),
        nextSendAt: protoInt64ToNumber(data.nextSendAt)
    }));
    return requireSuccess(PostAuthSendQqBindingCode, result);
}

export async function verifyQqBinding(qqNumber: string, code: string) {
    const result = await requestV2<
        PostAuthVerifyQqBindingData,
        AuthQqBindingStatus
    >(
        PostAuthVerifyQqBinding,
        { body: { qqNumber, code } },
        mapQqBindingStatus
    );
    return requireSuccess(PostAuthVerifyQqBinding, result);
}

export async function unbindQqBinding() {
    const result = await requestV2<
        PostAuthUnbindQqBindingData,
        AuthQqBindingStatus
    >(PostAuthUnbindQqBinding, {}, mapQqBindingStatus);
    return requireSuccess(PostAuthUnbindQqBinding, result);
}

export async function fetchAuthApiKeys(signal?: AbortSignal) {
    return requestAuth<GetAuthApiKeysData, AuthApiKeyListResponse>(
        GetAuthApiKeys,
        {},
        mapApiKeyListData,
        { signal, retry: 0 }
    );
}

export async function createAuthApiKey(input: {
    name: string;
    activeFrom?: number;
    expiresAt?: number;
    scopes: string[];
}) {
    const result = await requestV2<
        PostAuthApiKeysData,
        AuthIssueApiKeyResponse
    >(
        PostAuthApiKeys,
        {
            body: {
                name: input.name,
                ...(input.activeFrom === undefined
                    ? {}
                    : { activeFrom: input.activeFrom }),
                ...(input.expiresAt === undefined
                    ? {}
                    : { expiresAt: input.expiresAt }),
                scopes: input.scopes
            }
        },
        mapIssueApiKeyData
    );
    return requireSuccess(PostAuthApiKeys, result);
}

export async function deleteAuthApiKey(revokeId: string) {
    const result = await requestV2<DeleteAuthApiKeyData, boolean>(
        DeleteAuthApiKey,
        { params: { revokeId } },
        (data) => data.revoked
    );
    return requireSuccess(DeleteAuthApiKey, result);
}

export async function fetchAuthAuthorizations(signal?: AbortSignal) {
    return requestAuth<
        GetAuthAuthorizationsData,
        AuthAuthorizationListResponse
    >(GetAuthAuthorizations, {}, mapAuthorizationsData, {
        signal,
        retry: 0
    });
}

export async function deleteAuthAuthorization(clientId: string) {
    const result = await requestV2<
        DeleteAuthAuthorizationData,
        AuthAuthorizationRevokeResponse
    >(
        DeleteAuthAuthorization,
        { params: { clientId } },
        (data) =>
            ({
                userId: data.userId,
                clientId,
                revoked: data.revoked
            }) as AuthAuthorizationRevokeResponse
    );
    return requireSuccess(DeleteAuthAuthorization, result);
}

export async function fetchAuthMemberships(signal?: AbortSignal) {
    return requestAuth<GetAuthMembershipsData, AuthMembershipsResponse>(
        GetAuthMemberships,
        {},
        mapMembershipsData,
        { signal, retry: 0 }
    );
}

export async function redeemMembership(code: string) {
    const result = await requestV2<
        PostAuthRedeemMembershipData,
        AuthMembershipRedeemResponse
    >(PostAuthRedeemMembership, { body: { code } }, (data) => ({
        code: data.code,
        redeemedAt: protoInt64ToNumber(data.redeemedAt) ?? 0,
        durationDays: data.durationDays,
        membership: {
            groupId: data.membership!.groupId,
            group: {
                id: data.membership!.group!.id,
                name: data.membership!.group!.name,
                description: data.membership!.group!.description,
                enabled: data.membership!.group!.enabled,
                visible: data.membership!.group!.visible,
                assignable: data.membership!.group!.assignable,
                sortOrder: data.membership!.group!.sortOrder,
                quota: {
                    tokenLimit:
                        data.membership!.group!.quota?.tokenLimit ?? null,
                    refillAmount:
                        data.membership!.group!.quota?.refillAmount ?? null
                },
                permissionGroups: data.membership!.group!.permissionGroups.map(
                    (group) => ({
                        id: group.id,
                        name: group.name,
                        scopes: group.scopes
                    })
                ),
                subscriptionUrl: data.membership!.group!.subscriptionUrl ?? null
            },
            status: mapMembershipStatus(
                data.membership!.status
            ) as AuthMembershipsResponse['items'][number]['status'],
            startsAt: protoInt64ToNumber(data.membership!.startsAt) ?? 0,
            expiresAt: protoInt64ToNumber(data.membership!.expiresAt) ?? 0
        },
        memberships: mapMembershipsData(data.memberships!)
    }));
    return requireSuccess(PostAuthRedeemMembership, result);
}

export async function fetchAuthFavorites(signal?: AbortSignal) {
    return requestAuth<GetAuthFavoritesData, AuthFavoritesResponse>(
        GetAuthFavorites,
        {},
        mapFavoritesData,
        { signal, retry: 0 }
    );
}

export async function putAuthFavorites(
    target: FavoriteLookupInput,
    emuId?: number | null
) {
    const favoriteTarget = toFavoriteTargetInput({ ...target, emuId });
    if (!favoriteTarget) {
        throw new Error('invalid_favorite_target');
    }
    const body: MessageInitShape<typeof PutAuthFavorites.requestSchema> = {
        target: favoriteTarget,
        tags: target.tags
    };
    const result = await requestV2<PutAuthFavoritesData, AuthFavoritesResponse>(
        PutAuthFavorites,
        { body },
        mapFavoritesData
    );
    return requireSuccess(PutAuthFavorites, result);
}

export async function putAuthFavorite(
    target: FavoriteLookupInput,
    emuId?: number | null,
    tags?: string[]
) {
    return putAuthFavorites(
        {
            type: target.type,
            code: target.code,
            tags: tags ?? target.tags
        },
        emuId
    );
}

export async function deleteAuthFavorites(
    target: Pick<FavoriteLookupInput, 'type' | 'code'>,
    emuId?: number | null
) {
    const favoriteTarget = toFavoriteTargetInput({ ...target, emuId });
    if (!favoriteTarget) {
        throw new Error('invalid_favorite_target');
    }
    const body: MessageInitShape<typeof DeleteAuthFavorites.requestSchema> = {
        target: favoriteTarget
    };
    const result = await requestV2<GetAuthFavoritesData, AuthFavoritesResponse>(
        DeleteAuthFavorites,
        { body },
        mapFavoritesData
    );
    return requireSuccess(DeleteAuthFavorites, result);
}

export async function deleteAuthFavorite(
    target: Pick<FavoriteLookupInput, 'type' | 'code'>,
    emuId?: number | null
) {
    return deleteAuthFavorites(target, emuId);
}

export async function fetchAuthEventSubscriptions(signal?: AbortSignal) {
    return requestAuth<
        GetAuthEventSubscriptionsData,
        AuthEventSubscriptionListResponse
    >(GetAuthEventSubscriptions, {}, mapEventSubscriptionsData, {
        signal,
        retry: 0
    });
}

export async function putAuthEventSubscriptions(
    target: NotificationTarget,
    emuId?: number | null
) {
    const subscriptionTarget = toEventSubscriptionTargetInput(target, emuId);
    if (!subscriptionTarget) {
        throw new Error('invalid_event_subscription_target');
    }
    const body: MessageInitShape<
        typeof PutAuthEventSubscriptions.requestSchema
    > = {
        target: subscriptionTarget
    };
    const result = await requestV2<
        PutAuthEventSubscriptionsData,
        AuthEventSubscriptionListResponse
    >(PutAuthEventSubscriptions, { body }, mapEventSubscriptionsData);
    return requireSuccess(PutAuthEventSubscriptions, result);
}

export async function putAuthEventSubscription(
    target: NotificationTarget,
    emuId?: number | null
) {
    return putAuthEventSubscriptions(target, emuId);
}

export async function deleteAuthEventSubscriptions(
    target: NotificationTarget,
    emuId?: number | null
) {
    const subscriptionTarget = toEventSubscriptionTargetInput(target, emuId);
    if (!subscriptionTarget) {
        throw new Error('invalid_event_subscription_target');
    }
    const body: MessageInitShape<
        typeof DeleteAuthEventSubscriptions.requestSchema
    > = {
        target: subscriptionTarget
    };
    const result = await requestV2<
        GetAuthEventSubscriptionsData,
        AuthEventSubscriptionListResponse
    >(DeleteAuthEventSubscriptions, { body }, mapEventSubscriptionsData);
    return requireSuccess(DeleteAuthEventSubscriptions, result);
}

export async function deleteAuthEventSubscription(
    target: NotificationTarget,
    emuId?: number | null
) {
    return deleteAuthEventSubscriptions(target, emuId);
}

export async function fetchAuthSubscriptions(signal?: AbortSignal) {
    return requestAuth<GetAuthSubscriptionsData, AuthSubscriptionListResponse>(
        GetAuthSubscriptions,
        {},
        mapSubscriptionListData,
        { signal, retry: 0 }
    );
}

export async function putAuthSubscriptions(input: {
    name?: string;
    subscription: {
        endpoint: string;
        expirationTime?: number | null;
        keys: {
            p256dh: string;
            auth: string;
        };
    };
}) {
    const result = await requestV2<
        PutAuthSubscriptionsData,
        AuthSubscriptionListResponse
    >(
        PutAuthSubscriptions,
        {
            body: {
                ...(input.name === undefined ? {} : { name: input.name }),
                subscription: {
                    endpoint: input.subscription.endpoint,
                    ...(input.subscription.expirationTime === undefined ||
                    input.subscription.expirationTime === null
                        ? {}
                        : {
                              expirationTime: input.subscription.expirationTime
                          }),
                    keys: input.subscription.keys
                }
            }
        },
        mapSubscriptionListData
    );
    return requireSuccess(PutAuthSubscriptions, result);
}

export async function patchAuthSubscription(
    subscriptionId: string,
    name: string
) {
    const result = await requestV2<
        GetAuthSubscriptionsData,
        AuthSubscriptionListResponse
    >(
        PatchAuthSubscription,
        { body: { subscriptionId, name } },
        mapSubscriptionListData
    );
    return requireSuccess(PatchAuthSubscription, result);
}

export async function deleteAuthSubscription(subscriptionId: string) {
    const result = await requestV2<
        GetAuthSubscriptionsData,
        AuthSubscriptionListResponse
    >(
        DeleteAuthSubscription,
        { params: { id: subscriptionId } },
        mapSubscriptionListData
    );
    return requireSuccess(DeleteAuthSubscription, result);
}
