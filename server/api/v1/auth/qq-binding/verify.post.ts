import { defineEventHandler, readBody } from 'h3';
import { verifyQqBinding } from '~/server/services/qqBindingService';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

interface VerifyQqBindingBody {
    qqNumber?: unknown;
    code?: unknown;
}

export default defineEventHandler(async (event) =>
    executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.auth.qqBinding.verify],
            fixedCost: getFixedCost('authVerifyQqBinding')
        },
        async ({ identity }) => {
            const body = await readBody<VerifyQqBindingBody>(event);
            ensure(
                body && typeof body === 'object' && !Array.isArray(body),
                400,
                'invalid_param',
                '请求体必须是 JSON 对象'
            );
            ensure(
                Object.prototype.hasOwnProperty.call(body, 'qqNumber') &&
                    Object.prototype.hasOwnProperty.call(body, 'code'),
                400,
                'invalid_param',
                'qqNumber 和 code 不能为空'
            );

            return verifyQqBinding(identity.id, body.qqNumber, body.code);
        }
    )
);
