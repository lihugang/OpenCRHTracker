import { getHeader } from 'h3';
import useConfig from '~/server/config';
import { asEmuId } from '~/server/libs/database/emu';
import {
    deleteAuthApiKey,
    deleteAuthAuthorization,
    deleteAuthEventSubscriptions,
    deleteAuthFavorites,
    deleteAuthSubscription,
    getAuthApiKeys,
    getAuthAuthorizations,
    getAuthEventSubscriptions,
    getAuthFavorites,
    getAuthMe,
    getAuthMemberships,
    getAuthSettings,
    getAuthSubscriptions,
    patchAuthPassword,
    patchAuthSettings,
    patchAuthSubscription,
    postAuthApiKeys,
    postAuthLogin,
    postAuthLogout,
    postAuthRedeemMembership,
    postAuthRegister,
    postAuthSendQqBindingCode,
    postAuthUnbindQqBinding,
    postAuthVerifyQqBinding,
    putAuthEventSubscriptions,
    putAuthFavorites,
    putAuthSubscriptions
} from '~/server/domain/auth';
import { clearAuthCookie, setAuthCookie } from '~/server/utils/auth/authCookie';
import toPublicAuthSession from '~/server/utils/auth/toPublicAuthSession';
import { normalizeQqNumber } from '~/server/services/qqBindingService';
import {
    isQqNumberInBanList,
    queueQqBanListUserBan,
    queueRiskQqBindingEscalation
} from '~/server/services/userBanSecurityStore';
import ensure from '~/server/utils/api/executor/ensure';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import type { TrainCodeParts } from '~/server/utils/12306/trainCode';
import type { V2OperationContext } from '~/server/utils/api/v2/V2Types';
import {
    AuthApiKeyIssuer,
    UserMembershipStatus,
    type GetAuthEventSubscriptionsRequest,
    type PostAuthApiKeysRequest,
    type PostAuthLoginRequest,
    type PostAuthRegisterRequest,
    type PatchAuthPasswordRequest,
    type PatchAuthSettingsRequest,
    type PatchAuthSubscriptionRequest,
    type PostAuthRedeemMembershipRequest,
    type PostAuthSendQqBindingCodeRequest,
    type PostAuthVerifyQqBindingRequest,
    type PutAuthEventSubscriptionsRequest,
    type PutAuthFavoritesRequest,
    type PutAuthSubscriptionsRequest,
    type DeleteAuthEventSubscriptionsRequest,
    type DeleteAuthFavoritesRequest
} from '~/server/generated/proto/opencrh/v2/auth_pb';
import type {
    AuthEventTarget,
    AuthFavoriteTarget
} from '~/server/types/authTargets';

function toTrainCode(parts: TrainCodeParts) {
    return {
        prefix: parts.prefix,
        number: parts.number
    };
}

function toIssuer(issuer: string): number {
    if (issuer === 'webapp') {
        return AuthApiKeyIssuer.WEBAPP;
    }
    if (issuer === 'oauth') {
        return AuthApiKeyIssuer.OAUTH;
    }
    return AuthApiKeyIssuer.API;
}

function toSessionData(session: {
    userId: string;
    revokeId: string;
    issuer: string;
    maskedApiKey: string;
    scopes: string[];
    activeFrom: number;
    expiresAt: number;
    dailyTokenLimit: number;
}) {
    return {
        userId: session.userId,
        revokeId: session.revokeId,
        issuer: toIssuer(session.issuer),
        maskedApiKey: session.maskedApiKey,
        scopes: session.scopes,
        activeFrom: session.activeFrom,
        expiresAt: session.expiresAt,
        dailyTokenLimit: session.dailyTokenLimit
    };
}

function toProtoFavoriteTarget(target: AuthFavoriteTarget) {
    if (target.kind === 'train') {
        return {
            target: {
                case: 'train' as const,
                value: toTrainCode(target.trainCode)
            }
        };
    }
    if (target.kind === 'emu') {
        return {
            target: { case: 'emuId' as const, value: target.emuId }
        };
    }
    return {
        target: { case: 'stationName' as const, value: target.stationName }
    };
}

