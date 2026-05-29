<template>
    <UiModal
        :model-value="props.modelValue"
        eyebrow="TIMETABLE"
        :title="modalTitle"
        size="lg"
        height="tall"
        @update:model-value="emit('update:modelValue', $event)">
        <div
            v-if="viewState === 'loading'"
            class="space-y-3">
            <div
                v-for="index in 3"
                :key="'loading:' + index"
                class="h-14 animate-pulse rounded-[1rem] border border-slate-200 bg-slate-100/80" />
        </div>

        <UiEmptyState
            v-else-if="viewState === 'error'"
            eyebrow="Load Failed"
            :title="errorTitle"
            :description="
                errorMessage ||
                historyErrorMessage ||
                historyContentErrorMessage ||
                '请稍后重试。'
            "
            tone="danger" />

        <UiEmptyState
            v-else-if="viewState === 'empty'"
            eyebrow="No Data"
            :title="emptyTitle"
            :description="emptyDescription" />

        <div
            v-else-if="displayedTimetable"
            class="flex flex-col gap-5">
            <div class="order-1 space-y-5">
                <div class="grid gap-3 sm:grid-cols-2">
                    <UiCard
                        :show-accent-bar="false"
                        variant="subtle">
                        <p class="text-xs uppercase tracking-[0.16em] text-slate-400">车次</p>
                        <p class="mt-2 font-mono text-sm font-semibold text-crh-blue">
                            {{ displayedTimetable.allCodes.join(' / ') }}
                        </p>
                    </UiCard>

                    <UiCard
                        :show-accent-bar="false"
                        variant="subtle">
                        <p class="text-xs uppercase tracking-[0.16em] text-slate-400">始发 / 终到</p>
                        <p class="mt-2 text-sm font-medium text-crh-grey-dark">
                            <LookupStationLink
                                :station-name="displayedTimetable.startStation"
                                :focus-train-codes="timetableFocusTrainCodes"
                                fallback-text="--" />
                            <span class="mx-1">-></span>
                            <LookupStationLink
                                :station-name="displayedTimetable.endStation"
                                :focus-train-codes="timetableFocusTrainCodes"
                                fallback-text="--" />
                        </p>
                    </UiCard>

                    <UiCard
                        v-if="isCurrentView && responsibilitySummary"
                        :show-accent-bar="false"
                        variant="subtle"
                        class="sm:col-span-2">
                        <p class="text-xs uppercase tracking-[0.16em] text-slate-400">担当</p>
                        <p class="mt-2 text-sm font-medium text-crh-grey-dark">
                            {{ responsibilitySummary }}
                        </p>
                    </UiCard>
                </div>

                <div class="motion-divider" />
            </div>

            <UiCard
                class="order-4"
                :show-accent-bar="false"
                variant="subtle">
                <div class="space-y-4">
                    <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                            <p class="text-xs uppercase tracking-[0.16em] text-slate-400">时刻表</p>
                            <p
                                v-if="!isTimetableExpanded"
                                class="mt-2 text-sm text-slate-500">
                                {{ timetableSummaryLabel }}
                            </p>
                        </div>

                        <button
                            type="button"
                            class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crh-blue/25 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                            :class="isTimetableExpanded ? 'border-crh-blue/20 text-crh-blue' : ''"
                            :aria-controls="timetableSectionId"
                            :aria-expanded="isTimetableExpanded ? 'true' : 'false'"
                            :aria-label="isTimetableExpanded ? '折叠时刻表' : '展开时刻表'"
                            @click="toggleTimetableExpanded">
                            <svg
                                aria-hidden="true"
                                viewBox="0 0 20 20"
                                fill="none"
                                class="h-4 w-4 transition-transform duration-200 ease-out"
                                :class="isTimetableExpanded ? 'rotate-180' : ''">
                                <path
                                    d="M5 7.5L10 12.5L15 7.5"
                                    stroke="currentColor"
                                    stroke-width="1.8"
                                    stroke-linecap="round"
                                    stroke-linejoin="round" />
                            </svg>
                        </button>
                    </div>

                    <Transition
                        enter-active-class="transition duration-200 ease-out"
                        enter-from-class="translate-y-2 opacity-0 motion-reduce:translate-y-0"
                        enter-to-class="translate-y-0 opacity-100"
                        leave-active-class="transition duration-180 ease-out"
                        leave-from-class="translate-y-0 opacity-100"
                        leave-to-class="translate-y-1 opacity-0 motion-reduce:translate-y-0">
                        <div
                            v-if="isTimetableExpanded"
                            :id="timetableSectionId"
                            class="space-y-2.5">
                            <div
                                v-if="historyTimetableOptions.length > 0"
                                class="flex justify-end">
                                <UiSelect
                                    v-model="selectedTimetableSourceKey"
                                    class="min-w-[12rem]"
                                    :options="historyTimetableOptions"
                                    placeholder="选择时段"
                                    mobile-presentation="sheet"
                                    mobile-sheet-title="选择时段"
                                    mobile-sheet-eyebrow="TIMETABLE" />
                            </div>

                            <p
                                v-if="isCurrentView && timetableNotice"
                                class="text-sm leading-6 text-slate-700">
                                {{ timetableNotice }}
                            </p>

                            <div class="hidden overflow-hidden rounded-[1.25rem] border border-slate-200 md:block">
                                <table class="min-w-full border-separate border-spacing-0 bg-white/90">
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
                                            v-for="stop in displayedTimetable.stops"
                                            :key="'desktop:' + stop.stationNo"
                                            class="align-top">
                                            <td class="border-b border-slate-100 px-4 py-3 font-mono text-sm text-slate-500 last:border-b-0">
                                                {{ stop.stationNo }}
                                            </td>
                                            <td class="border-b border-slate-100 px-4 py-3 font-mono text-sm text-slate-500 last:border-b-0">
                                                {{ stop.stationTrainCode || '--' }}
                                            </td>
                                            <td class="border-b border-slate-100 px-4 py-3 text-sm font-medium text-crh-grey-dark last:border-b-0">
                                                <LookupStationLink
                                                    :station-name="stop.stationName"
                                                    :focus-train-codes="resolveStopFocusTrainCodes(stop)"
                                                    fallback-text="--" />
                                            </td>
                                            <td class="border-b border-slate-100 px-4 py-3 font-mono text-sm text-slate-500 last:border-b-0">
                                                {{ formatStopTime(stop.arriveAt) }}
                                            </td>
                                            <td class="border-b border-slate-100 px-4 py-3 font-mono text-sm text-slate-500 last:border-b-0">
                                                {{ formatStopTime(stop.departAt) }}
                                            </td>
                                            <td
                                                v-if="isCurrentView"
                                                class="border-b border-slate-100 px-4 py-3 text-sm text-slate-500 last:border-b-0">
                                                {{ stop.wicket || '--' }}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <div class="space-y-2.5 md:hidden">
                                <UiCard
                                    v-for="stop in displayedTimetable.stops"
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
                                                    <LookupStationLink
                                                        :station-name="stop.stationName"
                                                        :focus-train-codes="resolveStopFocusTrainCodes(stop)"
                                                        fallback-text="--" />
                                                </p>
                                            </div>
                                            <span class="font-mono text-xs text-slate-400">
                                                {{ stop.stationTrainCode || '--' }}
                                            </span>
                                        </div>

                                        <div class="grid grid-cols-2 gap-3">
                                            <div>
                                                <p class="text-[11px] uppercase tracking-[0.16em] text-slate-400">到点</p>
                                                <p class="mt-1 font-mono text-sm text-slate-500">
                                                    {{ formatStopTime(stop.arriveAt) }}
                                                </p>
                                            </div>
                                            <div>
                                                <p class="text-[11px] uppercase tracking-[0.16em] text-slate-400">开点</p>
                                                <p class="mt-1 font-mono text-sm text-slate-500">
                                                    {{ formatStopTime(stop.departAt) }}
                                                </p>
                                            </div>
                                            <div>
                                                <p class="text-[11px] uppercase tracking-[0.16em] text-slate-400">车次</p>
                                                <p class="mt-1 font-mono text-sm text-slate-500">
                                                    {{ stop.stationTrainCode || '--' }}
                                                </p>
                                            </div>
                                            <div v-if="isCurrentView">
                                                <p class="text-[11px] uppercase tracking-[0.16em] text-slate-400">检票口</p>
                                                <p class="mt-1 text-sm text-slate-500">
                                                    {{ stop.wicket || '--' }}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </UiCard>
                            </div>
                        </div>
                    </Transition>
                </div>
            </UiCard>

            <UiCard
                v-if="shouldShowCirculationSection"
                class="order-2"
                :show-accent-bar="false"
                variant="subtle">
                <div class="space-y-4">
                    <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                            <p class="text-xs uppercase tracking-[0.16em] text-slate-400">交路表</p>
                            <p
                                v-if="!isCirculationExpanded && circulationNodes.length > 0"
                                class="mt-2 text-sm text-slate-500">
                                {{ circulationSummaryLabel }}
                            </p>
                        </div>

                        <button
                            v-if="circulationNodes.length > 0"
                            type="button"
                            class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crh-blue/25 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                            :class="isCirculationExpanded ? 'border-crh-blue/20 text-crh-blue' : ''"
                            :aria-controls="circulationSectionId"
                            :aria-expanded="isCirculationExpanded ? 'true' : 'false'"
                            :aria-label="isCirculationExpanded ? '折叠交路表' : '展开交路表'"
                            @click="toggleCirculationExpanded">
                            <svg
                                aria-hidden="true"
                                viewBox="0 0 20 20"
                                fill="none"
                                class="h-4 w-4 transition-transform duration-200 ease-out"
                                :class="isCirculationExpanded ? 'rotate-180' : ''">
                                <path
                                    d="M5 7.5L10 12.5L15 7.5"
                                    stroke="currentColor"
                                    stroke-width="1.8"
                                    stroke-linecap="round"
                                    stroke-linejoin="round" />
                            </svg>
                        </button>
                    </div>

                    <p
                        v-if="circulationNotice && isCirculationExpanded"
                        class="text-sm leading-6 text-slate-700">
                        {{ circulationNotice }}
                    </p>

                    <Transition
                        enter-active-class="transition duration-200 ease-out"
                        enter-from-class="translate-y-2 opacity-0 motion-reduce:translate-y-0"
                        enter-to-class="translate-y-0 opacity-100"
                        leave-active-class="transition duration-180 ease-out"
                        leave-from-class="translate-y-0 opacity-100"
                        leave-to-class="translate-y-1 opacity-0 motion-reduce:translate-y-0">
                        <div
                            v-if="isCirculationExpanded && circulationNodes.length > 0"
                            :id="circulationSectionId"
                            class="space-y-3">
                            <div class="hidden space-y-3 md:block">
                                <div
                                    v-for="(node, index) in circulationNodes"
                                    :key="`desktop:${node.key}`"
                                    class="flex gap-3">
                                    <div class="flex w-7 shrink-0 flex-col items-center">
                                        <span
                                            :class="[
                                                'inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition',
                                                node.isCurrent
                                                    ? 'border-crh-blue bg-crh-blue text-white shadow-[0_6px_16px_-10px_rgba(0,82,155,0.85)]'
                                                    : 'border-slate-200 bg-white text-slate-500'
                                            ]">
                                            {{ index + 1 }}
                                        </span>
                                        <span
                                            v-if="index + 1 < circulationNodes.length"
                                            :class="[
                                                'mt-2 min-h-6 w-px flex-1',
                                                node.isCurrent ? 'bg-crh-blue/30' : 'bg-slate-200'
                                            ]"
                                            aria-hidden="true" />
                                    </div>

                                    <div
                                        :class="[
                                            'min-w-0 flex-1 rounded-[1rem] border px-4 py-3 transition',
                                            node.isCurrent
                                                ? 'border-crh-blue/20 bg-blue-50/80 shadow-[0_14px_30px_-24px_rgba(0,82,155,0.55)]'
                                                : 'border-slate-200 bg-white/90'
                                        ]">
                                        <div class="flex flex-wrap items-start justify-between gap-3">
                                            <div class="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-sm font-semibold">
                                                <template
                                                    v-for="(code, codeIndex) in node.allCodes"
                                                    :key="`${node.key}:desktop:${code}`">
                                                    <span
                                                        v-if="isCurrentCirculationCode(code)"
                                                        :class="node.isCurrent ? 'text-crh-blue' : 'text-crh-grey-dark'">
                                                        {{ code }}
                                                    </span>
                                                    <NuxtLink
                                                        v-else
                                                        :to="buildCirculationCodeLink(code)"
                                                        :class="[
                                                            'transition hover:underline',
                                                            node.isCurrent
                                                                ? 'text-crh-blue'
                                                                : 'text-crh-grey-dark hover:text-crh-blue'
                                                        ]">
                                                        {{ code }}
                                                    </NuxtLink>
                                                    <span
                                                        v-if="codeIndex < node.allCodes.length - 1"
                                                        class="text-slate-400">
                                                        /
                                                    </span>
                                                </template>
                                            </div>

                                            <span
                                                v-if="node.isCurrent"
                                                class="inline-flex items-center rounded-full border border-crh-blue/20 bg-white/80 px-2.5 py-1 text-xs font-medium text-crh-blue">
                                                当前车次
                                            </span>
                                        </div>

                                        <div class="mt-3 grid gap-3 sm:grid-cols-2">
                                            <div class="rounded-[0.9rem] border border-slate-200/80 bg-white/70 px-3 py-3">
                                                <p class="text-[11px] uppercase tracking-[0.16em] text-slate-400">始发 / 终到</p>
                                                <p class="mt-1 text-sm font-medium text-crh-grey-dark">
                                                    <LookupStationLink
                                                        :station-name="node.startStation"
                                                        :focus-train-codes="resolveCirculationNodeFocusTrainCodes(node)"
                                                        fallback-text="--" />
                                                    <span class="mx-1">-></span>
                                                    <LookupStationLink
                                                        :station-name="node.endStation"
                                                        :focus-train-codes="resolveCirculationNodeFocusTrainCodes(node)"
                                                        fallback-text="--" />
                                                </p>
                                            </div>

                                            <div class="rounded-[0.9rem] border border-slate-200/80 bg-white/70 px-3 py-3">
                                                <p class="text-[11px] uppercase tracking-[0.16em] text-slate-400">始发时间 / 终到时间</p>
                                                <p class="mt-1 font-mono text-sm text-slate-500">
                                                    {{ formatCirculationOffsetTime(node.startAt) }}
                                                    <span class="mx-1">-></span>
                                                    {{ formatCirculationOffsetTime(node.endAt) }}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="space-y-2.5 md:hidden">
                                <div
                                    v-for="(node, index) in circulationNodes"
                                    :key="`mobile:${node.key}`"
                                    class="flex gap-3">
                                    <div class="flex w-7 shrink-0 flex-col items-center">
                                        <span
                                            :class="[
                                                'inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition',
                                                node.isCurrent
                                                    ? 'border-crh-blue bg-crh-blue text-white shadow-[0_6px_16px_-10px_rgba(0,82,155,0.85)]'
                                                    : 'border-slate-200 bg-white text-slate-500'
                                            ]">
                                            {{ index + 1 }}
                                        </span>
                                        <span
                                            v-if="index + 1 < circulationNodes.length"
                                            :class="[
                                                'mt-2 min-h-6 w-px flex-1',
                                                node.isCurrent ? 'bg-crh-blue/30' : 'bg-slate-200'
                                            ]"
                                            aria-hidden="true" />
                                    </div>

                                    <UiCard
                                        :show-accent-bar="false"
                                        variant="subtle"
                                        :class="[
                                            'min-w-0 flex-1',
                                            node.isCurrent
                                                ? 'border-crh-blue/20 bg-blue-50/60 shadow-[0_14px_30px_-24px_rgba(0,82,155,0.55)]'
                                                : ''
                                        ]">
                                        <div class="space-y-3">
                                            <div class="flex items-start justify-between gap-3">
                                                <div class="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-sm font-semibold text-crh-blue">
                                                    <template
                                                        v-for="(code, codeIndex) in node.allCodes"
                                                        :key="`${node.key}:${code}`">
                                                        <span v-if="isCurrentCirculationCode(code)">
                                                            {{ code }}
                                                        </span>
                                                        <NuxtLink
                                                            v-else
                                                            :to="buildCirculationCodeLink(code)"
                                                            class="transition hover:underline">
                                                            {{ code }}
                                                        </NuxtLink>
                                                        <span
                                                            v-if="codeIndex < node.allCodes.length - 1"
                                                            class="text-slate-400">
                                                            /
                                                        </span>
                                                    </template>
                                                </div>

                                                <span
                                                    v-if="node.isCurrent"
                                                    class="inline-flex items-center rounded-full border border-crh-blue/20 bg-white px-2.5 py-1 text-xs font-medium text-crh-blue">
                                                    当前车次
                                                </span>
                                            </div>

                                            <div
                                                :class="[
                                                    'rounded-[1rem] border bg-white/90 px-4 py-3',
                                                    node.isCurrent
                                                        ? 'border-crh-blue/20'
                                                        : 'border-slate-200'
                                                ]">
                                                <div class="grid grid-cols-2 gap-3">
                                                    <div class="min-w-0">
                                                        <p class="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">始发站</p>
                                                        <p class="mt-1 truncate text-sm font-medium text-crh-grey-dark">
                                                            <LookupStationLink
                                                                :station-name="node.startStation"
                                                                :focus-train-codes="resolveCirculationNodeFocusTrainCodes(node)"
                                                                fallback-text="--" />
                                                        </p>
                                                    </div>

                                                    <div class="min-w-0 text-right">
                                                        <p class="text-[11px] uppercase tracking-[0.18em] text-slate-400">终到站</p>
                                                        <p class="mt-1 truncate text-sm font-medium text-crh-grey-dark">
                                                            <LookupStationLink
                                                                :station-name="node.endStation"
                                                                :focus-train-codes="resolveCirculationNodeFocusTrainCodes(node)"
                                                                fallback-text="--" />
                                                        </p>
                                                    </div>
                                                </div>

                                                <div class="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
                                                    <div class="min-w-0">
                                                        <p class="text-[11px] uppercase tracking-[0.18em] text-slate-400">始发时间</p>
                                                        <p class="mt-1 font-mono text-sm text-slate-500">
                                                            {{ formatCirculationOffsetTime(node.startAt) }}
                                                        </p>
                                                    </div>

                                                    <div class="min-w-0 text-right">
                                                        <p class="text-[11px] uppercase tracking-[0.18em] text-slate-400">终到时间</p>
                                                        <p class="mt-1 font-mono text-sm text-slate-500">
                                                            {{ formatCirculationOffsetTime(node.endAt) }}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </UiCard>
                                </div>
                            </div>
                        </div>
                    </Transition>

                </div>
            </UiCard>

            <div
                v-if="shouldShowCirculationSection"
                class="order-3 motion-divider" />
        </div>
    </UiModal>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import type {
    CurrentTrainTimetableData,
    HistoricalTimetableData,
    TrainTimetableHistoryListResponse
} from '~/types/lookup';
import type { TrackerApiResponse } from '~/types/homepage';
import useTrackedRequestFetch, {
    type TrackedRequestFetch
} from '~/composables/useTrackedRequestFetch';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import { buildLookupPath } from '~/utils/lookup/lookupTarget';
import formatShanghaiDateString from '~/utils/time/formatShanghaiDateString';

