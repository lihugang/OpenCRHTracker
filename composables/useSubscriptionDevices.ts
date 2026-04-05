import { computed, watch } from 'vue';
import type {
    AuthSession,
    AuthSubscriptionItem,
    AuthSubscriptionListResponse
} from '~/types/auth';
import type { TrackerApiResponse } from '~/types/homepage';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';

type SubscriptionState = 'idle' | 'loading' | 'success' | 'error';

type CurrentDeviceStatus =
    | 'checking'
    | 'ios-open-in-safari'
    | 'ios-install-pwa'
    | 'unsupported'
    | 'missing-key'
    | 'permission-denied'
    | 'idle'
    | 'out-of-sync'
    | 'tracked';

type PushSupportState = 'unknown' | 'supported' | 'unsupported';
type IosPushGuidance = 'none' | 'open-in-safari' | 'install-pwa';

type SubscriptionTimeoutRunner = <T>(promise: Promise<T>) => Promise<T>;

const DEFAULT_SUBSCRIPTION_SYNC_TIMEOUT_SECONDS = 30;
const SUBSCRIPTION_SYNC_TIMEOUT_ERROR_MESSAGE =
    '订阅操作超时，请检查网络状况。';
const IOS_NON_SAFARI_UA_PATTERN =
    /(?:CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA|MicroMessenger|QQ|Weibo|Instagram|Line|FBAN|FBAV)/i;

function createSubscriptionTimeoutRunner(
    timeoutSeconds: number
): SubscriptionTimeoutRunner {
    const timeoutAt = Date.now() + Math.max(1, timeoutSeconds) * 1000;

    return async function runWithSubscriptionTimeout<T>(promise: Promise<T>) {
        const remainingMs = timeoutAt - Date.now();

        if (remainingMs <= 0) {
            throw new Error(SUBSCRIPTION_SYNC_TIMEOUT_ERROR_MESSAGE);
        }

        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        try {
            return (await Promise.race([
                promise,
                new Promise<never>((_, reject) => {
                    timeoutId = setTimeout(() => {
                        reject(
                            new Error(SUBSCRIPTION_SYNC_TIMEOUT_ERROR_MESSAGE)
                        );
                    }, remainingMs);
                })
            ])) as T;
        } finally {
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
            }
        }
    };
}

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

function isPushSupported() {
    if (!import.meta.client) {
        return false;
    }

    return (
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window
    );
}

function resolvePushSupportState(): PushSupportState {
    if (!import.meta.client) {
        return 'unknown';
    }

    return isPushSupported() ? 'supported' : 'unsupported';
}

