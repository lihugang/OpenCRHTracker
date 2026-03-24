<template>
    <UiModal
        :model-value="props.modelValue"
        eyebrow="TIMETABLE"
        :title="modalTitle"
        :description="modalDescription"
        size="lg"
        height="tall"
        @update:model-value="emit('update:modelValue', $event)">
        <div
            v-if="state === 'loading'"
            class="space-y-3">
            <div
                v-for="index in 3"
                :key="'loading:' + index"
                class="h-14 animate-pulse rounded-[1rem] border border-slate-200 bg-slate-100/80" />
        </div>

        <UiEmptyState
            v-else-if="state === 'error'"
            eyebrow="Load Failed"
            title="当前时刻表暂时不可用"
            :description="errorMessage || '请稍后重试。'"
            tone="danger" />

        <UiEmptyState
            v-else-if="state === 'empty'"
            eyebrow="No Data"
            title="当前暂无时刻表"
            description="该车次今天没有可用的完整经停表。" />

        <div
            v-else-if="timetable"
            class="space-y-5">
            <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <UiCard
                    :show-accent-bar="false"
                    variant="subtle">
                    <p class="text-xs uppercase tracking-[0.16em] text-slate-400">
                        车次
                    </p>
                    <p class="mt-2 font-mono text-sm font-semibold text-crh-blue">
                        {{ timetable.allCodes.join(' / ') }}
                    </p>
                </UiCard>

                <UiCard
                    :show-accent-bar="false"
                    variant="subtle">
                    <p class="text-xs uppercase tracking-[0.16em] text-slate-400">
                        始发 / 终到
                    </p>
                    <p class="mt-2 text-sm font-medium text-crh-grey-dark">
                        {{ timetable.startStation }} -> {{ timetable.endStation }}
                    </p>
                </UiCard>

                <UiCard
                    :show-accent-bar="false"
                    variant="subtle">
                    <p class="text-xs uppercase tracking-[0.16em] text-slate-400">
                        出发 / 终到时间
                    </p>
                    <p class="mt-2 font-mono text-sm text-crh-grey-dark">
                        {{ formatTime(timetable.startAt) }} / {{ formatTime(timetable.endAt) }}
                    </p>
                </UiCard>

                <UiCard
                    :show-accent-bar="false"
                    variant="subtle">
                    <p class="text-xs uppercase tracking-[0.16em] text-slate-400">
                        数据日期
                    </p>
                    <p class="mt-2 font-mono text-sm text-crh-grey-dark">
                        {{ timetable.date }}
                    </p>
                </UiCard>
            </div>

            <div class="hidden overflow-hidden rounded-[1.25rem] border border-slate-200 md:block">
                <table class="min-w-full border-separate border-spacing-0 bg-white/90">
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
                            v-for="stop in timetable.stops"
                            :key="'desktop:' + stop.stationNo"
                            class="align-top">
                            <td class="border-b border-slate-100 px-4 py-3 font-mono text-sm text-slate-500 last:border-b-0">
                                {{ stop.stationNo }}
                            </td>
                            <td class="border-b border-slate-100 px-4 py-3 text-sm font-medium text-crh-grey-dark last:border-b-0">
                                {{ stop.stationName }}
                            </td>
                            <td class="border-b border-slate-100 px-4 py-3 font-mono text-sm text-slate-500 last:border-b-0">
                                {{ formatNullableTime(stop.arriveAt) }}
                            </td>
                            <td class="border-b border-slate-100 px-4 py-3 font-mono text-sm text-slate-500 last:border-b-0">
                                {{ formatNullableTime(stop.departAt) }}
                            </td>
                            <td class="border-b border-slate-100 px-4 py-3 font-mono text-sm text-slate-500 last:border-b-0">
                                {{ stop.stationTrainCode || '--' }}
                            </td>
                            <td class="border-b border-slate-100 px-4 py-3 text-sm text-slate-500 last:border-b-0">
                                {{ stop.wicket || '--' }}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="space-y-2.5 md:hidden">
                <UiCard
                    v-for="stop in timetable.stops"
                    :key="'mobile:' + stop.stationNo"
                    :show-accent-bar="false"
                    variant="subtle">
                    <div class="space-y-3">
                        <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                                <p class="text-xs uppercase tracking-[0.16em] text-slate-400">
                                    第 {{ stop.stationNo }} 站
                                </p>
                                <p class="mt-1 text-sm font-semibold text-crh-grey-dark">
                                    {{ stop.stationName }}
                                </p>
                            </div>
                            <span class="font-mono text-xs text-slate-400">
                                {{ stop.stationTrainCode || '--' }}
                            </span>
                        </div>

                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <p class="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                    到点
                                </p>
                                <p class="mt-1 font-mono text-sm text-slate-500">
                                    {{ formatNullableTime(stop.arriveAt) }}
                                </p>
                            </div>
                            <div>
                                <p class="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                    开点
                                </p>
                                <p class="mt-1 font-mono text-sm text-slate-500">
                                    {{ formatNullableTime(stop.departAt) }}
                                </p>
                            </div>
                            <div>
                                <p class="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                    当前站车次
                                </p>
                                <p class="mt-1 font-mono text-sm text-slate-500">
                                    {{ stop.stationTrainCode || '--' }}
                                </p>
                            </div>
                            <div>
                                <p class="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                    检票口
                                </p>
                                <p class="mt-1 text-sm text-slate-500">
                                    {{ stop.wicket || '--' }}
                                </p>
                            </div>
                        </div>
                    </div>
                </UiCard>
            </div>
        </div>
    </UiModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { TrackerApiResponse } from '~/types/homepage';