function toProtoEventTarget(target: AuthEventTarget) {
    if (target.kind === 'train') {
        return {
            target: {
                case: 'train' as const,
                value: toTrainCode(target.trainCode)
            }
        };
    }
    if (target.kind === 'emu') {
        return {
            target: { case: 'emuId' as const, value: target.emuId }
        };
    }
    return {
        target: { case: 'topicId' as const, value: target.topicId }
    };
}

function fromProtoFavoriteTarget(target: {
    case: 'train' | 'emuId' | 'stationName' | undefined;
    value?: unknown;
}): AuthFavoriteTarget | null {
    if (target.case === 'train') {
        const value = target.value as { prefix?: string; number?: number };
        const prefix = typeof value.prefix === 'string' ? value.prefix : '';
        const number =
            typeof value.number === 'number' && Number.isInteger(value.number)
                ? value.number
                : NaN;
        if (
            !/^[A-Z]?$/.test(prefix) ||
            !Number.isInteger(number) ||
            number <= 0
        ) {
            return null;
        }
        return { kind: 'train', trainCode: { prefix, number } };
    }
    if (target.case === 'emuId') {
        const emuId = target.value as number;
        if (!Number.isInteger(emuId) || emuId <= 0) {
            return null;
        }
        return { kind: 'emu', emuId: asEmuId(emuId) };
    }
    if (target.case === 'stationName') {
        const stationName = target.value as string;
        if (
            typeof stationName !== 'string' ||
            stationName.trim().length === 0
        ) {
            return null;
        }
        return { kind: 'station', stationName: stationName.trim() };
    }
    return null;
}

function fromProtoEventTarget(target: {
    case: 'train' | 'emuId' | 'topicId' | undefined;
    value?: unknown;
}): AuthEventTarget | null {
    if (target.case === 'train') {
        const value = target.value as { prefix?: string; number?: number };
        const prefix = typeof value.prefix === 'string' ? value.prefix : '';
        const number =
            typeof value.number === 'number' && Number.isInteger(value.number)
                ? value.number
                : NaN;
        if (
            !/^[A-Z]?$/.test(prefix) ||
            !Number.isInteger(number) ||
            number <= 0
        ) {
            return null;
        }
        return { kind: 'train', trainCode: { prefix, number } };
    }
    if (target.case === 'emuId') {
        const emuId = target.value as number;
        if (!Number.isInteger(emuId) || emuId <= 0) {
            return null;
        }
        return { kind: 'emu', emuId: asEmuId(emuId) };
    }
    if (target.case === 'topicId') {
        const topicId = target.value as number;
        if (!Number.isInteger(topicId) || topicId <= 0) {
            return null;
        }
        return { kind: 'feedback', topicId };
    }
    return null;
}

function toMembershipStatus(status: string): number {
    switch (status) {
        case 'active':
            return UserMembershipStatus.ACTIVE;
        case 'scheduled':
            return UserMembershipStatus.SCHEDULED;
        case 'expired':
            return UserMembershipStatus.EXPIRED;
        case 'revoked':
            return UserMembershipStatus.REVOKED;
        case 'disabled':
            return UserMembershipStatus.DISABLED;
        default:
            return UserMembershipStatus.UNKNOWN;
    }
}

function toAuthMembershipItem(item: {
    groupId: string;
    group: {
        id: string;
        name: string;
        description: string;
        enabled: boolean;
        visible: boolean;
        assignable: boolean;
        sortOrder: number;
        quota: { tokenLimit: number | null; refillAmount: number | null };
        permissionGroups: Array<{
            id: string;
            name: string;
            scopes: string[];
        }>;
        subscriptionUrl: string | null;
    };
    status: 'active' | 'scheduled';
    startsAt: number;
    expiresAt: number;
}) {
    return {
        groupId: item.groupId,
        group: toCatalogGroup(item.group),
        status: toMembershipStatus(item.status),
        startsAt: item.startsAt,
        expiresAt: item.expiresAt
    };
}

