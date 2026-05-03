import { defineEventHandler, readBody } from 'h3';
import useConfig from '~/server/config';
import { removeUserEventSubscription } from '~/server/services/userEventSubscriptionStore';
import { removeUserFavoriteLookup } from '~/server/services/userProfileStore';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import ensurePayloadStringLength from '~/server/utils/api/payload/ensurePayloadStringLength';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import type { AuthFavoritesResponse } from '~/types/auth';
import type { LookupTargetType } from '~/types/lookup';
import { isLookupTargetType } from '~/utils/lookup/lookupFavorite';

interface DeleteFavoriteBody {
    type?: unknown;
    code?: unknown;
}

export default defineEventHandler(async (event) => {
    const config = useConfig();

    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.auth.favorites.write]
        },
        async ({ identity }) => {
            const body =
                (await readBody<DeleteFavoriteBody | null>(event)) ?? {};

            ensure(
                typeof body === 'object' &&
                    body !== null &&
                    !Array.isArray(body),
                400,
                'invalid_param',
                '请求体必须是 JSON 对象'
            );
            ensure(
                isLookupTargetType(body.type),
                400,
                'invalid_param',
                'type 必须是有效的收藏类型'
            );
            ensure(
                typeof body.code === 'string' && body.code.trim().length > 0,
                400,
                'invalid_param',
                'code 不能为空'
            );

            ensurePayloadStringLength(
                body.code,
                'code',
                config.api.payload.maxStringLength
            );

            const items = removeUserFavoriteLookup(identity.id, {
                type: body.type as LookupTargetType,
                code: body.code
            });

            if (body.type === 'train' || body.type === 'emu') {
                try {
                    removeUserEventSubscription(identity.id, {
                        targetType: body.type,
                        targetId: body.code
                    });
                } catch (error) {
                    if (
                        !(
                            error instanceof ApiRequestError &&
                            error.errorCode === 'not_found'
                        )
                    ) {
                        throw error;
                    }
                }
            }

            const response: AuthFavoritesResponse = {
                userId: identity.id,
                maxEntries: config.user.favorites.maxEntries,
                items
            };

            return response;
        }
    );
});
