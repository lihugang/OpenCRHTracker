import { computed, watch } from 'vue';
import type {
    AuthSession,
    AuthSettingsResponse,
    AuthUserPreference
} from '~/types/auth';
import type { TrackerApiResponse } from '~/types/homepage';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';

type UserSettingsState = 'idle' | 'loading' | 'success' | 'error';

function createDefaultUserPreference(): AuthUserPreference {
    return {
        saveSearchHistory: true
    };
}

function hasSettingsScope(session: AuthSession | null, requiredScope: string) {
    return (session?.scopes ?? []).some((scope) => {
        const normalizedScope = scope.trim().toLowerCase();
        const normalizedRequired = requiredScope.trim().toLowerCase();

        return (
            normalizedScope === normalizedRequired ||
            normalizedRequired.startsWith(`${normalizedScope}.`)
        );
    });
}

function normalizeUserPreference(
    value: AuthSettingsResponse['userPreference'] | null | undefined
) {
    return {
        ...createDefaultUserPreference(),
        ...(value ?? {})
    };
}

export function useUserSettings() {
    const { session, hydrated, isAuthenticated, isRefreshing } = useAuthState();
    const userPreference = useState<AuthUserPreference>(
        'user-settings-preference',
        createDefaultUserPreference
    );
    const state = useState<UserSettingsState>(
        'user-settings-state',
        () => 'idle'
    );
    const errorMessage = useState('user-settings-error', () => '');
    const loadedUserId = useState('user-settings-user-id', () => '');
    const initialized = useState('user-settings-initialized', () => false);

    const canReadSettings = computed(() =>
        hasSettingsScope(session.value, 'api.auth.settings.read')
    );
    const canWriteSettings = computed(() =>
        hasSettingsScope(session.value, 'api.auth.settings.write')
    );

    const isReady = computed(() => {
        if (import.meta.server) {
            return true;
        }

        if (!hydrated.value || isRefreshing.value) {
            return false;
        }

        if (
            !isAuthenticated.value ||
            !session.value ||
            !canReadSettings.value
        ) {
            return true;
        }

        return (
            loadedUserId.value === session.value.userId &&
            (state.value === 'success' || state.value === 'error')
        );
    });

    function reset() {
        userPreference.value = createDefaultUserPreference();
        state.value = 'idle';
        errorMessage.value = '';
        loadedUserId.value = '';
    }

    async function refresh(force = false) {
        if (import.meta.server) {
            reset();
            return userPreference.value;
        }

        if (!hydrated.value || isRefreshing.value) {
            return userPreference.value;
        }

        if (
            !isAuthenticated.value ||
            !session.value ||
            !canReadSettings.value
        ) {
            reset();
            return userPreference.value;
        }

        if (
            !force &&
            loadedUserId.value === session.value.userId &&
            (state.value === 'success' || state.value === 'loading')
        ) {
            return userPreference.value;
        }

        state.value = 'loading';
        errorMessage.value = '';

        try {
            const requestFetch = import.meta.server
                ? useRequestFetch()
                : $fetch;
            const response = await requestFetch<
                TrackerApiResponse<AuthSettingsResponse>
            >('/api/v1/auth/settings', {
                retry: 0
            });

            if (!response.ok) {
                throw {
                    data: response
                };
            }

            userPreference.value = normalizeUserPreference(
                response.data.userPreference
            );
            loadedUserId.value = response.data.userId;
            state.value = 'success';
            errorMessage.value = '';
        } catch (error) {
            userPreference.value = createDefaultUserPreference();
            loadedUserId.value = session.value.userId;
            state.value = 'error';
            errorMessage.value = getApiErrorMessage(error, '加载设置失败。');
        }

        return userPreference.value;
    }

    async function updateUserPreferencePreference(
        nextPreference: Partial<AuthUserPreference>
    ) {
        if (!import.meta.client || !session.value || !canWriteSettings.value) {
            return false;
        }

        const requestedPreference = {
            ...userPreference.value,
            ...nextPreference
        };

        state.value = 'loading';
        errorMessage.value = '';

        try {
            const response = await useNuxtApp().$csrfFetch<
                TrackerApiResponse<AuthSettingsResponse>
            >('/api/v1/auth/settings', {
                method: 'PATCH',
                body: {
                    userPreference: requestedPreference
                },
                retry: 0
            });

            if (
                !response ||
                typeof response !== 'object' ||
                typeof response.ok !== 'boolean'
            ) {
                throw new Error('设置接口未返回有效数据。');
            }

            if (!response.ok) {
                throw {
                    data: response
                };
            }

            userPreference.value = normalizeUserPreference(
                response.data.userPreference
            );
            loadedUserId.value = response.data.userId;
            state.value = 'success';
            errorMessage.value = '';

            return true;
        } catch (error) {
            loadedUserId.value = session.value.userId;
            state.value = 'error';
            errorMessage.value = getApiErrorMessage(error, '保存设置失败。');
            return false;
        }
    }

    function ensureInitialized() {
        if (!import.meta.client || initialized.value) {
            return;
        }

        initialized.value = true;

        watch(
            () =>
                [
                    hydrated.value,
                    isRefreshing.value,
                    session.value?.userId ?? '',
                    canReadSettings.value
                ] as const,
            (
                [
                    nextHydrated,
                    nextIsRefreshing,
                    nextUserId,
                    nextCanReadSettings
                ],
                previousValue
            ) => {
                const [
                    previousHydrated,
                    previousIsRefreshing,
                    previousUserId,
                    previousCanReadSettings
                ] = previousValue ?? [false, false, '', false];

                if (!nextHydrated || nextIsRefreshing) {
                    return;
                }

                if (!nextUserId || !nextCanReadSettings) {
                    reset();
                    return;
                }

                if (
                    !previousHydrated ||
                    previousIsRefreshing !== nextIsRefreshing ||
                    previousUserId !== nextUserId ||
                    previousCanReadSettings !== nextCanReadSettings ||
                    loadedUserId.value !== nextUserId ||
                    state.value === 'idle'
                ) {
                    void refresh(
                        previousUserId !== nextUserId ||
                            previousCanReadSettings !== nextCanReadSettings ||
                            loadedUserId.value !== nextUserId
                    );
                }
            },
            {
                immediate: true
            }
        );
    }

    ensureInitialized();

    return {
        userPreference: computed(() => userPreference.value),
        state: computed(() => state.value),
        errorMessage: computed(() => errorMessage.value),
        canReadSettings,
        canWriteSettings,
        isReady,
        refresh,
        updateUserPreference: updateUserPreferencePreference
    };
}
