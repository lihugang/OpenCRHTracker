import { defineEventHandler, readBody } from 'h3';
import useConfig from '~/server/config';
import { createApiKey } from '~/server/services/authStore';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import ensurePayloadStringLength from '~/server/utils/api/payload/ensurePayloadStringLength';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import isScopeSubset from '~/server/utils/api/scopes/isScopeSubset';
import normalizeScopeList from '~/server/utils/api/scopes/normalizeScopeList';
import type { AuthIssueApiKeyResponse } from '~/types/auth';
import {
    normalizeApiKeyName,
    validateApiKeyName
} from '~/utils/auth/apiKeyName';

interface CreateApiKeyBody {
    name?: unknown;
    activeFrom?: number;
    expiresAt?: number;
    scopes?: string[];
    issuer?: unknown;
    dailyTokenLimit?: unknown;
    userId?: unknown;
    keyId?: unknown;
    revokeId?: unknown;
    apiKey?: unknown;
}

function ensureIntegerTimestamp(
    value: unknown,
    field: 'activeFrom' | 'expiresAt'
) {
    ensure(
        typeof value === 'number' &&
            Number.isFinite(value) &&
            Number.isInteger(value) &&
            value > 0,
        400,
        'invalid_param',
        `${field} 必须是正整数 Unix 时间戳`
    );

    return value;
}

export default defineEventHandler(async (event) => {
    const config = useConfig();
    const creatableScopes = config.api.permissions.creatableKeyMaxScopes;

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

            ensure(
                typeof body.name === 'string',
                400,
                'invalid_param',
                'name 不能为空'
            );
            ensurePayloadStringLength(
                body.name,
                'name',
                config.api.payload.maxStringLength
            );

            const normalizedName = normalizeApiKeyName(body.name);
            const nameError = validateApiKeyName(
                normalizedName,
                config.user.apiKeyNameLength
            );
            if (nameError) {
                throw new ApiRequestError(400, 'invalid_param', nameError);
            }

            const activeFrom = ensureIntegerTimestamp(
                body.activeFrom,
                'activeFrom'
            );
            const expiresAt = ensureIntegerTimestamp(
                body.expiresAt,
                'expiresAt'
            );

            ensure(
                activeFrom < expiresAt,
                400,
                'invalid_param',
                'expiresAt 必须大于 activeFrom'
            );
            ensure(
                expiresAt - activeFrom <= config.user.apiKeyMaxLifetimeSeconds,
                400,
                'invalid_param',
                'API Key 有效期超过服务端配置上限'
            );

            ensure(
                Array.isArray(body.scopes) && body.scopes.length > 0,
                400,
                'invalid_param',
                'scopes 必须是非空字符串数组'
            );

            const rawScopes = body.scopes.map((scope, index) => {
                ensure(
                    typeof scope === 'string',
                    400,
                    'invalid_param',
                    `scopes[${index}] 必须是字符串`
                );
                ensurePayloadStringLength(
                    scope,
                    `scopes[${index}]`,
                    config.api.payload.maxStringLength
                );
                return scope;
            });

            let requestedScopes: string[];
            try {
                requestedScopes = normalizeScopeList(rawScopes);
            } catch (error) {
                throw new ApiRequestError(
                    400,
                    'invalid_param',
                    error instanceof Error ? error.message : 'scopes 无效'
                );
            }

            if (!isScopeSubset(requestedScopes, identity.scopes)) {
                throw new ApiRequestError(
                    403,
                    'forbidden_scope',
                    'scopes 必须是当前 API Key 权限范围的子集'
                );
            }

            if (!isScopeSubset(requestedScopes, creatableScopes)) {
                throw new ApiRequestError(
                    403,
                    'forbidden_scope',
                    'scopes 超出服务端允许创建的权限范围'
                );
            }

            const apiKey = createApiKey(identity.id, {
                name: normalizedName,
                issuer: 'api',
                scopes: requestedScopes,
                activeFrom,
                expiresAt
            });
            const response: AuthIssueApiKeyResponse = {
                userId: identity.id,
                name: apiKey.name,
                revokeId: apiKey.revokeId,
                issuer: apiKey.issuer,
                apiKey: apiKey.apiKey,
                maskedApiKey: apiKey.maskedApiKey,
                activeFrom: apiKey.activeFrom,
                expiresAt: apiKey.expiresAt,
                dailyTokenLimit: apiKey.dailyTokenLimit,
                scopes: apiKey.scopes
            };

            return response;
        }
    );
});
