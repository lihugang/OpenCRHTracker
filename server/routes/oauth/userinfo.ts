import { createError, defineEventHandler } from 'h3';
import { buildUserInfo } from '~/server/services/oauthStore';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import hasScope from '~/server/utils/api/scopes/hasScope';
import resolveIdentity from '~/server/utils/api/identity/resolveIdentity';

export default defineEventHandler((event) => {
    const identity = resolveIdentity(event);
    if (identity.type !== 'user') {
        throw createError({
            statusCode: 401,
            statusMessage: 'Unauthorized'
        });
    }

    const userInfo = buildUserInfo(
        identity.id,
        hasScope(identity.scopes, API_SCOPES.auth.me)
    );
    if (!userInfo) {
        throw createError({
            statusCode: 401,
            statusMessage: 'Unauthorized'
        });
    }

    return userInfo;
});
