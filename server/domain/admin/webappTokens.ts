import { revokeApiKeysByIssuer } from '~/server/services/authStore';
import type ApiIdentity from '~/server/utils/api/identity/ApiIdentity';

export function postAdminWebappTokensRevokeAll(identity: ApiIdentity) {
    const result = revokeApiKeysByIssuer('webapp');

    return {
        issuer: 'webapp',
        revokedCount: result.revokedCount,
        revokedAt: result.revokedAt,
        revokedCurrentSession: identity.issuer === 'webapp'
    };
}
