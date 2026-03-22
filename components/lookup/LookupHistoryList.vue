<template>
    <UiCard class="history-panel-card">
        <div class="space-y-6">
            <div class="space-y-2">
                <p
                    class="text-xs font-semibold uppercase tracking-[0.3em] text-crh-blue/70">
                    RECENT RECORDS
                </p>
                <h2 class="text-2xl font-semibold text-crh-grey-dark">
                    {{ title }}
                </h2>
            </div>

            <div class="motion-divider" />

            <div
                v-if="state === 'loading'"
                class="space-y-4">
                <div
                    class="hidden overflow-hidden rounded-[1.25rem] border border-slate-200 md:block">
                    <table
                        class="min-w-full border-separate border-spacing-0 bg-white/90">
                        <thead>
                            <tr class="bg-slate-50/80 text-left">
                                <th
                                    v-for="column in columns"
                                    :key="`loading:${column}`"
                                    class="border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                                    {{ column }}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="index in 5"
                                :key="`loading:row:${index}`"
                                class="animate-pulse">
                                <td
                                    class="border-b border-slate-100 px-4 py-4 last:border-b-0">
                                    <div
                                        class="h-4 w-20 rounded bg-slate-200" />
                                </td>
                                <td
                                    class="border-b border-slate-100 px-4 py-4 last:border-b-0">
                                    <div
                                        class="h-4 w-28 rounded bg-slate-200" />
                                </td>
                                <td
                                    class="border-b border-slate-100 px-4 py-4 last:border-b-0">
                                    <div
                                        class="h-4 w-24 rounded bg-slate-100" />
                                </td>
                                <td
                                    class="border-b border-slate-100 px-4 py-4 last:border-b-0">
                                    <div
                                        class="h-4 w-16 rounded bg-slate-100" />
                                </td>
                                <td
                                    class="border-b border-slate-100 px-4 py-4 last:border-b-0">
                                    <div
                                        class="h-4 w-24 rounded bg-slate-100" />
                                </td>
                                <td
                                    class="border-b border-slate-100 px-4 py-4 last:border-b-0">
                                    <div
                                        class="h-4 w-16 rounded bg-slate-100" />
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="space-y-2.5 md:hidden">
                    <UiCard
                        v-for="index in 5"
                        :key="`loading:card:${index}`"
                        :show-accent-bar="false"
                        variant="subtle">
                        <div class="animate-pulse space-y-3">
                            <div class="flex items-start gap-3">
                                <div class="min-w-0">
                                    <div
                                        class="h-4 w-20 rounded bg-slate-100" />
                                    <div
                                        class="mt-2 h-4 w-28 rounded bg-slate-200" />
                                </div>
                            </div>

                            <div
                                class="rounded-[1rem] border border-slate-200 bg-white/90 px-4 py-3">
                                <div class="flex items-center gap-3">
                                    <div class="min-w-0 flex-1">
                                        <div
                                            class="h-3 w-12 rounded bg-slate-100" />
                                        <div
                                            class="mt-2 h-4 w-20 rounded bg-slate-200" />
                                    </div>

                                    <div
                                        class="shrink-0 flex min-w-[4.75rem] items-center gap-[0.35rem] text-slate-300"
                                        aria-hidden="true">
                                        <span
                                            class="h-px flex-1 bg-[linear-gradient(90deg,rgb(226_232_240),rgb(203_213_225))]" />
                                        <span class="text-[0.8rem] leading-none"
                                            >-&gt;</span
                                        >
                                        <span
                                            class="h-px flex-1 bg-[linear-gradient(90deg,rgb(226_232_240),rgb(203_213_225))]" />
                                    </div>

                                    <div class="min-w-0 flex-1 text-right">
                                        <div
                                            class="ml-auto h-3 w-12 rounded bg-slate-100" />
                                        <div
                                            class="mt-2 ml-auto h-4 w-20 rounded bg-slate-200" />
                                    </div>
                                </div>

                                <div
                                    class="mt-3 flex items-center gap-3 border-t border-slate-100 pt-3">
                                    <div class="min-w-0 flex-1">
                                        <div
                                            class="h-3 w-12 rounded bg-slate-100" />
                                        <div
                                            class="mt-2 h-4 w-16 rounded bg-slate-200" />
                                    </div>

                                    <div
                                        class="h-px basis-6 bg-[linear-gradient(90deg,rgb(241_245_249),rgb(203_213_225))]"
                                        aria-hidden="true" />

                                    <div class="min-w-0 flex-1 text-right">
                                        <div
                                            class="ml-auto h-3 w-12 rounded bg-slate-100" />
                                        <div
                                            class="mt-2 ml-auto h-4 w-16 rounded bg-slate-200" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </UiCard>
                </div>
            </div>

            <UiEmptyState
                v-else-if="state === 'empty'"
                eyebrow="No Results"
                title="没有查到历史记录"
                description="可以尝试更换车次号或车组号，或检查输入格式是否正确。" />

            <UiEmptyState
                v-else-if="state === 'error'"
                eyebrow="Load Failed"
                title="历史数据暂时不可用"
                :description="errorMessage || '请稍后重试。'"
                tone="danger" />

            <div
                v-else
                class="space-y-4">
                <div
                    class="hidden overflow-hidden rounded-[1.25rem] border border-slate-200 md:block">
                    <table
                        class="min-w-full border-separate border-spacing-0 bg-white/90">
                        <thead>
                            <tr class="bg-slate-50/80 text-left">
                                <th
                                    v-for="column in columns"
                                    :key="column"
                                    class="border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                    {{ column }}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="item in groupedItems"
                                :key="item.id"
                                :class="[
                                    'history-table-row align-top',
                                    item.isTintedDateBand
                                        ? 'history-table-row--tinted'
                                        : '',
                                    isRunningItem(item)
                                        ? 'running-result-row'
                                        : ''
                                ]">
                                <td
                                    class="border-b border-slate-100 px-4 py-4 text-sm font-medium text-crh-grey-dark last:border-b-0">
                                    <NuxtLink
                                        v-if="shouldShowExportDateLink(item.startAt)"
                                        :to="buildExportDateLink(item.startAt)"
                                        class="history-date-link">
                                        {{ formatDateLabel(item.startAt) }}
                                    </NuxtLink>
                                    <span v-else>
                                        {{ formatDateLabel(item.startAt) }}
                                    </span>
                                </td>
                                <td
                                    class="border-b border-slate-100 px-4 py-4 font-mono text-sm font-semibold text-crh-blue last:border-b-0">
                                    <span
                                        class="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <template
                                            v-for="(code, index) in item.codes"
                                            :key="`${item.id}:${code}`">
                                            <NuxtLink
                                                :to="buildCodeLink(code)"
                                                class="cursor-pointer transition hover:underline">
                                                {{ formatCodeText(code) }}
                                            </NuxtLink>
                                            <span
                                                v-if="
                                                    index <
                                                    item.codes.length - 1
                                                "
                                                class="text-slate-400">
                                                {{ mergeSeparator }}
                                            </span>
                                        </template>
                                    </span>
                                </td>
                                <td
                                    :class="[
                                        'border-b border-slate-100 px-4 py-4 text-sm last:border-b-0',
                                        getValueTextClass(
                                            isMissingText(item.startStation)
                                        )
                                    ]">
                                    {{ formatStationText(item.startStation) }}
                                </td>
                                <td
                                    :class="[
                                        'border-b border-slate-100 px-4 py-4 font-mono text-sm last:border-b-0',
                                        getValueTextClass(
                                            isMissingTimestamp(item.startAt),
                                            true
                                        )
                                    ]">
                                    {{ formatTimeLabel(item.startAt) }}
                                </td>
                                <td
                                    :class="[
                                        'border-b border-slate-100 px-4 py-4 text-sm last:border-b-0',
                                        getValueTextClass(
                                            isMissingText(item.endStation)
                                        )
                                    ]">
                                    {{ formatStationText(item.endStation) }}
                                </td>
                                <td
                                    :class="[
                                        'border-b border-slate-100 px-4 py-4 font-mono text-sm last:border-b-0',
                                        getValueTextClass(
                                            isMissingTimestamp(item.endAt),
                                            true
                                        )
                                    ]">
                                    {{ formatTimeLabel(item.endAt) }}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="space-y-2.5 md:hidden">
                    <UiCard
                        v-for="item in groupedItems"
                        :key="item.id"
                        :class="[
                            'history-result-card',
                            item.isTintedDateBand
                                ? 'history-result-card--tinted'
                                : '',
                            isRunningItem(item) ? 'running-result-card' : ''
                        ]"
                        :show-accent-bar="false"
                        variant="subtle">
                        <div class="space-y-3">
                            <div class="flex items-start gap-3">
                                <div class="min-w-0">
                                    <div class="text-xs font-medium text-slate-500">
                                        <NuxtLink
                                            v-if="shouldShowExportDateLink(item.startAt)"
                                            :to="buildExportDateLink(item.startAt)"
                                            class="history-date-link">
                                            {{ formatDateLabel(item.startAt) }}
                                        </NuxtLink>
                                        <span v-else>
                                            {{ formatDateLabel(item.startAt) }}
                                        </span>
                                    </div>
                                    <div
                                        class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-sm font-semibold text-crh-blue">
                                        <template
                                            v-for="(code, index) in item.codes"
                                            :key="`${item.id}:mobile:${code}`">
                                            <NuxtLink
                                                :to="buildCodeLink(code)"
                                                class="cursor-pointer transition hover:underline">
                                                {{ formatCodeText(code) }}
                                            </NuxtLink>
                                            <span
                                                v-if="
                                                    index <
                                                    item.codes.length - 1
                                                "
                                                class="text-slate-400">
                                                {{ mergeSeparator }}
                                            </span>
                                        </template>
                                    </div>
                                </div>
                            </div>

                            <div
                                class="rounded-[1rem] border border-slate-200 bg-white/90 px-4 py-3">
                                <div class="flex items-center gap-3">
                                    <div class="min-w-0 flex-1">
                                        <p
                                            class="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                                            出发站
                                        </p>
                                        <p
                                            :class="[
                                                'mt-1 truncate text-sm font-medium',
                                                getValueTextClass(
                                                    isMissingText(
                                                        item.startStation
                                                    )
                                                )
                                            ]">
                                            {{
                                                formatStationText(
                                                    item.startStation
                                                )
                                            }}
                                        </p>
                                    </div>

                                    <div
                                        class="shrink-0 flex min-w-[4.75rem] items-center gap-[0.35rem] text-slate-400"
                                        aria-hidden="true">
                                        <span
                                            class="h-px flex-1 bg-[linear-gradient(90deg,rgb(203_213_225),rgb(148_163_184))]" />
                                        <span class="text-[0.8rem] leading-none"
                                            >-&gt;</span
                                        >
                                        <span
                                            class="h-px flex-1 bg-[linear-gradient(90deg,rgb(203_213_225),rgb(148_163_184))]" />
                                    </div>

                                    <div class="min-w-0 flex-1 text-right">
                                        <p
                                            class="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                                            终到站
                                        </p>
                                        <p
                                            :class="[
                                                'mt-1 truncate text-sm font-medium',
                                                getValueTextClass(
                                                    isMissingText(
                                                        item.endStation
                                                    )
                                                )
                                            ]">
                                            {{
                                                formatStationText(
                                                    item.endStation
                                                )
                                            }}
                                        </p>
                                    </div>
                                </div>

                                <div
                                    class="mt-3 flex items-center gap-3 border-t border-slate-100 pt-3">
                                    <div class="min-w-0 flex-1">
                                        <p
                                            class="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                                            出发时间
                                        </p>
                                        <p
                                            :class="[
                                                'mt-1 font-mono text-sm',
                                                getValueTextClass(
                                                    isMissingTimestamp(
                                                        item.startAt
                                                    ),
                                                    true
                                                )
                                            ]">
                                            {{ formatTimeLabel(item.startAt) }}
                                        </p>
                                    </div>

                                    <div
                                        class="h-px basis-6 bg-[linear-gradient(90deg,rgb(226_232_240),rgb(148_163_184))]"
                                        aria-hidden="true" />

                                    <div class="min-w-0 flex-1 text-right">
                                        <p
                                            class="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                                            终到时间
                                        </p>
                                        <p
                                            :class="[
                                                'mt-1 font-mono text-sm',
                                                getValueTextClass(
                                                    isMissingTimestamp(
                                                        item.endAt
                                                    ),
                                                    true
                                                )
                                            ]">
                                            {{ formatTimeLabel(item.endAt) }}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </UiCard>
                </div>

                <div
                    v-if="isLoadingMore || canLoadMore || errorMessage"
                    class="rounded-[1rem] border border-dashed border-slate-200 bg-white/70 px-4 py-4 text-center text-sm text-slate-500">
                    <div
                        v-if="isLoadingMore"
                        class="flex items-center justify-center gap-2">
                        <span
                            class="h-2.5 w-2.5 animate-pulse rounded-full bg-crh-blue" />
                        <span>正在加载更多记录...</span>
                    </div>
                    <div
                        v-else-if="errorMessage"
                        class="space-y-3">
                        <p class="text-rose-600">
                            无法加载更多数据：{{ errorMessage }}
                        </p>
                        <button
                            v-if="canLoadMore"
                            type="button"
                            class="inline-flex items-center justify-center rounded-full border border-rose-200 px-4 py-2 text-sm font-medium text-rose-600 transition hover:border-rose-300 hover:bg-rose-50"
                            @click="emit('requestMore')">
                            重试加载更多
                        </button>
                    </div>
                    <p v-else-if="canLoadMore">正在加载...</p>
                    <p v-else>已加载全部记录</p>
                </div>

                <div
                    v-if="canLoadMore"
                    ref="sentinelRef"
                    aria-hidden="true"
                    class="h-px w-full" />
            </div>
        </div>
    </UiCard>
