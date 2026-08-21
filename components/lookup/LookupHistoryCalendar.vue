<template>
    <UiModal
        :model-value="modelValue"
        :title="`${code} 历史开行记录`"
        eyebrow="HISTORY CALENDAR"
        description=""
        size="sm"
        height="tall"
        @update:model-value="emit('update:modelValue', $event)">
        <div class="space-y-3 rounded-[20px] bg-slate-50 p-2">
            <div
                class="flex items-center justify-between gap-3 px-2 py-1 sm:px-3">
                <button
                    type="button"
                    class="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-2xl text-lg text-slate-500 transition hover:bg-white hover:text-[#00529B] disabled:cursor-not-allowed disabled:opacity-30"
                    :disabled="!canGoPreviousMonth"
                    aria-label="上一个月"
                    @click="moveMonth(-1)">
                    <span aria-hidden="true">&lsaquo;</span>
                </button>
                <p class="text-base font-semibold text-[#334155] sm:text-lg">
                    {{ monthLabel }}
                </p>
                <button
                    type="button"
                    class="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-2xl text-lg text-slate-500 transition hover:bg-white hover:text-[#00529B] disabled:cursor-not-allowed disabled:opacity-30"
                    :disabled="!canGoNextMonth"
                    aria-label="下一个月"
                    @click="moveMonth(1)">
                    <span aria-hidden="true">&rsaquo;</span>
                </button>
            </div>

            <div
                v-if="isLoadingMonth"
                class="flex items-center gap-2 px-3 text-xs text-slate-400">
                <span
                    class="h-2.5 w-2.5 animate-spin rounded-full border-2 border-[#00529B]/25 border-t-[#00529B]"
                    aria-hidden="true" />
                <span>加载中</span>
            </div>
            <div
                v-else-if="loadError"
                class="flex items-center justify-between gap-3 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">
                <span>网络请求失败，请稍后重试</span>
                <button
                    type="button"
                    class="shrink-0 rounded-lg border border-red-100 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
                    @click="retryMonth">
                    重试
                </button>
            </div>

            <div
                class="overflow-hidden rounded-[20px] border border-slate-100 bg-white shadow-sm">
                <div
                    class="grid grid-cols-7 bg-white px-1 pt-1 sm:px-1.5 sm:pt-1.5">
                    <div
                        v-for="weekday in weekdays"
                        :key="weekday"
                        class="px-1 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-400">
                        {{ weekday }}
                    </div>
                </div>

                <div class="grid grid-cols-7 gap-0.5 bg-slate-50 p-1 sm:p-1.5">
                    <div
                        v-for="cell in calendarCells"
                        :key="cell.key"
                        class="m-px min-h-14 rounded-lg bg-white p-1 sm:min-h-[4.5rem]"
                        :class="cell.isCurrentMonth ? '' : 'opacity-60'">
                        <component
                            :is="
                                cell.state === 'running'
                                    ? LookupCouplingPositionTooltip
                                    : 'div'
                            "
                            v-bind="
                                cell.state === 'running'
                                    ? {
                                          label: cell.tooltipLabel,
                                          triggerClass: 'w-full',
                                          disabled:
                                              !isDesktopViewport ||
                                              cell.codes.length === 0
                                      }
                                    : {}
                            ">
                            <button
                                type="button"
                                class="relative flex min-h-12 w-full flex-col rounded-lg p-1 text-left transition sm:min-h-[4.25rem] sm:p-1.5"
                                :class="[
                                    cell.state === 'running'
                                        ? 'cursor-pointer hover:bg-slate-50'
                                        : 'cursor-default',
                                    cell.isToday
                                        ? 'bg-slate-50 ring-1 ring-slate-400/70'
                                        : '',
                                    selectedServiceDate === cell.serviceDate
                                        ? 'bg-slate-100 ring-2 ring-slate-500/60 md:bg-white md:ring-0'
                                        : ''
                                ]"
                                :disabled="cell.state !== 'running'"
                                :aria-label="cell.ariaLabel"
                                :aria-expanded="
                                    !isDesktopViewport &&
                                    selectedServiceDate === cell.serviceDate
                                "
                                :aria-controls="
                                    cell.state === 'running'
                                        ? 'history-calendar-mobile-detail'
                                        : undefined
                                "
                                @click="handleDateClick(cell)">
                                <span
                                    class="flex items-center justify-between gap-1">
                                    <span
                                        class="text-sm font-medium"
                                        :class="
                                            cell.state === 'unavailable' ||
                                            !cell.isCurrentMonth
                                                ? 'text-slate-300'
                                                : 'text-slate-700'
                                        ">
                                        {{ cell.day }}
                                    </span>
                                    <span
                                        v-if="cell.state === 'running'"
                                        class="h-1.5 w-1.5 rounded-full bg-[#10B981]"
                                        aria-label="开行" />
                                    <span
                                        v-else-if="cell.state === 'closed'"
                                        class="h-1.5 w-1.5 rounded-full bg-red-500"
                                        aria-label="未开行" />
                                    <span
                                        v-else-if="
                                            cell.state === 'unavailable' ||
                                            cell.state === 'pending'
                                        "
                                        class="h-1.5 w-1.5 rounded-full bg-slate-300"
                                        :aria-label="
                                            cell.state === 'pending'
                                                ? '等待开行'
                                                : '无更早记录'
                                        " />
                                    <span
                                        v-else-if="cell.state === 'loading'"
                                        class="h-1.5 w-1.5 rounded-full bg-[#00529B]/30"
                                        aria-label="获取数据中" />
                                </span>
                                <span
                                    v-if="cell.categories.length > 0"
                                    class="absolute inset-x-1 bottom-1 flex h-[2px] overflow-hidden opacity-75"
                                    aria-hidden="true">
                                    <span
                                        v-for="category in cell.categories"
                                        :key="`${cell.key}:${category.key}`"
                                        class="min-w-0 flex-1"
                                        :style="{
                                            backgroundColor: getCategoryColor(
                                                category.key
                                            )
                                        }" />
                                </span>
                            </button>
                        </component>
                    </div>
                </div>
            </div>

            <div
                class="flex flex-wrap gap-x-3 gap-y-2 px-2 text-xs text-slate-600 sm:px-3">
                <span
                    v-for="item in statusLegendItems"
                    :key="item.key"
                    class="inline-flex min-w-0 items-center gap-1.5">
                    <span
                        class="h-2 w-2 shrink-0 rounded-full"
                        :style="{ backgroundColor: item.color }"
                        aria-hidden="true" />
                    <span>{{ item.label }}</span>
                </span>
                <span
                    v-for="item in modelLegendItems"
                    :key="item.key"
                    class="inline-flex min-w-0 items-center gap-1.5">
                    <span
                        class="h-2 w-2 shrink-0 rounded-full"
                        :style="{ backgroundColor: item.color }"
                        aria-hidden="true" />
                    <span>{{ item.label }}</span>
                </span>
            </div>

            <div
                v-if="selectedMobileCell"
                id="history-calendar-mobile-detail"
                class="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:hidden"
                aria-live="polite">
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <p class="text-xs font-medium text-slate-400">
                            {{ selectedDateLabel }}
                        </p>
                        <p class="mt-1 text-sm font-semibold text-slate-800">
                            {{ detailCodeLabel }}
                        </p>
                    </div>
                    <span
                        class="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500"
                        aria-label="开行" />
                </div>

                <div class="space-y-2">
                    <div
                        v-for="entry in selectedMobileCell.codes"
                        :key="`selected:${entry.key}`"
                        class="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                        <div
                            class="flex min-h-6 items-center justify-between gap-3">
                            <span class="font-mono font-semibold">
                                {{ entry.code }}
                            </span>
                            <span
                                v-if="hasKnownCouplingPosition(entry)"
                                class="flex shrink-0 items-center gap-1.5 font-medium text-crh-blue">
                                <LookupCouplingPositionIcon
                                    mode="active-half"
                                    :position="
                                        getKnownCouplingPosition(entry)
                                    " />
                                <span>{{ getCouplingEndLabel(entry) }}</span>
                            </span>
                        </div>

                        <div
                            v-if="type === 'emu'"
                            class="mt-2.5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-t border-slate-200 pt-2.5">
                            <div class="min-w-0">
                                <p class="truncate text-xs text-slate-500">
                                    {{ formatStation(entry.startStation) }}
                                </p>
                                <p
                                    class="mt-1 font-mono text-sm font-medium text-slate-800">
                                    {{
                                        formatRecordTime(
                                            entry.startAt,
                                            selectedMobileCell.serviceDate
                                        )
                                    }}
                                </p>
                            </div>
                            <span
                                class="text-slate-300"
                                aria-hidden="true">
                                -&gt;
                            </span>
                            <div class="min-w-0 text-right">
                                <p class="truncate text-xs text-slate-500">
                                    {{ formatStation(entry.endStation) }}
                                </p>
                                <p
                                    class="mt-1 font-mono text-sm font-medium text-slate-800">
                                    {{
                                        formatRecordTime(
                                            entry.endAt,
                                            selectedMobileCell.serviceDate
                                        )
                                    }}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <UiButton
                    block
                    size="sm"
                    @click="jumpToSelectedDate">
                    跳转到记录
                </UiButton>
            </div>
        </div>
    </UiModal>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import LookupCouplingPositionTooltip from './LookupCouplingPositionTooltip.vue';
