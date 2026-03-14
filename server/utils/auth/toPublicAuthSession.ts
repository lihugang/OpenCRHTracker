import { maskApiKey } from '~/server/services/authStore';
import type { AuthSession } from '~/types/auth';

interface AuthSessionLike {
    userId: string;
    keyId: string;
    apiKey: string;
    scopes: string[];
    createdAt: number;
    expiresAt: number;
    dailyTokenLimit: number;
}

export default function toPublicAuthSession(
    session: AuthSessionLike
): AuthSession {
    return {
        userId: session.userId,
        keyId: session.keyId,
        maskedApiKey: maskApiKey(session.apiKey),
        scopes: session.scopes,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        dailyTokenLimit: session.dailyTokenLimit
    };
}