const DAY_SECONDS = 24 * 60 * 60;
const TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
});

const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
});
const SECTION_STATE_STORAGE_KEY =
    'opencrhtracker:lookup-current-timetable-modal-sections';
const timetableSectionId = 'lookup-current-timetable-section';
const circulationSectionId = 'lookup-current-circulation-section';
const HISTORY_LIST_LIMIT = 200;

type ViewState = 'loading' | 'error' | 'empty' | 'success';
type TimetableSourceKey = 'current' | `history:${number}`;
type HistoricalTimetableStopItem = HistoricalTimetableData['stops'][number];

interface DisplayTimetableStop {
    stationNo: number;
    stationName: string;
    stationTrainCode: string;
    arriveAt: number | null;
    departAt: number | null;
    wicket: string | null;
}

interface PersistedSectionState {
    timetableExpanded: boolean;
    circulationExpanded: boolean;
}

interface DisplayCirculationNode {
    key: string;
    allCodes: string[];
    startStation: string;
    endStation: string;
    startAt: number;
    endAt: number;
    isCurrent: boolean;
}

interface TimetableSourceOption {
    value: TimetableSourceKey;
    label: string;
}

interface HistoricalTimetableOption {
    sourceKey: TimetableSourceKey;
    historyId: number;
    serviceDateStart: string;
    serviceDateEndExclusive: string;
    isCurrent: boolean;
}

