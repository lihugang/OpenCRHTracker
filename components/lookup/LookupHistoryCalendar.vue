<template>
    <UiModal
        :model-value="modelValue"
        :title="`${code} 历史日历`"
        eyebrow="HISTORY CALENDAR"
        description="与下方历史表格使用同一份数据；翻月时会按需继续加载。"
        size="lg"
        height="tall"
        @update:model-value="emit('update:modelValue', $event)">
        <div class="space-y-5">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-2">
                    <button
                        type="button"
                        class="calendar-nav-button"
                        :disabled="!canGoPreviousMonth"
                        aria-label="上一个月"
                        @click="moveMonth(-1)">
                        &lt;
                    </button>
                    <p
                        class="min-w-[9rem] text-center text-lg font-semibold text-slate-900">
                        {{ monthLabel }}
                    </p>
                    <button
                        type="button"
                        class="calendar-nav-button"
                        :disabled="!canGoNextMonth"
                        aria-label="下一个月"
                        @click="moveMonth(1)">
                        &gt;
                    </button>
                </div>

                <div
                    class="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-500">
                    <span class="calendar-legend-item">
                        <span
                            class="calendar-legend-dot calendar-legend-dot--running" />
                        开行
                    </span>
                    <span class="calendar-legend-item">
                        <span
                            class="calendar-legend-dot calendar-legend-dot--closed" />
                        未开行
                    </span>
                    <span class="calendar-legend-item">
                        <span
                            class="calendar-legend-dot calendar-legend-dot--loading" />
                        获取数据中
                    </span>
                </div>
            </div>

            <div
                v-if="isLoadingMonth"
                class="calendar-loading-banner">
                <span
                    class="calendar-loading-spinner"
                    aria-hidden="true" />
                正在加载 {{ monthLabel }} 的历史数据
            </div>
            <div
                v-else-if="loadError"
                class="calendar-error-banner">
                <span>{{ loadError }}</span>
                <button
                    type="button"
                    class="text-sm font-medium text-rose-700 underline underline-offset-4"
                    @click="retryMonth">
                    重试
                </button>
            </div>

            <div
                class="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div
                    class="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80">
                    <div
                        v-for="weekday in weekdays"
                        :key="weekday"
                        class="px-1 py-2 text-center text-[11px] font-medium tracking-[0.12em] text-slate-400 sm:px-2 sm:py-3">
                        {{ weekday }}
                    </div>
                </div>

                <div class="grid grid-cols-7">
                    <div
                        v-for="cell in calendarCells"
                        :key="cell.key"
                        class="min-h-[4.8rem] border-b border-r border-slate-100 p-1 last:border-r-0 sm:min-h-[6.5rem] sm:p-2"
                        :class="
                            cell.isCurrentMonth ? 'bg-white' : 'bg-slate-50/65'
                        ">
                        <button
                            v-if="cell.serviceDate"
                            type="button"
                            class="calendar-day-button"
                            :class="[
                                `calendar-day-button--${cell.state}`,
                                cell.isToday
                                    ? 'calendar-day-button--today'
                                    : '',
                                cell.state === 'running'
                                    ? 'cursor-pointer'
                                    : 'cursor-default'
                            ]"
                            :disabled="cell.state !== 'running'"
                            :aria-label="cell.ariaLabel"
                            @click="selectDate(cell.serviceDate)">
                            <span
                                class="flex items-center justify-between gap-1">
                                <span class="calendar-day-number">{{
                                    cell.day
                                }}</span>
                                <span
                                    v-if="cell.recordCount > 0"
                                    class="calendar-day-count">
                                    {{ cell.recordCount }}
                                </span>
                            </span>
                            <span
                                v-if="cell.colors.length > 0"
                                class="mt-2 flex min-h-1.5 gap-1">
                                <span
                                    v-for="color in cell.colors"
                                    :key="color"
                                    class="calendar-model-dot"
                                    :style="{ backgroundColor: color }" />
                            </span>
                            <span
                                v-if="cell.hasRecords"
                                class="mt-1 line-clamp-2 text-left text-[10px] leading-4 text-slate-500 sm:text-[11px]">
                                {{ cell.summary }}
                            </span>
                        </button>
                    </div>
                </div>
            </div>

            <p class="text-xs leading-5 text-slate-500">
                当前日期之后显示为“获取数据中”，不会为了未来日期扩大历史请求范围。车型色标按车组号去掉末尾编号后的车型键自动分配。
            </p>
        </div>
    </UiModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { LookupHistoryListItem, LookupTargetType } from '~/types/lookup';
import formatShanghaiDateString from '~/utils/time/formatShanghaiDateString';

type CalendarState = 'running' | 'closed' | 'loading';