</template>

<script setup lang="ts">
import {
    computed,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    watch
} from 'vue';
import type {
    LookupHistoryListItem,
    LookupTargetType,
    RecentAssignmentsState
} from '~/types/lookup';
import isTimestampRangeActive from '~/utils/time/isTimestampRangeActive';
import formatShanghaiDateString from '~/utils/time/formatShanghaiDateString';
import { buildLookupPath } from '~/utils/lookup/lookupTarget';

interface GroupedHistoryListItem {
    id: string;
    startAt: number;
    endAt: number;
    startStation: string;
    endStation: string;
    codes: string[];
}

interface DisplayHistoryListItem extends GroupedHistoryListItem {
    dateKey: string;
    isTintedDateBand: boolean;
}

const DATE_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
});

const TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
});

const props = defineProps<{
    type: LookupTargetType;
    code: string;
    state: RecentAssignmentsState;
    items: LookupHistoryListItem[];
    summary: string;
    isLoadingMore: boolean;
    canLoadMore: boolean;
    errorMessage?: string;
}>();

const emit = defineEmits<{
    requestMore: [];
}>();

const currentUnixSeconds = useCurrentUnixSeconds();
const { isAuthenticated } = useAuthState();
const sentinelRef = ref<HTMLElement | null>(null);
let sentinelObserver: IntersectionObserver | null = null;

