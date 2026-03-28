<template>
    <UiCard class="history-panel-card">
        <div class="space-y-6">
            <div class="space-y-2">
                <p
                    class="text-xs font-medium uppercase tracking-[0.28em] text-crh-blue/70">
                    BOARD
                </p>
                <h2 class="text-2xl font-semibold text-crh-grey-dark">
                    {{ title }}
                </h2>
                <p
                    v-if="summary"
                    class="text-sm text-slate-500">
                    {{ summary }}
                </p>
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
                                    class="border-b border-slate-200 px-4 py-3 text-xs font-medium uppercase tracking-[0.16em] text-slate-300">
                                    {{ column }}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="index in 6"
                                :key="`loading:${index}`"
                                class="animate-pulse">
                                <td
                                    v-for="column in columns"
                                    :key="`loading:${index}:${column}`"
                                    class="border-b border-slate-100 px-4 py-4 last:border-b-0">
                                    <div class="h-4 rounded bg-slate-200" />
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="space-y-2.5 md:hidden">
                    <UiCard
                        v-for="index in 4"
                        :key="`loading:card:${index}`"
                        :show-accent-bar="false"
                        variant="subtle">
                        <div class="animate-pulse space-y-3">
                            <div class="h-4 w-24 rounded bg-slate-200" />
                            <div class="grid grid-cols-2 gap-3">
                                <div class="h-14 rounded bg-slate-100" />
                                <div class="h-14 rounded bg-slate-100" />
                                <div
                                    class="col-span-2 h-14 rounded bg-slate-100" />
                            </div>
                        </div>
                    </UiCard>
                </div>
            </div>

            <UiEmptyState
                v-else-if="state === 'empty'"
                eyebrow="No Results"
                title="当前暂无车站时刻表"
                description="该车站今天没有可用的时刻表数据。" />

            <UiEmptyState
                v-else-if="state === 'error'"
                eyebrow="Load Failed"
                title="车站时刻表暂时不可用"
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
                                    class="border-b border-slate-200 px-4 py-3 text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                                    {{ column }}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="item in items"
                                :key="buildItemKey(item)"
                                :ref="setDesktopRowRef(buildItemKey(item))"
                                :class="[
                                    'align-top station-board-scroll-target',
                                    buildItemKey(item) === focusedItemKey
                                        ? 'station-board-row--focused'
                                        : ''
                                ]">
                                <td
                                    class="border-b border-slate-100 px-4 py-4 font-mono text-sm font-semibold text-crh-blue last:border-b-0">
                                    <NuxtLink
                                        :to="buildTrainLink(item.trainCode)"
                                        class="transition hover:underline">
                                        {{ formatTrainCode(item.trainCode) }}
                                    </NuxtLink>
                                </td>
                                <td
                                    class="border-b border-slate-100 px-4 py-4 font-mono text-sm text-slate-500 last:border-b-0">
                                    <button
                                        type="button"
                                        :disabled="!canOpenTimetable(item)"
                                        class="inline-flex cursor-pointer items-center rounded-md transition enabled:hover:text-crh-blue enabled:hover:underline disabled:cursor-default"
                                        @click="openTimetable(item)">
                                        {{ formatNullableTime(item.arriveAt) }}
                                    </button>
                                </td>
                                <td
                                    class="border-b border-slate-100 px-4 py-4 font-mono text-sm text-slate-500 last:border-b-0">
                                    <button
                                        type="button"
                                        :disabled="!canOpenTimetable(item)"
                                        class="inline-flex cursor-pointer items-center rounded-md transition enabled:hover:text-crh-blue enabled:hover:underline disabled:cursor-default"
                                        @click="openTimetable(item)">
                                        {{ formatNullableTime(item.departAt) }}
                                    </button>
                                </td>
                                <td
                                    class="border-b border-slate-100 px-4 py-4 text-sm text-crh-grey-dark last:border-b-0">
                                    <LookupStationLink
                                        :station-name="item.startStation"
                                        :focus-train-codes="
                                            resolveStationFocusTrainCodes(item)
                                        "
                                        :current-station-name="
                                            props.stationName
                                        "
                                        :fallback-text="
                                            formatStation(item.startStation)
                                        " />
                                </td>
                                <td
                                    class="border-b border-slate-100 px-4 py-4 text-sm text-crh-grey-dark last:border-b-0">
                                    <LookupStationLink
                                        :station-name="item.endStation"
                                        :focus-train-codes="
                                            resolveStationFocusTrainCodes(item)
                                        "
                                        :current-station-name="
                                            props.stationName
                                        "
                                        :fallback-text="
                                            formatStation(item.endStation)
                                        " />
                                </td>
                                <td
                                    class="border-b border-slate-100 px-4 py-4 text-sm last:border-b-0">
                                    <span
                                        v-if="hasReferenceModels(item)"
                                        class="text-sm text-crh-grey-dark">
                                        {{ formatReferenceModelText(item) }}
                                    </span>
                                    <span
                                        v-else
                                        class="text-slate-400 italic">
                                        --
                                    </span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="space-y-2.5 md:hidden">
                    <UiCard
                        v-for="item in items"
                        :key="`mobile:${buildItemKey(item)}`"
                        :class="[
                            buildItemKey(item) === focusedItemKey
                                ? 'station-board-card--focused'
                                : ''
                        ]"
                        :show-accent-bar="false"
                        variant="subtle">
                        <div
                            :ref="setMobileCardRef(buildItemKey(item))"
                            class="space-y-3 station-board-scroll-target">
                            <div class="flex items-start justify-between gap-3">
                                <NuxtLink
                                    :to="buildTrainLink(item.trainCode)"
                                    class="min-w-0 font-mono text-sm font-semibold text-crh-blue transition hover:underline">
                                    {{ formatTrainCode(item.trainCode) }}
                                </NuxtLink>

                                <div
                                    class="flex max-w-[58%] flex-wrap justify-end gap-1.5 text-right">
                                    <template v-if="hasReferenceModels(item)">
                                        <span
                                            v-for="model in getReferenceModelLabels(item)"
                                            :key="`mobile:${buildItemKey(item)}:${model}`"
                                            class="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium leading-none text-sky-700">
                                            {{ model }}
                                        </span>
                                    </template>
                                    <span
                                        v-else
                                        class="text-xs italic text-slate-400">
                                        --
                                    </span>
                                </div>
                            </div>

                            <div
                                class="rounded-[1rem] border border-slate-200 bg-white/90 px-4 py-3">
                                <div class="flex items-center gap-3">
                                    <div class="min-w-0 flex-1">
                                        <p
                                            class="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                                            始发站
                                        </p>
                                        <p
                                            class="mt-1 truncate text-sm font-medium text-crh-grey-dark">
                                            <LookupStationLink
                                                :station-name="item.startStation"
                                                :focus-train-codes="
                                                    resolveStationFocusTrainCodes(item)
                                                "
                                                :current-station-name="
                                                    props.stationName
                                                "
                                                :fallback-text="
                                                    formatStation(item.startStation)
                                                " />
                                        </p>
                                    </div>

                                    <button
                                        type="button"
                                        class="shrink-0 flex min-w-[4.75rem] items-center gap-[0.35rem] text-slate-400 transition enabled:cursor-pointer enabled:hover:text-crh-blue disabled:cursor-default"
                                        :disabled="!canOpenTimetable(item)"
                                        aria-label="查看当前时刻表"
                                        @click="openTimetable(item)">
                                        <span
                                            class="h-px flex-1 bg-[linear-gradient(90deg,rgb(203_213_225),rgb(148_163_184))]"
                                            aria-hidden="true" />
                                        <span
                                            class="text-[0.8rem] leading-none"
                                            aria-hidden="true">
                                            ->
                                        </span>
                                        <span
                                            class="h-px flex-1 bg-[linear-gradient(90deg,rgb(203_213_225),rgb(148_163_184))]"
                                            aria-hidden="true" />
                                    </button>

                                    <div class="min-w-0 flex-1 text-right">
                                        <p
                                            class="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                                            终到站
                                        </p>
                                        <p
                                            class="mt-1 truncate text-sm font-medium text-crh-grey-dark">
                                            <LookupStationLink
                                                :station-name="item.endStation"
                                                :focus-train-codes="
                                                    resolveStationFocusTrainCodes(item)
                                                "
                                                :current-station-name="
                                                    props.stationName
                                                "
                                                :fallback-text="
                                                    formatStation(item.endStation)
                                                " />
                                        </p>
                                    </div>
                                </div>

                                <div
                                    class="mt-3 flex items-center gap-3 border-t border-slate-100 pt-3">
                                    <button
                                        type="button"
                                        class="min-w-0 flex-1 cursor-pointer text-left transition enabled:hover:text-crh-blue disabled:cursor-default"
                                        :disabled="!canOpenTimetable(item)"
                                        @click="openTimetable(item)">
                                        <p
                                            class="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                                            到达时间
                                        </p>
                                        <p
                                            class="mt-1 font-mono text-sm text-slate-500">
                                            {{ formatNullableTime(item.arriveAt) }}
                                        </p>
                                    </button>

                                    <button
                                        type="button"
                                        class="min-w-0 flex-1 cursor-pointer text-right transition enabled:hover:text-crh-blue disabled:cursor-default"
                                        :disabled="!canOpenTimetable(item)"
                                        @click="openTimetable(item)">
                                        <p
                                            class="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                                            出发时间
                                        </p>
                                        <p
                                            class="mt-1 font-mono text-sm text-slate-500">
                                            {{ formatNullableTime(item.departAt) }}
                                        </p>
                                    </button>
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
                        <span>正在加载更多车次...</span>
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
                    <p v-else-if="canLoadMore">继续向下滚动即可加载更多</p>
                    <p v-else>已加载全部车次</p>
                </div>

                <div
                    v-if="canLoadMore"
                    ref="sentinelRef"
                    aria-hidden="true"
                    class="h-px w-full" />
            </div>
        </div>
    </UiCard>

    <LookupCurrentTimetableModal
        :model-value="isTimetableModalOpen"
        :train-code="selectedTimetableTrainCode"
        :display-codes="selectedTimetableDisplayCodes"
        @update:model-value="isTimetableModalOpen = $event" />
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
import type { ComponentPublicInstance } from 'vue';
import type {
    RecentAssignmentsState,
    StationTimetableRecord
} from '~/types/lookup';
import { buildLookupPath } from '~/utils/lookup/lookupTarget';

const TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
});

const columns = [
    '车次号',
    '到达时间',
    '出发时间',
    '始发站',
    '终到站',
    '参考车型'
];

const props = defineProps<{
    stationName: string;
    state: RecentAssignmentsState;
    items: StationTimetableRecord[];
    summary: string;
    isLoadingMore: boolean;
    canLoadMore: boolean;
    errorMessage?: string;
    focusTrainCodes?: string[];
}>();

const emit = defineEmits<{
    requestMore: [];
}>();

const sentinelRef = ref<HTMLElement | null>(null);
const isTimetableModalOpen = ref(false);
const selectedTimetableTrainCode = ref('');
const selectedTimetableDisplayCodes = ref<string[]>([]);
const lastScrolledFocusedItemKey = ref('');
const desktopRowElements = new Map<string, HTMLTableRowElement>();
const mobileCardElements = new Map<string, HTMLElement>();
let sentinelObserver: IntersectionObserver | null = null;

const title = computed(() => `${props.stationName} 时刻表`);
const normalizedFocusTrainCodes = computed(() =>
    normalizeTrainCodes(props.focusTrainCodes ?? [])
);
const focusedItemKey = computed(() => {
    if (normalizedFocusTrainCodes.value.length === 0) {
        return '';
    }

    const focusCodeSet = new Set(normalizedFocusTrainCodes.value);
    const matchedItem = props.items.find((item) =>
        recordMatchesFocus(item, focusCodeSet)
    );
    return matchedItem ? buildItemKey(matchedItem) : '';
});

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

