<template>
    <UiModal
        :model-value="props.modelValue"
        eyebrow="TIMETABLE"
        :title="modalTitle"
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
            class="flex flex-col gap-5">
            <div class="order-2 space-y-5">
                <div class="motion-divider" />

                <div
                    v-if="timetableNotice"
                    class="rounded-[1rem] border border-slate-200 bg-white/80 px-4 py-3">
                    <p
                        class="text-xs tracking-[0.16em] text-slate-400">
                        时刻表
                    </p>
                    <p class="mt-2 text-sm leading-6 text-crh-grey-dark">
                        {{ timetableNotice }}
                    </p>
                </div>
            </div>

            <div class="order-3 grid gap-3 sm:grid-cols-2">
                <UiCard
                    :show-accent-bar="false"
                    variant="subtle">
                    <p
                        class="text-xs uppercase tracking-[0.16em] text-slate-400">
                        车次
                    </p>
                    <p
                        class="mt-2 font-mono text-sm font-semibold text-crh-blue">
                        {{ timetable.allCodes.join(' / ') }}
                    </p>
                </UiCard>

                <UiCard
                    :show-accent-bar="false"
                    variant="subtle">
                    <p
                        class="text-xs uppercase tracking-[0.16em] text-slate-400">
                        始发 / 终到
                    </p>
                    <p class="mt-2 text-sm font-medium text-crh-grey-dark">
                        <LookupStationLink
                            :station-name="timetable.startStation"
                            :focus-train-codes="timetableFocusTrainCodes"
                            fallback-text="--" />
                        <span class="mx-1">-></span>
                        <LookupStationLink
                            :station-name="timetable.endStation"
                            :focus-train-codes="timetableFocusTrainCodes"
                            fallback-text="--" />
                    </p>
                </UiCard>

                <UiCard
                    v-if="responsibilitySummary"
                    :show-accent-bar="false"
                    variant="subtle"
                    class="sm:col-span-2">
                    <p
                        class="text-xs uppercase tracking-[0.16em] text-slate-400">
                        担当
                    </p>
                    <p class="mt-2 text-sm font-medium text-crh-grey-dark">
                        {{ responsibilitySummary }}
                    </p>
                </UiCard>
            </div>

            <div
                class="order-4 hidden overflow-hidden rounded-[1.25rem] border border-slate-200 md:block">
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
                            v-for="stop in timetable.stops"
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
                                {{ formatNullableTime(stop.arriveAt) }}
                            </td>
                            <td
                                class="border-b border-slate-100 px-4 py-3 font-mono text-sm text-slate-500 last:border-b-0">
                                {{ formatNullableTime(stop.departAt) }}
                            </td>
                            <td
                                class="border-b border-slate-100 px-4 py-3 text-sm text-slate-500 last:border-b-0">
                                {{ stop.wicket || '--' }}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="order-5 space-y-2.5 md:hidden">
                <UiCard
                    v-for="stop in timetable.stops"
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
                                <p
                                    class="mt-1 font-mono text-sm text-slate-500">
                                    {{ formatNullableTime(stop.arriveAt) }}
                                </p>
                            </div>
                            <div>
                                <p
                                    class="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                    开点
                                </p>
                                <p
                                    class="mt-1 font-mono text-sm text-slate-500">
                                    {{ formatNullableTime(stop.departAt) }}
                                </p>
                            </div>
                            <div>
                                <p
                                    class="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                    车次
                                </p>
                                <p
                                    class="mt-1 font-mono text-sm text-slate-500">
                                    {{ stop.stationTrainCode || '--' }}
                                </p>
                            </div>
                            <div>
                                <p
                                    class="text-[11px] uppercase tracking-[0.16em] text-slate-400">
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

            <UiCard
                class="order-1"
                :show-accent-bar="false"
                variant="subtle">
                <div class="space-y-4">
                    <p
                        class="text-xs uppercase tracking-[0.16em] text-slate-400">
                        交路表
                    </p>

                    <div
                        v-if="circulationNodes.length > 0"
                        class="hidden space-y-3 md:block">
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
                                        node.isCurrent
                                            ? 'bg-crh-blue/30'
                                            : 'bg-slate-200'
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
                                <div
                                    class="flex flex-wrap items-start justify-between gap-3">
                                    <div
                                        class="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-sm font-semibold">
                                        <template
                                            v-for="(code, codeIndex) in node.allCodes"
                                            :key="`${node.key}:desktop:${code}`">
                                            <span
                                                v-if="isCurrentCirculationCode(code)"
                                                :class="
                                                    node.isCurrent
                                                        ? 'text-crh-blue'
                                                        : 'text-crh-grey-dark'
                                                ">
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
                                    <div
                                        class="rounded-[0.9rem] border border-slate-200/80 bg-white/70 px-3 py-3">
                                        <p
                                            class="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                            始发 / 终到
                                        </p>
                                        <p class="mt-1 text-sm font-medium text-crh-grey-dark">
                                            <LookupStationLink
                                                :station-name="node.startStation"
                                                :focus-train-codes="
                                                    resolveCirculationNodeFocusTrainCodes(
                                                        node
                                                    )
                                                "
                                                fallback-text="--" />
                                            <span class="mx-1">-></span>
                                            <LookupStationLink
                                                :station-name="node.endStation"
                                                :focus-train-codes="
                                                    resolveCirculationNodeFocusTrainCodes(
                                                        node
                                                    )
                                                "
                                                fallback-text="--" />
                                        </p>
                                    </div>

                                    <div
                                        class="rounded-[0.9rem] border border-slate-200/80 bg-white/70 px-3 py-3">
                                        <p
                                            class="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                            始发时间 / 终到时间
                                        </p>
                                        <p
                                            class="mt-1 font-mono text-sm text-slate-500">
                                            {{ formatNullableTime(node.startAt) }}
                                            <span class="mx-1">-></span>
                                            {{ formatNullableTime(node.endAt) }}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div
                        v-if="circulationNodes.length > 0"
                        class="space-y-2.5 md:hidden">
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
                                        node.isCurrent
                                            ? 'bg-crh-blue/30'
                                            : 'bg-slate-200'
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
                                    <div
                                        class="flex items-start justify-between gap-3">
                                        <div
                                            class="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-sm font-semibold text-crh-blue">
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
                                                <p
                                                    class="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                                                    始发站
                                                </p>
                                                <p
                                                    class="mt-1 truncate text-sm font-medium text-crh-grey-dark">
                                                    <LookupStationLink
                                                        :station-name="node.startStation"
                                                        :focus-train-codes="
                                                            resolveCirculationNodeFocusTrainCodes(
                                                                node
                                                            )
                                                        "
                                                        fallback-text="--" />
                                                </p>
                                            </div>

                                            <div class="min-w-0 text-right">
                                                <p
                                                    class="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                                                    终到站
                                                </p>
                                                <p
                                                    class="mt-1 truncate text-sm font-medium text-crh-grey-dark">
                                                    <LookupStationLink
                                                        :station-name="node.endStation"
                                                        :focus-train-codes="
                                                            resolveCirculationNodeFocusTrainCodes(
                                                                node
                                                            )
                                                        "
                                                        fallback-text="--" />
                                                </p>
                                            </div>
                                        </div>

                                        <div
                                            class="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
                                            <div class="min-w-0">
                                                <p
                                                    class="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                                                    始发时间
                                                </p>
                                                <p
                                                    class="mt-1 font-mono text-sm text-slate-500">
                                                    {{ formatNullableTime(node.startAt) }}
                                                </p>
                                            </div>

                                            <div class="min-w-0 text-right">
                                                <p
                                                    class="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                                                    终到时间
                                                </p>
                                                <p
                                                    class="mt-1 font-mono text-sm text-slate-500">
                                                    {{ formatNullableTime(node.endAt) }}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </UiCard>
                        </div>
                    </div>

                    <div
                        v-else
                        class="rounded-[1rem] border border-dashed border-slate-200 bg-white/70 px-4 py-4 text-sm leading-6 text-slate-500">
                        暂无推断交路，后续可在交路索引更新后再查看。
                    </div>
                </div>
            </UiCard>
        </div>
    </UiModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { TrackerApiResponse } from '~/types/homepage';
