<template>
    <UiModal
        :model-value="modelValue"
        :title="`${code} 历史日历`"
        eyebrow="HISTORY CALENDAR"
        description=""
        size="lg"
        height="tall"
        @update:model-value="emit('update:modelValue', $event)">
        <div class="space-y-4 rounded-[20px] bg-slate-50 p-2 sm:p-3">
            <div
                class="flex items-center justify-between gap-3 px-2 py-1 sm:px-3">
                <button
                    type="button"
                    class="inline-flex h-9 w-9 items-center justify-center rounded-2xl text-lg text-slate-500 transition hover:bg-white hover:text-[#00529B] disabled:cursor-not-allowed disabled:opacity-30"
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
                    class="inline-flex h-9 w-9 items-center justify-center rounded-2xl text-lg text-slate-500 transition hover:bg-white hover:text-[#00529B] disabled:cursor-not-allowed disabled:opacity-30"
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
                    class="grid grid-cols-7 bg-white px-1 pt-1 sm:px-2 sm:pt-2">
                    <div
                        v-for="weekday in weekdays"
                        :key="weekday"
                        class="px-1 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-400 sm:py-3">
                        {{ weekday }}
                    </div>
                </div>

                <div
                    class="grid grid-cols-7 gap-0.5 bg-slate-50 p-1 sm:gap-1 sm:p-2">
                    <div
                        v-for="cell in calendarCells"
                        :key="cell.key"
                        class="m-px min-h-[5.5rem] rounded-lg bg-white p-1.5 sm:min-h-[7.25rem] sm:p-2"
                        :class="cell.isCurrentMonth ? '' : 'opacity-60'">
                        <button
                            v-if="cell.serviceDate"
                            type="button"
                            class="flex min-h-[5.25rem] w-full flex-col rounded-xl p-1 text-left transition sm:min-h-[7rem] sm:p-1.5"
                            :class="[
                                cell.state === 'running'
                                    ? 'cursor-pointer hover:bg-blue-50/60'
                                    : 'cursor-default',
                                cell.isToday
                                    ? 'bg-blue-50/30 ring-2 ring-[#00529B]/50'
                                    : ''
                            ]"
                            :disabled="cell.state !== 'running'"
                            :aria-label="cell.ariaLabel"
                            @click="selectDate(cell.serviceDate)">
                            <span
                                class="flex items-center justify-between gap-1">
                                <span
                                    class="text-sm font-medium"
                                    :class="
                                        cell.isCurrentMonth
                                            ? 'text-slate-700'
                                            : 'text-slate-300'
                                    ">
                                    {{ cell.day }}
                                </span>
                                <span
                                    v-if="cell.state === 'running'"
                                    class="h-1.5 w-1.5 rounded-full bg-[#10B981]"
                                    aria-label="开行" />
                                <span
                                    v-else-if="cell.state === 'loading'"
                                    class="h-1.5 w-1.5 rounded-full bg-[#00529B]/30"
                                    aria-label="获取数据中" />
                            </span>
                            <span
                                v-if="cell.codes.length > 0"
                                class="mt-2 flex min-w-0 flex-col gap-1">
                                <span
                                    v-for="entry in cell.codes"
                                    :key="entry"
                                    class="truncate border-b border-slate-100 pb-1 font-mono text-[11px] leading-tight text-slate-600 last:border-b-0 last:pb-0 md:text-xs">
                                    {{ entry }}
                                </span>
                            </span>
                        </button>
                    </div>
                </div>
            </div>
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
    codes: string[];
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
        const codes = Array.from(
            new Set(records.map((record) => record.code.trim()).filter(Boolean))
        ).slice(0, 4);
        const summary = codes.slice(0, 2).join('、');

        cells.push({
            key: serviceDate,
            serviceDate,
            day: cellDay,
            isCurrentMonth,
            isToday: serviceDate === today.value,
            state,
            codes,
            ariaLabel: `${serviceDate.slice(0, 4)} 年 ${Number(serviceDate.slice(4, 6))} 月 ${Number(serviceDate.slice(6, 8))} 日，${state === 'running' ? `开行，${summary || '有记录'}` : state === 'closed' ? '未开行' : '获取数据中'}`
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
