import { createError, defineEventHandler } from 'h3';
import { buildUserInfo } from '~/server/services/oauthStore';
import resolveIdentity from '~/server/utils/api/identity/resolveIdentity';

export default defineEventHandler((event) => {
    const identity = resolveIdentity(event);
    if (identity.type !== 'user') {
        throw createError({
            statusCode: 401,
            statusMessage: 'Unauthorized'
        });
    }

    const userInfo = buildUserInfo(identity.id);
    if (!userInfo) {
        throw createError({
            statusCode: 401,
            statusMessage: 'Unauthorized'
        });
    }

    return userInfo;
});