function toCatalogGroup(group: {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    visible: boolean;
    assignable: boolean;
    sortOrder: number;
    quota: { tokenLimit: number | null; refillAmount: number | null };
    permissionGroups: Array<{
        id: string;
        name: string;
        scopes: string[];
    }>;
    subscriptionUrl: string | null;
}) {
    return {
        id: group.id,
        name: group.name,
        description: group.description,
        enabled: group.enabled,
        visible: group.visible,
        assignable: group.assignable,
        sortOrder: group.sortOrder,
        quota: {
            ...(group.quota.tokenLimit === null
                ? {}
                : { tokenLimit: group.quota.tokenLimit }),
            ...(group.quota.refillAmount === null
                ? {}
                : { refillAmount: group.quota.refillAmount })
        },
        permissionGroups: group.permissionGroups.map((permission) => ({
            id: permission.id,
            name: permission.name,
            scopes: permission.scopes
        })),
        ...(group.subscriptionUrl === null
            ? {}
            : { subscriptionUrl: group.subscriptionUrl })
    };
}

function toMembershipsData(response: {
    userId: string;
    asOf: number;
    items: Array<{
        groupId: string;
        group: Parameters<typeof toCatalogGroup>[0];
        status: 'active' | 'scheduled';
        startsAt: number;
        expiresAt: number;
    }>;
    catalog: Array<Parameters<typeof toCatalogGroup>[0]>;
    accountScopes: string[];
    effectiveQuota: {
        tokenLimit: number;
        refillAmount: number;
        refillIntervalSeconds: number;
    };
    quotaBreakdown: {
        baseline: { tokenLimit: number; refillAmount: number };
        sponsorship: { tokenLimit: number | null; refillAmount: number | null };
    };
}) {
    return {
        userId: response.userId,
        asOf: response.asOf,
        items: response.items.map(toAuthMembershipItem),
        catalog: response.catalog.map(toCatalogGroup),
        accountScopes: response.accountScopes,
        effectiveQuota: response.effectiveQuota,
        quotaBreakdown: {
            baseline: response.quotaBreakdown.baseline,
            sponsorship: {
                ...(response.quotaBreakdown.sponsorship.tokenLimit === null
                    ? {}
                    : {
                          tokenLimit:
                              response.quotaBreakdown.sponsorship.tokenLimit
                      }),
                ...(response.quotaBreakdown.sponsorship.refillAmount === null
                    ? {}
                    : {
                          refillAmount:
                              response.quotaBreakdown.sponsorship.refillAmount
                      })
            }
        }
    };
}

export async function getAuthMeV2Adapter(ctx: V2OperationContext) {
    return getAuthMe(ctx.identity);
}

export async function getAuthApiKeysV2Adapter(ctx: V2OperationContext) {
    return getAuthApiKeys(ctx.identity);
}

export async function postAuthApiKeysV2Adapter(ctx: V2OperationContext) {
    const request = ctx.request as PostAuthApiKeysRequest;
    return postAuthApiKeys(ctx.identity, {
        name: request.name,
        activeFrom:
            request.activeFrom === undefined
                ? undefined
                : Number(request.activeFrom),
        expiresAt:
            request.expiresAt === undefined
                ? undefined
                : Number(request.expiresAt),
        scopes: request.scopes
    });
}

export async function deleteAuthApiKeyV2Adapter(ctx: V2OperationContext) {
    return deleteAuthApiKey(ctx.identity.id, ctx.params.revokeId ?? '');
}

export async function getAuthAuthorizationsV2Adapter(ctx: V2OperationContext) {
    return getAuthAuthorizations(ctx.identity.id);
}

export async function deleteAuthAuthorizationV2Adapter(
    ctx: V2OperationContext
) {
    return deleteAuthAuthorization(ctx.identity.id, ctx.params.clientId ?? '');
}

export async function getAuthEventSubscriptionsV2Adapter(
    ctx: V2OperationContext
) {
    const response = getAuthEventSubscriptions(ctx.identity.id);
    return {
        userId: response.userId,
        maxEntries: response.maxEntries,
        items: response.items.map((item) => ({
            target: toProtoEventTarget(item.target),
            label: item.label,
            path: item.path,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
        }))
    };
}

