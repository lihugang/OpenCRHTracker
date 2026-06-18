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
                <LookupTimetableSummaryCards
                    :timetable="displayedTimetable"
                    :focus-train-codes="timetableFocusTrainCodes"
                    :is-current-view="isCurrentView"
                    :responsibility-summary="responsibilitySummary" />

                <div class="motion-divider" />
            </div>

            <LookupTimetableSection
                v-model="isTimetableExpanded"
                v-model:selected-source-key="selectedTimetableSourceKey"
                class="order-4"
                :section-id="timetableSectionId"
                :summary="timetableSummaryLabel"
                :timetable="displayedTimetable"
                :is-current-view="isCurrentView"
                :notice="timetableNotice"
                :show-history-selector="shouldShowHistoryTimetableSelector"
                :history-options="historyTimetableOptions"
                :visible-columns="visibleColumns"
                :show-distance-columns="shouldShowDistanceColumns"
                :resolve-stop-focus-train-codes="resolveStopFocusTrainCodes"
                :format-stop-time="formatStopTime"
                :format-stop-wicket="formatStopWicket"
                :format-stop-distance="formatStopDistance"
                :format-stop-section-speed="formatStopSectionSpeed" />

            <LookupCirculationSection
                v-if="shouldShowCirculationSection"
                v-model="isCirculationExpanded"
                class="order-2"
                :section-id="circulationSectionId"
                :summary="circulationSummaryLabel"
                :notice="circulationNotice"
                :nodes="circulationNodes"
                :show-pdf-preview="shouldShowCirculationPdfPreview"
                :pdf-state="circulationPdfState"
                :export-state="circulationExportState"
                :export-error-message="circulationExportErrorMessage"
                :preview-error-message="circulationPreviewErrorMessage"
                :can-inspect-preview-errors="canInspectCirculationPreviewErrors"
                :set-pdf-canvas-container="setCirculationPdfCanvasContainer"
                :set-pdf-canvas="setCirculationPdfCanvas"
                :resolve-node-focus-train-codes="
                    resolveCirculationNodeFocusTrainCodes
                "
                :is-current-code="isCurrentCirculationCode"
                :build-code-link="buildCirculationCodeLink"
                @open-pdf-preview="openCirculationPdfPreview"
                @export-asset="exportCirculationAsset" />

            <div
                v-if="shouldShowCirculationSection"
                class="order-3 motion-divider" />
        </div>
    </UiModal>

    <LookupCirculationPdfOverlay
        :is-open="isCirculationPdfPreviewOpen"
        :preview-state="circulationPdfState"
        :fullscreen-state="circulationPdfFullscreenState"
        :viewport-style="circulationPdfFullscreenViewportStyle"
        :set-fullscreen-canvas-container="
            setCirculationPdfFullscreenCanvasContainer
        "
        :set-fullscreen-viewport="setCirculationPdfFullscreenViewport"
        :set-fullscreen-canvas="setCirculationPdfFullscreenCanvas"
        :handle-wheel="handleCirculationPdfFullscreenWheel"
        :handle-mouse-down="handleCirculationPdfFullscreenMouseDown"
        :handle-touch-start="handleCirculationPdfFullscreenTouchStart"
        :handle-touch-move="handleCirculationPdfFullscreenTouchMove"
        :handle-touch-end="handleCirculationPdfFullscreenTouchEnd"
        @close="closeCirculationPdfPreview" />
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import LookupCirculationPdfOverlay from '~/components/lookup/current-timetable/LookupCirculationPdfOverlay.vue';
import LookupCirculationSection from '~/components/lookup/current-timetable/LookupCirculationSection.vue';
import LookupTimetableSection from '~/components/lookup/current-timetable/LookupTimetableSection.vue';
import LookupTimetableSummaryCards from '~/components/lookup/current-timetable/LookupTimetableSummaryCards.vue';
import useLookupCirculationDisplay from '~/composables/useLookupCirculationDisplay';
import useLookupCirculationPdf from '~/composables/useLookupCirculationPdf';
import useLookupTimetableDisplay from '~/composables/useLookupTimetableDisplay';
import useLookupTimetableHistory from '~/composables/useLookupTimetableHistory';
import useTrackedRequestFetch, {
    type TrackedRequestFetch
} from '~/composables/useTrackedRequestFetch';
import type {
    LookupCurrentTimetableViewState,
    PersistedLookupTimetableSectionState
} from '~/types/lookupCurrentTimetable';
import hasClientScope, {
    CLIENT_AUTH_SCOPES
} from '~/utils/auth/hasClientScope';

