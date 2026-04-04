<template>
    <UiCard
        :show-accent-bar="false"
        class="min-h-[32rem]">
        <div class="space-y-6">
            <div
                class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div class="space-y-2">
                    <p
                        class="text-xs font-medium uppercase tracking-[0.26em] text-crh-blue/80">
                        SUBSCRIPTIONS
                    </p>
                    <div class="flex flex-wrap items-center gap-3">
                        <h2 class="text-2xl font-semibold text-slate-900">
                            订阅设备
                        </h2>
                        <span
                            class="inline-flex items-center rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-white">
                            {{ items.length }} / {{ maxDevices }}
                        </span>
                    </div>
                </div>

                <div class="flex flex-wrap gap-3">
                    <UiButton
                        type="button"
                        variant="secondary"
                        :disabled="state === 'loading'"
                        @click="void refresh()">
                        刷新列表
                    </UiButton>
                    <UiButton
                        type="button"
                        :loading="isRefreshingCurrentDevice"
                        :disabled="!canTriggerSync"
                        @click="void syncCurrentDevice()">
                        {{ currentActionLabel }}
                    </UiButton>
                </div>
            </div>

            <div class="motion-divider" />

            <section
                class="rounded-[1.2rem] border border-slate-200 bg-slate-50/80 p-5">
                <div class="space-y-3">
                    <div class="flex flex-wrap items-center gap-2">
                        <span
                            class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em]"
                            :class="currentStatusBadgeClass">
                            {{ currentStatusLabel }}
                        </span>
                        <span
                            v-if="currentItem"
                            class="inline-flex items-center rounded-full bg-crh-blue/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-crh-blue">
                            已登记
                        </span>
                    </div>
                    <h3 class="text-lg font-semibold text-slate-900">
                        当前设备
                    </h3>
                    <p
                        v-if="currentStatusDescription"
                        class="max-w-2xl text-sm leading-6 text-slate-600">
                        {{ currentStatusDescription }}
                    </p>
                    <dl
                        v-if="currentItem"
                        class="grid gap-3 pt-1 text-sm text-slate-600 sm:grid-cols-2">
                        <div class="space-y-1">
                            <dt class="text-xs uppercase tracking-[0.16em] text-slate-400">
                                设备名称
                            </dt>
                            <dd class="font-semibold text-slate-900">
                                {{ currentItem.name }}
                            </dd>
                        </div>
                        <div class="space-y-1">
                            <dt class="text-xs uppercase tracking-[0.16em] text-slate-400">
                                最近同步
                            </dt>
                            <dd class="font-semibold text-slate-900">
                                {{ formatTimestamp(currentItem.updatedAt) }}
                            </dd>
                        </div>
                    </dl>
                </div>
            </section>

            <div
                v-if="displayErrorMessage"
                class="flex items-center gap-1.5 text-sm leading-6 text-[#E53E3E]">
                <span
                    aria-hidden="true"
                    class="font-semibold">
                    [!]
                </span>
                <span>{{ displayErrorMessage }}</span>
            </div>

            <UiEmptyState
                v-if="state === 'loading' && items.length === 0"
                eyebrow="LOADING"
                title="正在加载订阅设备"
                description="请稍候，正在同步当前账号已保存的推送设备。" />

            <UiEmptyState
                v-else-if="state === 'error' && items.length === 0"
                eyebrow="ERROR"
                title="订阅设备加载失败"
                :description="errorMessage || '请稍后重试。'"
                tone="danger">
                <UiButton
                    type="button"
                    variant="secondary"
                    @click="void refresh()">
                    重试
                </UiButton>
            </UiEmptyState>

            <UiEmptyState
                v-else-if="items.length === 0"
                eyebrow="EMPTY"
                title="还没有订阅设备"
                description="" />

            <div
                v-else
                class="grid gap-4">
                <article
                    v-for="item in items"
                    :key="item.id"
                    class="rounded-[1.15rem] border border-slate-200 bg-white/85 px-5 py-4 shadow-[0_16px_32px_-26px_rgba(15,23,42,0.28)]">
                    <div
                        class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div class="min-w-0 flex-1 space-y-4">
                            <div
                                v-if="currentItem?.id === item.id"
                                class="flex flex-wrap items-center gap-2">
                                <span
                                    class="inline-flex items-center rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-white">
                                    当前设备
                                </span>
                            </div>

                            <div class="space-y-1">
                                <h3 class="text-lg font-semibold text-slate-900">
                                    {{ item.name }}
                                </h3>
                                <p class="text-sm text-slate-500">
                                    {{ item.userAgent || '未记录浏览器信息' }}
                                </p>
                            </div>

                            <dl class="grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
                                <div class="space-y-1">
                                    <dt class="text-xs uppercase tracking-[0.16em] text-slate-400">
                                        创建时间
                                    </dt>
                                    <dd class="font-semibold text-slate-900">
                                        {{ formatTimestamp(item.createdAt) }}
                                    </dd>
                                </div>
                                <div class="space-y-1">
                                    <dt class="text-xs uppercase tracking-[0.16em] text-slate-400">
                                        最近更新
                                    </dt>
                                    <dd class="font-semibold text-slate-900">
                                        {{ formatTimestamp(item.updatedAt) }}
                                    </dd>
                                </div>
                                <div class="space-y-1">
                                    <dt class="text-xs uppercase tracking-[0.16em] text-slate-400">
                                        过期时间
                                    </dt>
                                    <dd class="font-semibold text-slate-900">
                                        {{
                                            item.expirationTime === null
                                                ? '由浏览器决定'
                                                : formatTimestamp(item.expirationTime)
                                        }}
                                    </dd>
                                </div>
                            </dl>
                        </div>

                        <div class="flex shrink-0 flex-wrap gap-3">
                            <UiButton
                                type="button"
                                variant="secondary"
                                :loading="isPending('rename', item.id)"
                                @click="openRenameModal(item)">
                                重命名
                            </UiButton>
                            <UiButton
                                type="button"
                                variant="secondary"
                                class="border-rose-200 bg-white text-rose-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800"
                                :loading="isPending('delete', item.id)"
                                @click="void deleteSubscription(item)">
                                删除
                            </UiButton>
                        </div>
                    </div>
                </article>
            </div>
        </div>
    </UiCard>

    <UiModal
        :model-value="renameTarget !== null"
        eyebrow="OPERATION"
        title="重命名订阅设备"
        :close-on-backdrop="!isRenameSubmitting"
        @update:model-value="handleRenameModalVisibilityChange">
        <div
            v-if="renameTarget"
            class="space-y-4">
            <div
                class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                <p class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                    当前设备
                </p>
                <p class="mt-2 text-sm font-semibold text-slate-900">
                    {{ renameTarget.name }}
                </p>
            </div>

            <UiField
                label="设备名称"