interface DisplayTimetableData {
    allCodes: string[];
    startStation: string;
    endStation: string;
    stops: DisplayTimetableStop[];
    updatedAt: number | null;
    circulation: CurrentTrainTimetableData['circulation'];
    bureauName: string;
    trainDepartment: string;
    passengerDepartment: string;
    internalCode: string;
    requestTrainCode: string;
    isHistorical: boolean;
}

const historyContentCache = shallowRef(new Map<number, HistoricalTimetableData | null>());
const historyContentRequestCache = new Map<number, Promise<HistoricalTimetableData | null>>();

const props = defineProps<{
    modelValue: boolean;
    trainCode: string;
    displayCodes?: string[];
}>();

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
}>();

const requestFetch: TrackedRequestFetch = import.meta.server
    ? useTrackedRequestFetch()
    : ($fetch as TrackedRequestFetch);

const { state, timetable, errorMessage, normalizedTrainCode } = useCurrentTrainTimetable(
    computed(() => props.trainCode),
    computed(() => props.modelValue)
);

const columns = ['站序', '车次', '站名', '到点', '开点', '检票口'];
const historyColumns = ['站序', '车次', '站名', '到点', '开点'];
const isTimetableExpanded = ref(true);
const isCirculationExpanded = ref(true);
const historyLoadingState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const historyErrorMessage = ref('');
const historyItems = ref<HistoricalTimetableOption[]>([]);
const selectedTimetableSourceKey = ref<TimetableSourceKey>('current');
const historyContentState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const historyContentErrorMessage = ref('');
let historyListRequestToken = 0;
let historyContentRequestToken = 0;

