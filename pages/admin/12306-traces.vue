<template>
    <AdminShell
        v-model:date-input="selectedDateInput"
        :today-date-input-value="todayDateInputValue"
        :session="session"
        title="12306 追踪"
        description="按日期和车次查看 12306 请求、主要函数调用、冲突事件与最终决策的完整时间线。">
        <template #toolbar>
            <UiButton
                type="button"
                variant="secondary"
                :loading="tracesStatus === 'pending'"
                @click="loadTraces(true)">
                刷新追踪
            </UiButton>
        </template>

        <div class="grid gap-6 xl:grid-cols-[24rem_minmax(0,1fr)]">
            <UiCard :show-accent-bar="false">
                <div class="space-y-5">
                    <div class="space-y-2">
                        <p
                            class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                            FILTER
                        </p>
                        <h2 class="text-2xl font-semibold text-slate-900">
                            车次筛选
                        </h2>
                        <p class="text-sm leading-6 text-slate-600">
                            可输入车次号、内部车次号，或留空查看所选日期内的全部追踪。
                        </p>
                    </div>

                    <UiField
                        label="车次或内部车次号"
                        help="例如 G1、D1234 或内部车次号。">
                        <input
                            v-model="trainCodeInput"
                            type="text"
                            class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark"
                            placeholder="输入车次后点击搜索"
                            @keydown.enter.prevent="applyTrainCodeFilter" />
                    </UiField>

                    <div class="flex flex-wrap gap-3">
                        <UiButton
                            type="button"
                            @click="applyTrainCodeFilter">
                            搜索
                        </UiButton>
                        <UiButton
                            type="button"
                            variant="secondary"
                            :disabled="!activeTrainCodeFilter"
                            @click="clearTrainCodeFilter">
                            清空
                        </UiButton>
                    </div>

                    <div
                        v-if="tracesErrorMessage"
                        class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700">
                        {{ tracesErrorMessage }}
                    </div>

                    <div
                        v-else-if="tracesData && !tracesData.requestMetricsEnabled"
                        class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-600">
                        当前配置已关闭 12306 追踪，管理员页不会显示请求曲线和 trace 明细。
                    </div>

                    <div
                        v-else-if="tracesData && !tracesData.requestMetricsRetained"
                        class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-600">
                        所选日期超出追踪保留窗口，目前仅保留最近
                        {{ tracesData.requestMetricsRetentionDays }} 天。
                    </div>

                    <div
                        v-else
                        class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-600">
                        已加载 {{ tracesData?.items.length ?? 0 }} /
                        {{ tracesData?.filteredTotal ?? 0 }} 条追踪
                        <template v-if="activeTrainCodeFilter">
                            ，当前筛选：{{ activeTrainCodeFilter }}
                        </template>
                    </div>

                    <div
                        v-if="tracesStatus === 'pending'"
                        class="space-y-3">
                        <div
                            v-for="index in 4"
                            :key="`trace-loading:${index}`"
                            class="h-24 animate-pulse rounded-[1rem] bg-slate-100/90" />
                    </div>

                    <div
                        v-else-if="traceItems.length > 0"
                        class="space-y-3">
                        <button
                            v-for="item in traceItems"
                            :key="item.traceId"
                            type="button"
                            class="w-full rounded-[1rem] border px-4 py-4 text-left transition"
                            :class="
                                selectedTraceId === item.traceId
                                    ? 'border-crh-blue/30 bg-blue-50/80'
                                    : 'border-slate-200 bg-white/90 hover:border-slate-300 hover:bg-slate-50/80'
                            "
                            @click="selectTrace(item.traceId)">
                            <div
                                class="flex items-start justify-between gap-3">
                                <div class="space-y-2">
                                    <div
                                        class="flex flex-wrap items-center gap-2">
                                        <span
                                            class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em]"
                                            :class="getTraceStatusBadgeClass(item.status)">
                                            {{ item.status }}
                                        </span>
                                        <span
                                            class="text-sm font-semibold text-slate-900">
                                            {{ item.title }}
                                        </span>
                                    </div>
                                    <p
                                        v-if="item.subtitle"
                                        class="text-sm leading-6 text-slate-600">
                                        {{ item.subtitle }}
                                    </p>
                                </div>
                                <span class="text-xs text-slate-500">
                                    {{ formatTimestamp(item.startedAt) }}
                                </span>
                            </div>

                            <div
                                class="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-3">
                                <span>请求 {{ item.requestCount }}</span>
                                <span>冲突 {{ item.conflictCount }}</span>
                                <span>函数 {{ item.functionCount }}</span>
                            </div>
                        </button>

                        <div
                            v-if="canLoadMore"
                            class="pt-1">
                            <UiButton
                                type="button"
                                variant="secondary"
                                :loading="isLoadingMore"
                                @click="loadTraces(false)">
                                加载更多
                            </UiButton>
                        </div>
                    </div>

                    <UiEmptyState
                        v-else
                        eyebrow="无追踪"
                        title="当前条件下没有可显示的追踪"
                        description="可以切换日期，或清空车次筛选后重试。" />
                </div>
            </UiCard>

            <UiCard :show-accent-bar="false">
                <div class="space-y-6">
                    <div class="space-y-2">
                        <p
                            class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                            DETAIL
                        </p>
                        <h2 class="text-2xl font-semibold text-slate-900">
                            过程时间线
                        </h2>
                        <p class="text-sm leading-6 text-slate-600">
                            展示主要函数调用、12306 子请求、冲突事件与最终摘要。
                        </p>
                    </div>

                    <div
                        v-if="detailErrorMessage"
                        class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700">
                        {{ detailErrorMessage }}
                    </div>

                    <div
                        v-else-if="detailStatus === 'pending'"
                        class="space-y-3">
                        <div
                            v-for="index in 4"
                            :key="`trace-detail-loading:${index}`"
                            class="h-28 animate-pulse rounded-[1rem] bg-slate-100/90" />
                    </div>

                    <template v-else-if="selectedTrace">
                        <div
                            class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                            <div
                                class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div class="space-y-2">
                                    <div class="flex flex-wrap items-center gap-2">
                                        <span
                                            class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em]"
                                            :class="getTraceStatusBadgeClass(selectedTrace.status)">
                                            {{ selectedTrace.status }}
                                        </span>
                                        <span
                                            class="text-lg font-semibold text-slate-900">
                                            {{ selectedTrace.title }}
                                        </span>
                                    </div>
                                    <p
                                        v-if="selectedTrace.subtitle"
                                        class="text-sm leading-6 text-slate-600">
                                        {{ selectedTrace.subtitle }}
                                    </p>
                                </div>
                                <div class="text-sm leading-6 text-slate-500">
                                    <p>开始：{{ formatTimestamp(selectedTrace.startedAt) }}</p>
                                    <p>结束：{{ formatTimestamp(selectedTrace.endedAt ?? 0) }}</p>
                                </div>
                            </div>

                            <div
                                class="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-4">
                                <div>
                                    <p class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                        主车次
                                    </p>
                                    <p class="mt-1 font-medium text-slate-900">
                                        {{ selectedTrace.primaryTrainCode || '--' }}
                                    </p>
                                </div>
                                <div>
                                    <p class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                        内部车次
                                    </p>
                                    <p class="mt-1 font-medium text-slate-900">
                                        {{ selectedTrace.trainInternalCode || '--' }}
                                    </p>
                                </div>
                                <div>
                                    <p class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                        任务
                                    </p>
                                    <p class="mt-1 font-medium text-slate-900">
                                        {{ selectedTrace.executor || '--' }}
                                        <template v-if="selectedTrace.taskId !== null">
                                            #{{ selectedTrace.taskId }}
                                        </template>
                                    </p>
                                </div>
                                <div>
                                    <p class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                        关联车次
                                    </p>
                                    <p class="mt-1 font-medium text-slate-900">
                                        {{
                                            selectedTrace.allTrainCodes.length > 0
                                                ? selectedTrace.allTrainCodes.join(' / ')
                                                : '--'
                                        }}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div
                            v-if="selectedTrace.events.length > 0"
                            class="space-y-3">
                            <article
                                v-for="event in selectedTrace.events"
                                :key="event.id"
                                class="rounded-[1rem] border px-4 py-4"
                                :class="getEventCardClass(event.kind, event.level)">
                                <div
                                    class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                    <div class="space-y-2">
                                        <div class="flex flex-wrap items-center gap-2">
                                            <span
                                                class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em]"
                                                :class="getEventBadgeClass(event.kind, event.level)">
                                                {{ event.kind }}
                                            </span>
                                            <span
                                                class="text-sm font-semibold text-slate-900">
                                                {{ event.title }}
                                            </span>
                                        </div>
                                        <p
                                            v-if="event.message"
                                            class="text-sm leading-6 text-slate-700">
                                            {{ event.message }}
                                        </p>
                                    </div>
                                    <div class="text-xs leading-5 text-slate-500">
                                        <p>{{ formatTimestamp(event.timestamp) }}</p>
                                        <p v-if="event.durationMs !== null">
                                            {{ event.durationMs }} ms
                                        </p>
                                    </div>
                                </div>

                                <div
                                    v-if="event.kind === 'request'"
                                    class="mt-3 rounded-[0.9rem] bg-white/70 px-3 py-3 text-sm leading-6 text-slate-600">
                                    <p>{{ event.method }} {{ event.url }}</p>
                                    <p>
                                        operation={{ event.operation }}
                                        <template v-if="event.responseStatus !== null">
                                            · status={{ event.responseStatus }}
                                        </template>
                                        <template v-if="event.errorCode">
                                            · error={{ event.errorCode }}
                                        </template>
                                    </p>
                                </div>

                                <div
                                    v-if="event.kind === 'function'"
                                    class="mt-3 text-sm leading-6 text-slate-600">
                                    函数：{{ event.functionName }} · 状态：{{ event.status }}
                                </div>

                                <div
                                    v-if="event.kind === 'summary'"
                                    class="mt-3 text-sm leading-6 text-slate-600">
                                    最终状态：{{ event.status }}
                                </div>

                                <div
                                    v-if="Object.keys(event.context).length > 0"
                                    class="mt-3 grid gap-2 rounded-[0.9rem] bg-white/70 px-3 py-3 text-sm leading-6 text-slate-600 md:grid-cols-2">
                                    <div
                                        v-for="entry in toEventContextEntries(event.context)"
                                        :key="`${event.id}:${entry.key}`"
                                        class="min-w-0">
                                        <span class="font-medium text-slate-900">
                                            {{ entry.key }}
                                        </span>
                                        ：{{ entry.value }}
                                    </div>
                                </div>
                            </article>
                        </div>

                        <UiEmptyState
                            v-else
                            eyebrow="空时间线"
                            title="当前 trace 还没有事件"
                            description="可能刚创建，还没有写入主要函数调用和请求事件。" />
                    </template>

                    <UiEmptyState
                        v-else
                        eyebrow="未选择"
                        title="先选择一条 trace"
                        description="左侧选择一条追踪后，这里会显示完整时间线。" />
                </div>
            </UiCard>
        </div>
    </AdminShell>
