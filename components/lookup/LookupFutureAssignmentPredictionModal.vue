<template>
    <UiModal
        :model-value="props.modelValue"
        eyebrow="PREDICTION"
        :title="modalTitle"
        description="基于交路表推测，仅供参考。"
        size="lg"
        height="tall"
        @update:model-value="emit('update:modelValue', $event)">
        <div
            v-if="state === 'loading'"
            class="space-y-3">
            <div
                v-for="index in 4"
                :key="'loading:' + index"
                class="h-16 animate-pulse rounded-[1rem] border border-slate-200 bg-slate-100/80" />
        </div>

        <UiEmptyState
            v-else-if="state === 'error'"
            eyebrow="Load Failed"
            title="未来担当预测暂时不可用"
            :description="errorMessage || '请稍后重试。'"
            tone="danger" />

        <UiEmptyState
            v-else-if="state === 'empty'"
            eyebrow="No Data"
            title="当前暂无可用于预测的交路时刻表"
            description="请确认锚定车次存在当日时刻表，或车组最近有可用于定位交路的担当记录。" />

        <div
            v-else-if="timetable"
            class="flex flex-col gap-5">
            <UiEmptyState
                v-if="predictionState === 'no_circulation'"
                eyebrow="No Route"
                title="暂无可用交路推断"
                description="当前锚定车次还没有稳定的交路推断结果，暂时无法生成未来担当预测。" />

            <UiEmptyState
                v-else-if="predictionState === 'unresolved'"
                eyebrow="Unknown Position"
                :title="unresolvedTitle"
                :description="unresolvedDescription" />

            <UiEmptyState
                v-else-if="predictionState === 'no_future'"
                eyebrow="No Future"
                :title="noFutureTitle"
                :description="noFutureDescription" />

            <div
                v-else-if="isTrainSource"
                class="space-y-3">
                <div
                    v-for="(item, index) in predictedEmus"
                    :key="item.key"
                    class="flex gap-3">
                    <div class="flex w-7 shrink-0 flex-col items-center">
                        <span
                            class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-crh-blue/20 bg-blue-50 text-xs font-semibold text-crh-blue">
                            {{ index + 1 }}
                        </span>
                        <span
                            v-if="index + 1 < predictedEmus.length"
                            class="mt-2 min-h-6 w-px flex-1 bg-crh-blue/20"
                            aria-hidden="true" />
                    </div>

                    <UiCard
                        :show-accent-bar="false"
                        variant="subtle"
                        class="min-w-0 flex-1">
                        <div class="space-y-3">
                            <div
                                class="flex flex-wrap items-start justify-between gap-3">
                                <div
                                    class="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-sm font-semibold text-crh-blue">
                                    <template
                                        v-for="(
                                            emuCode, emuCodeIndex
                                        ) in item.emuCodes"
                                        :key="`${item.key}:${emuCode}`">
                                        <NuxtLink
                                            :to="
                                                buildPredictionEmuLink(emuCode)
                                            "
                                            class="transition hover:underline">
                                            {{ emuCode }}
                                        </NuxtLink>
                                        <span
                                            v-if="
                                                emuCodeIndex <
                                                item.emuCodes.length - 1
                                            "
                                            class="text-slate-400">
                                            重联
                                        </span>
                                    </template>
                                </div>

                                <div class="flex flex-wrap items-center gap-2">
                                    <span
                                        class="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500">
                                        {{
                                            formatFutureDayLabel(
                                                item.dayOffsetFromToday
                                            )
                                        }}
                                    </span>
                                    <span
                                        class="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500">
                                        {{
                                            formatPredictionDateTag(
                                                item.predictedStartAt,
                                                item.predictedEndAt
                                            )
                                        }}
                                    </span>
                                </div>
                            </div>

                            <div class="grid gap-3 sm:grid-cols-2">
                                <div
                                    class="rounded-[0.9rem] border border-slate-200/80 bg-white/80 px-3 py-3">
                                    <p
                                        class="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                        始发 / 终到
                                    </p>
                                    <p
                                        class="mt-1 text-sm font-medium text-crh-grey-dark">
                                        <LookupStationLink
                                            :station-name="item.startStation"
                                            :focus-train-codes="
                                                predictionFocusTrainCodes
                                            "
                                            fallback-text="--" />
                                        <span class="mx-1">-></span>
                                        <LookupStationLink
                                            :station-name="item.endStation"
                                            :focus-train-codes="
                                                predictionFocusTrainCodes
                                            "
                                            fallback-text="--" />
                                    </p>
                                </div>

                                <div
                                    class="rounded-[0.9rem] border border-slate-200/80 bg-white/80 px-3 py-3">
                                    <p
                                        class="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                        发车时间 / 到达时间
                                    </p>
                                    <p
                                        class="mt-1 font-mono text-sm text-slate-500">
                                        {{
                                            formatNullableTime(
                                                item.predictedStartAt
                                            )
                                        }}
                                        <span class="mx-1">-></span>
                                        {{
                                            formatNullableTime(
                                                item.predictedEndAt
                                            )
                                        }}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </UiCard>
                </div>
            </div>

            <div
                v-else
                class="space-y-3">
                <div
                    v-for="(node, index) in predictedNodes"
                    :key="node.key"
                    class="flex gap-3">
                    <div class="flex w-7 shrink-0 flex-col items-center">
                        <span
                            class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-crh-blue/20 bg-blue-50 text-xs font-semibold text-crh-blue">
                            {{ index + 1 }}
                        </span>
                        <span
                            v-if="index + 1 < predictedNodes.length"
                            class="mt-2 min-h-6 w-px flex-1 bg-crh-blue/20"
                            aria-hidden="true" />
                    </div>

                    <UiCard
                        :show-accent-bar="false"
                        variant="subtle"
                        class="min-w-0 flex-1">
                        <div class="space-y-3">
                            <div
                                class="flex flex-wrap items-start justify-between gap-3">
                                <div
                                    class="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-sm font-semibold text-crh-blue">
                                    <template
                                        v-for="(
                                            code, codeIndex
                                        ) in node.allCodes"
                                        :key="`${node.key}:${code}`">
                                        <NuxtLink
                                            :to="buildPredictionCodeLink(code)"
                                            class="transition hover:underline">
                                            {{ code }}
                                        </NuxtLink>
                                        <span
                                            v-if="
                                                codeIndex <
                                                node.allCodes.length - 1
                                            "
                                            class="text-slate-400">
                                            /
                                        </span>
                                    </template>
                                </div>

                                <div class="flex flex-wrap items-center gap-2">
                                    <span
                                        class="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500">
                                        {{
                                            formatFutureDayLabel(
                                                node.dayOffsetFromToday
                                            )
                                        }}
                                    </span>
                                    <span
                                        class="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500">
                                        {{
                                            formatPredictionDateTag(
                                                node.predictedStartAt,
                                                node.predictedEndAt
                                            )
                                        }}
                                    </span>
                                </div>
                            </div>

                            <div class="grid gap-3 sm:grid-cols-2">
                                <div
                                    class="rounded-[0.9rem] border border-slate-200/80 bg-white/80 px-3 py-3">
                                    <p
                                        class="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                        始发 / 终到
                                    </p>
                                    <p
                                        class="mt-1 text-sm font-medium text-crh-grey-dark">
                                        <LookupStationLink
                                            :station-name="node.startStation"
                                            :focus-train-codes="
                                                resolvePredictionNodeFocusTrainCodes(
                                                    node
                                                )
                                            "
                                            fallback-text="--" />
                                        <span class="mx-1">-></span>
                                        <LookupStationLink
                                            :station-name="node.endStation"
                                            :focus-train-codes="
                                                resolvePredictionNodeFocusTrainCodes(
                                                    node
                                                )
                                            "
                                            fallback-text="--" />
                                    </p>
                                </div>

                                <div
                                    class="rounded-[0.9rem] border border-slate-200/80 bg-white/80 px-3 py-3">
                                    <p
                                        class="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                        发车时间 / 到达时间
                                    </p>
                                    <p
                                        class="mt-1 font-mono text-sm text-slate-500">
                                        {{
                                            formatNullableTime(
                                                node.predictedStartAt
                                            )
                                        }}
                                        <span class="mx-1">-></span>
                                        {{
                                            formatNullableTime(
                                                node.predictedEndAt
                                            )
                                        }}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </UiCard>
                </div>
            </div>
        </div>
    </UiModal>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type {
    FutureAssignmentPredictionNode,
    FutureAssignmentPredictionSourceType
} from '~/types/lookup';
import { buildLookupPath } from '~/utils/lookup/lookupTarget';
import formatTrackerTimestamp from '~/utils/time/formatTrackerTimestamp';

