<template>
    <AdminShell
        v-model:date-input="selectedDateInput"
        :today-date-input-value="todayDateInputValue"
        :session="session"
        title="被动告警"
        description="读取所选日期的 warning 与 error 日志。">
        <template #toolbar>
            <UiButton
                type="button"
                variant="secondary"
                :loading="passiveAlertsStatus === 'pending'"
                @click="loadPassiveAlerts(true)">
                刷新告警
            </UiButton>
        </template>

        <UiCard
            :show-accent-bar="false"
            class="min-h-[38rem]">
            <div class="space-y-6">
                <div
                    class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div class="space-y-2">
                        <p
                            class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                            被动告警
                        </p>
                        <h2 class="text-2xl font-semibold text-slate-900">
                            日志告警
                        </h2>
                        <p class="text-sm leading-6 text-slate-600">
                            正在读取 {{ selectedDateYmd }} 的日志，并汇总
                            warning 与 error。
                        </p>
                    </div>

                    <div class="text-sm leading-6 text-slate-500">
                        <p>日志文件：{{ passiveLogFileLabel }}</p>
                        <p>
                            已加载：{{ loadedPassiveAlertsItemCount }} /
                            {{ passiveAlertsData?.filteredTotal ?? 0 }}
                        </p>
                    </div>
                </div>

                <div class="grid gap-3 md:grid-cols-3">
                    <div
                        class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                        <p
                            class="text-xs uppercase tracking-[0.18em] text-slate-500">
                            告警总数
                        </p>
                        <p class="mt-2 text-3xl font-semibold text-slate-900">
                            {{ passiveAlertsData?.filteredTotal ?? 0 }}
                        </p>
                    </div>
                    <div
                        class="rounded-[1rem] border border-amber-200 bg-amber-50/70 px-4 py-4">
                        <p
                            class="text-xs uppercase tracking-[0.18em] text-amber-700">
                            Warning 数
                        </p>
                        <p class="mt-2 text-3xl font-semibold text-amber-900">
                            {{ passiveAlertsData?.warnCount ?? 0 }}
                        </p>
                    </div>
                    <div
                        class="rounded-[1rem] border border-rose-200 bg-rose-50/70 px-4 py-4">
                        <p
                            class="text-xs uppercase tracking-[0.18em] text-rose-700">
                            Error 数
                        </p>
                        <p class="mt-2 text-3xl font-semibold text-rose-900">
                            {{ passiveAlertsData?.errorCount ?? 0 }}
                        </p>
                    </div>
                </div>

                <div
                    v-if="passiveAlertsErrorMessage"
                    class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700">
                    {{ passiveAlertsErrorMessage }}
                </div>

                <div
                    v-else-if="passiveAlertsStatus === 'pending'"
                    class="space-y-3">
                    <div
                        v-for="index in 3"
                        :key="`passive-loading:${index}`"
                        class="h-24 animate-pulse rounded-[1rem] bg-slate-100/90" />
                </div>

                <template v-else>
                    <div class="space-y-3">
                        <div class="space-y-1">
                            <h3 class="text-lg font-semibold text-slate-900">
                                高频来源
                            </h3>
                            <p class="text-sm leading-6 text-slate-500">
                                按 warning 和 error
                                数量排序，不受当前类型筛选影响。
                            </p>
                        </div>

                        <div
                            v-if="
                                passiveAlertsData &&
                                passiveAlertsData.topLoggers.length > 0
                            "
                            class="flex flex-wrap gap-2">
                            <span
                                v-for="item in passiveAlertsData.topLoggers"
                                :key="item.logger"
                                class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700">
                                <span>{{ item.logger }}</span>
                                <span class="text-slate-400">{{
                                    item.count
                                }}</span>
                            </span>
                        </div>

                        <UiEmptyState
                            v-else
                            eyebrow="无告警"
                            title="暂无高频来源"
                            description="如果所选日期没有 warning 或 error 日志，这里会保持为空。" />
                    </div>

                    <div class="space-y-3">
                        <div
                            class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                            <div class="space-y-1">
                                <h3
                                    class="text-lg font-semibold text-slate-900">
                                    最新告警
                                </h3>
                                <p class="text-sm leading-6 text-slate-500">
                                    类型筛选在后端执行，并通过滚动自动加载更多记录。
                                </p>
                            </div>

                            <div class="w-full lg:max-w-xs">
                                <UiField
                                    label="告警类型"
                                    help="仅影响下方告警列表，不影响统计与高频来源。">
                                    <UiSelect
                                        v-model="selectedAlertType"
                                        :disabled="alertTypeOptions.length <= 1"
                                        mobile-sheet-eyebrow="筛选"
                                        mobile-sheet-title="选择告警类型"
                                        :options="alertTypeOptions" />
                                </UiField>
                            </div>
                        </div>

                        <div
                            v-if="
                                passiveAlertsData &&
                                passiveAlertsData.items.length > 0
                            "
                            class="space-y-3">
                            <article
                                v-for="item in passiveAlertsData.items"
                                :key="item.id"
                                class="rounded-[1rem] border px-4 py-4"
                                :class="
                                    item.level === 'ERROR'
                                        ? 'border-rose-200 bg-rose-50/60'
                                        : 'border-amber-200 bg-amber-50/60'
                                ">
                                <div
                                    class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                    <div class="space-y-2">
                                        <div
                                            class="flex flex-wrap items-center gap-2">
                                            <span
                                                :class="
                                                    getAlertLevelBadgeClass(
                                                        item.level
                                                    )
                                                ">
                                                {{ item.level }}
                                            </span>
                                            <span
                                                class="text-sm font-medium text-slate-900">
                                                {{ item.logger }}
                                            </span>
                                        </div>
                                        <p
                                            class="text-sm leading-6 text-slate-700">
                                            {{ item.message }}
                                        </p>
                                    </div>
                                    <span
                                        class="shrink-0 text-xs text-slate-500">
                                        {{ formatTimestamp(item.timestamp) }}
                                    </span>
                                </div>
                            </article>

                            <div class="space-y-3 pt-2">
                                <div
                                    v-if="isLoadingMore"
                                    class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-600">
                                    正在加载更多告警…
                                </div>

                                <div
                                    v-else-if="loadMoreErrorMessage"
                                    class="rounded-[1rem] border border-amber-200 bg-amber-50/70 px-4 py-4">
                                    <p class="text-sm leading-6 text-amber-900">
                                        {{ loadMoreErrorMessage }}
                                    </p>
                                    <div class="mt-3">
                                        <UiButton
                                            type="button"
                                            variant="secondary"
                                            @click="loadMorePassiveAlerts">
                                            重试加载更多
                                        </UiButton>
                                    </div>
                                </div>

                                <div
                                    v-if="canLoadMore"
                                    ref="loadMoreSentinel"
                                    class="h-1 w-full" />

                                <p class="text-xs text-slate-400">
                                    <template v-if="canLoadMore">
                                        已加载
                                        {{ loadedPassiveAlertsItemCount }} /
                                        {{ passiveAlertsData.filteredTotal }}
                                        条，继续下滑可加载更多。
                                    </template>
                                    <template v-else>
                                        已加载全部
                                        {{ passiveAlertsData.filteredTotal }}
                                        条告警。
                                    </template>
                                </p>
                            </div>
                        </div>

                        <UiEmptyState
                            v-else-if="(passiveAlertsData?.total ?? 0) > 0"
                            eyebrow="无命中"
                            title="当前类型下没有告警"
                            description="请切换到其他类型，或返回“全部类型”查看完整告警列表。" />

                        <UiEmptyState
                            v-else
                            eyebrow="正常"
                            title="该日期没有被动告警"
                            description="所选日期没有 warning 或 error 记录。" />
                    </div>
                </template>
            </div>
        </UiCard>
    </AdminShell>