export async function putAuthEventSubscriptionsV2Adapter(
    ctx: V2OperationContext
) {
    const request = ctx.request as PutAuthEventSubscriptionsRequest;
    ensure(request.target !== undefined, 400, 'invalid_param', '缺少 target');
    const target = fromProtoEventTarget(request.target.target);
    ensure(target !== null, 400, 'invalid_param', '订阅目标无效');
    const response = putAuthEventSubscriptions(ctx.identity.id, target);
    return {
        userId: response.userId,
        maxEntries: response.maxEntries,
        items: response.items.map((item) => ({
            target: toProtoEventTarget(item.target),
            label: item.label,
            path: item.path,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
        }))
    };
}

export async function deleteAuthEventSubscriptionsV2Adapter(
    ctx: V2OperationContext
) {
    const request = ctx.request as DeleteAuthEventSubscriptionsRequest;
    ensure(request.target !== undefined, 400, 'invalid_param', '缺少 target');
    const target = fromProtoEventTarget(request.target.target);
    ensure(target !== null, 400, 'invalid_param', '订阅目标无效');
    const response = deleteAuthEventSubscriptions(ctx.identity.id, target);
    return {
        userId: response.userId,
        maxEntries: response.maxEntries,
        items: response.items.map((item) => ({
            target: toProtoEventTarget(item.target),
            label: item.label,
            path: item.path,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
        }))
    };
}

export async function getAuthFavoritesV2Adapter(ctx: V2OperationContext) {
    const response = getAuthFavorites(ctx.identity.id);
    return {
        userId: response.userId,
        maxEntries: response.maxEntries,
        items: response.items.map((item) => ({
            target: toProtoFavoriteTarget(item.target),
            tags: item.tags,
            starredAt: item.starredAt
        }))
    };
}

export async function putAuthFavoritesV2Adapter(ctx: V2OperationContext) {
    const request = ctx.request as PutAuthFavoritesRequest;
    ensure(request.target !== undefined, 400, 'invalid_param', '缺少 target');
    const target = fromProtoFavoriteTarget(request.target.target);
    ensure(target !== null, 400, 'invalid_param', '收藏目标无效');
    const response = putAuthFavorites(ctx.identity.id, target, request.tags);
    return {
        userId: response.userId,
        maxEntries: response.maxEntries,
        items: response.items.map((item) => ({
            target: toProtoFavoriteTarget(item.target),
            tags: item.tags,
            starredAt: item.starredAt
        }))
    };
}

export async function deleteAuthFavoritesV2Adapter(ctx: V2OperationContext) {
    const request = ctx.request as DeleteAuthFavoritesRequest;
    ensure(request.target !== undefined, 400, 'invalid_param', '缺少 target');
    const target = fromProtoFavoriteTarget(request.target.target);
    ensure(target !== null, 400, 'invalid_param', '收藏目标无效');
    const response = deleteAuthFavorites(ctx.identity.id, target);
    return {
        userId: response.userId,
        maxEntries: response.maxEntries,
        items: response.items.map((item) => ({
            target: toProtoFavoriteTarget(item.target),
            tags: item.tags,
            starredAt: item.starredAt
        }))
    };
}

export async function postAuthLoginV2Adapter(ctx: V2OperationContext) {
    const request = ctx.request as PostAuthLoginRequest;
    const session = postAuthLogin({
        username: request.username,
        passwordDigest: request.passwordDigest
    });
    setAuthCookie(ctx.event, session.apiKey);
    return toSessionData(toPublicAuthSession(session));
}

export async function postAuthRegisterV2Adapter(ctx: V2OperationContext) {
    const request = ctx.request as PostAuthRegisterRequest;
    const session = postAuthRegister({
        username: request.username,
        passwordDigest: request.passwordDigest
    });
    setAuthCookie(ctx.event, session.apiKey);
    return toSessionData(toPublicAuthSession(session));
}

export async function postAuthLogoutV2Adapter(ctx: V2OperationContext) {
    const response = postAuthLogout(ctx.identity);
    clearAuthCookie(ctx.event);
    return response;
}

export async function getAuthMembershipsV2Adapter(ctx: V2OperationContext) {
    return toMembershipsData(getAuthMemberships(ctx.identity.id));
}

export async function postAuthRedeemMembershipV2Adapter(
    ctx: V2OperationContext
) {
    const request = ctx.request as PostAuthRedeemMembershipRequest;
    const response = postAuthRedeemMembership(ctx.identity.id, request.code);
    return {
        code: response.code,
        redeemedAt: response.redeemedAt,
        durationDays: response.durationDays,
        membership: toAuthMembershipItem(response.membership),
        memberships: toMembershipsData(response.memberships)
    };
}

