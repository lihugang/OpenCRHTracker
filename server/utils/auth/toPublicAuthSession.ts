import { maskApiKey } from '~/server/services/authStore';
import resolveUserQuotaSubject from '~/server/utils/api/quota/resolveUserQuotaSubject';
import type { AuthSession } from '~/types/auth';

interface AuthSessionLike {
    userId: string;
    revokeId: string;
    issuer: AuthSession['issuer'];
    apiKey: string;
    scopes: string[];
    activeFrom: number;
    expiresAt: number;
}

export default function toPublicAuthSession(
    session: AuthSessionLike
): AuthSession {
    const quotaSubject = resolveUserQuotaSubject(session.userId);

    return {
        userId: session.userId,
        revokeId: session.revokeId,
        issuer: session.issuer,
        maskedApiKey: maskApiKey(session.apiKey),
        scopes: session.scopes,
        activeFrom: session.activeFrom,
        expiresAt: session.expiresAt,
        dailyTokenLimit: quotaSubject.tokenLimit
    };
}