</template>

<script setup lang="ts">
import useTrackedRequestFetch, {
    type TrackedRequestFetch
} from '~/composables/useTrackedRequestFetch';
import type {
    AdminPassiveAlertLevel,
    AdminPassiveAlertsResponse
} from '~/types/admin';
import type { TrackerApiResponse } from '~/types/homepage';
import { useAdminDateQuery } from '~/composables/useAdminDateQuery';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import formatTrackerTimestamp from '~/utils/time/formatTrackerTimestamp';

definePageMeta({
    middleware: 'admin-required'
});

const PASSIVE_ALERT_PAGE_LIMIT = 50;

const requestFetch: TrackedRequestFetch = import.meta.server
    ? useTrackedRequestFetch()
    : ($fetch as TrackedRequestFetch);
const { session } = useAuthState();
const { selectedDateInput, selectedDateYmd, todayDateInputValue } =
    await useAdminDateQuery();

const passiveAlertsStatus = ref<'pending' | 'success' | 'error'>('pending');
const passiveAlertsData = ref<AdminPassiveAlertsResponse | null>(null);
const passiveAlertsErrorMessage = ref('');
const loadMoreErrorMessage = ref('');
const isLoadingMore = ref(false);
const selectedAlertType = ref('all');
const loadMoreSentinel = ref<HTMLElement | null>(null);

let latestPassiveAlertRequestId = 0;
let sentinelObserver: IntersectionObserver | null = null;