const codeColumnLabel = computed(() => {
    return props.type === 'train' ? '车组号' : '车次号';
});

const mergeSeparator = computed(() => {
    return props.type === 'train' ? '重联' : '/';
});

const columns = computed(() => [
    '日期',
    codeColumnLabel.value,
    '出发站点',
    '出发时间',
    '终到站点',
    '终到时间'
]);

const title = computed(() => {
    return props.type === 'train'
        ? `${props.code} 担当历史`
        : `${props.code} 运行历史`;
});

const groupedItems = computed<DisplayHistoryListItem[]>(() => {
    const groups = new Map<string, GroupedHistoryListItem>();

    for (const item of props.items) {
        const groupKey = `${item.startAt}:${item.endAt}`;
        const existingGroup = groups.get(groupKey);

        if (existingGroup) {
            if (!existingGroup.codes.includes(item.code)) {
                existingGroup.codes.push(item.code);
            }

            if (
                isMissingText(existingGroup.startStation) &&
                !isMissingText(item.startStation)
            ) {
                existingGroup.startStation = item.startStation;
            }

            if (
                isMissingText(existingGroup.endStation) &&
                !isMissingText(item.endStation)
            ) {
                existingGroup.endStation = item.endStation;
            }

            continue;
        }

        groups.set(groupKey, {
            id: item.id,
            startAt: item.startAt,
            endAt: item.endAt,
            startStation: item.startStation,
            endStation: item.endStation,
            codes: item.code.trim().length > 0 ? [item.code] : []
        });
    }

    const groupedValues = Array.from(groups.values());
    let currentDateKey = '';
    let dateBandIndex = -1;

    return groupedValues.map((item) => {
        const dateKey = buildDateKey(item.startAt);

        if (dateKey !== currentDateKey) {
            currentDateKey = dateKey;
            dateBandIndex += 1;
        }

        return {
            ...item,
            codes: normalizeDisplayCodes(item.codes),
            dateKey,
            isTintedDateBand: dateBandIndex % 2 === 1
        };
    });
});