function isIosDevice() {
    if (!import.meta.client) {
        return false;
    }

    const userAgent = navigator.userAgent;
    return (
        /iPad|iPhone|iPod/i.test(userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
}

function isStandalonePwa() {
    if (!import.meta.client) {
        return false;
    }

    return (
        window.matchMedia('(display-mode: standalone)').matches ||
        (typeof navigator === 'object' &&
            'standalone' in navigator &&
            (navigator as Navigator & { standalone?: boolean }).standalone ===
                true)
    );
}

function isIosSafariBrowser(userAgent: string) {
    if (!isIosDevice()) {
        return false;
    }

    return (
        /AppleWebKit/i.test(userAgent) &&
        /Safari/i.test(userAgent) &&
        !IOS_NON_SAFARI_UA_PATTERN.test(userAgent)
    );
}

function resolveIosPushGuidance(): IosPushGuidance {
    if (!import.meta.client || !isIosDevice()) {
        return 'none';
    }

    if (!isIosSafariBrowser(navigator.userAgent)) {
        return 'open-in-safari';
    }

    if (!isStandalonePwa()) {
        return 'install-pwa';
    }

    return 'none';
}

function decodeBase64UrlToUint8Array(input: string) {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
    const binary = window.atob(normalized + padding);
    const result = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
        result[index] = binary.charCodeAt(index);
    }

    return result;
}

async function getCurrentPushSubscription(
    runWithTimeout?: SubscriptionTimeoutRunner
) {
    if (!isPushSupported()) {
        return null;
    }

    const registrationPromise = navigator.serviceWorker.ready;
    const registration = runWithTimeout
        ? await runWithTimeout(registrationPromise)
        : await registrationPromise;
    const subscriptionPromise = registration.pushManager.getSubscription();

    return runWithTimeout
        ? await runWithTimeout(subscriptionPromise)
        : await subscriptionPromise;
}

function getPushSubscriptionPayload(subscription: PushSubscription) {
    const json = subscription.toJSON();

    if (
        typeof json.endpoint !== 'string' ||
        json.endpoint.length === 0 ||
        typeof json.keys?.p256dh !== 'string' ||
        json.keys.p256dh.length === 0 ||
        typeof json.keys?.auth !== 'string' ||
        json.keys.auth.length === 0
    ) {
        throw new Error('当前浏览器返回的 PushSubscription 不完整。');
    }

    return {
        endpoint: json.endpoint,
        expirationTime:
            typeof json.expirationTime === 'number' &&
            Number.isInteger(json.expirationTime) &&
            json.expirationTime > 0
                ? json.expirationTime
                : null,
        keys: {
            p256dh: json.keys.p256dh,
            auth: json.keys.auth
        }
    };
}

function resolvePlatformLabel(userAgent: string) {
    if (/iphone|ipad|ipod/i.test(userAgent)) {
        return 'iPhone / iPad';
    }

    if (/android/i.test(userAgent)) {
        return 'Android';
    }

    if (/macintosh|mac os x/i.test(userAgent)) {
        return 'macOS';
    }

    if (/windows/i.test(userAgent)) {
        return 'Windows';
    }

    if (/linux/i.test(userAgent)) {
        return 'Linux';
    }

    return '未知平台';
}

function resolveBrowserLabel(userAgent: string) {
    if (/edgios/i.test(userAgent) || /edg\//i.test(userAgent)) {
        return 'Edge';
    }

    if (/crios/i.test(userAgent)) {
        return 'Chrome';
    }

    if (/chrome\//i.test(userAgent) && !/edg\//i.test(userAgent)) {
        return 'Chrome';
    }

    if (/fxios/i.test(userAgent) || /firefox\//i.test(userAgent)) {
        return 'Firefox';
    }

    if (/opios/i.test(userAgent)) {
        return 'Opera';
    }

    if (
        isIosSafariBrowser(userAgent) ||
        (/safari\//i.test(userAgent) && !/chrome\//i.test(userAgent))
    ) {
        return 'Safari';
    }

    return '浏览器';
}

function resolveDisplayModeLabel() {
    return isStandalonePwa() ? 'PWA' : '网页';
}

function buildDefaultDeviceName() {
    if (!import.meta.client) {
        return '当前设备';
    }

    const userAgent = navigator.userAgent;
    return [
        resolvePlatformLabel(userAgent),
        resolveBrowserLabel(userAgent),
        resolveDisplayModeLabel()
    ].join(' · ');
}

function resolveCurrentDeviceCapabilityMessage(options: {
    currentDeviceStatus: CurrentDeviceStatus;
    canWriteSubscriptions: boolean;
    supportsPush: boolean;
    vapidPublicKey: string;
    notificationPermission: NotificationPermission | 'unsupported';
}) {
    const {
        currentDeviceStatus,
        canWriteSubscriptions,
        supportsPush,
        vapidPublicKey,
        notificationPermission
    } = options;

    switch (currentDeviceStatus) {
        case 'checking':
            return '正在检测当前浏览器的 Web Push 支持状态，请稍候。';
        case 'ios-open-in-safari':
            return '根据苹果公司要求，通知订阅功能只能在 Safari 浏览器上启用，请您用系统默认浏览器打开此网页。';
        case 'ios-install-pwa':
            return '根据苹果公司要求，只有被添加到主屏幕的网站才能调用浏览器通知功能。请您用 Safari 浏览器打开此网页，轻击屏幕下方的‘分享’按钮，选择‘添加到主屏幕’并确认，然后通过手机主屏幕上的快捷方式访问本网站并点击‘订阅’按钮。';
        case 'unsupported':
            return '当前浏览器环境不支持 Web Push，无法为这台设备创建订阅。';
        case 'missing-key':
            return '服务端尚未配置 VAPID 公钥，当前设备暂时无法创建新的订阅。';
        case 'permission-denied':
            return '当前浏览器已经拒绝通知权限。你需要先在浏览器设置里重新允许通知。';
        default:
            break;
    }

    if (!canWriteSubscriptions) {
        return '当前登录会话没有订阅管理权限。若这是旧会话，请重新登录后再试。';
    }

    if (!supportsPush) {
        return '当前环境不支持 Web Push。建议在支持 Service Worker 和 Push API 的浏览器中使用。';
    }

    if (!vapidPublicKey.trim()) {
        return '推送公钥尚未配置，当前设备暂时无法创建新的订阅。';
    }

    if (notificationPermission === 'denied') {
        return '通知权限已被浏览器拒绝，请先在浏览器设置里重新允许通知。';
    }

    return '';
}

export function useSubscriptionDevices() {
    const { session, isAuthenticated } = useAuthState();
    const items = useState<AuthSubscriptionItem[]>(
        'subscription-devices-items',
        () => []
    );
    const state = useState<SubscriptionState>(
        'subscription-devices-state',
        () => 'idle'
    );
    const errorMessage = useState('subscription-devices-error', () => '');
    const loadedUserId = useState('subscription-devices-user-id', () => '');
    const maxDevices = useState('subscription-devices-max-devices', () => 20);
    const initialized = useState(
        'subscription-devices-initialized',
        () => false
    );
    const syncTimeoutSeconds = useState(
        'subscription-devices-sync-timeout-seconds',
        () => DEFAULT_SUBSCRIPTION_SYNC_TIMEOUT_SECONDS
    );
    const vapidPublicKey = useState('subscription-devices-vapid-key', () => '');
    const pendingIds = useState<string[]>(
        'subscription-devices-pending-ids',
        () => []
    );
    const isRefreshingCurrentDevice = useState(
        'subscription-devices-refreshing-current',
        () => false
    );
    const currentEndpoint = useState(
        'subscription-devices-current-endpoint',
        () => ''
    );
    const pushSupportState = useState<PushSupportState>(
        'subscription-devices-push-support-state',
        () => resolvePushSupportState()
    );
    const notificationPermission = useState<
        NotificationPermission | 'unsupported'
    >('subscription-devices-permission', () =>
        import.meta.client && 'Notification' in window
            ? Notification.permission
            : 'unsupported'
    );

    const canReadSubscriptions = computed(() =>
        hasSubscriptionScope(session.value, 'api.auth.subscriptions.read')
    );
    const canWriteSubscriptions = computed(() =>
        hasSubscriptionScope(session.value, 'api.auth.subscriptions.write')
    );
    const supportsPush = computed(() => pushSupportState.value === 'supported');
    const currentItem = computed(
        () =>
            items.value.find(
                (item) => item.endpoint === currentEndpoint.value
            ) ?? null
    );
    const currentDeviceStatus = computed<CurrentDeviceStatus>(() => {
        if (pushSupportState.value === 'unknown') {
            return 'checking';
        }

        const iosPushGuidance = resolveIosPushGuidance();
        if (iosPushGuidance === 'open-in-safari') {
            return 'ios-open-in-safari';
        }

        if (iosPushGuidance === 'install-pwa') {
            return 'ios-install-pwa';
        }

        if (pushSupportState.value === 'unsupported') {
            return 'unsupported';
        }

        if (!vapidPublicKey.value.trim()) {
            return 'missing-key';
        }

        if (notificationPermission.value === 'denied') {
            return 'permission-denied';
        }

        if (!currentEndpoint.value) {
            return 'idle';
        }

        if (!currentItem.value) {
            return 'out-of-sync';
        }

        return 'tracked';
    });
    const currentDeviceCapabilityMessage = computed(() =>
        resolveCurrentDeviceCapabilityMessage({
            currentDeviceStatus: currentDeviceStatus.value,
            canWriteSubscriptions: canWriteSubscriptions.value,
            supportsPush: supportsPush.value,
            vapidPublicKey: vapidPublicKey.value,
            notificationPermission: notificationPermission.value
        })
    );

    function replaceItems(nextItems: AuthSubscriptionItem[]) {
        items.value = [...nextItems].sort(
            (left, right) => right.updatedAt - left.updatedAt
        );
    }

    function applySubscriptionResponse(response: AuthSubscriptionListResponse) {
        replaceItems(response.items);
        loadedUserId.value = response.userId;
        maxDevices.value = response.maxDevices;
        vapidPublicKey.value = response.vapidPublicKey;
        syncTimeoutSeconds.value =
            Number.isInteger(response.syncTimeoutSeconds) &&
            response.syncTimeoutSeconds > 0
                ? response.syncTimeoutSeconds
                : DEFAULT_SUBSCRIPTION_SYNC_TIMEOUT_SECONDS;
    }

    function setPending(key: string, pending: boolean) {
        pendingIds.value = pending
            ? Array.from(new Set([...pendingIds.value, key]))
            : pendingIds.value.filter((pendingKey) => pendingKey !== key);
    }

    function reset() {
        items.value = [];
        state.value = 'idle';
        errorMessage.value = '';
        loadedUserId.value = '';
        maxDevices.value = 20;
        syncTimeoutSeconds.value = DEFAULT_SUBSCRIPTION_SYNC_TIMEOUT_SECONDS;
        vapidPublicKey.value = '';
        pendingIds.value = [];
        isRefreshingCurrentDevice.value = false;
        currentEndpoint.value = '';
        pushSupportState.value = resolvePushSupportState();
        notificationPermission.value =
            import.meta.client && 'Notification' in window
                ? Notification.permission
                : 'unsupported';
    }

    async function executeSubscriptionRequest(
        path: string,
        options?: {
            method?: 'GET' | 'PUT' | 'PATCH' | 'DELETE';
            body?: Record<string, unknown>;
        }
    ) {
        const response = await useNuxtApp().$csrfFetch<
            TrackerApiResponse<AuthSubscriptionListResponse>
        >(path, {
            ...options,
            retry: 0
        });

        if (
            !response ||
            typeof response !== 'object' ||
            typeof response.ok !== 'boolean'
        ) {
            throw new Error('订阅设备接口未返回有效数据。');
        }

        if (!response.ok) {
            throw {
                data: response
            };
        }

        return response.data;
    }

    async function syncCurrentDeviceState(
        runWithTimeout?: SubscriptionTimeoutRunner
    ) {
        if (!import.meta.client) {
            pushSupportState.value = 'unknown';
            currentEndpoint.value = '';
            notificationPermission.value = 'unsupported';
            return null;
        }

        pushSupportState.value = resolvePushSupportState();

        notificationPermission.value = supportsPush.value
            ? Notification.permission
            : 'unsupported';

        if (!supportsPush.value) {
            currentEndpoint.value = '';
            return null;
        }

        const subscription = await getCurrentPushSubscription(runWithTimeout);
        currentEndpoint.value = subscription?.endpoint ?? '';
        return subscription;
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
            await syncCurrentDeviceState();
            return items.value;
        }

        if (
            !force &&
            loadedUserId.value === session.value.userId &&
            (state.value === 'success' || state.value === 'loading')
        ) {
            await syncCurrentDeviceState();
            return items.value;
        }

        state.value = 'loading';
        errorMessage.value = '';

        try {
            const response = await executeSubscriptionRequest(
                '/api/v1/auth/subscriptions'
            );

            applySubscriptionResponse(response);
            state.value = 'success';
        } catch (error) {
            state.value = 'error';
            errorMessage.value = getApiErrorMessage(
                error,
                '加载订阅设备失败。'
            );
        }

        await syncCurrentDeviceState();
        return items.value;
    }

    async function syncCurrentDeviceSubscription() {
        if (!import.meta.client) {
            return false;
        }

        if (!session.value || !canWriteSubscriptions.value) {
            return false;
        }

        notificationPermission.value = supportsPush.value
            ? Notification.permission
            : 'unsupported';

        if (!supportsPush.value) {
            errorMessage.value = '当前浏览器不支持 Web Push。';
            return false;
        }

        if (!vapidPublicKey.value.trim()) {
            errorMessage.value = '服务端尚未配置推送公钥。';
            return false;
        }

        isRefreshingCurrentDevice.value = true;
        errorMessage.value = '';
        const runWithTimeout = createSubscriptionTimeoutRunner(
            syncTimeoutSeconds.value
        );

        try {
            let permission = Notification.permission;
            if (permission === 'default') {
                permission = await runWithTimeout(
                    Notification.requestPermission()
                );
            }

            notificationPermission.value = permission;

            if (permission === 'denied') {
                throw new Error('通知权限已被拒绝。');
            }

            let subscription = await getCurrentPushSubscription(runWithTimeout);
            if (!subscription) {
                const registration = await runWithTimeout(
                    navigator.serviceWorker.ready
                );
                subscription = await runWithTimeout(
                    registration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: decodeBase64UrlToUint8Array(
                            vapidPublicKey.value
                        )
                    })
                );
            }

            const response = await executeSubscriptionRequest(
                '/api/v1/auth/subscriptions',
                {
                    method: 'PUT',
                    body: {
                        name: buildDefaultDeviceName(),
                        subscription: getPushSubscriptionPayload(subscription)
                    }
                }
            );

            applySubscriptionResponse(response);
            currentEndpoint.value = subscription.endpoint;
            state.value = 'success';
            return true;
        } catch (error) {
            errorMessage.value = getApiErrorMessage(
                error,
                '同步当前设备订阅失败。'
            );

            try {
                await syncCurrentDeviceState(runWithTimeout);
            } catch {
                notificationPermission.value = supportsPush.value
                    ? Notification.permission
                    : 'unsupported';
            }

            return false;
        } finally {
            isRefreshingCurrentDevice.value = false;
        }
    }

    async function ensureCurrentDeviceSubscriptionReady() {
        if (!import.meta.client) {
            return false;
        }

        if (!session.value || !canWriteSubscriptions.value) {
            errorMessage.value =
                currentDeviceCapabilityMessage.value ||
                '当前登录会话没有订阅管理权限。若这是旧会话，请重新登录后再试。';
            return false;
        }

        if (
            loadedUserId.value !== session.value.userId ||
            !vapidPublicKey.value.trim()
        ) {
            if (!canReadSubscriptions.value) {
                errorMessage.value =
                    currentDeviceCapabilityMessage.value ||
                    '当前登录会话没有订阅读取权限，无法检查当前设备状态。';
                return false;
            }

            try {
                const response = await executeSubscriptionRequest(
                    '/api/v1/auth/subscriptions'
                );

                applySubscriptionResponse(response);
                state.value = 'success';
            } catch (error) {
                state.value = 'error';
                errorMessage.value = getApiErrorMessage(
                    error,
                    '加载订阅设备失败。'
                );

                try {
                    await syncCurrentDeviceState();
                } catch {
                    notificationPermission.value = supportsPush.value
                        ? Notification.permission
                        : 'unsupported';
                }

                return false;
            }
        }

        try {
            await syncCurrentDeviceState();
        } catch (error) {
            errorMessage.value = getApiErrorMessage(
                error,
                '检查当前设备订阅状态失败。'
            );
            return false;
        }

        if (currentDeviceStatus.value === 'tracked') {
            errorMessage.value = '';
            return true;
        }

        if (currentDeviceCapabilityMessage.value) {
            errorMessage.value = currentDeviceCapabilityMessage.value;
            return false;
        }

        return syncCurrentDeviceSubscription();
    }

    async function renameSubscription(id: string, name: string) {
        if (!canWriteSubscriptions.value) {
            return false;
        }

        setPending(`rename:${id}`, true);
        errorMessage.value = '';

        try {
            const response = await executeSubscriptionRequest(
                `/api/v1/auth/subscriptions/${encodeURIComponent(id)}`,
                {
                    method: 'PATCH',
                    body: {
                        name
                    }
                }
            );

            applySubscriptionResponse(response);
            state.value = 'success';
            return true;
        } catch (error) {
            errorMessage.value = getApiErrorMessage(
                error,
                '更新设备名称失败。'
            );
            return false;
        } finally {
            setPending(`rename:${id}`, false);
        }
    }

    async function deleteSubscription(item: AuthSubscriptionItem) {
        if (!canWriteSubscriptions.value) {
            return false;
        }

        setPending(`delete:${item.id}`, true);
        errorMessage.value = '';

        try {
            const response = await executeSubscriptionRequest(
                `/api/v1/auth/subscriptions/${encodeURIComponent(item.id)}`,
                {
                    method: 'DELETE'
                }
            );

            applySubscriptionResponse(response);
            state.value = 'success';

            if (import.meta.client && currentEndpoint.value === item.endpoint) {
                const currentSubscription = await getCurrentPushSubscription();

                if (currentSubscription?.endpoint === item.endpoint) {
                    try {
                        await currentSubscription.unsubscribe();
                    } catch {
                        // Ignore local unsubscribe failures and resync state below.
                    }
                }
            }

            await syncCurrentDeviceState();
            return true;
        } catch (error) {
            errorMessage.value = getApiErrorMessage(
                error,
                '删除订阅设备失败。'
            );
            return false;
        } finally {
            setPending(`delete:${item.id}`, false);
        }
    }

    function isPending(kind: 'rename' | 'delete', id: string) {
        return pendingIds.value.includes(`${kind}:${id}`);
    }

    function ensureInitialized() {
        if (!import.meta.client || initialized.value) {
            return;
        }

        initialized.value = true;

        watch(
            () =>
                [
                    session.value?.userId ?? '',
                    canReadSubscriptions.value
                ] as const,
            ([nextUserId, nextCanReadSubscriptions], previousValue) => {
                const [previousUserId, previousCanReadSubscriptions] =
                    previousValue ?? ['', false];

                if (!nextUserId || !nextCanReadSubscriptions) {
                    reset();
                    void syncCurrentDeviceState();
                    return;
                }

                if (
                    nextUserId !== previousUserId ||
                    nextCanReadSubscriptions !== previousCanReadSubscriptions ||
                    loadedUserId.value !== nextUserId ||
                    state.value === 'idle'
                ) {
                    void refresh(
                        nextUserId !== previousUserId ||
                            nextCanReadSubscriptions !==
                                previousCanReadSubscriptions ||
                            loadedUserId.value !== nextUserId
                    );
                    return;
                }

                void syncCurrentDeviceState();
            },
            {
                immediate: true
            }
        );
    }

    ensureInitialized();

    return {
        items: computed(() => items.value),
        state: computed(() => state.value),
        errorMessage: computed(() => errorMessage.value),
        maxDevices: computed(() => maxDevices.value),
        vapidPublicKey: computed(() => vapidPublicKey.value),
        supportsPush,
        notificationPermission: computed(() => notificationPermission.value),
        currentEndpoint: computed(() => currentEndpoint.value),
        currentItem,
        currentDeviceStatus,
        currentDeviceCapabilityMessage,
        isRefreshingCurrentDevice: computed(
            () => isRefreshingCurrentDevice.value
        ),
        canReadSubscriptions,
        canWriteSubscriptions,
        refresh,
        syncCurrentDeviceSubscription,
        ensureCurrentDeviceSubscriptionReady,
        renameSubscription,
        deleteSubscription,
        isPending
    };
}
