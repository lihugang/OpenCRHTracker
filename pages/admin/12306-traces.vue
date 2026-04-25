<template>
    <AdminShell
        v-model:date-input="selectedDateInput"
        :today-date-input-value="todayDateInputValue"
        :session="session"
        :show-date-input="false"
        title="12306 追踪"
        description="按车次查看最近保留天数内的编组来源、重联复用状态和重联扫描结果。">
        <template #toolbar>
            <UiButton
                type="button"
                variant="secondary"
                :disabled="!activeTrainCodeFilter"
                :loading="searchStatus === 'pending'"
                @click="loadTrainTraceDays(activeTrainCodeFilter)">
                刷新结果
            </UiButton>
        </template>

        <div class="space-y-6">
            <UiCard :show-accent-bar="false">
                <div class="space-y-6">
                    <div
                        class="rounded-[1.2rem] border border-sky-200 bg-sky-50/80 px-5 py-5">
                        <div
                            class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                            <div class="space-y-2">
                                <p
                                    class="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
                                    Train Search
                                </p>
                                <h2 class="text-2xl font-semibold text-slate-900">
                                    车次来源追踪
                                </h2>
                                <p class="max-w-3xl text-sm leading-6 text-slate-700">
                                    输入车次后，页面会从截止日期开始，向前搜索保留窗口内的
                                    12306 trace，并按天整理为来源表格。
                                </p>
                            </div>

                            <div
                                class="grid gap-3 sm:grid-cols-2 xl:min-w-[28rem]">
                                <div
                                    class="rounded-[1rem] border border-white/80 bg-white/90 px-4 py-3">
                                    <p
                                        class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                        截止日期
                                    </p>
                                    <p
                                        class="mt-2 text-sm font-semibold text-slate-900">
                                        {{ formatDayLabel(selectedDateYmd) }}
                                    </p>
                                </div>
                                <div
                                    class="rounded-[1rem] border border-white/80 bg-white/90 px-4 py-3">
                                    <p
                                        class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                        保留窗口
                                    </p>
                                    <p
                                        class="mt-2 text-sm font-semibold text-slate-900">
                                        最近
                                        {{ searchData?.requestMetricsRetentionDays ?? 0 }}
                                        天
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
                        <UiField
                            label="车次"
                            help="例如 G1、D1234、C7861。按回车也可以直接搜索。">
                            <input
                                v-model="trainCodeInput"
                                type="text"
                                class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark"
                                placeholder="输入车次"
                                @keydown.enter.prevent="submitSearch" />
                        </UiField>

                        <UiField
                            label="截止日期"
                            help="结果会从这一天开始向前搜索保留窗口。">
                            <input
                                v-model="selectedDateInput"
                                type="date"
                                class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark" />
                        </UiField>
                    </div>

                    <div class="flex flex-wrap gap-3">
                        <UiButton
                            type="button"
                            :loading="searchStatus === 'pending'"
                            @click="submitSearch">
                            搜索
                        </UiButton>
                        <UiButton
                            type="button"
                            variant="secondary"
                            :disabled="!activeTrainCodeFilter && !trainCodeInput"
                            @click="clearSearch">
                            清空
                        </UiButton>
                    </div>

                    <div
                        v-if="validationMessage"
                        class="rounded-[1rem] border border-amber-200 bg-amber-50/80 px-4 py-4 text-sm leading-6 text-amber-700">
                        {{ validationMessage }}
                    </div>

                    <div
                        v-else-if="searchErrorMessage"
                        class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700">
                        {{ searchErrorMessage }}
                    </div>

                    <div
                        v-else-if="
                            searchData &&
                            !searchData.requestMetricsEnabled
                        "
                        class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-600">
                        当前配置已关闭 12306 trace 记录，无法展示车次来源表。
                    </div>

                    <div
                        v-else-if="
                            searchData &&
                            !searchData.requestMetricsRetained
                        "
                        class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-600">
                        当前截止日期超出 trace 保留窗口。当前仅保留最近
                        {{ searchData.requestMetricsRetentionDays }} 天。
                    </div>

                    <div
                        v-else-if="activeTrainCodeFilter && searchData"
                        class="grid gap-3 md:grid-cols-3">
                        <div
                            class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                            <p
                                class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                当前车次
                            </p>
                            <p
                                class="mt-2 text-2xl font-semibold text-slate-900">
                                {{ activeTrainCodeFilter }}
                            </p>
                        </div>
                        <div
                            class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                            <p
                                class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                命中日期
                            </p>
                            <p
                                class="mt-2 text-2xl font-semibold text-slate-900">
                                {{ searchData.matchedDayCount }}
                            </p>
                        </div>
                        <div
                            class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                            <p
                                class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                搜索范围
                            </p>
                            <p
                                class="mt-2 text-2xl font-semibold text-slate-900">
                                {{ searchData.searchedDayCount }} 天
                            </p>
                        </div>
                    </div>
                </div>
            </UiCard>

            <div
                v-if="searchStatus === 'pending'"
                class="space-y-4">
                <div
                    v-for="index in 3"
                    :key="`admin-12306-trace-search-skeleton:${index}`"
                    class="h-56 animate-pulse rounded-[1.25rem] bg-slate-100/90" />
            </div>

            <UiEmptyState
                v-else-if="!activeTrainCodeFilter"
                eyebrow="等待搜索"
                title="先输入一个车次"
                description="搜索后会按天展示该车次的编组来源、重联复用状态和重联扫描结果。" />

            <UiEmptyState
                v-else-if="dayItems.length === 0"
                eyebrow="无结果"
                title="保留窗口内没有命中这个车次"
                description="可以切换截止日期，或确认车次写法是否正确。" />

            <div
                v-else
                class="space-y-5">
                <UiCard
                    v-for="day in dayItems"
                    :key="day.date"
                    :show-accent-bar="false">
                    <div class="space-y-5">
                        <div
                            class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div class="space-y-2">
                                <div class="flex flex-wrap items-center gap-2">
                                    <span
                                        class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em]"
                                        :class="getResultBadgeClass(day.resultStatus)">
                                        {{ day.resultLabel }}
                                    </span>
                                    <span
                                        class="text-xl font-semibold text-slate-900">
                                        {{ formatDayLabel(day.date) }}
                                    </span>
                                </div>
                                <p class="text-sm leading-6 text-slate-600">
                                    命中 {{ day.traceCount }} 条 trace
                                    <template v-if="day.matchedTrainCodes.length > 0">
                                        ，关联车次：
                                        {{ day.matchedTrainCodes.join(' / ') }}
                                    </template>
                                </p>
                                <p
                                    v-if="day.relatedEmuCodes.length > 0"
                                    class="text-sm leading-6 text-slate-500">
                                    关联编组：{{ day.relatedEmuCodes.join(' / ') }}
                                </p>
                            </div>

                            <div
                                class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-slate-600">
                                <p>搜索车次：{{ day.queryTrainCode }}</p>
                                <p>来源记录：{{ day.rows.length }} 条</p>
                            </div>
                        </div>

                        <div
                            class="overflow-x-auto rounded-[1rem] border border-slate-200 bg-white/90">
                            <table class="min-w-full divide-y divide-slate-200">
                                <thead class="bg-slate-50/80">
                                    <tr>
                                        <th
                                            class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                            时间
                                        </th>
                                        <th
                                            class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                            来源
                                        </th>
                                        <th
                                            class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                            结果
                                        </th>
                                        <th
                                            class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                            说明
                                        </th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100">
                                    <tr
                                        v-for="row in day.rows"
                                        :key="row.id"
                                        class="align-top transition hover:bg-slate-50/70">
                                        <td
                                            class="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-900">
                                            {{ formatRowTime(row.timestamp) }}
                                        </td>
                                        <td class="px-4 py-3 text-sm text-slate-700">
                                            <button
                                                v-if="
                                                    row.clickable &&
                                                    row.actionType ===
                                                        'open_coupling_task'
                                                "
                                                type="button"
                                                class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                                                :class="getSourceBadgeClass(row.kind)"
                                                @click="
                                                    openCouplingTaskModal(row)
                                                ">
                                                {{ row.source }}
                                            </button>
                                            <span
                                                v-else
                                                class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]"
                                                :class="getSourceBadgeClass(row.kind)">
                                                {{ row.source }}
                                            </span>
                                        </td>
                                        <td class="px-4 py-3 text-sm text-slate-900">
                                            <span class="font-semibold">
                                                {{ row.result }}
                                            </span>
                                        </td>
                                        <td class="px-4 py-3 text-sm text-slate-600">
                                            {{ row.detail || '--' }}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </UiCard>
            </div>
        </div>

        <Admin12306CouplingTaskModal
            v-model="isCouplingTaskModalOpen"
            :is-mobile="isMobileActionSheet"
            :task-id="selectedCouplingTaskId"
            :date="selectedCouplingTaskDate" />
    </AdminShell>
