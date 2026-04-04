import { computed, watch } from 'vue';
import type {
    AuthEventSubscriptionListResponse,
    AuthSession
} from '~/types/auth';
import type { TrackerApiResponse } from '~/types/homepage';
import type { NotificationTarget } from '~/types/notifications';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import {
    buildNotificationTargetKey,
    buildNotificationTargetPath,
    normalizeNotificationTarget
} from '~/utils/notifications/target';

type EventSubscriptionState = 'idle' | 'loading' | 'success' | 'error';

function hasSubscriptionScope(
    session: AuthSession | null,
    requiredScope: string
) {
    return (session?.scopes ?? []).some((scope) => {
        const normalizedScope = scope.trim().toLowerCase();
        const normalizedRequired = requiredScope.trim().toLowerCase();

        return (
            normalizedScope === normalizedRequired ||
            normalizedRequired.startsWith(`${normalizedScope}.`)
        );
    });
}

function buildEventSubscriptionFallbackLabel(target: NotificationTarget) {
    if (target.targetType === 'train') {
        return `车次 ${target.targetId}`;
    }

    if (target.targetType === 'emu') {
        return `车组 ${target.targetId}`;
    }

    return `反馈 #${target.targetId}`;
}

export function useEventSubscriptions() {
    const { session, isAuthenticated } = useAuthState();
    const {
        currentDeviceCapabilityMessage,
        ensureCurrentDeviceSubscriptionReady,
        errorMessage: deviceSubscriptionErrorMessage
    } = useSubscriptionDevices();
    const items = useState(
        'event-subscriptions-items',
        () => [] as AuthEventSubscriptionListResponse['items']
    );
    const state = useState<EventSubscriptionState>(
        'event-subscriptions-state',
        () => 'idle'
    );
    const errorMessage = useState('event-subscriptions-error', () => '');
    const loadedUserId = useState('event-subscriptions-user-id', () => '');
    const maxEntries = useState('event-subscriptions-max-entries', () => 50);
    const pendingKeys = useState<string[]>(
        'event-subscriptions-pending-keys',
        () => []
    );

    const subscriptionKeySet = computed(
        () =>
            new Set(
                items.value.map((item) =>
                    buildNotificationTargetKey({
                        targetType: item.targetType,
                        targetId: item.targetId
                    })
                )
            )
    );
    const canReadSubscriptions = computed(() =>
        hasSubscriptionScope(session.value, 'api.auth.subscriptions.read')
    );
    const canWriteSubscriptions = computed(() =>
        hasSubscriptionScope(session.value, 'api.auth.subscriptions.write')
    );

    function setPending(key: string, pending: boolean) {
        pendingKeys.value = pending
            ? Array.from(new Set([...pendingKeys.value, key]))
            : pendingKeys.value.filter((pendingKey) => pendingKey !== key);
    }

    function replaceItems(
        nextItems: AuthEventSubscriptionListResponse['items']
    ) {
        items.value = [...nextItems].sort(
            (left, right) => right.updatedAt - left.updatedAt
        );
    }

    function reset() {
        items.value = [];
        state.value = 'idle';
        errorMessage.value = '';
        loadedUserId.value = '';
        maxEntries.value = 50;
        pendingKeys.value = [];
    }

    async function executeEventSubscriptionRequest(
        path: string,
        options?: {
            method?: 'GET' | 'PUT' | 'DELETE';
            body?: Record<string, unknown>;
        }
    ) {
        const response = await useNuxtApp().$csrfFetch<
            TrackerApiResponse<AuthEventSubscriptionListResponse>
        >(path, {
            ...options,
            retry: 0
        });

        if (
            !response ||
            typeof response !== 'object' ||
            typeof response.ok !== 'boolean'
        ) {
            throw new Error('订阅对象接口未返回有效数据。');
        }

        if (!response.ok) {
            throw {
                data: response
            };
        }

        return response.data;
    }

    async function refresh(force = false) {
        if (!import.meta.client) {
            reset();
            return items.value;
        }

        if (
            !isAuthenticated.value ||
            !session.value ||
            !canReadSubscriptions.value
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
            const response = await executeEventSubscriptionRequest(
                '/api/v1/auth/event-subscriptions'
            );

            replaceItems(response.items);
            loadedUserId.value = response.userId;
            maxEntries.value = response.maxEntries;
            state.value = 'success';
        } catch (error) {
            state.value = 'error';
            errorMessage.value = getApiErrorMessage(
                error,
                '加载订阅对象失败。'
            );
        }

        return items.value;
    }

    async function requireEventSubscriptionAuth() {
        await navigateTo('/auth');
    }

    async function addEventSubscription(target: NotificationTarget) {
        const normalizedTarget = normalizeNotificationTarget(target);
        if (!normalizedTarget) {
            return false;
        }

        if (!isAuthenticated.value || !session.value) {
            await requireEventSubscriptionAuth();
            return false;
        }

        if (!canWriteSubscriptions.value) {
            return false;
        }

        errorMessage.value = '';

        const currentDeviceReady = await ensureCurrentDeviceSubscriptionReady();
        if (!currentDeviceReady) {
            state.value = 'error';
            errorMessage.value =
                deviceSubscriptionErrorMessage.value ||
                currentDeviceCapabilityMessage.value ||
                '启用当前设备订阅失败。';
            return false;
        }

        const targetKey = buildNotificationTargetKey(normalizedTarget);
        const previousItems = [...items.value];

        setPending(targetKey, true);
        replaceItems([
            {
                targetType: normalizedTarget.targetType,
                targetId: normalizedTarget.targetId,
                label: buildEventSubscriptionFallbackLabel(normalizedTarget),
                path: buildNotificationTargetPath(normalizedTarget),
                createdAt: Math.floor(Date.now() / 1000),
                updatedAt: Math.floor(Date.now() / 1000)
            },
            ...items.value.filter(
                (item) =>
                    buildNotificationTargetKey({
                        targetType: item.targetType,
                        targetId: item.targetId
                    }) !== targetKey
            )
        ]);

        try {
            const response = await executeEventSubscriptionRequest(
                '/api/v1/auth/event-subscriptions',
                {
                    method: 'PUT',
                    body: {
                        targetType: normalizedTarget.targetType,
                        targetId: normalizedTarget.targetId
                    }
                }
            );

            replaceItems(response.items);
            loadedUserId.value = response.userId;
            maxEntries.value = response.maxEntries;
            state.value = 'success';
            errorMessage.value = '';
            return true;
        } catch (error) {
            items.value = previousItems;
            state.value = 'error';
            errorMessage.value = getApiErrorMessage(error, '订阅对象失败。');
            return false;
        } finally {
            setPending(targetKey, false);
        }
    }

    async function removeEventSubscription(target: NotificationTarget) {
        const normalizedTarget = normalizeNotificationTarget(target);
        if (!normalizedTarget) {
            return false;
        }

        if (!isAuthenticated.value || !session.value) {
            await requireEventSubscriptionAuth();
            return false;
        }

        if (!canWriteSubscriptions.value) {
            return false;
        }

        const targetKey = buildNotificationTargetKey(normalizedTarget);
        const previousItems = [...items.value];

        setPending(targetKey, true);
        items.value = items.value.filter(
            (item) =>
                buildNotificationTargetKey({
                    targetType: item.targetType,
                    targetId: item.targetId
                }) !== targetKey
        );

        try {
            const response = await executeEventSubscriptionRequest(
                '/api/v1/auth/event-subscriptions',
                {
                    method: 'DELETE',
                    body: {
                        targetType: normalizedTarget.targetType,
                        targetId: normalizedTarget.targetId
                    }
                }
            );

            replaceItems(response.items);
            loadedUserId.value = response.userId;
            maxEntries.value = response.maxEntries;
            state.value = 'success';
            errorMessage.value = '';
            return true;
        } catch (error) {
            items.value = previousItems;
            state.value = 'error';
            errorMessage.value = getApiErrorMessage(
                error,
                '取消订阅对象失败。'
            );
            return false;
        } finally {
            setPending(targetKey, false);
        }
    }

    async function toggleEventSubscription(target: NotificationTarget) {
        const normalizedTarget = normalizeNotificationTarget(target);
        if (!normalizedTarget) {
            return false;
        }

        if (
            subscriptionKeySet.value.has(
                buildNotificationTargetKey(normalizedTarget)
            )
        ) {
            return removeEventSubscription(normalizedTarget);
        }

        return addEventSubscription(normalizedTarget);
    }

    function isSubscribed(target: NotificationTarget) {
        const normalizedTarget = normalizeNotificationTarget(target);
        if (!normalizedTarget) {
            return false;
        }

        return subscriptionKeySet.value.has(
            buildNotificationTargetKey(normalizedTarget)
        );
    }

    function isPending(target: NotificationTarget) {
        const normalizedTarget = normalizeNotificationTarget(target);
        if (!normalizedTarget) {
            return false;
        }

        return pendingKeys.value.includes(
            buildNotificationTargetKey(normalizedTarget)
        );
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
        maxEntries: computed(() => maxEntries.value),
        state: computed(() => state.value),
        errorMessage: computed(() => errorMessage.value),
        canReadSubscriptions,
        canWriteSubscriptions,
        isSubscribed,
        isPending,
        refresh,
        addEventSubscription,
        removeEventSubscription,
        toggleEventSubscription,
        requireEventSubscriptionAuth
    };
}
