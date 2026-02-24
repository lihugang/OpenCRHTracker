import type { QuotaSubject } from '~/server/utils/api/quota/QuotaTypes';

export default interface ApiIdentity extends QuotaSubject {
    type: 'anonymous' | 'user';
    id: string;
    apiKey?: string;
}