const isCurrentView = computed(() => selectedTimetableSourceKey.value === 'current');
const isCurrentTimetableAvailable = computed(() => timetable.value !== null);
const shouldShowCirculationSection = computed(() => {
    return isCurrentTimetableAvailable.value && circulationNodes.value.length > 0;
});

const latestHistoricalCoverage = computed(
    () => historyItems.value[0] ?? null
);

const selectedHistoricalItem = computed(() => {
    if (isCurrentView.value) {
        return null;
    }

    return (
        historyItems.value.find((item) => item.sourceKey === selectedTimetableSourceKey.value) ??
        null
    );
});

const selectedHistoricalContent = computed(() => {
    const selected = selectedHistoricalItem.value;
    if (!selected) {
        return null;
    }

    return historyContentCache.value.get(selected.historyId) ?? null;
});

const currentTimetableOptionLabel = computed(() => {
    const latestCoverage = latestHistoricalCoverage.value;
    if (!latestCoverage) {
        return '当前时刻表';
    }

    const startLabel = formatServiceDateLabel(latestCoverage.serviceDateStart);
    return startLabel.length > 0 ? `${startLabel}起` : '当前时刻表';
});

const historyTimetableOptions = computed<TimetableSourceOption[]>(() => {
    const options: TimetableSourceOption[] = [];

    if (isCurrentTimetableAvailable.value) {
        options.push({ value: 'current', label: currentTimetableOptionLabel.value });
    }

    const historicalItems = isCurrentTimetableAvailable.value
        ? historyItems.value.slice(1)
        : historyItems.value;

    for (const item of historicalItems) {
        options.push({ value: item.sourceKey, label: formatHistoryOptionLabel(item) });
    }

    return options;
});