const SECTION_STATE_STORAGE_KEY =
    'opencrhtracker:lookup-current-timetable-modal-sections';
const timetableSectionId = 'lookup-current-timetable-section';
const circulationSectionId = 'lookup-current-circulation-section';

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
const { session } = useAuthState();

const { state, timetable, errorMessage, normalizedTrainCode } =
    useCurrentTrainTimetable(
        computed(() => props.trainCode),
        computed(() => props.modelValue)
    );

const isTimetableExpanded = ref(true);
const isCirculationExpanded = ref(true);
const isCurrentTimetableAvailable = computed(() => timetable.value !== null);

const {
    historyLoadingState,
    historyErrorMessage,
    historyItems,
    selectedTimetableSourceKey,
    historyContentState,
    historyContentErrorMessage,
    isCurrentView,
    selectedHistoricalContent,
    historyTimetableOptions,
    shouldShowHistoryTimetableSelector
} = useLookupTimetableHistory({
    modelValue: computed(() => props.modelValue),
    normalizedTrainCode,
    currentState: state,
    isCurrentTimetableAvailable,
    requestFetch
});

const {
    displayedTimetable,
    modalTitle,
    timetableNotice,
    timetableFocusTrainCodes,
    responsibilitySummary,
    shouldShowDistanceColumns,
    visibleColumns,
    timetableSummaryLabel,
    resolveStopFocusTrainCodes,
    formatStopTime,
    formatStopWicket,
    formatStopDistance,
    formatStopSectionSpeed
} = useLookupTimetableDisplay({
    trainCode: computed(() => props.trainCode),
    displayCodes: computed(() => props.displayCodes),
    timetable,
    selectedHistoricalContent,
    isCurrentView
});

const {
    circulation,
    circulationNodes,
    circulationSummaryLabel,
    circulationNotice,
    circulationPdfRequestTrainCode,
    resolveCirculationNodeFocusTrainCodes,
    isCurrentCirculationCode,
    buildCirculationCodeLink
} = useLookupCirculationDisplay({
    trainCode: computed(() => props.trainCode),
    displayCodes: computed(() => props.displayCodes),
    timetable,
    isCurrentView,
    timetableFocusTrainCodes
});

const shouldShowCirculationSection = computed(() => {
    return (
        isCurrentTimetableAvailable.value && circulationNodes.value.length > 0
    );
});

const shouldLoadCirculationPdfPreview = computed(() => {
    return (
        import.meta.client &&
        props.modelValue &&
        isCurrentView.value &&
        isCirculationExpanded.value &&
        shouldShowCirculationSection.value &&
        circulationPdfRequestTrainCode.value.length > 0
    );
});

const canInspectCirculationPreviewErrors = computed(() => {
    return hasClientScope(
        session.value?.scopes ?? [],
        CLIENT_AUTH_SCOPES.admin
    );
});

const {
    circulationPdfState,
    circulationPdfFullscreenState,
    circulationExportState,
    circulationExportErrorMessage,
    circulationPreviewErrorMessage,
    isCirculationPdfPreviewOpen,
    fullscreenViewportStyle: circulationPdfFullscreenViewportStyle,
    circulationPdfCanvasContainer,
    circulationPdfCanvas,
    fullscreenCanvasContainer: circulationPdfFullscreenCanvasContainer,
    fullscreenViewport: circulationPdfFullscreenViewport,
    fullscreenCanvas: circulationPdfFullscreenCanvas,
    exportCirculationAsset,
    openCirculationPdfPreview,
    closeCirculationPdfPreview,
    handleFullscreenWheel: handleCirculationPdfFullscreenWheel,
    handleFullscreenMouseDown: handleCirculationPdfFullscreenMouseDown,
    handleFullscreenTouchStart: handleCirculationPdfFullscreenTouchStart,
    handleFullscreenTouchMove: handleCirculationPdfFullscreenTouchMove,
    handleFullscreenTouchEnd: handleCirculationPdfFullscreenTouchEnd
} = useLookupCirculationPdf({
    shouldLoadPreview: shouldLoadCirculationPdfPreview,
    requestTrainCode: circulationPdfRequestTrainCode,
    fallbackTrainCode: computed(
        () => displayedTimetable.value?.requestTrainCode ?? props.trainCode
    )
});