const props = defineProps<{
    modelValue: boolean;
    sourceType: FutureAssignmentPredictionSourceType;
    sourceCode: string;
    anchorTrainCode: string;
    displayCodes?: string[];
}>();

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
}>();

const {
    state,
    timetable,
    errorMessage,
    predictionState,
    predictedNodes,
    predictedEmus,
    displayAnchor,
    displayAnchorNode
} = useFutureAssignmentPrediction(
    computed(() => props.sourceType),
    computed(() => props.sourceCode),
    computed(() => props.anchorTrainCode),
    computed(() => props.modelValue)
);

const isTrainSource = computed(() => props.sourceType === 'train');

const modalTitle = computed(() => {
    if (props.sourceType === 'emu') {
        return props.sourceCode
            ? `${props.sourceCode} 未来担当预测`
            : '未来担当预测';
    }

    const displayCodes =
        timetable.value?.allCodes ??
        (Array.isArray(props.displayCodes) ? props.displayCodes : []);
    const titleSuffix = isTrainSource.value
        ? '未来担当车组预测'
        : '未来担当预测';

    if (displayCodes.length > 0) {
        return `${displayCodes.join(' / ')} ${titleSuffix}`;
    }

    return props.anchorTrainCode
        ? `${props.anchorTrainCode} ${titleSuffix}`
        : titleSuffix;
});