</template>

<script setup lang="ts">
import type {
    Admin12306TraceDetailItem,
    Admin12306TraceDetailResponse,
    Admin12306TraceEvent,
    Admin12306TraceListItem,
    Admin12306TraceListResponse
} from '~/types/admin';
import type { TrackerApiResponse } from '~/types/homepage';
import { useAdminDateQuery } from '~/composables/useAdminDateQuery';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import formatTrackerTimestamp from '~/utils/time/formatTrackerTimestamp';

definePageMeta({
    middleware: 'admin-required'
});

const TRACE_PAGE_LIMIT = 50;

const requestFetch = import.meta.server ? useRequestFetch() : $fetch;
const { session } = useAuthState();
const { selectedDateInput, selectedDateYmd, todayDateInputValue } =
    await useAdminDateQuery();

const trainCodeInput = ref('');
const activeTrainCodeFilter = ref('');
const tracesStatus = ref<'pending' | 'success' | 'error'>('pending');
const tracesData = ref<Admin12306TraceListResponse | null>(null);
const tracesErrorMessage = ref('');
const isLoadingMore = ref(false);
const selectedTraceId = ref('');
const detailStatus = ref<'idle' | 'pending' | 'success' | 'error'>('idle');
const detailData = ref<Admin12306TraceDetailResponse | null>(null);
const detailErrorMessage = ref('');