import type { CurrentTrainTimetableData } from '~/types/lookup';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';

const TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
});

const cachedTimetables = new Map<string, CurrentTrainTimetableData>();

const props = defineProps<{
    modelValue: boolean;
    trainCode: string;
    displayCodes?: string[];
}>();

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
}>();

const state = ref<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
const timetable = ref<CurrentTrainTimetableData | null>(null);
const errorMessage = ref('');

const columns = ['站序', '站名', '到点', '开点', '当前站车次', '检票口'];

const modalTitle = computed(() => {
    if (timetable.value) {
        return timetable.value.allCodes.join(' / ');
    }

    if (Array.isArray(props.displayCodes) && props.displayCodes.length > 0) {
        return props.displayCodes.join(' / ');
    }

    return props.trainCode || '当前时刻表';
});

const modalDescription = computed(() => {
    const displayCode =
        timetable.value?.allCodes[0] ??
        props.displayCodes?.[0] ??
        props.trainCode;

    return `当前展示的是今日 ${displayCode} 次列车时刻表数据，仅供参考`;
});

watch(
    () => [props.modelValue, props.trainCode] as const,
    async ([isOpen, trainCode]) => {
        if (!isOpen || trainCode.trim().length === 0) {
            return;
        }

        const normalizedTrainCode = trainCode.trim().toUpperCase();
        if (cachedTimetables.has(normalizedTrainCode)) {
            timetable.value = cachedTimetables.get(normalizedTrainCode) ?? null;
            state.value = timetable.value ? 'success' : 'empty';
            errorMessage.value = '';
            return;
        }

        state.value = 'loading';
        errorMessage.value = '';

        try {
            const response = await $fetch<TrackerApiResponse<CurrentTrainTimetableData>>(
                '/api/v1/timetable/train/' + encodeURIComponent(normalizedTrainCode)
            );

            if (!response.ok) {
                throw {
                    data: response
                };
            }

            cachedTimetables.set(normalizedTrainCode, response.data);
            timetable.value = response.data;
            state.value =
                response.data.stops.length > 0 ? 'success' : 'empty';
        } catch (error) {
            timetable.value = null;
            state.value = 'error';
            errorMessage.value = getApiErrorMessage(
                error,
                '当前时刻表加载失败'
            );
        }
    },
    {
        immediate: true
    }
);

function formatNullableTime(timestamp: number | null) {
    if (timestamp === null || !Number.isFinite(timestamp)) {
        return '--';
    }

    return formatTime(timestamp);
}

function formatTime(timestamp: number) {
    return TIME_FORMATTER.format(new Date(timestamp * 1000));
}
</script>
