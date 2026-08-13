import {
    deleteAdminQqBanEntry,
    deleteAdminUserMembership,
    getAdminUserMemberships,
    getAdminUsers,
    getAdminUsersSecurity,
    postAdminQqBanEntry,
    postAdminUsersQuotaReset,
    postAdminUsersRiskClear,
    postAdminUsersStatus,
    putAdminUserMembership
} from '~/server/domain/admin/users';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import ensure from '~/server/utils/api/executor/ensure';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import type { V2OperationContext } from '~/server/utils/api/v2/V2Types';

const SECONDS_PER_DAY = 24 * 60 * 60;

export async function getAdminUsersV2Adapter(ctx: V2OperationContext) {
    return getAdminUsers();
}

export async function getAdminUserMembershipsV2Adapter(
    ctx: V2OperationContext
) {
    const userId = (ctx.params.userId ?? '').trim();
    ensure(userId.length > 0, 400, 'invalid_param', 'userId 不能为空');
    return getAdminUserMemberships(userId);
}

export async function putAdminUserMembershipV2Adapter(
    ctx: V2OperationContext
) {
    const userId = (ctx.params.userId ?? '').trim();
    const groupId = (ctx.params.groupId ?? '').trim();
    const request = ctx.request as {
        startsAt?: number;
        durationDays?: number;
    };
    ensure(userId.length > 0, 400, 'invalid_param', 'userId 不能为空');
    ensure(
        groupId.length > 0,
        400,
        'invalid_param',
        '赞助权益组 ID 不能为空'
    );
    if (
        typeof request.startsAt !== 'number' ||
        !Number.isSafeInteger(request.startsAt) ||
        request.startsAt <= 0
    ) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            'startsAt 必须为正整数 Unix 秒时间戳'
        );
    }
    if (
        typeof request.durationDays !== 'number' ||
        !Number.isSafeInteger(request.durationDays) ||
        request.durationDays <= 0
    ) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            'durationDays 必须为正整数'
        );
    }
    const expiresAt =
        request.startsAt + request.durationDays * SECONDS_PER_DAY;
    ensure(
        Number.isSafeInteger(expiresAt) &&
            expiresAt > request.startsAt &&
            expiresAt > getNowSeconds(),
        400,
        'invalid_param',
        '计算得到的赞助权益到期时间必须晚于当前时间'
    );

    return putAdminUserMembership({
        userId,
        groupId,
        startsAt: request.startsAt,
        expiresAt,
        actorUserId: ctx.identity.id
    });
}

export async function deleteAdminUserMembershipV2Adapter(
    ctx: V2OperationContext
) {
    const userId = (ctx.params.userId ?? '').trim();
    const groupId = (ctx.params.groupId ?? '').trim();
    ensure(userId.length > 0, 400, 'invalid_param', 'userId 不能为空');
    ensure(
        groupId.length > 0,
        400,
        'invalid_param',
        '赞助权益组 ID 不能为空'
    );
    return deleteAdminUserMembership(
        userId,
        groupId,
        ctx.identity.id
    );
}

export async function postAdminQqBanEntryV2Adapter(
    ctx: V2OperationContext
) {
    const qqNumber = (ctx.request as { qqNumber?: string }).qqNumber ?? '';
    return postAdminQqBanEntry(qqNumber, ctx.identity.id);
}

export async function deleteAdminQqBanEntryV2Adapter(
    ctx: V2OperationContext
) {
    return deleteAdminQqBanEntry(
        ctx.params.qqNumber ?? '',
        ctx.identity.id
    );
}

export async function postAdminUsersQuotaResetV2Adapter(
    ctx: V2OperationContext
) {
    const userId = (ctx.request as { userId?: string }).userId ?? '';
    ensure(userId.length > 0, 400, 'invalid_param', 'userId 不能为空');
    return postAdminUsersQuotaReset(userId);
}

export async function postAdminUsersRiskClearV2Adapter(
    ctx: V2OperationContext
) {
    const userId = (ctx.request as { userId?: string }).userId ?? '';
    ensure(userId.length > 0, 400, 'invalid_param', 'userId 不能为空');
    return postAdminUsersRiskClear(userId, ctx.identity.id);
}

export async function getAdminUsersSecurityV2Adapter(
    ctx: V2OperationContext
) {
    return getAdminUsersSecurity();
}

export async function postAdminUsersStatusV2Adapter(
    ctx: V2OperationContext
) {
    const request = ctx.request as {
        userId?: string;
        banned?: boolean;
    };
    const userId = (request.userId ?? '').trim();
    ensure(userId.length > 0, 400, 'invalid_param', 'userId 不能为空');
    if (
        request.banned === undefined ||
        typeof request.banned !== 'boolean'
    ) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            'banned 必须为布尔值'
        );
    }
    return postAdminUsersStatus(
        {
            userId,
            banned: request.banned
        },
        ctx.identity.id
    );
}