import type { LookupHistoryListItem, LookupTargetType } from '~/types/lookup';
import extractEmuModelFromCode from '~/utils/lookup/extractEmuModelFromCode';
import { formatNullableTime } from '~/utils/lookup/timetableDisplay';
import formatShanghaiDateString from '~/utils/time/formatShanghaiDateString';
import { getShanghaiDayOffsetFromServiceDate } from '~/utils/time/getShanghaiDayStartUnixSeconds';
import {
    getEmuRouteFormationPosition,
    type EmuRouteFormationPosition
} from '~/utils/emuRouteStatus';

type CalendarState =
    | 'running'
    | 'closed'
    | 'loading'
    | 'unavailable'
    | 'pending';

type CalendarFormationKind = 'single' | 'coupled';

interface CalendarCategory {
    key: string;
    label: string;
}

interface CalendarCodeEntry {
    key: string;
    code: string;
    status: number;
    startStation: string | null;
    endStation: string | null;
    startAt: number | null;
    endAt: number | null;
    categories: CalendarCategory[];
}

interface CalendarCell {
    key: string;
    serviceDate: string;
    day: number;
    isCurrentMonth: boolean;
    isToday: boolean;
    state: CalendarState;
    codes: CalendarCodeEntry[];
    categories: CalendarCategory[];
    tooltipLabel: string;
    ariaLabel: string;
}

