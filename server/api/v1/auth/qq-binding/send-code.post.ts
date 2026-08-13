import { defineEventHandler, readBody } from 'h3';
import useConfig from '~/server/config';
import { postAuthSendQqBindingCode } from '~/server/domain/auth';
import { normalizeQqNumber } from '~/server/services/qqBindingService';
import {
    isQqNumberInBanList,
    queueQqBanListUserBan,
    queueRiskQqBindingEscalation
} from '~/server/services/userBanSecurityStore';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

interface SendQqBindingCodeBody {
    qqNumber?: unknown;
}

export default defineEventHandler(async (event) =>
    executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.auth.qqBinding.send],
            fixedCost: getFixedCost('authSendQqBindingCode')
        },
        async ({ identity }) => {
            const body = await readBody<SendQqBindingCodeBody>(event);
            ensure(
                body && typeof body === 'object' && !Array.isArray(body),
                400,
                'invalid_param',
                '请求体必须是 JSON 对象'
            );
            ensure(
                Object.prototype.hasOwnProperty.call(body, 'qqNumber'),
                400,
                'invalid_param',
                'qqNumber 不能为空'
            );

            const qqNumber = normalizeQqNumber(body.qqNumber);
            if (isQqNumberInBanList(qqNumber)) {
                queueQqBanListUserBan(identity.id, qqNumber, event);
                const now = getNowSeconds();
                return {
                    expiresAt: now + useConfig().user.qqBinding.codeTtlSeconds,
                    nextSendAt:
                        now + useConfig().user.qqBinding.sendIntervalSeconds
                };
            }
            if (queueRiskQqBindingEscalation(identity.id, qqNumber, event)) {
                const now = getNowSeconds();
                return {
                    expiresAt: now + useConfig().user.qqBinding.codeTtlSeconds,
                    nextSendAt:
                        now + useConfig().user.qqBinding.sendIntervalSeconds
                };
            }

            return postAuthSendQqBindingCode(identity.id, qqNumber);
        }
    )
);