const activeAlertType = computed(() =>
    selectedAlertType.value === 'all' ? '' : selectedAlertType.value
);
const alertTypeOptions = computed(() => [
    {
        value: 'all',
        label: '全部类型'
    },
    ...(passiveAlertsData.value?.typeCounts ?? []).map((item) => ({
        value: item.type,
        label: `${item.type} (${item.count})`
    }))
]);
const passiveLogFileLabel = computed(() => {
    const logFile = passiveAlertsData.value?.logFile;
    if (!logFile) {
        return '未找到对应日志文件';
    }

    return logFile.replace(/^.*[\\/]/, '');
});
const loadedPassiveAlertsItemCount = computed(
    () => passiveAlertsData.value?.items.length ?? 0
);
const canLoadMore = computed(
    () =>
        !!passiveAlertsData.value?.nextCursor &&
        passiveAlertsStatus.value === 'success' &&
        !isLoadingMore.value &&
        !loadMoreErrorMessage.value
);

useSiteSeo({
    title: '被动告警 | Open CRH Tracker',
    description: '查看被动告警列表与高频来源。',
    path: '/admin/passive-alerts',
    noindex: true
});

async function fetchPassiveAlerts(cursor = '') {
    const response = await requestFetch<
        TrackerApiResponse<AdminPassiveAlertsResponse>
    >('/api/v1/admin/passive-alerts', {
        retry: 0,
        query: {
            date: selectedDateYmd.value,
            type: activeAlertType.value || undefined,
            cursor: cursor || undefined,
            limit: PASSIVE_ALERT_PAGE_LIMIT
        }
    });

    if (!response.ok) {
        throw {
            data: response
        };
    }

    return response.data;
}

async function loadPassiveAlerts(reset = true) {
    const cursor = reset ? '' : (passiveAlertsData.value?.nextCursor ?? '');
    if (!reset && (!cursor || isLoadingMore.value)) {
        return;
    }

    const requestId = ++latestPassiveAlertRequestId;

    if (reset) {
        passiveAlertsStatus.value = 'pending';
        passiveAlertsErrorMessage.value = '';
        loadMoreErrorMessage.value = '';
        isLoadingMore.value = false;
    } else {
        isLoadingMore.value = true;
        loadMoreErrorMessage.value = '';
    }

    try {
        const payload = await fetchPassiveAlerts(cursor);
        if (requestId !== latestPassiveAlertRequestId) {
            return;
        }

        passiveAlertsData.value =
            reset || !passiveAlertsData.value
                ? payload
                : {
                      ...payload,
                      items: [
                          ...passiveAlertsData.value.items,
                          ...payload.items
                      ]
                  };
        passiveAlertsStatus.value = 'success';
    } catch (error) {
        if (requestId !== latestPassiveAlertRequestId) {
            return;
        }

        if (reset) {
            passiveAlertsData.value = null;
            passiveAlertsErrorMessage.value = getApiErrorMessage(
                error,
                '加载被动告警失败。'
            );
            passiveAlertsStatus.value = 'error';
        } else {
            loadMoreErrorMessage.value = getApiErrorMessage(
                error,
                '加载更多告警失败。'
            );
        }
    } finally {
        if (requestId !== latestPassiveAlertRequestId) {
            return;
        }

        isLoadingMore.value = false;
    }
}

async function loadMorePassiveAlerts() {
    await loadPassiveAlerts(false);
}

function disconnectSentinelObserver() {
    sentinelObserver?.disconnect();
    sentinelObserver = null;
}

function connectSentinelObserver() {
    if (!import.meta.client || !loadMoreSentinel.value || !canLoadMore.value) {
        disconnectSentinelObserver();
        return;
    }

    disconnectSentinelObserver();
    sentinelObserver = new IntersectionObserver(
        (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                void loadMorePassiveAlerts();
            }
        },
        {
            rootMargin: '0px 0px 240px 0px'
        }
    );
    sentinelObserver.observe(loadMoreSentinel.value);
}

async function reconnectSentinelObserver() {
    if (!import.meta.client) {
        return;
    }

    await nextTick();
    connectSentinelObserver();
}

watch(selectedDateYmd, () => {
    if (selectedAlertType.value !== 'all') {
        selectedAlertType.value = 'all';
        return;
    }

    void loadPassiveAlerts(true);
});

watch(selectedAlertType, (nextValue, previousValue) => {
    if (nextValue === previousValue) {
        return;
    }

    void loadPassiveAlerts(true);
});

watch(
    () => [
        passiveAlertsData.value?.nextCursor ?? '',
        passiveAlertsData.value?.items.length ?? 0,
        passiveAlertsStatus.value,
        isLoadingMore.value,
        loadMoreErrorMessage.value
    ],
    reconnectSentinelObserver,
    {
        immediate: true
    }
);

watch(loadMoreSentinel, reconnectSentinelObserver);

onMounted(() => {
    void reconnectSentinelObserver();
});

onBeforeUnmount(() => {
    disconnectSentinelObserver();
});

await loadPassiveAlerts(true);

function formatTimestamp(timestamp: number) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return '--';
    }

    return formatTrackerTimestamp(timestamp);
}

function getAlertLevelBadgeClass(level: AdminPassiveAlertLevel) {
    return level === 'ERROR'
        ? 'inline-flex items-center rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-rose-800'
        : 'inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-amber-800';
}
</script>