const displayedTimetable = computed<DisplayTimetableData | null>(() => {
    if (isCurrentView.value) {
        if (!timetable.value) {
            return null;
        }

        return {
            allCodes: [...timetable.value.allCodes],
            startStation: timetable.value.startStation,
            endStation: timetable.value.endStation,
            stops: timetable.value.stops.map((stop) => ({
                stationNo: stop.stationNo,
                stationName: stop.stationName,
                stationTrainCode: stop.stationTrainCode,
                arriveAt: stop.arriveAt,
                departAt: stop.departAt,
                wicket: stop.wicket
            })),
            updatedAt: timetable.value.updatedAt,
            circulation: timetable.value.circulation,
            bureauName: timetable.value.bureauName,
            trainDepartment: timetable.value.trainDepartment,
            passengerDepartment: timetable.value.passengerDepartment,
            internalCode: timetable.value.internalCode,
            requestTrainCode: timetable.value.requestTrainCode,
            isHistorical: false
        };
    }

    if (!selectedHistoricalItem.value) {
        return null;
    }

    const historicalTimetable = selectedHistoricalContent.value;
    if (!historicalTimetable) {
        return null;
    }

    return {
        allCodes: [props.trainCode],
        startStation: historicalTimetable.startStation ?? '--',
        endStation: historicalTimetable.endStation ?? '--',
        stops: historicalTimetable.stops.map((stop) => ({
            stationNo: stop.stationNo,
            stationName: stop.stationName,
            stationTrainCode: stop.stationTrainCode,
            arriveAt: stop.arriveOffset,
            departAt: stop.departOffset,
            wicket: null
        })),
        updatedAt: null,
        circulation: null,
        bureauName: '',
        trainDepartment: '',
        passengerDepartment: '',
        internalCode: '',
        requestTrainCode: props.trainCode,
        isHistorical: true
    };
});

const modalTitle = computed(() => {
    if (displayedTimetable.value) {
        return displayedTimetable.value.allCodes.join(' / ');
    }

    if (Array.isArray(props.displayCodes) && props.displayCodes.length > 0) {
        return props.displayCodes.join(' / ');
    }

    return props.trainCode || '当前时刻表';
});

const timetableNotice = computed(() => {
    const displayCode = displayedTimetable.value?.allCodes[0] ?? props.displayCodes?.[0] ?? props.trainCode;
    const updatedDateLabel = getUpdatedDateLabel(displayedTimetable.value?.updatedAt ?? null);

    if (updatedDateLabel.length === 0) {
        return `当前展示的是 ${displayCode} 次列车时刻表数据，仅供参考`;
    }

    return `当前展示的是${updatedDateLabel} ${displayCode} 次列车时刻表数据，仅供参考`;
});

const timetableFocusTrainCodes = computed(() => {
    return normalizeTrainCodes([
        ...(displayedTimetable.value?.allCodes ?? []),
        ...(props.displayCodes ?? []),
        props.trainCode
    ]);
});

const circulation = computed(() => (isCurrentView.value ? timetable.value?.circulation ?? null : null));

