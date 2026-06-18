<template>
    <LookupExpandableSection
        :model-value="modelValue"
        title="交路表"
        :section-id="sectionId"
        :summary="nodes.length > 0 ? summary : ''"
        collapse-label="折叠交路表"
        expand-label="展开交路表"
        :show-toggle="nodes.length > 0"
        @update:model-value="emit('update:modelValue', $event)">
        <template #notice>
            <p
                v-if="notice && modelValue"
                class="text-sm leading-6 text-slate-700">
                {{ notice }}
            </p>
        </template>

        <div class="hidden space-y-3 md:block">
            <div
                v-for="(node, index) in nodes"
                :key="`desktop:${node.key}`"
                class="flex gap-3">
                <div class="flex w-7 shrink-0 flex-col items-center">
                    <span :class="nodeIndexClass(node)">
                        {{ index + 1 }}
                    </span>
                    <span
                        v-if="index + 1 < nodes.length"
                        :class="nodeLineClass(node)"
                        aria-hidden="true" />
                </div>

                <div :class="desktopNodeCardClass(node)">
                    <div
                        class="flex flex-wrap items-start justify-between gap-3">
                        <CirculationCodeList
                            :node="node"
                            :is-current-code="isCurrentCode"
                            :build-code-link="buildCodeLink"
                            mode="desktop" />

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
                            <p
                                class="mt-1 text-sm font-medium text-crh-grey-dark">
                                <LookupStationLink
                                    :station-name="node.startStation"
                                    :focus-train-codes="
                                        resolveNodeFocusTrainCodes(node)
                                    "
                                    fallback-text="--" />
                                <span class="mx-1">-></span>
                                <LookupStationLink
                                    :station-name="node.endStation"
                                    :focus-train-codes="
                                        resolveNodeFocusTrainCodes(node)
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
                            <p class="mt-1 font-mono text-sm text-slate-500">
                                {{ formatOffsetTime(node.startAt) }}
                                <span class="mx-1">-></span>
                                {{ formatOffsetTime(node.endAt) }}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="space-y-2.5 md:hidden">
            <div
                v-for="(node, index) in nodes"
                :key="`mobile:${node.key}`"
                class="flex gap-3">
                <div class="flex w-7 shrink-0 flex-col items-center">
                    <span :class="nodeIndexClass(node)">
                        {{ index + 1 }}
                    </span>
                    <span
                        v-if="index + 1 < nodes.length"
                        :class="nodeLineClass(node)"
                        aria-hidden="true" />
                </div>

                <UiCard
                    :show-accent-bar="false"
                    variant="subtle"
                    :class="mobileNodeCardClass(node)">
                    <div class="space-y-3">
                        <div class="flex items-start justify-between gap-3">
                            <CirculationCodeList
                                :node="node"
                                :is-current-code="isCurrentCode"
                                :build-code-link="buildCodeLink"
                                mode="mobile" />

                            <span
                                v-if="node.isCurrent"
                                class="inline-flex items-center rounded-full border border-crh-blue/20 bg-white px-2.5 py-1 text-xs font-medium text-crh-blue">
                                当前车次
                            </span>
                        </div>

                        <div :class="mobileNodeDetailClass(node)">
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
                                                resolveNodeFocusTrainCodes(node)
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
                                                resolveNodeFocusTrainCodes(node)
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
                                        {{ formatOffsetTime(node.startAt) }}
                                    </p>
                                </div>

                                <div class="min-w-0 text-right">
                                    <p
                                        class="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                                        终到时间
                                    </p>
                                    <p
                                        class="mt-1 font-mono text-sm text-slate-500">
                                        {{ formatOffsetTime(node.endAt) }}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </UiCard>
            </div>
        </div>

        <div
            v-if="showPdfPreview"
            class="space-y-3 border-t border-slate-100 pt-4">
            <p class="text-xs uppercase tracking-[0.16em] text-slate-400">
                列车交路图
            </p>

            <div
                v-if="pdfState === 'idle' || pdfState === 'loading'"
                class="h-64 animate-pulse rounded-[1rem] border border-slate-200 bg-slate-100/80" />

            <button
                v-else-if="pdfState === 'ready'"
                type="button"
                class="block w-full cursor-pointer overflow-hidden rounded-[1rem] border border-slate-200 bg-slate-50/80 p-2 text-left shadow-[0_18px_42px_-34px_rgba(15,23,42,0.45)] transition hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crh-blue/25 focus-visible:ring-offset-2 focus-visible:ring-offset-white sm:p-3"
                @click="emit('openPdfPreview')">
                <div
                    :ref="setPdfCanvasContainer"
                    class="cursor-pointer overflow-hidden rounded-[0.75rem] bg-white">
                    <canvas
                        :ref="setPdfCanvas"
                        class="block h-auto w-full cursor-pointer" />
                </div>
            </button>

            <div
                v-else-if="pdfState === 'error' && canInspectPreviewErrors"
                class="rounded-[1rem] border border-rose-200 bg-rose-50/80 p-4 text-rose-900 shadow-[0_18px_42px_-34px_rgba(190,24,93,0.35)]">
                <p
                    class="text-xs font-medium uppercase tracking-[0.16em] text-rose-500">
                    预览失败
                </p>
                <p class="mt-2 text-sm font-semibold">交路图预览加载失败</p>
                <p
                    class="mt-2 whitespace-pre-wrap break-all font-mono text-xs leading-5 text-rose-700">
                    {{ previewErrorMessage }}
                </p>
            </div>

            <p
                v-if="exportErrorMessage.length > 0"
                class="text-[11px] leading-5 text-rose-600">
                [!] {{ exportErrorMessage }}
            </p>

            <div class="grid gap-2 sm:grid-cols-2">
                <UiButton
                    class="border border-slate-200 bg-slate-50 text-slate-700 shadow-none hover:border-slate-300 hover:bg-white hover:text-slate-900"
                    variant="ghost"
                    :loading="exportState === 'pdf'"
                    :disabled="exportState !== null"
                    block
                    @click="emit('exportAsset', 'pdf')">
                    {{ exportState === 'pdf' ? '正在准备 PDF' : '保存为 PDF' }}
                </UiButton>

                <UiButton
                    class="border border-slate-200 bg-slate-50 text-slate-700 shadow-none hover:border-slate-300 hover:bg-white hover:text-slate-900"
                    variant="ghost"
                    :loading="exportState === 'png'"
                    :disabled="exportState !== null"
                    block
                    @click="emit('exportAsset', 'png')">
                    {{ exportState === 'png' ? '正在准备图片' : '保存为图片' }}
                </UiButton>
            </div>
        </div>
    </LookupExpandableSection>
