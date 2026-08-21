<template>
    <div class="space-y-3 rounded-[20px] bg-slate-50 p-2">
        <div class="flex items-center justify-between px-2 py-1">
            <button
                type="button"
                class="h-9 w-9 rounded-2xl text-lg text-slate-500 hover:bg-white"
                aria-label="上一个月"
                @click="moveMonth(-1)">
                &lsaquo;
            </button>
            <p class="text-base font-semibold text-slate-700">
                {{ monthLabel }}
            </p>
            <button
                type="button"
                class="h-9 w-9 rounded-2xl text-lg text-slate-500 hover:bg-white"
                aria-label="下一个月"
                @click="moveMonth(1)">
                &rsaquo;
            </button>
        </div>
        <div
            class="grid grid-cols-7 rounded-[20px] border border-slate-100 bg-white p-1">
            <div
                v-for="weekday in weekdays"
                :key="weekday"
                class="py-2 text-center text-xs font-semibold text-slate-400">
                {{ weekday }}
            </div>
            <button
                v-for="cell in cells"
                :key="cell.date"
                type="button"
                class="m-0.5 min-h-12 rounded-lg text-sm transition"
                :class="cellClass(cell)"
                :disabled="cell.disabled"
                :aria-label="cell.date"
                @click="select(cell.date)">
                {{ cell.day }}
            </button>
        </div>
        <p class="px-2 text-xs text-slate-500">{{ rangeLabel }}</p>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import getShanghaiDayStartUnixSeconds from '~/utils/time/getShanghaiDayStartUnixSeconds';
import formatShanghaiDateString from '~/utils/time/formatShanghaiDateString';

const props = defineProps<{
    startDate: string;
    endDate: string;
    minDate: string;
    maxDate: string;
}>();
const emit = defineEmits<{
    'update:startDate': [value: string];
    'update:endDate': [value: string];
}>();
const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
const visibleMonth = ref((props.endDate || props.maxDate).slice(0, 6));
const monthLabel = computed(
    () =>
        `${visibleMonth.value.slice(0, 4)} 年 ${Number(visibleMonth.value.slice(4, 6))} 月`
);
const cells = computed(() => {
    const year = Number(visibleMonth.value.slice(0, 4));
    const month = Number(visibleMonth.value.slice(4, 6));
    const first = new Date(Date.UTC(year, month - 1, 1));
    const firstWeekday = first.getUTCDay();
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return Array.from({ length: 42 }, (_, index) => {
        const date = new Date(
            Date.UTC(year, month - 1, index - firstWeekday + 1)
        );
        const value = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;
        return {
            date: value,
            day: date.getUTCDate(),
            current: date.getUTCMonth() === month - 1,
            disabled:
                value < props.minDate ||
                value > props.maxDate ||
                date.getUTCMonth() !== month - 1
        };
    });
});
const rangeLabel = computed(() =>
    props.startDate && props.endDate
        ? `${props.startDate} 至 ${props.endDate}`
        : props.startDate
          ? `${props.startDate} 至请选择结束日期`
          : '请选择开始日期'
);
function moveMonth(delta: number) {
    const next = new Date(
        Date.UTC(
            Number(visibleMonth.value.slice(0, 4)),
            Number(visibleMonth.value.slice(4, 6)) - 1 + delta,
            1
        )
    );
    const key = `${next.getUTCFullYear()}${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
    if (key <= props.maxDate.slice(0, 6) && key >= props.minDate.slice(0, 6))
        visibleMonth.value = key;
}
function select(value: string) {
    if (!props.startDate || (props.startDate && props.endDate)) {
        emit('update:startDate', value);
        emit('update:endDate', '');
        return;
    }
    if (value < props.startDate) {
        emit('update:endDate', props.startDate);
        emit('update:startDate', value);
    } else emit('update:endDate', value);
}
function cellClass(cell: {
    date: string;
    current: boolean;
    disabled: boolean;
}) {
    const selected =
        cell.date === props.startDate || cell.date === props.endDate;
    const inRange =
        props.startDate &&
        props.endDate &&
        cell.date > props.startDate &&
        cell.date < props.endDate;
    return [
        !cell.current || cell.disabled ? 'text-slate-300' : 'text-slate-700',
        selected ? 'bg-crh-blue text-white' : '',
        inRange ? 'bg-blue-50 text-crh-blue' : '',
        cell.disabled ? 'cursor-not-allowed' : 'hover:bg-white'
    ];
}
</script>