>
                <input
                    ref="renameInputRef"
                    v-model.trim="renameValue"
                    type="text"
                    maxlength="64"
                    class="harmony-input w-full px-4 py-3"
                    placeholder="输入新的设备名称"
                    @keydown="handleRenameInputKeydown" />
            </UiField>
        </div>

        <template #footer>
            <div
                class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <UiButton
                    type="button"
                    variant="secondary"
                    :disabled="isRenameSubmitting"
                    @click="closeRenameModal">
                    取消
                </UiButton>
                <UiButton
                    type="button"
                    :loading="isRenameSubmitting"
                    :disabled="renameValue.length === 0"
                    @click="void submitRename()">
                    保存名称
                </UiButton>
            </div>
        </template>
    </UiModal>

</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import type { AuthSubscriptionItem } from '~/types/auth';

const props = defineProps<{
    items: AuthSubscriptionItem[];
    state: 'idle' | 'loading' | 'success' | 'error';
    errorMessage: string;
    maxDevices: number;
    vapidPublicKey: string;
    supportsPush: boolean;
    notificationPermission: NotificationPermission | 'unsupported';
    currentItem: AuthSubscriptionItem | null;
    currentDeviceStatus:
        | 'checking'
        | 'ios-open-in-safari'
        | 'ios-install-pwa'
        | 'unsupported'
        | 'missing-key'
        | 'permission-denied'
        | 'idle'
        | 'out-of-sync'
        | 'tracked';
    isRefreshingCurrentDevice: boolean;
    canWriteSubscriptions: boolean;
    formatTimestamp: (timestamp: number) => string;
    refresh: () => Promise<unknown> | unknown;
    syncCurrentDevice: () => Promise<boolean>;
    renameSubscription: (id: string, name: string) => Promise<boolean>;
    deleteSubscription: (item: AuthSubscriptionItem) => Promise<boolean>;
    isPending: (kind: 'rename' | 'delete', id: string) => boolean;
}>();

const renameTarget = ref<AuthSubscriptionItem | null>(null);
const renameValue = ref('');
const renameInputRef = ref<HTMLInputElement | null>(null);
const isRenameSubmitting = ref(false);

const currentStatusLabel = computed(() => {
    switch (props.currentDeviceStatus) {
        case 'checking':
            return '检测中';
        case 'ios-open-in-safari':
            return '请用 Safari';
        case 'ios-install-pwa':
            return '请先安装 PWA';
        case 'unsupported':
            return '浏览器不支持';
        case 'missing-key':
            return '未配置公钥';
        case 'permission-denied':
            return '权限被拒绝';
        case 'out-of-sync':
            return '待同步';
        case 'tracked':
            return '已就绪';
        default:
            return '未启用';
    }
});