function normalizeDisplayCodes(codes: string[]): string[] {
    const normalizedCodes = Array.from(
        new Set(
            codes.map((code) => code.trim()).filter((code) => code.length > 0)
        )
    );

    if (normalizedCodes.length < 2) {
        return normalizedCodes;
    }

    const leftCode = normalizedCodes[0]!;
    const rightCode = normalizedCodes[1]!;
    return leftCode.localeCompare(rightCode) <= 0
        ? normalizedCodes
        : [rightCode, leftCode];
}

function disconnectSentinelObserver() {
    sentinelObserver?.disconnect();
    sentinelObserver = null;
}

function connectSentinelObserver() {
    if (
        !import.meta.client ||
        !sentinelRef.value ||
        !props.canLoadMore ||
        !!props.errorMessage
    ) {
        disconnectSentinelObserver();
        return;
    }

    disconnectSentinelObserver();
    sentinelObserver = new IntersectionObserver(
        (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                emit('requestMore');
            }
        },
        {
            rootMargin: '0px 0px 240px 0px'
        }
    );
    sentinelObserver.observe(sentinelRef.value);
}

async function reconnectSentinelObserver() {
    if (!import.meta.client) {
        return;
    }

    await nextTick();
    connectSentinelObserver();
}

watch(
    () => [
        props.canLoadMore,
        props.isLoadingMore,
        props.items.length,
        props.state,
        props.errorMessage
    ],
    reconnectSentinelObserver,
    {
        immediate: true
    }
);