const currentCirculationTrainCodeSet = computed(() => {
    if (!isCurrentView.value) {
        return new Set<string>();
    }

    return new Set(
        normalizeTrainCodes([
            ...(timetable.value?.allCodes ?? []),
            timetable.value?.requestTrainCode ?? '',
            ...(props.displayCodes ?? []),
            props.trainCode
        ])
    );
});

const currentCirculationNodeIndex = computed(() => {
    const currentCirculation = circulation.value;
    if (!currentCirculation) {
        return -1;
    }

    const normalizedInternalCode = normalizeComparableCode(timetable.value?.internalCode);
    if (normalizedInternalCode.length > 0) {
        const nodeIndex = currentCirculation.nodes.findIndex(
            (node) => normalizeComparableCode(node.internalCode) === normalizedInternalCode
        );
        if (nodeIndex >= 0) {
            return nodeIndex;
        }
    }

    return currentCirculation.nodes.findIndex((node) =>
        node.allCodes.some((code) =>
            currentCirculationTrainCodeSet.value.has(normalizeComparableCode(code))
        )
    );
});

const circulationNodes = computed<DisplayCirculationNode[]>(() => {
    const currentCirculation = circulation.value;
    if (!currentCirculation) {
        return [];
    }

    return currentCirculation.nodes.map((node, index) => ({
        key: normalizeComparableCode(node.internalCode) || `node:${index}`,
        allCodes: [...node.allCodes],
        startStation: node.startStation,
        endStation: node.endStation,
        startAt: node.startAt,
        endAt: node.endAt,
        isCurrent: index === currentCirculationNodeIndex.value
    }));
});

const timetableSummaryLabel = computed(() => {
    return `${displayedTimetable.value?.stops.length ?? 0} 站`;
});

const circulationSummaryLabel = computed(() => {
    return `${circulationNodes.value.length} 段交路`;
});

const circulationNotice = computed(() => {
    return circulation.value?.source === 'inferred' ? '当前交路表结果由计算推测得到，仅供参考' : '';
});

const responsibilitySummary = computed(() => {
    if (!isCurrentView.value) {
        return '';
    }

    const bureauName = timetable.value?.bureauName.trim() ?? '';
    if (bureauName.length === 0) {
        return '';
    }

    const trainDepartment = timetable.value?.trainDepartment.trim() ?? '';
    const passengerDepartment = timetable.value?.passengerDepartment.trim() ?? '';
    const leadingText = [bureauName, trainDepartment]
        .filter((part) => part.length > 0)
        .join(', ');

    if (passengerDepartment.length === 0) {
        return leadingText;
    }

    return `${leadingText}, ${passengerDepartment}`;
});

const visibleColumns = computed(() => (isCurrentView.value ? columns : historyColumns));

const viewState = computed<ViewState>(() => {
    if (displayedTimetable.value) {
        return 'success';
    }

    if (isCurrentView.value) {
        if (state.value === 'loading' || historyLoadingState.value === 'loading') {
            return 'loading';
        }

        if (state.value === 'error') {
            return 'error';
        }

        if (historyLoadingState.value === 'error' && historyItems.value.length === 0) {
            return 'error';
        }

        if (state.value === 'empty' && historyItems.value.length === 0) {
            return 'empty';
        }

        return 'loading';
    }

    if (historyLoadingState.value === 'loading' || historyContentState.value === 'loading') {
        return 'loading';
    }

    if (historyContentState.value === 'error') {
        return 'error';
    }

    if (historyLoadingState.value === 'error' && historyItems.value.length === 0) {
        return 'error';
    }

    if (historyItems.value.length === 0) {
        return 'empty';
    }

    if (!selectedHistoricalItem.value) {
        return 'loading';
    }

    return 'loading';
});

const errorTitle = computed(() => (isCurrentView.value ? '当前时刻表暂时不可用' : '历史时刻表暂时不可用'));
const emptyTitle = computed(() => (isCurrentView.value ? '当前暂无时刻表' : '当前暂无历史时刻表'));
const emptyDescription = computed(() =>
    isCurrentView.value ? '该车次今天没有可用的完整经停表。' : '该车次没有可用的历史时刻表数据。'
);

function normalizeComparableCode(code: string | null | undefined) {
    return typeof code === 'string' ? code.trim().toUpperCase() : '';
}

function normalizeTrainCodes(codes: string[]) {
    return Array.from(
        new Set(
            codes
                .map((code) => normalizeComparableCode(code))
                .filter((code) => code.length > 0)
        )
    );
}

function resolveStopFocusTrainCodes(stop: DisplayTimetableStop) {
    return normalizeTrainCodes([stop.stationTrainCode, ...timetableFocusTrainCodes.value]);
}

function resolveCirculationNodeFocusTrainCodes(node: DisplayCirculationNode) {
    return normalizeTrainCodes([...node.allCodes, ...timetableFocusTrainCodes.value]);
}

function isCurrentCirculationCode(code: string) {
    return currentCirculationTrainCodeSet.value.has(normalizeComparableCode(code));
}

function buildCirculationCodeLink(code: string) {
    return buildLookupPath({
        type: 'train',
        code: normalizeComparableCode(code)
    });
}

function formatNullableTime(timestamp: number | null) {
    if (timestamp === null || !Number.isFinite(timestamp)) {
        return '--';
    }

    return formatTime(timestamp);
}

function formatStopTime(value: number | null) {
    if (displayedTimetable.value?.isHistorical) {
        return formatCirculationOffsetTime(value ?? -1);
    }

    return formatNullableTime(value);
}