</template>

<script setup lang="ts">
import CirculationCodeList from './CirculationCodeList.vue';
import LookupExpandableSection from './LookupExpandableSection.vue';
import type { ComponentPublicInstance } from 'vue';
import type {
    CirculationExportFormat,
    CirculationPdfState,
    DisplayCirculationNode
} from '~/types/lookupCurrentTimetable';
import { formatCirculationOffsetTime } from '~/utils/lookup/timetableDisplay';

defineProps<{
    modelValue: boolean;
    sectionId: string;
    summary: string;
    notice: string;
    nodes: DisplayCirculationNode[];
    showPdfPreview: boolean;
    pdfState: CirculationPdfState;
    exportState: CirculationExportFormat | null;
    exportErrorMessage: string;
    previewErrorMessage: string;
    canInspectPreviewErrors: boolean;
    setPdfCanvasContainer: (
        element: Element | ComponentPublicInstance | null
    ) => void;
    setPdfCanvas: (element: Element | ComponentPublicInstance | null) => void;
    resolveNodeFocusTrainCodes: (node: DisplayCirculationNode) => string[];
    isCurrentCode: (code: string) => boolean;
    buildCodeLink: (code: string) => string;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    openPdfPreview: [];
    exportAsset: [format: CirculationExportFormat];
}>();

function formatOffsetTime(offsetSeconds: number) {
    return formatCirculationOffsetTime(offsetSeconds);
}

function nodeIndexClass(node: DisplayCirculationNode) {
    return [
        'inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition',
        node.isCurrent
            ? 'border-crh-blue bg-crh-blue text-white shadow-[0_6px_16px_-10px_rgba(0,82,155,0.85)]'
            : 'border-slate-200 bg-white text-slate-500'
    ];
}

function nodeLineClass(node: DisplayCirculationNode) {
    return [
        'mt-2 min-h-6 w-px flex-1',
        node.isCurrent ? 'bg-crh-blue/30' : 'bg-slate-200'
    ];
}

function desktopNodeCardClass(node: DisplayCirculationNode) {
    return [
        'min-w-0 flex-1 rounded-[1rem] border px-4 py-3 transition',
        node.isCurrent
            ? 'border-crh-blue/20 bg-blue-50/80 shadow-[0_14px_30px_-24px_rgba(0,82,155,0.55)]'
            : 'border-slate-200 bg-white/90'
    ];
}

function mobileNodeCardClass(node: DisplayCirculationNode) {
    return [
        'min-w-0 flex-1',
        node.isCurrent
            ? 'border-crh-blue/20 bg-blue-50/60 shadow-[0_14px_30px_-24px_rgba(0,82,155,0.55)]'
            : ''
    ];
}

function mobileNodeDetailClass(node: DisplayCirculationNode) {
    return [
        'rounded-[1rem] border bg-white/90 px-4 py-3',
        node.isCurrent ? 'border-crh-blue/20' : 'border-slate-200'
    ];
}
</script>