import type {
    CurrentTrainTimetableData,
    CurrentTrainTimetableStop
} from '~/types/lookup';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import { buildLookupPath } from '~/utils/lookup/lookupTarget';
import formatShanghaiDateString from '~/utils/time/formatShanghaiDateString';

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

const cachedTimetables = new Map<string, CurrentTrainTimetableData>();

interface DisplayCirculationNode {
    key: string;
    allCodes: string[];
    startStation: string;
    endStation: string;
    startAt: number | null;
    endAt: number | null;
    isCurrent: boolean;
}

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

const columns = ['站序', '车次', '站名', '到点', '开点', '检票口'];

const modalTitle = computed(() => {
    if (timetable.value) {
        return timetable.value.allCodes.join(' / ');
    }

    if (Array.isArray(props.displayCodes) && props.displayCodes.length > 0) {
        return props.displayCodes.join(' / ');
    }

    return props.trainCode || '当前时刻表';
});

const timetableNotice = computed(() => {
    const displayCode =
        timetable.value?.allCodes[0] ??
        props.displayCodes?.[0] ??
        props.trainCode;
    const updatedDateLabel = getUpdatedDateLabel(
        timetable.value?.updatedAt ?? null
    );

    if (updatedDateLabel.length === 0) {
        return `当前展示的是 ${displayCode} 次列车时刻表数据，仅供参考`;
    }

    return `当前展示的是${updatedDateLabel} ${displayCode} 次列车时刻表数据，仅供参考`;
});