export async function patchAuthPasswordV2Adapter(ctx: V2OperationContext) {
    const request = ctx.request as PatchAuthPasswordRequest;
    const nextSession = patchAuthPassword(ctx.identity.id, {
        currentPasswordDigest: request.currentPasswordDigest,
        newPasswordDigest: request.newPasswordDigest
    });
    setAuthCookie(ctx.event, nextSession.apiKey);
    return toSessionData(toPublicAuthSession(nextSession));
}

export async function postAuthSendQqBindingCodeV2Adapter(
    ctx: V2OperationContext
) {
    const request = ctx.request as PostAuthSendQqBindingCodeRequest;
    ensure(
        request.qqNumber.length > 0,
        400,
        'invalid_param',
        'qqNumber 不能为空'
    );

    const qqNumber = normalizeQqNumber(request.qqNumber);
    if (isQqNumberInBanList(qqNumber)) {
        queueQqBanListUserBan(ctx.identity.id, qqNumber, ctx.event);
        const now = getNowSeconds();
        return {
            expiresAt: now + useConfig().user.qqBinding.codeTtlSeconds,
            nextSendAt: now + useConfig().user.qqBinding.sendIntervalSeconds
        };
    }
    if (queueRiskQqBindingEscalation(ctx.identity.id, qqNumber, ctx.event)) {
        const now = getNowSeconds();
        return {
            expiresAt: now + useConfig().user.qqBinding.codeTtlSeconds,
            nextSendAt: now + useConfig().user.qqBinding.sendIntervalSeconds
        };
    }

    return postAuthSendQqBindingCode(ctx.identity.id, qqNumber);
}

export async function postAuthUnbindQqBindingV2Adapter(
    ctx: V2OperationContext
) {
    return postAuthUnbindQqBinding(ctx.identity.id);
}

export async function postAuthVerifyQqBindingV2Adapter(
    ctx: V2OperationContext
) {
    const request = ctx.request as PostAuthVerifyQqBindingRequest;
    return postAuthVerifyQqBinding(
        ctx.identity.id,
        request.qqNumber,
        request.code
    );
}

export async function getAuthSettingsV2Adapter(ctx: V2OperationContext) {
    return getAuthSettings(ctx.identity.id);
}

export async function patchAuthSettingsV2Adapter(ctx: V2OperationContext) {
    const request = ctx.request as PatchAuthSettingsRequest;
    ensure(
        request.userPreference !== undefined,
        400,
        'invalid_param',
        'userPreference 必须是对象'
    );
    return patchAuthSettings(
        ctx.identity.id,
        request.userPreference.saveSearchHistory
    );
}

export async function getAuthSubscriptionsV2Adapter(ctx: V2OperationContext) {
    return getAuthSubscriptions(ctx.identity.id);
}

export async function putAuthSubscriptionsV2Adapter(ctx: V2OperationContext) {
    const request = ctx.request as PutAuthSubscriptionsRequest;
    const subscription = request.subscription;
    ensure(
        subscription !== undefined,
        400,
        'invalid_param',
        'subscription 必须是对象'
    );
    ensure(
        subscription.keys !== undefined,
        400,
        'invalid_param',
        'subscription.keys 必须是对象'
    );

    return putAuthSubscriptions(
        ctx.identity.id,
        {
            name: request.name === undefined ? undefined : request.name,
            endpoint: subscription.endpoint,
            expirationTime:
                subscription.expirationTime === undefined
                    ? null
                    : Number(subscription.expirationTime),
            keys: {
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth
            }
        },
        getHeader(ctx.event, 'user-agent') ?? ''
    );
}

export async function deleteAuthSubscriptionV2Adapter(ctx: V2OperationContext) {
    return deleteAuthSubscription(ctx.identity.id, ctx.params.id ?? '');
}

export async function patchAuthSubscriptionV2Adapter(ctx: V2OperationContext) {
    const request = ctx.request as PatchAuthSubscriptionRequest;
    return patchAuthSubscription(
        ctx.identity.id,
        ctx.params.id ?? '',
        request.name
    );
}
