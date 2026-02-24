import getNowSeconds from '~/server/utils/api/quota/getNowSeconds';
import hydrateBucket from '~/server/utils/api/quota/hydrateBucket';
import type { QuotaSubject } from '~/server/utils/api/quota/QuotaTypes';

export default function getRemainTokens(subject: QuotaSubject) {
    const bucket = hydrateBucket(subject, getNowSeconds());
    return bucket.tokens;
}
