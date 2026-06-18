<template>
    <div class="grid gap-3 sm:grid-cols-2">
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
                <LookupStationLink
                    :station-name="timetable.startStation"
                    :focus-train-codes="focusTrainCodes"
                    fallback-text="--" />
                <span class="mx-1">-></span>
                <LookupStationLink
                    :station-name="timetable.endStation"
                    :focus-train-codes="focusTrainCodes"
                    fallback-text="--" />
            </p>
        </UiCard>

        <UiCard
            v-if="isCurrentView && responsibilitySummary"
            data-guide="current-responsibility-summary"
            :show-accent-bar="false"
            variant="subtle"
            class="sm:col-span-2">
            <p class="text-xs uppercase tracking-[0.16em] text-slate-400">
                担当
            </p>
            <p class="mt-2 text-sm font-medium text-crh-grey-dark">
                {{ responsibilitySummary }}
            </p>
        </UiCard>
    </div>
</template>

<script setup lang="ts">
import type { DisplayTimetableData } from '~/types/lookupCurrentTimetable';

defineProps<{
    timetable: DisplayTimetableData;
    focusTrainCodes: string[];
    isCurrentView: boolean;
    responsibilitySummary: string;
}>();
</script>
