import { defineEventHandler, readBody } from 'h3';
import useConfig from '~/server/config';
import { createApiKey, maskApiKey } from '~/server/services/authStore';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import ensurePayloadStringLength from '~/server/utils/api/payload/ensurePayloadStringLength';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import hasScope from '~/server/utils/api/scopes/hasScope';
import isScopeSubset from '~/server/utils/api/scopes/isScopeSubset';
import normalizeScopeList from '~/server/utils/api/scopes/normalizeScopeList';

interface CreateApiKeyBody {
    scopes?: string[];
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

            const requestedScopes =
                body.scopes === undefined
                    ? normalizeScopeList([
                          ...identity.scopes.filter((scope) =>
                              hasScope(creatableScopes, scope)
                          ),
                          ...creatableScopes.filter((scope) =>
                              hasScope(identity.scopes, scope)
                          )
                      ])
                    : (() => {
                          ensure(
                              Array.isArray(body.scopes),
                              400,
                              'invalid_param',
                              'scopes 必须是字符串数组'
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

                          try {
                              return normalizeScopeList(rawScopes);
                          } catch (error) {
                              throw new ApiRequestError(
                                  400,
                                  'invalid_param',
                                  error instanceof Error
                                      ? error.message
                                      : 'scopes 格式无效'
                              );
                          }
                      })();

            if (!isScopeSubset(requestedScopes, identity.scopes)) {
                throw new ApiRequestError(
                    403,
                    'forbidden_scope',
                    'scopes 必须是当前 API Key 权限的子集'
                );
            }

            if (!isScopeSubset(requestedScopes, creatableScopes)) {
                throw new ApiRequestError(
                    403,
                    'forbidden_scope',
                    'scopes 超出了允许通过 API 创建的模板范围'
                );
            }

            const apiKey = createApiKey(identity.id, requestedScopes, 'api');

            return {
                userId: identity.id,
                keyId: apiKey.keyId,
                apiKey: apiKey.apiKey,
                maskedApiKey: maskApiKey(apiKey.apiKey),
                createdAt: apiKey.createdAt,
                expiresAt: apiKey.expiresAt,
                dailyTokenLimit: apiKey.dailyTokenLimit,
                scopes: apiKey.scopes
            };
        }
    );
});
