<template>
    <LookupExpandableSection
        :model-value="modelValue"
        title="时刻表"
        :section-id="sectionId"
        :summary="summary"
        collapse-label="折叠时刻表"
        expand-label="展开时刻表"
        show-toggle
        @update:model-value="emit('update:modelValue', $event)">
        <template #notice>
            <p
                v-if="isCurrentView && notice && modelValue"
                class="text-sm leading-6 text-slate-700">
                {{ notice }}
            </p>
        </template>

        <div
            v-if="showHistorySelector"
            class="flex justify-end">
            <UiSelect
                :model-value="selectedSourceKey"
                class="min-w-[12rem]"
                :options="historyOptions"
                placeholder="选择时段"
                mobile-presentation="sheet"
                mobile-sheet-title="选择时段"
                mobile-sheet-eyebrow="TIMETABLE"
                @update:model-value="handleSourceKeyUpdate" />
        </div>

        <div
            class="hidden overflow-x-auto overflow-y-hidden rounded-[1.25rem] border border-slate-200 md:block">
            <table
                class="border-separate border-spacing-0 bg-white/90"
                :class="showDistanceColumns ? 'min-w-[58rem]' : 'min-w-full'">
                <thead>
                    <tr class="bg-slate-50/80 text-left">
                        <th
                            v-for="column in visibleColumns"
                            :key="column"
                            class="border-b border-slate-200 px-4 py-3 text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                            {{ column }}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr
                        v-for="(stop, stopIndex) in timetable.stops"
                        :key="'desktop:' + stop.stationNo"
                        class="align-top">
                        <td
                            class="border-b border-slate-100 px-4 py-3 font-mono text-sm text-slate-500 last:border-b-0">
                            {{ stop.stationNo }}
                        </td>
                        <td
                            class="border-b border-slate-100 px-4 py-3 font-mono text-sm text-slate-500 last:border-b-0">
                            {{ stop.stationTrainCode || '--' }}
                        </td>
                        <td
                            class="border-b border-slate-100 px-4 py-3 text-sm font-medium text-crh-grey-dark last:border-b-0">
                            <LookupStationLink
                                :station-name="stop.stationName"
                                :focus-train-codes="
                                    resolveStopFocusTrainCodes(stop)
                                "
                                fallback-text="--" />
                        </td>
                        <td
                            class="border-b border-slate-100 px-4 py-3 font-mono text-sm text-slate-500 last:border-b-0">
                            {{ formatStopTime(stop.arriveAt) }}
                        </td>
                        <td
                            class="border-b border-slate-100 px-4 py-3 font-mono text-sm text-slate-500 last:border-b-0">
                            {{ formatStopTime(stop.departAt) }}
                        </td>
                        <td
                            v-if="isCurrentView"
                            class="border-b border-slate-100 px-4 py-3 text-sm text-slate-500 last:border-b-0">
                            {{ formatStopWicket(stop) }}
                        </td>
                        <td
                            v-if="showDistanceColumns"
                            class="border-b border-slate-100 px-4 py-3 font-mono text-sm text-slate-500 last:border-b-0">
                            {{ formatStopDistance(stop, stopIndex) }}
                        </td>
                        <td
                            v-if="showDistanceColumns"
                            class="border-b border-slate-100 px-4 py-3 font-mono text-sm text-slate-500 last:border-b-0">
                            {{ formatStopSectionSpeed(stop, stopIndex) }}
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div class="space-y-2.5 md:hidden">
            <UiCard
                v-for="(stop, stopIndex) in timetable.stops"
                :key="'mobile:' + stop.stationNo"
                :show-accent-bar="false"
                variant="subtle">
                <div class="space-y-3">
                    <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                            <p
                                class="text-xs uppercase tracking-[0.16em] text-slate-400">
                                第 {{ stop.stationNo }} 站
                            </p>
                            <p
                                class="mt-1 text-sm font-semibold text-crh-grey-dark">
                                <LookupStationLink
                                    :station-name="stop.stationName"
                                    :focus-train-codes="
                                        resolveStopFocusTrainCodes(stop)
                                    "
                                    fallback-text="--" />
                            </p>
                        </div>
                        <span class="font-mono text-xs text-slate-400">
                            {{ stop.stationTrainCode || '--' }}
                        </span>
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <p
                                class="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                到点
                            </p>
                            <p class="mt-1 font-mono text-sm text-slate-500">
                                {{ formatStopTime(stop.arriveAt) }}
                            </p>
                        </div>
                        <div>
                            <p
                                class="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                开点
                            </p>
                            <p class="mt-1 font-mono text-sm text-slate-500">
                                {{ formatStopTime(stop.departAt) }}
                            </p>
                        </div>
                        <div>
                            <p
                                class="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                车次
                            </p>
                            <p class="mt-1 font-mono text-sm text-slate-500">
                                {{ stop.stationTrainCode || '--' }}
                            </p>
                        </div>
                        <div v-if="isCurrentView">
                            <p
                                class="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                检票口
                            </p>
                            <p class="mt-1 text-sm text-slate-500">
                                {{ formatStopWicket(stop) }}
                            </p>
                        </div>
                        <div v-if="showDistanceColumns">
                            <p
                                class="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                里程
                            </p>
                            <p class="mt-1 font-mono text-sm text-slate-500">
                                {{ formatStopDistance(stop, stopIndex) }}
                            </p>
                        </div>
                        <div v-if="showDistanceColumns">
                            <p
                                class="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                区间均速
                            </p>
                            <p class="mt-1 font-mono text-sm text-slate-500">
                                {{ formatStopSectionSpeed(stop, stopIndex) }}
                            </p>
                        </div>
                    </div>
                </div>
            </UiCard>
        </div>
    </LookupExpandableSection>
</template>

<script setup lang="ts">
import LookupExpandableSection from './LookupExpandableSection.vue';
import type {
    DisplayTimetableData,
    DisplayTimetableStop,
    TimetableSourceKey,
    TimetableSourceOption
} from '~/types/lookupCurrentTimetable';

defineProps<{
    modelValue: boolean;
    sectionId: string;
    summary: string;
    timetable: DisplayTimetableData;
    isCurrentView: boolean;
    notice: string;
    showHistorySelector: boolean;
    selectedSourceKey: TimetableSourceKey;
    historyOptions: TimetableSourceOption[];
    visibleColumns: string[];
    showDistanceColumns: boolean;
    resolveStopFocusTrainCodes: (stop: DisplayTimetableStop) => string[];
    formatStopTime: (value: number | null) => string;
    formatStopWicket: (stop: DisplayTimetableStop) => string;
    formatStopDistance: (stop: DisplayTimetableStop, index: number) => string;
    formatStopSectionSpeed: (
        stop: DisplayTimetableStop,
        index: number
    ) => string;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    'update:selectedSourceKey': [value: TimetableSourceKey];
}>();

function isTimetableSourceKey(value: string): value is TimetableSourceKey {
    return value === 'current' || /^history:\d+$/.test(value);
}

function handleSourceKeyUpdate(value: string) {
    if (isTimetableSourceKey(value)) {
        emit('update:selectedSourceKey', value);
    }
}
</script>
