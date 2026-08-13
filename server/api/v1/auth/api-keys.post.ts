import { defineEventHandler, readBody } from 'h3';
import {
    postAuthApiKeys,
    type PostAuthApiKeysBody
} from '~/server/domain/auth';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

interface CreateApiKeyBody extends PostAuthApiKeysBody {
    issuer?: unknown;
    dailyTokenLimit?: unknown;
    userId?: unknown;
    keyId?: unknown;
    revokeId?: unknown;
    apiKey?: unknown;
}

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.auth.apiKeys.create],
            fixedCost: getFixedCost('authIssueApiKey')
        },
        async ({ identity }) => {
            const body = (await readBody<CreateApiKeyBody | null>(event)) ?? {};

            ensure(
                typeof body === 'object' &&
                    body !== null &&
                    !Array.isArray(body),
                400,
                'invalid_param',
                '请求体必须是 JSON 对象'
            );

            ensure(
                body.issuer === undefined &&
                    body.dailyTokenLimit === undefined &&
                    body.userId === undefined &&
                    body.keyId === undefined &&
                    body.revokeId === undefined &&
                    body.apiKey === undefined,
                400,
                'invalid_param',
                '请求体包含客户端不允许传入的字段'
            );

            return postAuthApiKeys(identity, body);
        }
    );
});
