import { defineEventHandler, getRouterParam } from 'h3';
import { revokeUserMembership } from '~/server/services/membershipStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

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

            return revokeUserMembership(userId, groupId, identity.id);
        }
    );
});
