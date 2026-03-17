import { maskApiKey } from '~/server/services/authStore';
import type { AuthSession } from '~/types/auth';

interface AuthSessionLike {
    userId: string;
    keyId: string;
    issuer: AuthSession['issuer'];
    apiKey: string;
    scopes: string[];
    activeFrom: number;
    expiresAt: number;
    dailyTokenLimit: number;
}

export default function toPublicAuthSession(
    session: AuthSessionLike
): AuthSession {
    return {
        userId: session.userId,
        keyId: session.keyId,
        issuer: session.issuer,
        maskedApiKey: maskApiKey(session.apiKey),
        scopes: session.scopes,
        activeFrom: session.activeFrom,
        expiresAt: session.expiresAt,
        dailyTokenLimit: session.dailyTokenLimit
    };
}
