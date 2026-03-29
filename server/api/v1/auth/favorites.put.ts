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
                '\u8bf7\u6c42\u4f53\u5fc5\u987b\u662f JSON \u5bf9\u8c61'
            );
            ensure(
                body.starredAt === undefined,
                400,
                'invalid_param',
                '\u8bf7\u6c42\u4f53\u5305\u542b\u5ba2\u6237\u7aef\u4e0d\u5141\u8bb8\u4f20\u5165\u7684\u5b57\u6bb5'
            );
            ensure(
                isLookupTargetType(body.type),
                400,
                'invalid_param',
                'type \u5fc5\u987b\u662f\u6709\u6548\u7684\u6536\u85cf\u7c7b\u578b'
            );
            ensure(
                typeof body.code === 'string' && body.code.trim().length > 0,
                400,
                'invalid_param',
                'code \u4e0d\u80fd\u4e3a\u7a7a'
            );
            ensure(
                Array.isArray(body.tags),
                400,
                'invalid_param',
                'tags \u5fc5\u987b\u662f\u5b57\u7b26\u4e32\u6570\u7ec4'
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
                    `tags[${index}] \u5fc5\u987b\u662f\u5b57\u7b26\u4e32`
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
