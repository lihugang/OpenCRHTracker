import hydrateBucket from '~/server/utils/api/quota/hydrateBucket';
import type { QuotaSubject } from '~/server/utils/api/quota/QuotaTypes';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

export default function getRemainTokens(subject: QuotaSubject) {
    if (import.meta.dev) {
        return subject.tokenLimit;
    }

    const bucket = hydrateBucket(subject, getNowSeconds());
    return bucket.tokens;
}
