import type { AuthApiKeyIssuer } from '~/types/auth';
import type { QuotaSubject } from '~/server/utils/api/quota/QuotaTypes';

export default interface ApiIdentity extends QuotaSubject {
    type: 'anonymous' | 'user';
    id: string;
    apiKey?: string;
    keyId?: string;
    revokeId?: string;
    issuer?: AuthApiKeyIssuer;
    oauthClientId?: string;
    scopes: string[];
    activeFrom?: number;
    expiresAt?: number;
}