const props = defineProps<{
    modelValue: boolean;
    type: LookupTargetType;
    code: string;
    items: LookupHistoryListItem[];
    isLoadingMore: boolean;
    errorMessage?: string;
    oldestLoadedServiceDate: string;
    isHistoryExhausted: boolean;
    ensureLoadedThroughServiceDate: (serviceDate: string) => Promise<boolean>;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    selectDate: [serviceDate: string];
}>();

const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
const CATEGORY_COLOR_HUE_RANGES = [
    [80, 105],
    [210, 320]
] as const;
const CATEGORY_COLOR_HUE_SPAN = CATEGORY_COLOR_HUE_RANGES.reduce(
    (total, [start, end]) => total + end - start,
    0
);
const CATEGORY_COLOR_SEQUENCE_STEP = 0.618033988749895;
const statusLegendItems = [
    { key: 'closed', label: '未开行', color: '#ef4444' },
    { key: 'running', label: '开行', color: '#10b981' },
    { key: 'unavailable', label: '无数据', color: '#cbd5e1' }
] as const;
const currentUnixSeconds = useCurrentUnixSeconds();
const today = computed(() =>
    formatShanghaiDateString(currentUnixSeconds.value)
);
const currentMonth = computed(() => today.value.slice(0, 6));
const visibleMonth = ref(currentMonth.value);
const isLoadingMonth = ref(false);
const loadError = ref('');
const selectedServiceDate = ref('');
const isDesktopViewport = ref(false);
const categoryColors = ref<ReadonlyMap<string, string>>(new Map());
let colorWheelStart = 0;
let nextCategoryColorIndex = 0;
let desktopMediaQuery: MediaQueryList | null = null;
let currentTimeTimer: ReturnType<typeof setInterval> | null = null;

