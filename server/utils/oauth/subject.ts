import crypto from 'crypto';
import useConfig from '~/server/config';
import type { UserRecord } from '~/server/services/authStore';

export default function buildOidcSubject(user: Pick<UserRecord, 'username' | 'created_at'>) {
    const hmac = crypto.createHmac('sha256', useConfig().oauth.subjectSalt);
    hmac.update(`${user.username}:${user.created_at}`);
    return hmac.digest('base64url');
}
