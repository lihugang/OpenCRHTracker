import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import type ApiIdentity from '~/server/utils/api/identity/ApiIdentity';
import hasScope from '~/server/utils/api/scopes/hasScope';

export default function assertRequiredScopes(
    identity: ApiIdentity,
    requiredScopes?: string[]
) {
    if (!requiredScopes || requiredScopes.length === 0) {
        return;
    }

    for (const requiredScope of requiredScopes) {
        if (hasScope(identity.scopes, requiredScope)) {
            continue;
        }

        throw new ApiRequestError(
            403,
            'forbidden_scope',
            `当前 API Key 缺乏访问该接口的权限: ${requiredScope}`
        );
    }
}