const traceItems = computed(() => tracesData.value?.items ?? []);
const canLoadMore = computed(
    () =>
        !!tracesData.value?.nextCursor &&
        tracesStatus.value === 'success' &&
        !isLoadingMore.value
);
const selectedTrace = computed<Admin12306TraceDetailItem | null>(
    () => detailData.value?.trace ?? null
);

useSiteSeo({
    title: '12306 追踪 | Open CRH Tracker',
    description: '查看管理员 12306 全链路追踪时间线。',
    path: '/admin/12306-traces',
    noindex: true
});

async function fetchTraces(cursor = '') {
    const response = await requestFetch<
        TrackerApiResponse<Admin12306TraceListResponse>
    >('/api/v1/admin/12306-traces', {
        retry: 0,
        query: {
            date: selectedDateYmd.value,
            trainCode: activeTrainCodeFilter.value || undefined,
            cursor: cursor || undefined,
            limit: TRACE_PAGE_LIMIT
        }
    });

    if (!response.ok) {
        throw {
            data: response
        };
    }

    return response.data;
}

async function fetchTraceDetail(traceId: string) {
    const response = await requestFetch<
        TrackerApiResponse<Admin12306TraceDetailResponse>
    >(`/api/v1/admin/12306-traces/${encodeURIComponent(traceId)}`, {
        retry: 0,
        query: {
            date: selectedDateYmd.value
        }
    });

    if (!response.ok) {
        throw {
            data: response
        };
    }

    return response.data;
}

