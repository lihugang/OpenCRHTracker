import { computed, onMounted } from 'vue';
import type { AuthMeResponse, AuthSession } from '~/types/auth';
import { V2ApiError } from '~/utils/api/v2/V2ApiError';
import { fetchAuthMe } from '~/utils/api/v2/domain/auth';

function toAuthSession(payload: AuthMeResponse): AuthSession {
    return {
        userId: payload.user.userId,
        revokeId: payload.apiKey.revokeId,
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
    const refreshPendingCount = useState(
        'auth-session-refresh-pending',
        () => 0
    );

    function setSession(nextSession: AuthSession) {
        session.value = nextSession;
    }

    function clearSession() {
        session.value = null;
    }

    async function refreshSession() {
        refreshPendingCount.value += 1;

        try {
            const data = await fetchAuthMe();
            setSession(toAuthSession(data));
            return session.value;
        } catch (error) {
            if (
                error instanceof V2ApiError &&
                (error.status === 401 || error.status === 403)
            ) {
                clearSession();
                return null;
            }

            return session.value;
        } finally {
            refreshPendingCount.value = Math.max(
                0,
                refreshPendingCount.value - 1
            );
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
        isRefreshing: computed(() => refreshPendingCount.value > 0),
        isAuthenticated: computed(() => session.value !== null),
        setSession,
        clearSession,
        ensureSession,
        refreshSession
    };
}
