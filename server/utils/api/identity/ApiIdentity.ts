import type { QuotaSubject } from '~/server/utils/api/quota/QuotaTypes';

export default interface ApiIdentity extends QuotaSubject {
    type: 'anonymous' | 'user';
    id: string;
    apiKey?: string;
    keyId?: string;
    scopes: string[];
    createdAt?: number;
    expiresAt?: number;
    dailyTokenLimit?: number;
}