function formatTime(timestamp: number) {
    return TIME_FORMATTER.format(new Date(timestamp * 1000));
}

function formatCirculationOffsetTime(offsetSeconds: number) {
    if (!Number.isFinite(offsetSeconds) || offsetSeconds < 0) {
        return '--';
    }

    const normalizedOffset = Math.floor(offsetSeconds);
    const secondsOfDay = normalizedOffset % DAY_SECONDS;
    const hours = Math.floor(secondsOfDay / 3600)
        .toString()
        .padStart(2, '0');
    const minutes = Math.floor((secondsOfDay % 3600) / 60)
        .toString()
        .padStart(2, '0');

    return `${hours}:${minutes}`;
}

function formatCalendarDateLabel(timestamp: number) {
    const parts = DATE_LABEL_FORMATTER.formatToParts(new Date(timestamp * 1000));
    const year = parts.find((part) => part.type === 'year')?.value ?? '';
    const month = parts.find((part) => part.type === 'month')?.value ?? '';
    const day = parts.find((part) => part.type === 'day')?.value ?? '';

    if (year.length === 0 || month.length === 0 || day.length === 0) {
        return '';
    }

    return `${year} 年 ${month} 月 ${day} 日`;
}

function getUpdatedDateLabel(updatedAt: number | null) {
    if (updatedAt === null || !Number.isFinite(updatedAt) || updatedAt <= 0) {
        return '';
    }

    const todayTimestamp = Math.floor(Date.now() / 1000);
    const updatedDateKey = formatShanghaiDateString(updatedAt);
    if (updatedDateKey.length === 0) {
        return '';
    }

    if (updatedDateKey === formatShanghaiDateString(todayTimestamp)) {
        return '今日';
    }

    if (updatedDateKey === formatShanghaiDateString(todayTimestamp - 24 * 60 * 60)) {
        return '昨日';
    }

    return formatCalendarDateLabel(updatedAt);
}

function formatServiceDateLabel(serviceDate: string) {
    if (!/^\d{8}$/.test(serviceDate)) {
        return '';
    }

    const month = Number(serviceDate.slice(4, 6));
    const day = Number(serviceDate.slice(6, 8));
    if (!Number.isInteger(month) || !Number.isInteger(day)) {
        return '';
    }

    return `${month} 月 ${day} 日`;
}

function formatHistoryOptionLabel(item: HistoricalTimetableOption) {
    const startLabel = formatServiceDateLabel(item.serviceDateStart);
    return startLabel.length > 0 ? `${startLabel}起` : '';
}

function setHistoryContentCacheValue(historyId: number, value: HistoricalTimetableData | null) {
    const nextCache = new Map(historyContentCache.value);
    nextCache.set(historyId, value);
    historyContentCache.value = nextCache;
}

function resetHistoryViewState() {
    historyLoadingState.value = 'idle';
    historyErrorMessage.value = '';
    historyItems.value = [];
    selectedTimetableSourceKey.value = 'current';
    historyContentState.value = 'idle';
    historyContentErrorMessage.value = '';
}

async function fetchHistoricalTimetableList() {
    if (historyLoadingState.value === 'loading') {
        return;
    }

    if (normalizedTrainCode.value.length === 0) {
        resetHistoryViewState();
        return;
    }

    const requestToken = ++historyListRequestToken;
    const requestTrainCode = normalizedTrainCode.value;
    historyLoadingState.value = 'loading';
    historyErrorMessage.value = '';
    historyItems.value = [];
    historyContentState.value = 'idle';
    historyContentErrorMessage.value = '';
    selectedTimetableSourceKey.value = 'current';

    try {
        const items: TrainTimetableHistoryListResponse['items'] = [];
        let cursor = '';

        while (true) {
            const response = await requestFetch<TrackerApiResponse<TrainTimetableHistoryListResponse>>(
                `/api/v1/timetable/train/${encodeURIComponent(normalizedTrainCode.value)}/history`,
                {
                    query: {
                        cursor: cursor.length > 0 ? cursor : undefined,
                        limit: HISTORY_LIST_LIMIT
                    }
                }
            );

            if (
                requestToken !== historyListRequestToken ||
                requestTrainCode !== normalizedTrainCode.value
            ) {
                return;
            }

            if (!response.ok) {
                throw new Error(response.data);
            }

            items.push(...response.data.items);
            cursor = response.data.nextCursor;
            if (cursor.length === 0) {
                break;
            }
        }

        if (
            requestToken !== historyListRequestToken ||
            requestTrainCode !== normalizedTrainCode.value
        ) {
            return;
        }

        historyItems.value = items.map((item) => ({
            sourceKey: `history:${item.historyId}` as TimetableSourceKey,
            historyId: item.historyId,
            serviceDateStart: item.serviceDateStart,
            serviceDateEndExclusive: item.serviceDateEndExclusive,
            isCurrent: false
        }));

        historyLoadingState.value = 'ready';
    } catch (error) {
        if (
            requestToken !== historyListRequestToken ||
            requestTrainCode !== normalizedTrainCode.value
        ) {
            return;
        }

        historyLoadingState.value = 'error';
        historyErrorMessage.value = getApiErrorMessage(error, '历史时刻表加载失败，请稍后重试。');
    }
}