</template>

<script setup lang="ts">
import type {
    Admin12306TrainTraceDayItem,
    Admin12306TrainTraceResultStatus,
    Admin12306TrainTraceSearchResponse,
    Admin12306TrainTraceSourceKind
} from '~/types/admin';
import type { TrackerApiResponse } from '~/types/homepage';
import { useAdminDateQuery } from '~/composables/useAdminDateQuery';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';

definePageMeta({
    middleware: 'admin-required'
});

const MOBILE_QUERY = '(max-width: 767px)';

const rowTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
});
const dayLabelFormatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short'
});

const requestFetch = import.meta.server ? useRequestFetch() : $fetch;
const { session } = useAuthState();
const { selectedDateInput, selectedDateYmd, todayDateInputValue } =
    await useAdminDateQuery();

const trainCodeInput = ref('');
const activeTrainCodeFilter = ref('');
const searchStatus = ref<'idle' | 'pending' | 'success' | 'error'>('idle');
const searchData = ref<Admin12306TrainTraceSearchResponse | null>(null);
const searchErrorMessage = ref('');
const validationMessage = ref('');
const isCouplingTaskModalOpen = ref(false);
const selectedCouplingTaskId = ref<number | null>(null);
const selectedCouplingTaskDate = ref('');
const isMobileActionSheet = ref(false);
const dialogMediaQuery = ref<MediaQueryList | null>(null);

