import { defineEventHandler, readBody } from 'h3';
import getLogger from '~/server/libs/log4js';
import { sendQqBindingCode } from '~/server/services/qqBindingService';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

interface SendQqBindingCodeBody {
    qqNumber?: unknown;
}

const logger = getLogger('auth-qq-binding-api');

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

            try {
                return await sendQqBindingCode(
                    identity.id,
                    identity.id,
                    body.qqNumber
                );
            } catch (error) {
                if (
                    !(error instanceof ApiRequestError) ||
                    error.statusCode >= 500
                ) {
                    logger.error(
                        `qq_binding_send_code_failed userId=${identity.id} error=${formatErrorForLog(error)}`
                    );
                }

                throw error;
            }
        }
    )
);