function setDesktopRowRef(itemKey: string) {
    return (element: Element | ComponentPublicInstance | null) => {
        if (element instanceof HTMLTableRowElement) {
            desktopRowElements.set(itemKey, element);
            return;
        }

        desktopRowElements.delete(itemKey);
    };
}

function setMobileCardRef(itemKey: string) {
    return (element: Element | ComponentPublicInstance | null) => {
        if (element instanceof HTMLElement) {
            mobileCardElements.set(itemKey, element);
            return;
        }

        mobileCardElements.delete(itemKey);
    };
}

function normalizeTrainCodes(codes: string[]) {
    return Array.from(
        new Set(
            codes
                .map((code) => code.trim().toUpperCase())
                .filter((code) => code.length > 0)
        )
    );
}

function recordMatchesFocus(
    item: StationTimetableRecord,
    focusCodeSet: Set<string>
) {
    const itemCodes = normalizeTrainCodes([item.trainCode, ...item.allCodes]);
    return itemCodes.some((code) => focusCodeSet.has(code));
}

function isVisibleElement(element: HTMLElement) {
    return element.isConnected && element.getClientRects().length > 0;
}

function resolveFocusedRowElement(itemKey: string) {
    const desktopRow = desktopRowElements.get(itemKey);
    if (desktopRow && isVisibleElement(desktopRow)) {
        return desktopRow;
    }

    const mobileCard = mobileCardElements.get(itemKey);
    if (mobileCard && isVisibleElement(mobileCard)) {
        return mobileCard;
    }

    return desktopRow ?? mobileCard ?? null;
}