const { timetable: currentTrainTimetable } = useCurrentTrainTimetable(
    computed(() => (props.type === 'train' ? props.code : '')),
    computed(() => props.modelValue && props.type === 'train')
);

const recordsByDate = computed(() => {
    const map = new Map<string, LookupHistoryListItem[]>();
    for (const item of props.items) {
        if (!/^\d{8}$/.test(item.serviceDate)) {
            continue;
        }
        const entries = map.get(item.serviceDate) ?? [];
        entries.push(item);
        map.set(item.serviceDate, entries);
    }
    return map;
});

const monthLabel = computed(() =>
    /^\d{6}$/.test(visibleMonth.value)
        ? `${visibleMonth.value.slice(0, 4)} 年 ${Number(visibleMonth.value.slice(4, 6))} 月`
        : ''
);

const canGoPreviousMonth = computed(() => {
    if (!props.isHistoryExhausted) {
        return true;
    }

    const earliestMonth = props.oldestLoadedServiceDate.slice(0, 6);
    return earliestMonth.length === 6 && visibleMonth.value > earliestMonth;
});

const canGoNextMonth = computed(() => visibleMonth.value < currentMonth.value);

const selectedMobileCell = computed(
    () =>
        calendarCells.value.find(
            (cell) =>
                cell.serviceDate === selectedServiceDate.value &&
                cell.state === 'running'
        ) ?? null
);

const selectedDateLabel = computed(() => {
    const serviceDate = selectedMobileCell.value?.serviceDate ?? '';
    if (!/^\d{8}$/.test(serviceDate)) {
        return '';
    }

    return `${serviceDate.slice(0, 4)} 年 ${Number(serviceDate.slice(4, 6))} 月 ${Number(serviceDate.slice(6, 8))} 日`;
});

const detailCodeLabel = computed(() =>
    props.type === 'train' ? '担当车组' : '开行车次'
);

const visibleCategories = computed(() =>
    dedupeCategories(calendarCells.value.flatMap((cell) => cell.categories))
);

const modelLegendItems = computed(() =>
    visibleCategories.value.map((category) => ({
        ...category,
        color: getCategoryColor(category.key)
    }))
);