const currentStatusDescription = computed(() => {
    switch (props.currentDeviceStatus) {
        case 'checking':
            return '正在检测当前浏览器的 Web Push 支持状态，请稍候。';
        case 'ios-open-in-safari':
            return 'iPhone / iPad 订阅仅支持 Safari。请在 Safari 中打开当前页面后再启用订阅。';
        case 'ios-install-pwa':
            return 'iPhone / iPad 需要先用 Safari 将本站添加到主屏幕，再从 PWA 中打开后启用订阅。';
        case 'unsupported':
            return '当前浏览器环境不支持 Web Push，无法为这台设备创建订阅。';
        case 'missing-key':
            return '服务端尚未配置 VAPID 公钥，当前只能查看已保存的订阅设备。';
        case 'permission-denied':
            return '当前浏览器已经拒绝通知权限。你需要先在浏览器设置里重新允许通知。';
        case 'out-of-sync':
            return '浏览器里已经存在 PushSubscription，但服务端还没有这台设备的记录，可以点击按钮重新同步。';
        case 'tracked':
            return '';
        default:
            return '当前浏览器还没有启用订阅。';
    }
});

const currentStatusBadgeClass = computed(() => {
    switch (props.currentDeviceStatus) {
        case 'checking':
            return 'bg-blue-50 text-crh-blue';
        case 'ios-open-in-safari':
        case 'ios-install-pwa':
            return 'bg-amber-50 text-amber-800';
        case 'unsupported':
        case 'missing-key':
            return 'bg-slate-100 text-slate-700';
        case 'permission-denied':
            return 'bg-rose-50 text-rose-800';
        case 'out-of-sync':
            return 'bg-amber-50 text-amber-800';
        case 'tracked':
            return 'bg-emerald-50 text-emerald-800';
        default:
            return 'bg-blue-50 text-crh-blue';
    }
});

const canTriggerSync = computed(() => {
    return (
        props.currentDeviceStatus !== 'checking' &&
        props.currentDeviceStatus !== 'ios-open-in-safari' &&
        props.currentDeviceStatus !== 'ios-install-pwa' &&
        props.canWriteSubscriptions &&
        props.supportsPush &&
        props.notificationPermission !== 'denied' &&
        props.vapidPublicKey.trim().length > 0
    );
});

const currentActionLabel = computed(() =>
    props.currentDeviceStatus === 'tracked' ||
    props.currentDeviceStatus === 'out-of-sync'
        ? '同步当前设备'
        : props.currentDeviceStatus === 'checking'
          ? '检测当前设备'
          : props.currentDeviceStatus === 'ios-open-in-safari'
            ? '请在 Safari 中打开'
            : props.currentDeviceStatus === 'ios-install-pwa'
              ? '请先安装 PWA'
              : '为当前设备启用订阅'
);

const capabilityHint = computed(() => {
    if (
        props.currentDeviceStatus === 'checking' ||
        props.currentDeviceStatus === 'ios-open-in-safari' ||
        props.currentDeviceStatus === 'ios-install-pwa'
    ) {
        return '';
    }

    if (!props.canWriteSubscriptions) {
        return '当前登录会话没有订阅管理权限。若这是旧会话，请重新登录后再试。';
    }

    if (!props.supportsPush) {
        return '当前环境不支持 Web Push。建议在支持 Service Worker 和 Push API 的浏览器中使用。';
    }

    if (!props.vapidPublicKey.trim()) {
        return '推送公钥尚未配置，当前设备暂时无法创建新的订阅。';
    }

    if (props.notificationPermission === 'denied') {
        return '通知权限已被浏览器拒绝，请先在浏览器设置里重新允许通知。';
    }

    return '';
});

const displayErrorMessage = computed(() => props.errorMessage || capabilityHint.value);

function openRenameModal(item: AuthSubscriptionItem) {
    renameTarget.value = item;
    renameValue.value = item.name;
    void nextTick(() => {
        renameInputRef.value?.focus();
        renameInputRef.value?.select();
    });
}

function closeRenameModal(force = false) {
    if (!force && isRenameSubmitting.value) {
        return;
    }

    renameTarget.value = null;
    renameValue.value = '';
}

function handleRenameModalVisibilityChange(nextValue: boolean) {
    if (!nextValue) {
        closeRenameModal();
    }
}

async function submitRename() {
    if (!renameTarget.value || isRenameSubmitting.value) {
        return;
    }

    isRenameSubmitting.value = true;

    try {
        const succeeded = await props.renameSubscription(
            renameTarget.value.id,
            renameValue.value
        );

        if (succeeded) {
            closeRenameModal(true);
        }
    } finally {
        isRenameSubmitting.value = false;
    }
}

function handleRenameInputKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.isComposing) {
        return;
    }

    event.preventDefault();
    void submitRename();
}

</script>
