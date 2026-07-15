import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { upsertUserMembership } from '~/server/services/membershipStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import type { AdminUpsertUserMembershipRequest } from '~/types/membership';

interface AdminUpsertUserMembershipBody {
    startsAt?: unknown;
    durationDays?: unknown;
}

const SECONDS_PER_DAY = 24 * 60 * 60;

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.admin]
        },
        async ({ identity }) => {
            const userId = (getRouterParam(event, 'userId') ?? '').trim();
            const groupId = (getRouterParam(event, 'groupId') ?? '').trim();
            ensure(userId.length > 0, 400, 'invalid_param', 'userId 不能为空');
            ensure(
                groupId.length > 0,
                400,
                'invalid_param',
                '赞助权益组 ID 不能为空'
            );

            const body =
                (await readBody<AdminUpsertUserMembershipBody | null>(event)) ??
                {};
            ensure(
                typeof body === 'object' &&
                    body !== null &&
                    !Array.isArray(body),
                400,
                'invalid_param',
                '请求体必须是 JSON 对象'
            );
            ensure(
                typeof body.startsAt === 'number' &&
                    Number.isSafeInteger(body.startsAt) &&
                    body.startsAt > 0,
                400,
                'invalid_param',
                'startsAt 必须为正整数 Unix 秒时间戳'
            );
            ensure(
                body.durationDays === null ||
                    (typeof body.durationDays === 'number' &&
                        Number.isSafeInteger(body.durationDays) &&
                        body.durationDays > 0),
                400,
                'invalid_param',
                'durationDays 必须为正整数或 null'
            );

            const request: AdminUpsertUserMembershipRequest = {
                startsAt: body.startsAt,
                durationDays: body.durationDays
            };
            const expiresAt =
                request.durationDays === null
                    ? null
                    : request.startsAt + request.durationDays * SECONDS_PER_DAY;
            ensure(
                expiresAt === null ||
                    (Number.isSafeInteger(expiresAt) &&
                        expiresAt > request.startsAt &&
                        expiresAt > getNowSeconds()),
                400,
                'invalid_param',
                '计算得到的赞助权益到期时间必须晚于当前时间'
            );

            return upsertUserMembership({
                userId,
                groupId,
                startsAt: request.startsAt,
                expiresAt,
                actorUserId: identity.id
            });
        }
    );
});