const dayItems = computed<Admin12306TrainTraceDayItem[]>(
    () => searchData.value?.items ?? []
);

useSiteSeo({
    title: '12306 追踪 | Open CRH Tracker',
    description: '按车次查看最近保留天数内的编组来源、重联复用与重联扫描结果。',
    path: '/admin/12306-traces',
    noindex: true
});

async function fetchTrainTraceDays(trainCode: string) {
    const response = await requestFetch<
        TrackerApiResponse<Admin12306TrainTraceSearchResponse>
    >('/api/v1/admin/12306-trace-search', {
        retry: 0,
        query: {
            date: selectedDateYmd.value,
            trainCode
        }
    });

    if (!response.ok) {
        throw {
            data: response
        };
    }

    return response.data;
}

async function loadTrainTraceDays(trainCode: string) {
    if (!trainCode) {
        return;
    }

    searchStatus.value = 'pending';
    searchErrorMessage.value = '';

    try {
        searchData.value = await fetchTrainTraceDays(trainCode);
        searchStatus.value = 'success';
    } catch (error) {
        searchData.value = null;
        searchStatus.value = 'error';
        searchErrorMessage.value = getApiErrorMessage(
            error,
            '加载 12306 车次来源追踪失败。'
        );
    }
}

function applyViewportState(mediaQueryList: MediaQueryList) {
    isMobileActionSheet.value = mediaQueryList.matches;
}

