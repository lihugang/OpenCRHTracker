import { defineEventHandler, readBody } from 'h3';
import { redeemMembershipCode } from '~/server/services/membershipCodeStore';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

interface AuthRedeemMembershipBody {
    code?: unknown;
}

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            cors: true,
            requiredScopes: [API_SCOPES.auth.memberships.redeem],
            fixedCost: getFixedCost('authRedeemMembership')
        },
        async ({ identity }) => {
            const body =
                (await readBody<AuthRedeemMembershipBody | null>(event)) ?? {};
            ensure(
                typeof body === 'object' &&
                    body !== null &&
                    !Array.isArray(body),
                400,
                'invalid_param',
                '请求体必须是 JSON 对象'
            );
            ensure(
                typeof body.code === 'string' &&
                    body.code.trim().length > 0 &&
                    body.code.length <= 64,
                400,
                'invalid_param',
                'code 必须是有效的兑换码字符串'
            );

            return redeemMembershipCode(body.code, identity.id);
        }
    );
});