async function fetchHistoricalTimetableContent(historyId: number) {
    const cached = historyContentCache.value.get(historyId);
    if (cached !== undefined) {
        historyContentState.value = cached ? 'ready' : 'error';
        historyContentErrorMessage.value = cached
            ? ''
            : '历史时刻表加载失败，请稍后重试。';
        return cached;
    }

    const pending = historyContentRequestCache.get(historyId);
    if (pending) {
        return pending;
    }

    const requestToken = ++historyContentRequestToken;
    const requestTrainCode = normalizedTrainCode.value;

    const request = requestFetch<TrackerApiResponse<HistoricalTimetableData>>(
        `/api/v1/timetable/train/${encodeURIComponent(normalizedTrainCode.value)}/history/${encodeURIComponent(String(historyId))}`
    )
        .then((response) => {
            if (
                requestToken !== historyContentRequestToken ||
                requestTrainCode !== normalizedTrainCode.value
            ) {
                return null;
            }

            if (!response.ok) {
                setHistoryContentCacheValue(historyId, null);
                historyContentState.value = 'error';
                historyContentErrorMessage.value = '历史时刻表加载失败，请稍后重试。';
                return null;
            }

            setHistoryContentCacheValue(historyId, response.data);
            historyContentState.value = 'ready';
            historyContentErrorMessage.value = '';
            return response.data;
        })
        .catch(() => {
            if (
                requestToken !== historyContentRequestToken ||
                requestTrainCode !== normalizedTrainCode.value
            ) {
                return null;
            }

            setHistoryContentCacheValue(historyId, null);
            historyContentState.value = 'error';
            historyContentErrorMessage.value = '历史时刻表加载失败，请稍后重试。';
            return null;
        })
        .finally(() => {
            historyContentRequestCache.delete(historyId);
        });

    historyContentState.value = 'loading';
    historyContentErrorMessage.value = '';
    historyContentRequestCache.set(historyId, request);
    return request;
}

function readPersistedSectionState(): PersistedSectionState {
    if (!import.meta.client) {
        return {
            timetableExpanded: true,
            circulationExpanded: true
        };
    }

    try {
        const rawValue = window.localStorage.getItem(SECTION_STATE_STORAGE_KEY);
        if (!rawValue) {
            return {
                timetableExpanded: true,
                circulationExpanded: true
            };
        }

        const parsed = JSON.parse(rawValue);
        if (typeof parsed !== 'object' || parsed === null) {
            return {
                timetableExpanded: true,
                circulationExpanded: true
            };
        }

        return {
            timetableExpanded:
                typeof parsed.timetableExpanded === 'boolean' ? parsed.timetableExpanded : true,
            circulationExpanded:
                typeof parsed.circulationExpanded === 'boolean' ? parsed.circulationExpanded : true
        };
    } catch {
        return {
            timetableExpanded: true,
            circulationExpanded: true
        };
    }
}

function persistSectionState() {
    if (!import.meta.client) {
        return;
    }

    try {
        window.localStorage.setItem(
            SECTION_STATE_STORAGE_KEY,
            JSON.stringify({
                timetableExpanded: isTimetableExpanded.value,
                circulationExpanded: isCirculationExpanded.value
            } satisfies PersistedSectionState)
        );
    } catch {
        // Keep the current in-memory state even if storage is unavailable.
    }
}

function toggleTimetableExpanded() {
    isTimetableExpanded.value = !isTimetableExpanded.value;
    persistSectionState();
}

function toggleCirculationExpanded() {
    isCirculationExpanded.value = !isCirculationExpanded.value;
    persistSectionState();
}

function ensureHistoricalContentLoaded() {
    if (isCurrentView.value || !props.modelValue) {
        return;
    }

    const selected = selectedHistoricalItem.value;
    if (!selected) {
        return;
    }

    void fetchHistoricalTimetableContent(selected.historyId);
}

function syncSelectionWithData() {
    if (isCurrentTimetableAvailable.value) {
        selectedTimetableSourceKey.value = 'current';
        return;
    }

    if (state.value !== 'empty' || historyItems.value.length === 0) {
        return;
    }

    const selectedExists = historyItems.value.some(
        (item) => item.sourceKey === selectedTimetableSourceKey.value
    );
    if (!selectedExists || selectedTimetableSourceKey.value === 'current') {
        selectedTimetableSourceKey.value = historyItems.value[0]!.sourceKey;
    }
}

watch(
    [
        () => props.modelValue,
        () => normalizedTrainCode.value
    ],
    async ([isOpen, trainCode], [previousOpen, previousTrainCode]) => {
        if (!isOpen) {
            return;
        }

        if (trainCode.length === 0) {
            resetHistoryViewState();
            return;
        }

        if (isOpen && (!previousOpen || previousTrainCode !== trainCode)) {
            resetHistoryViewState();
            await fetchHistoricalTimetableList();
        }
    },
    { immediate: true }
);

watch(
    [() => state.value, () => timetable.value, () => historyItems.value, () => historyLoadingState.value],
    async () => {
        syncSelectionWithData();
        ensureHistoricalContentLoaded();
    },
    { immediate: true, deep: true }
);

watch(
    () => selectedTimetableSourceKey.value,
    () => {
        if (selectedTimetableSourceKey.value !== 'current') {
            historyContentState.value = 'idle';
            historyContentErrorMessage.value = '';
        } else {
            historyContentState.value = 'idle';
            historyContentErrorMessage.value = '';
        }
        ensureHistoricalContentLoaded();
    }
);

onMounted(() => {
    const persistedState = readPersistedSectionState();
    isTimetableExpanded.value = persistedState.timetableExpanded;
    isCirculationExpanded.value = persistedState.circulationExpanded;

    if (props.modelValue && normalizedTrainCode.value.length > 0) {
        void fetchHistoricalTimetableList();
    }
});
</script>
