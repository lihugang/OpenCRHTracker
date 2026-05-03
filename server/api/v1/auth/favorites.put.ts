import { defineEventHandler, readBody } from 'h3';
import useConfig from '~/server/config';
import { upsertUserFavoriteLookup } from '~/server/services/userProfileStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import ensurePayloadStringLength from '~/server/utils/api/payload/ensurePayloadStringLength';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import type { AuthFavoritesResponse } from '~/types/auth';
import type { LookupTargetType } from '~/types/lookup';
import { isLookupTargetType } from '~/utils/lookup/lookupFavorite';

interface PutFavoriteBody {
    type?: unknown;
    code?: unknown;
    tags?: unknown;
    starredAt?: unknown;
}

export default defineEventHandler(async (event) => {
    const config = useConfig();

    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.auth.favorites.write]
        },
        async ({ identity }) => {
            const body = (await readBody<PutFavoriteBody | null>(event)) ?? {};

            ensure(
                typeof body === 'object' &&
                    body !== null &&
                    !Array.isArray(body),
                400,
                'invalid_param',
                '请求体必须是 JSON 对象'
            );
            ensure(
                body.starredAt === undefined,
                400,
                'invalid_param',
                '请求体包含客户端不允许传入的字段'
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
            ensure(
                Array.isArray(body.tags),
                400,
                'invalid_param',
                'tags 必须是字符串数组'
            );

            ensurePayloadStringLength(
                body.code,
                'code',
                config.api.payload.maxStringLength
            );

            const tags = body.tags.map((tag, index) => {
                ensure(
                    typeof tag === 'string',
                    400,
                    'invalid_param',
                    `tags[${index}] 必须是字符串`
                );
                ensurePayloadStringLength(
                    tag,
                    `tags[${index}]`,
                    config.api.payload.maxStringLength
                );
                return tag;
            });

            const items = upsertUserFavoriteLookup(identity.id, {
                type: body.type as LookupTargetType,
                code: body.code,
                tags
            });
            const response: AuthFavoritesResponse = {
                userId: identity.id,
                maxEntries: config.user.favorites.maxEntries,
                items
            };

            return response;
        }
    );
});
