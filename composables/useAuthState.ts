import { computed, onMounted } from 'vue';
import type { AuthMeResponse, AuthSession } from '~/types/auth';
import type { TrackerApiResponse } from '~/types/homepage';

function toAuthSession(payload: AuthMeResponse): AuthSession {
    return {
        userId: payload.user.userId,
        keyId: payload.apiKey.keyId,
        issuer: payload.apiKey.issuer,
        maskedApiKey: payload.apiKey.maskedApiKey,
        scopes: payload.apiKey.scopes,
        activeFrom: payload.apiKey.activeFrom,
        expiresAt: payload.apiKey.expiresAt,
        dailyTokenLimit: payload.apiKey.dailyTokenLimit
    };
}

export default function useAuthState() {
    const session = useState<AuthSession | null>('auth-session', () => null);
    const hydrated = useState('auth-session-hydrated', () => false);
    const initialized = useState('auth-session-initialized', () => false);

    function setSession(nextSession: AuthSession) {
        session.value = nextSession;
    }

    function clearSession() {
        session.value = null;
    }

    async function refreshSession() {
        const requestFetch = import.meta.server ? useRequestFetch() : $fetch;

        try {
            const response = await requestFetch<
                TrackerApiResponse<AuthMeResponse>
            >('/api/v1/auth/me', {
                retry: 0
            });

            if (response.ok) {
                setSession(toAuthSession(response.data));
                return session.value;
            }

            clearSession();
            return null;
        } catch (error) {
            const status =
                typeof error === 'object' &&
                error !== null &&
                'response' in error &&
                typeof (error as { response?: { status?: unknown } }).response
                    ?.status === 'number'
                    ? (error as { response: { status: number } }).response
                          .status
                    : 0;

            if (status === 401 || status === 403) {
                clearSession();
                return null;
            }

            return session.value;
        }
    }

    async function ensureSession() {
        if (initialized.value) {
            return session.value;
        }

        initialized.value = true;
        return refreshSession();
    }

    onMounted(() => {
        if (!hydrated.value) {
            hydrated.value = true;
            void refreshSession();
        }
    });

    return {
        session,
        hydrated: computed(() => hydrated.value),
        isAuthenticated: computed(() => session.value !== null),
        setSession,
        clearSession,
        ensureSession,
        refreshSession
    };
}