const timetableFocusTrainCodes = computed(() => {
    return normalizeTrainCodes([
        ...(timetable.value?.allCodes ?? []),
        ...(props.displayCodes ?? []),
        props.trainCode
    ]);
});

const inferredCirculation = computed(() => timetable.value?.inferredCirculation ?? null);

const currentCirculationTrainCodeSet = computed(() => {
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
    const circulation = inferredCirculation.value;
    if (!circulation) {
        return -1;
    }

    const normalizedInternalCode = normalizeComparableCode(
        timetable.value?.internalCode
    );
    if (normalizedInternalCode.length > 0) {
        const nodeIndex = circulation.nodes.findIndex(
            (node) =>
                normalizeComparableCode(node.internalCode) ===
                normalizedInternalCode
        );
        if (nodeIndex >= 0) {
            return nodeIndex;
        }
    }

    return circulation.nodes.findIndex((node) =>
        node.allCodes.some((code) =>
            currentCirculationTrainCodeSet.value.has(
                normalizeComparableCode(code)
            )
        )
    );
});

const circulationNodes = computed<DisplayCirculationNode[]>(() => {
    const circulation = inferredCirculation.value;
    if (!circulation) {
        return [];
    }

    return circulation.nodes.map((node, index) => ({
        key:
            normalizeComparableCode(node.internalCode) ||
            node.allCodes.join('/') ||
            `node:${index}`,
        allCodes: [...node.allCodes],
        startStation: node.startStation,
        endStation: node.endStation,
        startAt: node.startAt,
        endAt: node.endAt,
        isCurrent: index === currentCirculationNodeIndex.value
    }));
});

const responsibilitySummary = computed(() => {
    const bureauName = timetable.value?.bureauName.trim() ?? '';
    if (bureauName.length === 0) {
        return '';
    }

    const trainDepartment = timetable.value?.trainDepartment.trim() ?? '';
    const passengerDepartment =
        timetable.value?.passengerDepartment.trim() ?? '';
    const leadingText = [bureauName, trainDepartment]
        .filter((part) => part.length > 0)
        .join('，');

    if (passengerDepartment.length === 0) {
        return leadingText;
    }

    return `${leadingText}，${passengerDepartment}`;
});

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

function resolveStopFocusTrainCodes(stop: CurrentTrainTimetableStop) {
    return normalizeTrainCodes([
        stop.stationTrainCode,
        ...timetableFocusTrainCodes.value
    ]);
}

function resolveCirculationNodeFocusTrainCodes(node: DisplayCirculationNode) {
    return normalizeTrainCodes([
        ...node.allCodes,
        ...timetableFocusTrainCodes.value
    ]);
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
            const response = await $fetch<
                TrackerApiResponse<CurrentTrainTimetableData>
            >(
                '/api/v1/timetable/train/' +
                    encodeURIComponent(normalizedTrainCode)
            );

            if (!response.ok) {
                throw {
                    data: response
                };
            }

            cachedTimetables.set(normalizedTrainCode, response.data);
            timetable.value = response.data;
            state.value = response.data.stops.length > 0 ? 'success' : 'empty';
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

    if (
        updatedDateKey ===
        formatShanghaiDateString(todayTimestamp - 24 * 60 * 60)
    ) {
        return '昨日';
    }

    return formatCalendarDateLabel(updatedAt);
}

function formatCalendarDateLabel(timestamp: number) {
    const parts = DATE_LABEL_FORMATTER.formatToParts(
        new Date(timestamp * 1000)
    );
    const year = parts.find((part) => part.type === 'year')?.value ?? '';
    const month = parts.find((part) => part.type === 'month')?.value ?? '';
    const day = parts.find((part) => part.type === 'day')?.value ?? '';

    if (year.length === 0 || month.length === 0 || day.length === 0) {
        return '';
    }

    return ` ${year} 年 ${month} 月 ${day} 日`;
}
</script>