async function scrollToFocusedRow() {
    if (!import.meta.client) {
        return;
    }

    const itemKey = focusedItemKey.value;
    if (!itemKey || itemKey === lastScrolledFocusedItemKey.value) {
        return;
    }

    await nextTick();

    const targetElement = resolveFocusedRowElement(itemKey);
    if (!targetElement) {
        return;
    }

    lastScrolledFocusedItemKey.value = itemKey;
    targetElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
    });
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

watch(
    () => [props.stationName, normalizedFocusTrainCodes.value.join('|')],
    () => {
        lastScrolledFocusedItemKey.value = '';
    },
    {
        immediate: true
    }
);

watch(
    () => [focusedItemKey.value, props.items.length],
    () => {
        void scrollToFocusedRow();
    },
    {
        immediate: true
    }
);

onMounted(() => {
    void reconnectSentinelObserver();
});

onBeforeUnmount(() => {
    disconnectSentinelObserver();
    desktopRowElements.clear();
    mobileCardElements.clear();
});

function buildItemKey(item: StationTimetableRecord) {
    return [
        item.trainCode,
        item.arriveAt ?? 'null',
        item.departAt ?? 'null',
        item.startStation,
        item.endStation
    ].join(':');
}

function buildTrainLink(trainCode: string) {
    return buildLookupPath({
        type: 'train',
        code: trainCode
    });
}

function resolveTimetableTrainCode(item: StationTimetableRecord) {
    const primaryCode = item.trainCode.trim().toUpperCase();
    if (primaryCode.length > 0) {
        return primaryCode;
    }

    return (
        item.allCodes
            .map((code) => code.trim().toUpperCase())
            .find((code) => code.length > 0) ?? ''
    );
}

function resolveTimetableDisplayCodes(item: StationTimetableRecord) {
    const normalizedCodes = normalizeTrainCodes(item.allCodes);

    if (normalizedCodes.length > 0) {
        return normalizedCodes;
    }

    const fallbackCode = resolveTimetableTrainCode(item);
    return fallbackCode.length > 0 ? [fallbackCode] : [];
}

function resolveStationFocusTrainCodes(item: StationTimetableRecord) {
    return normalizeTrainCodes([item.trainCode, ...item.allCodes]);
}

function canOpenTimetable(item: StationTimetableRecord) {
    return resolveTimetableTrainCode(item).length > 0;
}

function openTimetable(item: StationTimetableRecord) {
    const trainCode = resolveTimetableTrainCode(item);
    if (trainCode.length === 0) {
        return;
    }

    selectedTimetableTrainCode.value = trainCode;
    selectedTimetableDisplayCodes.value = resolveTimetableDisplayCodes(item);
    isTimetableModalOpen.value = true;
}

function formatNullableTime(timestamp: number | null) {
    if (timestamp === null || !Number.isFinite(timestamp)) {
        return '--';
    }

    return TIME_FORMATTER.format(new Date(timestamp * 1000));
}

function formatStation(value: string) {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : '--';
}

function formatTrainCode(value: string) {
    const normalized = value.trim().toUpperCase();
    return normalized.length > 0 ? normalized : '--';
}

function getReferenceModelLabels(item: StationTimetableRecord) {
    return Array.from(
        new Set(
            item.referenceModels
                .map((entry) => entry.model.trim())
                .filter((model) => model.length > 0)
        )
    );
}

function hasReferenceModels(item: StationTimetableRecord) {
    return getReferenceModelLabels(item).length > 0;
}

function formatReferenceModelText(item: StationTimetableRecord) {
    return getReferenceModelLabels(item).join(' / ');
}
</script>

<style scoped>
.station-board-scroll-target {
    scroll-margin-block: 6rem;
}

.station-board-row--focused > td {
    border-color: rgba(147, 197, 253, 0.92);
    box-shadow: inset 0 0 0 999px rgba(219, 234, 254, 0.96);
}

.station-board-card--focused {
    border-color: rgba(147, 197, 253, 0.95);
    background: linear-gradient(180deg, #f6faff 0%, #dbeafe 100%);
    box-shadow: 0 18px 40px -26px rgba(0, 82, 155, 0.45);
}
</style>