function handleViewportChange(event: MediaQueryListEvent) {
    applyViewportState(event.currentTarget as MediaQueryList);
}

onMounted(() => {
    const nextMediaQueryList = window.matchMedia(MOBILE_QUERY);
    dialogMediaQuery.value = nextMediaQueryList;
    applyViewportState(nextMediaQueryList);
    nextMediaQueryList.addEventListener('change', handleViewportChange);
});

onBeforeUnmount(() => {
    dialogMediaQuery.value?.removeEventListener('change', handleViewportChange);
});

function normalizeTrainCodeInput(value: string) {
    return value.trim().toUpperCase();
}

function submitSearch() {
    const normalizedTrainCode = normalizeTrainCodeInput(trainCodeInput.value);
    validationMessage.value = '';
    closeCouplingTaskModal();

    if (!normalizedTrainCode) {
        activeTrainCodeFilter.value = '';
        searchData.value = null;
        searchStatus.value = 'idle';
        validationMessage.value = '请先输入要查询的车次。';
        return;
    }

    trainCodeInput.value = normalizedTrainCode;
    activeTrainCodeFilter.value = normalizedTrainCode;
    void loadTrainTraceDays(normalizedTrainCode);
}

function clearSearch() {
    trainCodeInput.value = '';
    activeTrainCodeFilter.value = '';
    searchData.value = null;
    searchStatus.value = 'idle';
    searchErrorMessage.value = '';
    validationMessage.value = '';
    closeCouplingTaskModal();
}

watch(selectedDateYmd, () => {
    closeCouplingTaskModal();

    if (!activeTrainCodeFilter.value) {
        return;
    }

    void loadTrainTraceDays(activeTrainCodeFilter.value);
});

function closeCouplingTaskModal() {
    isCouplingTaskModalOpen.value = false;
    selectedCouplingTaskId.value = null;
    selectedCouplingTaskDate.value = '';
}

function openCouplingTaskModal(row: Admin12306TrainTraceDayItem['rows'][number]) {
    if (
        row.actionType !== 'open_coupling_task' ||
        !row.couplingTaskId ||
        !row.couplingTaskDate
    ) {
        return;
    }

    selectedCouplingTaskId.value = row.couplingTaskId;
    selectedCouplingTaskDate.value = row.couplingTaskDate;
    isCouplingTaskModalOpen.value = true;
}

function formatRowTime(timestamp: number) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return '--';
    }

    return rowTimeFormatter.format(new Date(timestamp * 1000));
}

function formatDayLabel(date: string) {
    if (!/^\d{8}$/.test(date)) {
        return '--';
    }

    const year = Number.parseInt(date.slice(0, 4), 10);
    const month = Number.parseInt(date.slice(4, 6), 10);
    const day = Number.parseInt(date.slice(6, 8), 10);

    return dayLabelFormatter.format(
        new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00+08:00`)
    );
}

function getResultBadgeClass(status: Admin12306TrainTraceResultStatus) {
    switch (status) {
        case 'single':
            return 'bg-emerald-100 text-emerald-800';
        case 'coupled':
            return 'bg-sky-100 text-sky-800';
        case 'pending':
            return 'bg-amber-100 text-amber-800';
        default:
            return 'bg-slate-200 text-slate-700';
    }
}

function getSourceBadgeClass(kind: Admin12306TrainTraceSourceKind) {
    switch (kind) {
        case 'route_query':
            return 'bg-slate-200 text-slate-700';
        case 'reuse_status':
            return 'bg-amber-100 text-amber-800';
        case 'coupling_scan':
            return 'bg-sky-100 text-sky-800';
        case 'asset_resolve':
            return 'bg-emerald-100 text-emerald-800';
        case 'history_validation':
            return 'bg-violet-100 text-violet-800';
        default:
            return 'bg-slate-200 text-slate-700';
    }
}
</script>