async function loadTraces(reset = true) {
    const cursor = reset ? '' : (tracesData.value?.nextCursor ?? '');
    if (!reset && (!cursor || isLoadingMore.value)) {
        return;
    }

    if (reset) {
        tracesStatus.value = 'pending';
        tracesErrorMessage.value = '';
    } else {
        isLoadingMore.value = true;
    }

    try {
        const payload = await fetchTraces(cursor);
        tracesData.value =
            reset || !tracesData.value
                ? payload
                : {
                      ...payload,
                      items: [...tracesData.value.items, ...payload.items]
                  };
        tracesStatus.value = 'success';

        if (
            !selectedTraceId.value ||
            !tracesData.value.items.some(
                (item) => item.traceId === selectedTraceId.value
            )
        ) {
            selectedTraceId.value = tracesData.value.items[0]?.traceId ?? '';
        }
    } catch (error) {
        if (reset) {
            tracesData.value = null;
            tracesStatus.value = 'error';
            tracesErrorMessage.value = getApiErrorMessage(
                error,
                '加载 12306 追踪失败。'
            );
            selectedTraceId.value = '';
        } else {
            tracesErrorMessage.value = getApiErrorMessage(
                error,
                '加载更多 12306 追踪失败。'
            );
        }
    } finally {
        isLoadingMore.value = false;
    }
}

async function loadTraceDetail(traceId: string) {
    if (!traceId) {
        detailStatus.value = 'idle';
        detailData.value = null;
        detailErrorMessage.value = '';
        return;
    }

    detailStatus.value = 'pending';
    detailErrorMessage.value = '';
    try {
        detailData.value = await fetchTraceDetail(traceId);
        detailStatus.value = 'success';
    } catch (error) {
        detailData.value = null;
        detailStatus.value = 'error';
        detailErrorMessage.value = getApiErrorMessage(
            error,
            '加载 12306 trace 详情失败。'
        );
    }
}

function applyTrainCodeFilter() {
    activeTrainCodeFilter.value = trainCodeInput.value.trim().toUpperCase();
    void loadTraces(true);
}

function clearTrainCodeFilter() {
    trainCodeInput.value = '';
    activeTrainCodeFilter.value = '';
    void loadTraces(true);
}

function selectTrace(traceId: string) {
    selectedTraceId.value = traceId;
}

watch(selectedDateYmd, () => {
    void loadTraces(true);
});

watch(selectedTraceId, (traceId) => {
    void loadTraceDetail(traceId);
});

await loadTraces(true);
await loadTraceDetail(selectedTraceId.value);

function formatTimestamp(timestamp: number) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return '--';
    }

    return formatTrackerTimestamp(timestamp);
}

function getTraceStatusBadgeClass(status: Admin12306TraceListItem['status']) {
    switch (status) {
        case 'error':
            return 'bg-rose-100 text-rose-800';
        case 'warning':
            return 'bg-amber-100 text-amber-800';
        case 'success':
            return 'bg-emerald-100 text-emerald-800';
        default:
            return 'bg-slate-200 text-slate-700';
    }
}

function getEventBadgeClass(
    kind: Admin12306TraceEvent['kind'],
    level: Admin12306TraceEvent['level']
) {
    if (level === 'ERROR') {
        return 'bg-rose-100 text-rose-800';
    }
    if (level === 'WARN') {
        return 'bg-amber-100 text-amber-800';
    }
    if (kind === 'summary') {
        return 'bg-emerald-100 text-emerald-800';
    }
    return 'bg-slate-200 text-slate-700';
}

function getEventCardClass(
    kind: Admin12306TraceEvent['kind'],
    level: Admin12306TraceEvent['level']
) {
    if (level === 'ERROR') {
        return 'border-rose-200 bg-rose-50/60';
    }
    if (level === 'WARN') {
        return 'border-amber-200 bg-amber-50/60';
    }
    if (kind === 'summary') {
        return 'border-emerald-200 bg-emerald-50/60';
    }
    return 'border-slate-200 bg-white/90';
}

function toEventContextEntries(context: Record<string, string>) {
    return Object.entries(context)
        .filter(([, value]) => value.trim().length > 0)
        .slice(0, 12)
        .map(([key, value]) => ({
            key,
            value
        }));
}
</script>