watch(sentinelRef, reconnectSentinelObserver);

onMounted(() => {
    void reconnectSentinelObserver();
});

onBeforeUnmount(() => {
    disconnectSentinelObserver();
});

function isMissingTimestamp(timestamp: number) {
    return !Number.isFinite(timestamp) || timestamp <= 0;
}

function isMissingText(value: string) {
    return value.trim().length === 0;
}

function formatDateLabel(timestamp: number) {
    if (isMissingTimestamp(timestamp)) {
        return '暂无日期';
    }

    return DATE_FORMATTER.format(new Date(timestamp * 1000));
}

function buildDateKey(timestamp: number) {
    if (isMissingTimestamp(timestamp)) {
        return '__missing__';
    }

    return DATE_FORMATTER.format(new Date(timestamp * 1000));
}

function formatTimeLabel(timestamp: number) {
    if (isMissingTimestamp(timestamp)) {
        return '未采集';
    }

    return TIME_FORMATTER.format(new Date(timestamp * 1000));
}

function formatCodeText(value: string) {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : '未采集';
}

function formatStationText(value: string) {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : '暂无站点信息';
}

function isRunningItem(item: GroupedHistoryListItem) {
    return isTimestampRangeActive(
        item.startAt,
        item.endAt,
        currentUnixSeconds.value
    );
}

function getValueTextClass(isMissing: boolean, monospace = false) {
    if (!isMissing) {
        return monospace ? 'text-slate-500' : 'text-crh-grey-dark';
    }

    return monospace
        ? 'text-slate-400 italic tracking-[0.08em]'
        : 'text-slate-400 italic';
}

function shouldShowExportDateLink(timestamp: number) {
    return (
        isAuthenticated.value &&
        !isMissingTimestamp(timestamp) &&
        formatShanghaiDateString(timestamp) !==
            formatShanghaiDateString(currentUnixSeconds.value)
    );
}

function buildExportDateLink(timestamp: number) {
    const date = formatShanghaiDateString(timestamp);

    return {
        path: '/exports/daily',
        query: {
            year: date.slice(0, 4),
            month: String(Number.parseInt(date.slice(4, 6), 10)),
            date
        }
    };
}

function buildCodeLink(code: string) {
    return buildLookupPath({
        type: props.type === 'train' ? 'emu' : 'train',
        code
    });
}
</script>

<style scoped>
.history-table-row > td {
    transition:
        background-color 220ms ease,
        box-shadow 220ms ease,
        color 220ms ease,
        border-color 220ms ease;
}

.history-table-row--tinted:not(.running-result-row) > td {
    background-color: rgba(219, 234, 254, 0.68);
}

.history-date-link {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    color: inherit;
    text-decoration: none;
    transition:
        color 180ms ease,
        background-color 180ms ease,
        box-shadow 180ms ease;
}

.history-date-link:hover {
    color: inherit;
    text-decoration: underline;
    text-decoration-color: rgba(0, 82, 155, 0.42);
    text-underline-offset: 0.2em;
}

.history-result-card {
    transition:
        background-color 220ms ease,
        border-color 220ms ease;
}

.history-result-card--tinted:not(.running-result-card) {
    border-color: rgba(147, 197, 253, 0.95);
    background: linear-gradient(180deg, #f6faff 0%, #dbeafe 100%);
}

@media (max-width: 767px) {
    .history-panel-card.history-panel-card {
        padding-left: 1.5rem;
    }

    .history-panel-card::before {
        display: none;
    }
}

@media (hover: hover) {
    .history-table-row:not(.running-result-row):hover > td {
        box-shadow: inset 0 0 0 999px rgba(219, 234, 254, 0.92);
    }

    .history-table-row--tinted:not(.running-result-row):hover > td {
        box-shadow: inset 0 0 0 999px rgba(191, 219, 254, 0.74);
    }

    .history-result-card--tinted:not(.running-result-card):hover {
        border-color: rgba(147, 197, 253, 0.95);
        background: linear-gradient(180deg, #eff6ff 0%, #bfdbfe 100%);
    }
}
</style>