const calendarCells = computed(() => {
    const year = Number(visibleMonth.value.slice(0, 4));
    const month = Number(visibleMonth.value.slice(4, 6));
    if (!Number.isInteger(year) || !Number.isInteger(month)) {
        return [];
    }

    const first = new Date(Date.UTC(year, month - 1, 1));
    const firstWeekday = first.getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const previousMonthDays = new Date(
        Date.UTC(year, month - 1, 0)
    ).getUTCDate();
    const cells: CalendarCell[] = [];

    for (let index = 0; index < 42; index += 1) {
        const offset = index - firstWeekday;
        const day = offset + 1;
        let cellYear = year;
        let cellMonth = month;
        let cellDay = day;
        let isCurrentMonth = true;
        if (day <= 0) {
            const previous = new Date(Date.UTC(year, month - 1, day));
            cellYear = previous.getUTCFullYear();
            cellMonth = previous.getUTCMonth() + 1;
            cellDay = previousMonthDays + day;
            isCurrentMonth = false;
        } else if (day > daysInMonth) {
            const next = new Date(Date.UTC(year, month - 1, day));
            cellYear = next.getUTCFullYear();
            cellMonth = next.getUTCMonth() + 1;
            cellDay = next.getUTCDate();
            isCurrentMonth = false;
        }

        const serviceDate = `${cellYear}${String(cellMonth).padStart(2, '0')}${String(cellDay).padStart(2, '0')}`;
        const records = recordsByDate.value.get(serviceDate) ?? [];
        const isFuture = serviceDate > today.value;
        const isBeforeHistoryStart =
            props.isHistoryExhausted &&
            /^\d{8}$/.test(props.oldestLoadedServiceDate) &&
            serviceDate < props.oldestLoadedServiceDate;
        // A cursor page can end in the middle of a service day. Keep that
        // boundary in the loading state until the following page is loaded,
        // unless the API has confirmed that history is exhausted.
        const isCovered =
            props.isHistoryExhausted ||
            (props.oldestLoadedServiceDate.length > 0 &&
                serviceDate > props.oldestLoadedServiceDate);
        const hasRecords = records.length > 0;
        const isToday = serviceDate === today.value;
        const isTodayDepartureOverdue =
            isToday && isCurrentTrainDepartureOverdue();
        const state: CalendarState = isFuture
            ? 'loading'
            : hasRecords
              ? 'running'
              : isToday
                ? isTodayDepartureOverdue
                    ? 'closed'
                    : 'pending'
                : isBeforeHistoryStart
                  ? 'unavailable'
                  : !isCovered && !props.isHistoryExhausted
                    ? 'loading'
                    : 'closed';
        const codesByCode = new Map<string, CalendarCodeEntry>();
        for (const record of records) {
            const recordCode = record.code.trim().toUpperCase();
            const recordKey =
                props.type === 'emu'
                    ? [
                          recordCode,
                          record.startAt ?? 'null',
                          record.endAt ?? 'null',
                          record.startStation ?? '',
                          record.endStation ?? ''
                      ].join(':')
                    : recordCode;
            if (recordCode.length === 0) {
                continue;
            }

            const categories = buildCalendarCategories(
                recordCode,
                record.status
            );
            const existingEntry = codesByCode.get(recordKey);
            if (existingEntry) {
                existingEntry.categories = dedupeCategories([
                    ...existingEntry.categories,
                    ...categories
                ]);
                continue;
            }

            codesByCode.set(recordKey, {
                key: recordKey,
                code: recordCode,
                status: record.status,
                startStation: record.startStation,
                endStation: record.endStation,
                startAt: record.startAt,
                endAt: record.endAt,
                categories
            });
        }
        const codeEntries = Array.from(codesByCode.values());
        const normalizedEntries =
            props.type === 'emu'
                ? mergeEmuCalendarEntries(codeEntries)
                : codeEntries.sort(compareFormationEntries);
        const codes = normalizedEntries.slice(0, 4);
        const categories = dedupeCategories(
            normalizedEntries.flatMap((entry) => entry.categories)
        );
        const summary = codes
            .slice(0, 2)
            .map((entry) => entry.code)
            .join('、');

        cells.push({
            key: serviceDate,
            serviceDate,
            day: cellDay,
            isCurrentMonth,
            isToday,
            state,
            codes,
            categories,
            tooltipLabel: `${detailCodeLabel.value}：${codes.map((entry) => entry.code).join('、')}`,
            ariaLabel: `${serviceDate.slice(0, 4)} 年 ${Number(serviceDate.slice(4, 6))} 月 ${Number(serviceDate.slice(6, 8))} 日，${state === 'running' ? `开行，${summary || '有记录'}` : state === 'closed' ? '未开行' : state === 'unavailable' ? '无更早记录' : state === 'pending' ? '等待开行' : '获取数据中'}`
        });
    }

    return cells;
});

