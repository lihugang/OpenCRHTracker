import { defineEventHandler, readBody } from 'h3';
import useConfig from '~/server/config';
import { createApiKey, maskApiKey } from '~/server/services/authStore';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import ensurePayloadStringLength from '~/server/utils/api/payload/ensurePayloadStringLength';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import isScopeSubset from '~/server/utils/api/scopes/isScopeSubset';
import normalizeScopeList from '~/server/utils/api/scopes/normalizeScopeList';
import type { AuthIssueApiKeyResponse } from '~/types/auth';

interface CreateApiKeyBody {
    activeFrom?: number;
    expiresAt?: number;
    scopes?: string[];
    issuer?: unknown;
    dailyTokenLimit?: unknown;
    userId?: unknown;
    keyId?: unknown;
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
        `${field} must be a positive integer Unix timestamp`
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
                'Request body must be a JSON object'
            );

            ensure(
                body.issuer === undefined &&
                    body.dailyTokenLimit === undefined &&
                    body.userId === undefined &&
                    body.keyId === undefined &&
                    body.apiKey === undefined,
                400,
                'invalid_param',
                'Request body includes fields that clients are not allowed to send'
            );

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
                'expiresAt must be greater than activeFrom'
            );
            ensure(
                expiresAt - activeFrom <= config.user.apiKeyMaxLifetimeSeconds,
                400,
                'invalid_param',
                'API key lifetime exceeds the configured maximum'
            );

            ensure(
                Array.isArray(body.scopes) && body.scopes.length > 0,
                400,
                'invalid_param',
                'scopes must be a non-empty string array'
            );

            const rawScopes = body.scopes.map((scope, index) => {
                ensure(
                    typeof scope === 'string',
                    400,
                    'invalid_param',
                    `scopes[${index}] must be a string`
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
                    error instanceof Error ? error.message : 'scopes are invalid'
                );
            }

            if (!isScopeSubset(requestedScopes, identity.scopes)) {
                throw new ApiRequestError(
                    403,
                    'forbidden_scope',
                    'scopes must be a subset of the current API key scopes'
                );
            }

            if (!isScopeSubset(requestedScopes, creatableScopes)) {
                throw new ApiRequestError(
                    403,
                    'forbidden_scope',
                    'scopes exceed the server-side creatable scope limit'
                );
            }

            const apiKey = createApiKey(identity.id, {
                issuer: 'api',
                scopes: requestedScopes,
                activeFrom,
                expiresAt
            });
            const response: AuthIssueApiKeyResponse = {
                userId: identity.id,
                keyId: apiKey.keyId,
                issuer: apiKey.issuer,
                apiKey: apiKey.apiKey,
                maskedApiKey: maskApiKey(apiKey.apiKey),
                activeFrom: apiKey.activeFrom,
                expiresAt: apiKey.expiresAt,
                dailyTokenLimit: apiKey.dailyTokenLimit,
                scopes: apiKey.scopes
            };

            return response;
        }
    );
});
