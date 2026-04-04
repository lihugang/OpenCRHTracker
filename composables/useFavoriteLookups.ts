import { computed, watch } from 'vue';
import type { AuthFavoritesResponse, AuthSession } from '~/types/auth';
import type { TrackerApiResponse } from '~/types/homepage';
import type {
    FavoriteLookupInput,
    FavoriteLookupItem,
    LookupSuggestItem
} from '~/types/lookup';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import {
    buildLookupItemKeyFromItem,
    normalizeFavoriteLookupInput,
    normalizeFavoriteLookupItem
} from '~/utils/lookup/lookupFavorite';

type FavoriteState = 'idle' | 'loading' | 'success' | 'error';

function hasFavoriteScope(session: AuthSession | null, requiredScope: string) {
    return (session?.scopes ?? []).some((scope) => {
        const normalizedScope = scope.trim().toLowerCase();
        const normalizedRequired = requiredScope.trim().toLowerCase();

        return (
            normalizedScope === normalizedRequired ||
            normalizedRequired.startsWith(`${normalizedScope}.`)
        );
    });
}

export function useFavoriteLookups() {
    const { session, isAuthenticated } = useAuthState();
    const items = useState<FavoriteLookupItem[]>(
        'favorite-lookups-items',
        () => []
    );
    const state = useState<FavoriteState>(
        'favorite-lookups-state',
        () => 'idle'
    );
    const errorMessage = useState('favorite-lookups-error', () => '');
    const loadedUserId = useState('favorite-lookups-user-id', () => '');
    const maxEntries = useState('favorite-lookups-max-entries', () => 10);
    const pendingKeys = useState<string[]>(
        'favorite-lookups-pending-keys',
        () => []
    );

    const favoriteKeySet = computed(
        () =>
            new Set(items.value.map((item) => buildLookupItemKeyFromItem(item)))
    );
    const canReadFavorites = computed(() =>
        hasFavoriteScope(session.value, 'api.auth.favorites.read')
    );

    function setPending(key: string, pending: boolean) {
        pendingKeys.value = pending
            ? Array.from(new Set([...pendingKeys.value, key]))
            : pendingKeys.value.filter((pendingKey) => pendingKey !== key);
    }

    function replaceItems(nextItems: FavoriteLookupItem[]) {
        items.value = nextItems
            .map((item) => normalizeFavoriteLookupItem(item))
            .filter((item): item is FavoriteLookupItem => item !== null)
            .sort((left, right) => right.starredAt - left.starredAt);
    }

    function reset() {
        items.value = [];
        state.value = 'idle';
        errorMessage.value = '';
        loadedUserId.value = '';
        maxEntries.value = 10;
        pendingKeys.value = [];
    }

    async function executeFavoriteRequest(
        path: string,
        options?: {
            method?: 'GET' | 'PUT' | 'DELETE';
            body?: object;
        }
    ) {
        const response = await useNuxtApp().$csrfFetch<
            TrackerApiResponse<AuthFavoritesResponse>
        >(path, {
            ...options,
            retry: 0
        });

        if (
            !response ||
            typeof response !== 'object' ||
            typeof response.ok !== 'boolean'
        ) {
            throw new Error('收藏接口未返回有效数据。');
        }

        if (!response.ok) {
            throw {
                data: response
            };
        }

        return response;
    }

    async function refresh(force = false) {
        if (!import.meta.client) {
            reset();
            return items.value;
        }

        if (
            !isAuthenticated.value ||
            !session.value ||
            !canReadFavorites.value
        ) {
            reset();
            return items.value;
        }

        if (
            !force &&
            loadedUserId.value === session.value.userId &&
            (state.value === 'success' || state.value === 'loading')
        ) {
            return items.value;
        }

        state.value = 'loading';
        errorMessage.value = '';

        try {
            const response = await executeFavoriteRequest(
                '/api/v1/auth/favorites'
            );

            replaceItems(response.data.items);
            loadedUserId.value = response.data.userId;
            maxEntries.value = response.data.maxEntries;
            state.value = 'success';
        } catch (error) {
            state.value = 'error';
            errorMessage.value = getApiErrorMessage(
                error,
                '\u52a0\u8f7d\u6536\u85cf\u5931\u8d25\u3002'
            );
        }

        return items.value;
    }

    async function requireFavoriteAuth() {
        await navigateTo('/auth');
    }

    async function addFavorite(item: FavoriteLookupInput) {
        const normalizedItem = normalizeFavoriteLookupInput(item);

        if (!normalizedItem) {
            return false;
        }

        if (!isAuthenticated.value || !session.value) {
            await requireFavoriteAuth();
            return false;
        }

        const favoriteKey = buildLookupItemKeyFromItem(normalizedItem);
        const previousItems = [...items.value];
        const optimisticItem: FavoriteLookupItem = {
            ...normalizedItem,
            starredAt: Math.floor(Date.now() / 1000)
        };

        setPending(favoriteKey, true);
        replaceItems([
            optimisticItem,
            ...items.value.filter(
                (favorite) =>
                    buildLookupItemKeyFromItem(favorite) !== favoriteKey
            )
        ]);

        try {
            const response = await executeFavoriteRequest(
                '/api/v1/auth/favorites',
                {
                    method: 'PUT',
                    body: normalizedItem
                }
            );

            replaceItems(response.data.items);
            loadedUserId.value = response.data.userId;
            maxEntries.value = response.data.maxEntries;
            state.value = 'success';
            errorMessage.value = '';

            return true;
        } catch (error) {
            items.value = previousItems;
            state.value = 'error';
            errorMessage.value = getApiErrorMessage(
                error,
                '\u66f4\u65b0\u6536\u85cf\u5931\u8d25\u3002'
            );
            return false;
        } finally {
            setPending(favoriteKey, false);
        }
    }

    async function removeFavorite(
        target: Pick<LookupSuggestItem, 'type' | 'code'>
    ) {
        const favoriteKey = buildLookupItemKeyFromItem(target);
        const previousItems = [...items.value];

        if (!isAuthenticated.value || !session.value) {
            await requireFavoriteAuth();
            return false;
        }

        setPending(favoriteKey, true);
        items.value = items.value.filter(
            (favorite) => buildLookupItemKeyFromItem(favorite) !== favoriteKey
        );

        try {
            const response = await executeFavoriteRequest(
                '/api/v1/auth/favorites',
                {
                    method: 'DELETE',
                    body: target
                }
            );

            replaceItems(response.data.items);
            loadedUserId.value = response.data.userId;
            maxEntries.value = response.data.maxEntries;
            state.value = 'success';
            errorMessage.value = '';
            return true;
        } catch (error) {
            items.value = previousItems;
            state.value = 'error';
            errorMessage.value = getApiErrorMessage(
                error,
                '\u53d6\u6d88\u6536\u85cf\u5931\u8d25\u3002'
            );
            return false;
        } finally {
            setPending(favoriteKey, false);
        }
    }

    async function toggleFavorite(item: FavoriteLookupInput) {
        const normalizedItem = normalizeFavoriteLookupInput(item);

        if (!normalizedItem) {
            return false;
        }

        if (
            favoriteKeySet.value.has(buildLookupItemKeyFromItem(normalizedItem))
        ) {
            return removeFavorite(normalizedItem);
        }

        return addFavorite(normalizedItem);
    }

    function isFavorited(target: Pick<LookupSuggestItem, 'type' | 'code'>) {
        return favoriteKeySet.value.has(buildLookupItemKeyFromItem(target));
    }

    function isFavoritePending(
        target: Pick<LookupSuggestItem, 'type' | 'code'>
    ) {
        return pendingKeys.value.includes(buildLookupItemKeyFromItem(target));
    }

    if (import.meta.client) {
        watch(
            () => session.value?.userId ?? '',
            (nextUserId, previousUserId) => {
                if (!nextUserId) {
                    reset();
                    return;
                }

                if (nextUserId !== previousUserId) {
                    void refresh(true);
                }
            },
            {
                immediate: true
            }
        );
    }

    return {
        items: computed(() => items.value),
        favoriteKeySet,
        maxEntries: computed(() => maxEntries.value),
        state: computed(() => state.value),
        errorMessage: computed(() => errorMessage.value),
        isFavorited,
        isFavoritePending,
        refresh,
        addFavorite,
        removeFavorite,
        toggleFavorite,
        requireFavoriteAuth
    };
}