function moveMonth(delta: number) {
    const year = Number(visibleMonth.value.slice(0, 4));
    const month = Number(visibleMonth.value.slice(4, 6));
    const next = new Date(Date.UTC(year, month - 1 + delta, 1));
    const nextKey = `${next.getUTCFullYear()}${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
    if (nextKey > currentMonth.value) {
        return;
    }
    selectedServiceDate.value = '';
    visibleMonth.value = nextKey;
    void ensureMonthLoaded(nextKey);
}

async function ensureMonthLoaded(monthKey: string) {
    const firstDate = `${monthKey}01`;
    if (
        props.isHistoryExhausted ||
        (props.oldestLoadedServiceDate.length > 0 &&
            props.oldestLoadedServiceDate < firstDate)
    ) {
        return;
    }

    isLoadingMonth.value = true;
    loadError.value = '';
    const loaded = await props.ensureLoadedThroughServiceDate(
        previousServiceDate(firstDate)
    );
    isLoadingMonth.value = false;
    const earliestMonth = props.oldestLoadedServiceDate.slice(0, 6);
    if (
        props.isHistoryExhausted &&
        earliestMonth.length === 6 &&
        monthKey < earliestMonth
    ) {
        visibleMonth.value = earliestMonth;
        return;
    }
    if (!loaded && props.errorMessage) {
        loadError.value = props.errorMessage;
    }
}

function previousServiceDate(serviceDate: string) {
    const year = Number(serviceDate.slice(0, 4));
    const month = Number(serviceDate.slice(4, 6));
    const day = Number(serviceDate.slice(6, 8));
    const previous = new Date(Date.UTC(year, month - 1, day - 1));
    return `${previous.getUTCFullYear()}${String(
        previous.getUTCMonth() + 1
    ).padStart(2, '0')}${String(previous.getUTCDate()).padStart(2, '0')}`;
}

function retryMonth() {
    void ensureMonthLoaded(visibleMonth.value);
}

function isCurrentTrainDepartureOverdue() {
    if (props.type !== 'train') {
        return false;
    }

    const startAt = currentTrainTimetable.value?.startAt ?? null;
    if (
        startAt === null ||
        !Number.isFinite(startAt) ||
        formatShanghaiDateString(startAt) !== today.value
    ) {
        return false;
    }

    return currentUnixSeconds.value >= startAt + 30 * 60;
}

function getCouplingPosition(
    entry: CalendarCodeEntry
): EmuRouteFormationPosition {
    return getEmuRouteFormationPosition(entry.status);
}

function getFormationKind(status: number): CalendarFormationKind {
    return getEmuRouteFormationPosition(status) === 'single'
        ? 'single'
        : 'coupled';
}

function buildCalendarCategories(code: string, status: number) {
    if (props.type !== 'train') {
        return [];
    }

    const model = extractEmuModelFromCode(code);
    if (!model) {
        return [];
    }

    const formation = getFormationKind(status);
    const formationLabel = formation === 'single' ? '单组' : '重联';
    return [
        {
            key: `${model}:${formation}`,
            label: `${model} · ${formationLabel}`
        }
    ];
}

function dedupeCategories(categories: readonly CalendarCategory[]) {
    const categoriesByKey = new Map<string, CalendarCategory>();
    for (const category of categories) {
        if (!categoriesByKey.has(category.key)) {
            categoriesByKey.set(category.key, category);
        }
    }
    return Array.from(categoriesByKey.values());
}

function assignCategoryColors(categories: readonly CalendarCategory[]) {
    const nextColors = new Map(categoryColors.value);
    let hasNewColor = false;

    for (const category of categories) {
        if (nextColors.has(category.key)) {
            continue;
        }

        const colorIndex = nextCategoryColorIndex;
        const hue = getCategoryColorHue(colorIndex);
        nextColors.set(category.key, `oklch(62% 0.18 ${hue})`);
        nextCategoryColorIndex += 1;
        hasNewColor = true;
    }

    if (hasNewColor) {
        categoryColors.value = nextColors;
    }
}

function resetCategoryColors() {
    colorWheelStart = Math.random();
    nextCategoryColorIndex = 0;
    categoryColors.value = new Map();
    assignCategoryColors(visibleCategories.value);
}

function getCategoryColorHue(colorIndex: number) {
    const sequencePosition =
        (colorWheelStart + colorIndex * CATEGORY_COLOR_SEQUENCE_STEP) % 1;
    let offset = sequencePosition * CATEGORY_COLOR_HUE_SPAN;

    for (const [start, end] of CATEGORY_COLOR_HUE_RANGES) {
        const rangeSpan = end - start;
        if (offset <= rangeSpan) {
            return (start + offset).toFixed(2);
        }
        offset -= rangeSpan;
    }

    return String(CATEGORY_COLOR_HUE_RANGES[0][0]);
}

function getCategoryColor(categoryKey: string) {
    return categoryColors.value.get(categoryKey) ?? 'oklch(62% 0.18 245)';
}

function compareFormationEntries(
    left: CalendarCodeEntry,
    right: CalendarCodeEntry
) {
    const leftPosition = getEmuRouteFormationPosition(left.status);
    const rightPosition = getEmuRouteFormationPosition(right.status);
    if (leftPosition === rightPosition) {
        return left.code.localeCompare(right.code);
    }
    if (leftPosition === 'I') {
        return -1;
    }
    if (rightPosition === 'I') {
        return 1;
    }
    return left.code.localeCompare(right.code);
}

function mergeEmuCalendarEntries(entries: CalendarCodeEntry[]) {
    const groups = new Map<string, CalendarCodeEntry[]>();

    for (const entry of entries) {
        const hasKnownTimes =
            entry.startAt !== null &&
            Number.isFinite(entry.startAt) &&
            entry.endAt !== null &&
            Number.isFinite(entry.endAt);
        const groupKey = hasKnownTimes
            ? `${entry.startAt}:${entry.endAt}`
            : `unknown:${entry.key}`;
        const group = groups.get(groupKey) ?? [];
        group.push(entry);
        groups.set(groupKey, group);
    }

    return Array.from(groups.values())
        .map((group) => {
            const first = group[0];
            const codes = Array.from(
                new Set(group.map((entry) => entry.code))
            ).sort((left, right) => left.localeCompare(right));

            return {
                ...first,
                key: group
                    .map((entry) => entry.key)
                    .sort()
                    .join('|'),
                code: codes.join(' / '),
                categories: dedupeCategories(
                    group.flatMap((entry) => entry.categories)
                )
            };
        })
        .sort((left, right) => {
            const leftStartAt = left.startAt ?? Number.POSITIVE_INFINITY;
            const rightStartAt = right.startAt ?? Number.POSITIVE_INFINITY;
            if (leftStartAt !== rightStartAt) {
                return leftStartAt - rightStartAt;
            }

            const leftEndAt = left.endAt ?? Number.POSITIVE_INFINITY;
            const rightEndAt = right.endAt ?? Number.POSITIVE_INFINITY;
            if (leftEndAt !== rightEndAt) {
                return leftEndAt - rightEndAt;
            }

            return left.code.localeCompare(right.code);
        });
}

function hasKnownCouplingPosition(entry: CalendarCodeEntry) {
    const position = getCouplingPosition(entry);
    return props.type === 'train' && (position === 'I' || position === 'II');
}

function getKnownCouplingPosition(entry: CalendarCodeEntry): 'I' | 'II' {
    return getCouplingPosition(entry) === 'I' ? 'I' : 'II';
}

function getCouplingEndLabel(entry: CalendarCodeEntry) {
    return getKnownCouplingPosition(entry) === 'I' ? '1 位端' : '2 位端';
}

function formatStation(station: string | null) {
    return station?.trim() || '--';
}

function formatRecordTime(timestamp: number | null, serviceDate: string) {
    const time = formatNullableTime(timestamp);
    if (timestamp === null || !Number.isFinite(timestamp)) {
        return time;
    }

    const dayOffset = getShanghaiDayOffsetFromServiceDate(
        serviceDate,
        timestamp
    );
    return dayOffset !== null && dayOffset > 0 ? `${time} +${dayOffset}` : time;
}

function handleDateClick(cell: CalendarCell) {
    if (
        cell.serviceDate > today.value ||
        !recordsByDate.value.has(cell.serviceDate)
    ) {
        return;
    }

    if (isDesktopViewport.value) {
        emit('selectDate', cell.serviceDate);
        return;
    }

    selectedServiceDate.value = cell.serviceDate;
}

function jumpToSelectedDate() {
    if (!selectedMobileCell.value) {
        return;
    }

    emit('selectDate', selectedMobileCell.value.serviceDate);
}

function updateViewportMode(event?: MediaQueryListEvent) {
    isDesktopViewport.value =
        event?.matches ?? desktopMediaQuery?.matches ?? false;
    if (isDesktopViewport.value) {
        selectedServiceDate.value = '';
    }
}

watch(visibleCategories, assignCategoryColors, { immediate: true });

watch(
    () => props.modelValue,
    (isOpen) => {
        if (!isOpen) {
            selectedServiceDate.value = '';
            return;
        }
        visibleMonth.value = currentMonth.value;
        resetCategoryColors();
        void ensureMonthLoaded(visibleMonth.value);
    }
);

onMounted(() => {
    desktopMediaQuery = window.matchMedia('(min-width: 768px)');
    updateViewportMode();
    desktopMediaQuery.addEventListener('change', updateViewportMode);
    currentTimeTimer = setInterval(() => {
        currentUnixSeconds.value = Math.floor(Date.now() / 1000);
    }, 60_000);
});

onBeforeUnmount(() => {
    desktopMediaQuery?.removeEventListener('change', updateViewportMode);
    if (currentTimeTimer) {
        clearInterval(currentTimeTimer);
    }
});
</script>