const unresolvedTitle = computed(() => {
    return props.sourceType === 'emu' ? '无数据' : '暂时无法找到当前周期锚点';
});

const unresolvedDescription = computed(() => {
    return props.sourceType === 'emu'
        ? ''
        : '未找到交路首节点在当前周期范围内的可用历史记录，暂时无法推算这趟车在当前窗口内的未来担当车组。';
});

const noFutureTitle = computed(() => {
    return '无数据';
});

const noFutureDescription = computed(() => {
    return '';
});

const predictionFocusTrainCodes = computed(() => {
    const candidates = [
        ...(timetable.value?.allCodes ?? []),
        timetable.value?.trainCode ?? '',
        props.anchorTrainCode
    ];

    return Array.from(
        new Set(
            candidates
                .map((code) => normalizeComparableCode(code))
                .filter((code) => code.length > 0)
        )
    );
});

function buildPredictionCodeLink(code: string) {
    return buildLookupPath({
        type: 'train',
        code: normalizeComparableCode(code)
    });
}

function buildPredictionEmuLink(emuCode: string) {
    return buildLookupPath({
        type: 'emu',
        code: normalizeComparableCode(emuCode)
    });
}

function normalizeComparableCode(code: string | null | undefined) {
    return typeof code === 'string' ? code.trim().toUpperCase() : '';
}

function resolvePredictionNodeFocusTrainCodes(
    node: FutureAssignmentPredictionNode
) {
    return Array.from(
        new Set(
            node.allCodes
                .map((code) => normalizeComparableCode(code))
                .filter((code) => code.length > 0)
        )
    );
}

function formatNullableTimestamp(timestamp: number | null) {
    if (timestamp === null || !Number.isFinite(timestamp)) {
        return '--';
    }

    return formatTrackerTimestamp(timestamp);
}

function formatNullableTime(timestamp: number | null) {
    const formattedTimestamp = formatNullableTimestamp(timestamp);
    if (formattedTimestamp === '--') {
        return '--';
    }

    const matchedTime = formattedTimestamp.match(/(\d{2}:\d{2})(?::\d{2})?$/);
    if (!matchedTime) {
        return formattedTimestamp;
    }

    return matchedTime[1] ?? formattedTimestamp;
}

function formatFutureDayLabel(dayOffsetFromToday: number) {
    if (dayOffsetFromToday <= 0) {
        return '今天';
    }

    if (dayOffsetFromToday === 1) {
        return '明天';
    }

    if (dayOffsetFromToday === 2) {
        return '后天';
    }

    return `+${dayOffsetFromToday} 天`;
}

function formatPredictionDateTag(
    startTimestamp: number | null,
    endTimestamp: number | null
) {
    const timestamp = startTimestamp ?? endTimestamp;
    if (timestamp === null || !Number.isFinite(timestamp)) {
        return '--';
    }

    return new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date(timestamp * 1000));
}
</script>