interface CalendarCell {
    key: string;
    serviceDate: string;
    day: number;
    isCurrentMonth: boolean;
    isToday: boolean;
    state: CalendarState;
    hasRecords: boolean;
    recordCount: number;
    colors: string[];
    summary: string;
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

const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
const palette = [
    '#00529b',
    '#0f766e',
    '#b45309',
    '#7c3aed',
    '#be123c',
    '#0369a1',
    '#4d7c0f',
    '#c2410c'
];
const currentUnixSeconds = useCurrentUnixSeconds();
const today = computed(() =>
    formatShanghaiDateString(currentUnixSeconds.value)
);
const currentMonth = computed(() => today.value.slice(0, 6));
const visibleMonth = ref(currentMonth.value);
const isLoadingMonth = ref(false);
const loadError = ref('');

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

const calendarCells = computed(() => {
    const year = Number(visibleMonth.value.slice(0, 4));
    const month = Number(visibleMonth.value.slice(4, 6));
    if (!Number.isInteger(year) || !Number.isInteger(month)) {
        return [];
    }

    const first = new Date(Date.UTC(year, month - 1, 1));
    const firstWeekday = (first.getUTCDay() + 6) % 7;
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
        // A cursor page can end in the middle of a service day. Keep that
        // boundary in the loading state until the following page is loaded,
        // unless the API has confirmed that history is exhausted.
        const isCovered =
            props.isHistoryExhausted ||
            (props.oldestLoadedServiceDate.length > 0 &&
                serviceDate > props.oldestLoadedServiceDate);
        const hasRecords = records.length > 0;
        const state: CalendarState = isFuture
            ? 'loading'
            : hasRecords
              ? 'running'
              : !isCovered && !props.isHistoryExhausted
                ? 'loading'
                : 'closed';
        const colors = Array.from(
            new Set(records.map((record) => colorForModel(modelKey(record))))
        ).slice(0, 3);
        const summary = records
            .map((record) => record.code.trim())
            .filter(Boolean)
            .slice(0, 2)
            .join(' / ');

        cells.push({
            key: serviceDate,
            serviceDate,
            day: cellDay,
            isCurrentMonth,
            isToday: serviceDate === today.value,
            state,
            hasRecords,
            recordCount: records.length,
            colors,
            summary,
            ariaLabel: `${serviceDate.slice(0, 4)} 年 ${Number(serviceDate.slice(4, 6))} 月 ${Number(serviceDate.slice(6, 8))} 日，${state === 'running' ? `开行，${summary || '有记录'}` : state === 'closed' ? '未开行' : '获取数据中'}`
        });
    }

    return cells;
});

function modelKey(item: LookupHistoryListItem) {
    const value = (props.type === 'emu' ? props.code : item.code)
        .trim()
        .toUpperCase();
    const separator = value.lastIndexOf('-');
    return separator > 0 ? value.slice(0, separator) : value || 'UNKNOWN';
}

function colorForModel(model: string) {
    let hash = 0;
    for (const char of model) {
        hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    }
    return palette[hash % palette.length] ?? palette[0];
}

function moveMonth(delta: number) {
    const year = Number(visibleMonth.value.slice(0, 4));
    const month = Number(visibleMonth.value.slice(4, 6));
    const next = new Date(Date.UTC(year, month - 1 + delta, 1));
    const nextKey = `${next.getUTCFullYear()}${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
    if (nextKey > currentMonth.value) {
        return;
    }
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

function selectDate(serviceDate: string) {
    if (serviceDate <= today.value && recordsByDate.value.has(serviceDate)) {
        emit('selectDate', serviceDate);
    }
}

watch(
    () => props.modelValue,
    (isOpen) => {
        if (!isOpen) {
            return;
        }
        visibleMonth.value = currentMonth.value;
        void ensureMonthLoaded(visibleMonth.value);
    }
);
</script>

<style scoped>
.calendar-nav-button {
    display: inline-flex;
    height: 2.25rem;
    width: 2.25rem;
    align-items: center;
    justify-content: center;
    border: 1px solid rgb(226 232 240);
    border-radius: 0.75rem;
    color: rgb(71 85 105);
    transition:
        border-color 180ms ease,
        background-color 180ms ease,
        color 180ms ease;
}

.calendar-nav-button:hover:not(:disabled) {
    border-color: rgb(147 197 253);
    background: rgb(239 246 255);
    color: rgb(0 82 155);
}

.calendar-nav-button:disabled {
    cursor: not-allowed;
    opacity: 0.35;
}

.calendar-legend-item {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    white-space: nowrap;
}

.calendar-legend-dot {
    display: inline-block;
    height: 0.55rem;
    width: 0.55rem;
    border-radius: 999px;
}

.calendar-legend-dot--running {
    background: rgb(16 185 129);
}
.calendar-legend-dot--closed {
    background: rgb(203 213 225);
}
.calendar-legend-dot--loading {
    background: rgb(245 158 11);
}

.calendar-loading-banner,
.calendar-error-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    border-radius: 0.75rem;
    padding: 0.7rem 0.85rem;
    font-size: 0.8rem;
}

.calendar-loading-banner {
    background: rgb(255 247 237);
    color: rgb(154 52 18);
}
.calendar-error-banner {
    background: rgb(255 241 242);
    color: rgb(159 18 57);
}

.calendar-loading-spinner {
    height: 0.65rem;
    width: 0.65rem;
    flex-shrink: 0;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 999px;
    animation: calendar-spin 800ms linear infinite;
}

.calendar-day-button {
    display: block;
    min-height: 4.25rem;
    width: 100%;
    border-radius: 0.75rem;
    padding: 0.4rem;
    text-align: left;
    transition:
        background-color 180ms ease,
        box-shadow 180ms ease;
}

.calendar-day-button:hover:not(:disabled) {
    background: rgb(239 246 255);
}
.calendar-day-button--running {
    background: rgb(240 253 250);
    color: rgb(15 118 110);
}
.calendar-day-button--closed {
    color: rgb(100 116 139);
}
.calendar-day-button--loading {
    background: rgb(255 251 235);
    color: rgb(180 83 9);
}
.calendar-day-button--today {
    box-shadow: inset 0 0 0 2px rgb(0 82 155 / 0.55);
}

.calendar-day-number {
    font-size: 0.8rem;
    font-weight: 600;
}
.calendar-day-count {
    font-size: 0.65rem;
    color: rgb(100 116 139);
}
.calendar-model-dot {
    height: 0.35rem;
    width: 1.15rem;
    border-radius: 999px;
}

@keyframes calendar-spin {
    to {
        transform: rotate(360deg);
    }
}

@media (prefers-reduced-motion: reduce) {
    .calendar-loading-spinner {
        animation: none;
    }
}
</style>