const shouldShowCirculationPdfPreview = computed(() => {
    return (
        shouldLoadCirculationPdfPreview.value &&
        (circulationPdfState.value !== 'error' ||
            canInspectCirculationPreviewErrors.value)
    );
});

const viewState = computed<LookupCurrentTimetableViewState>(() => {
    if (displayedTimetable.value) {
        return 'success';
    }

    if (isCurrentView.value) {
        if (
            state.value === 'loading' ||
            historyLoadingState.value === 'loading'
        ) {
            return 'loading';
        }

        if (state.value === 'error') {
            return 'error';
        }

        if (
            historyLoadingState.value === 'error' &&
            historyItems.value.length === 0
        ) {
            return 'error';
        }

        if (state.value === 'empty' && historyItems.value.length === 0) {
            return 'empty';
        }

        return 'loading';
    }

    if (
        historyLoadingState.value === 'loading' ||
        historyContentState.value === 'loading'
    ) {
        return 'loading';
    }

    if (historyContentState.value === 'error') {
        return 'error';
    }

    if (
        historyLoadingState.value === 'error' &&
        historyItems.value.length === 0
    ) {
        return 'error';
    }

    if (historyItems.value.length === 0) {
        return 'empty';
    }

    return 'loading';
});

const errorTitle = computed(() =>
    isCurrentView.value ? '当前时刻表暂时不可用' : '历史时刻表暂时不可用'
);
const emptyTitle = computed(() =>
    isCurrentView.value ? '当前暂无时刻表' : '当前暂无历史时刻表'
);
const emptyDescription = computed(() =>
    isCurrentView.value
        ? '该车次今天没有可用的完整经停表。'
        : '该车次没有可用的历史时刻表数据。'
);

function setCirculationPdfCanvasContainer(
    element: Element | ComponentPublicInstance | null
) {
    circulationPdfCanvasContainer.value =
        element instanceof HTMLDivElement ? element : null;
}

function setCirculationPdfCanvas(
    element: Element | ComponentPublicInstance | null
) {
    circulationPdfCanvas.value =
        element instanceof HTMLCanvasElement ? element : null;
}

function setCirculationPdfFullscreenCanvasContainer(
    element: Element | ComponentPublicInstance | null
) {
    circulationPdfFullscreenCanvasContainer.value =
        element instanceof HTMLDivElement ? element : null;
}

function setCirculationPdfFullscreenViewport(
    element: Element | ComponentPublicInstance | null
) {
    circulationPdfFullscreenViewport.value =
        element instanceof HTMLDivElement ? element : null;
}

function setCirculationPdfFullscreenCanvas(
    element: Element | ComponentPublicInstance | null
) {
    circulationPdfFullscreenCanvas.value =
        element instanceof HTMLCanvasElement ? element : null;
}

function readPersistedSectionState(): PersistedLookupTimetableSectionState {
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
                typeof parsed.timetableExpanded === 'boolean'
                    ? parsed.timetableExpanded
                    : true,
            circulationExpanded:
                typeof parsed.circulationExpanded === 'boolean'
                    ? parsed.circulationExpanded
                    : true
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
            } satisfies PersistedLookupTimetableSectionState)
        );
    } catch {
        // Keep the current in-memory state even if storage is unavailable.
    }
}

watch([isTimetableExpanded, isCirculationExpanded], persistSectionState);

watch(
    () => [props.modelValue, viewState.value, displayedTimetable.value],
    async () => {
        if (
            !props.modelValue ||
            viewState.value !== 'success' ||
            !displayedTimetable.value
        ) {
            return;
        }

        await nextTick();
        const { startCurrentTimetableGuide } = useUserGuide();
        await startCurrentTimetableGuide();
    }
);

onMounted(() => {
    const persistedState = readPersistedSectionState();
    isTimetableExpanded.value = persistedState.timetableExpanded;
    isCirculationExpanded.value = persistedState.circulationExpanded;
});
</script>
