import {
    computed,
    onMounted,
    ref,
    toValue,
    watch,
    type MaybeRefOrGetter
} from 'vue';
import type { TrackedRequestFetch } from '~/composables/useTrackedRequestFetch';
import type { TrackerApiResponse } from '~/types/homepage';
import type {
    HistoricalTimetableData,
    RecentAssignmentsState,
    TrainTimetableHistoryListResponse
} from '~/types/lookup';
import type {
    HistoricalTimetableOption,
    LookupTimetableLoadState,
    TimetableSourceKey,
    TimetableSourceOption
} from '~/types/lookupCurrentTimetable';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import {
    fetchHistoricalTimetableContentWithCache,
    getHistoricalTimetableContentMemoryCacheValue,
    setHistoricalTimetableContentMemoryCacheValue
} from '~/utils/lookup/historicalTimetableContentCache';
import {
    formatHistoryOptionLabel,
    formatServiceDateLabel
} from '~/utils/lookup/timetableDisplay';

const HISTORY_LIST_LIMIT = 200;

export default function useLookupTimetableHistory(options: {
    modelValue: MaybeRefOrGetter<boolean>;
    normalizedTrainCode: MaybeRefOrGetter<string>;
    currentState: MaybeRefOrGetter<RecentAssignmentsState>;
    isCurrentTimetableAvailable: MaybeRefOrGetter<boolean>;
    requestFetch: TrackedRequestFetch;
}) {
    const historyContentCacheVersion = ref(0);
    const historyLoadingState = ref<LookupTimetableLoadState>('idle');
    const historyErrorMessage = ref('');
    const historyItems = ref<HistoricalTimetableOption[]>([]);
    const selectedTimetableSourceKey = ref<TimetableSourceKey>('current');
    const historyContentState = ref<LookupTimetableLoadState>('idle');
    const historyContentErrorMessage = ref('');
    let historyListRequestToken = 0;
    let historyContentLoadToken = 0;

    const isCurrentView = computed(
        () => selectedTimetableSourceKey.value === 'current'
    );

    const latestHistoricalCoverage = computed(
        () => historyItems.value[0] ?? null
    );

    const selectedHistoricalItem = computed(() => {
        if (isCurrentView.value) {
            return null;
        }

        return (
            historyItems.value.find(
                (item) => item.sourceKey === selectedTimetableSourceKey.value
            ) ?? null
        );
    });

    const selectedHistoricalContent = computed(() => {
        historyContentCacheVersion.value;

        const selected = selectedHistoricalItem.value;
        if (!selected) {
            return null;
        }

        return (
            getHistoricalTimetableContentMemoryCacheValue(selected.historyId) ??
            null
        );
    });

    const currentTimetableOptionLabel = computed(() => {
        const latestCoverage = latestHistoricalCoverage.value;
        if (!latestCoverage) {
            return '当前时刻表';
        }

        const startLabel = formatServiceDateLabel(
            latestCoverage.serviceDateStart
        );
        return startLabel.length > 0 ? `${startLabel}起` : '当前时刻表';
    });

    const historyTimetableOptions = computed<TimetableSourceOption[]>(() => {
        const items = historyItems.value;
        const sourceOptions: TimetableSourceOption[] = [];

        if (toValue(options.isCurrentTimetableAvailable)) {
            sourceOptions.push({
                value: 'current',
                label: currentTimetableOptionLabel.value
            });
        }

        const historicalItems = toValue(options.isCurrentTimetableAvailable)
            ? items.slice(1)
            : items;

        for (const item of historicalItems) {
            sourceOptions.push({
                value: item.sourceKey,
                label: formatHistoryOptionLabel(item)
            });
        }

        return sourceOptions;
    });

    const shouldShowHistoryTimetableSelector = computed(
        () => historyTimetableOptions.value.length > 1
    );

    function setHistoryContentCacheValue(
        historyId: number,
        value: HistoricalTimetableData | null
    ) {
        setHistoricalTimetableContentMemoryCacheValue(historyId, value);
        historyContentCacheVersion.value += 1;
    }

    function resetHistoryViewState() {
        historyContentLoadToken += 1;
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

        const normalizedTrainCode = toValue(options.normalizedTrainCode);
        if (normalizedTrainCode.length === 0) {
            resetHistoryViewState();
            return;
        }

        const requestToken = ++historyListRequestToken;
        const requestTrainCode = normalizedTrainCode;
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
                const response = await options.requestFetch<
                    TrackerApiResponse<TrainTimetableHistoryListResponse>
                >(
                    `/api/v1/timetable/train/${encodeURIComponent(requestTrainCode)}/history`,
                    {
                        query: {
                            cursor: cursor.length > 0 ? cursor : undefined,
                            limit: HISTORY_LIST_LIMIT
                        }
                    }
                );

                if (
                    requestToken !== historyListRequestToken ||
                    requestTrainCode !== toValue(options.normalizedTrainCode)
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
                requestTrainCode !== toValue(options.normalizedTrainCode)
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
                requestTrainCode !== toValue(options.normalizedTrainCode)
            ) {
                return;
            }

            historyLoadingState.value = 'error';
            historyErrorMessage.value = getApiErrorMessage(
                error,
                '历史时刻表加载失败，请稍后重试。'
            );
        }
    }

    async function fetchHistoricalTimetableContent(historyId: number) {
        const loadToken = ++historyContentLoadToken;
        const cached = getHistoricalTimetableContentMemoryCacheValue(historyId);
        if (cached !== undefined) {
            historyContentState.value = cached ? 'ready' : 'error';
            historyContentErrorMessage.value = cached
                ? ''
                : '历史时刻表加载失败，请稍后重试。';
            historyContentCacheVersion.value += 1;
            return cached;
        }

        const requestTrainCode = toValue(options.normalizedTrainCode);
        if (requestTrainCode.length === 0) {
            setHistoryContentCacheValue(historyId, null);
            historyContentState.value = 'error';
            historyContentErrorMessage.value =
                '历史时刻表加载失败，请稍后重试。';
            return null;
        }

        historyContentState.value = 'loading';
        historyContentErrorMessage.value = '';

        const timetable = await fetchHistoricalTimetableContentWithCache(
            options.requestFetch,
            requestTrainCode,
            historyId
        );

        if (
            loadToken !== historyContentLoadToken ||
            requestTrainCode !== toValue(options.normalizedTrainCode)
        ) {
            return null;
        }

        historyContentCacheVersion.value += 1;
        if (!timetable) {
            historyContentState.value = 'error';
            historyContentErrorMessage.value =
                '历史时刻表加载失败，请稍后重试。';
            return null;
        }

        historyContentState.value = 'ready';
        historyContentErrorMessage.value = '';
        return timetable;
    }

    function ensureHistoricalContentLoaded() {
        if (isCurrentView.value || !toValue(options.modelValue)) {
            return;
        }

        const selected = selectedHistoricalItem.value;
        if (!selected) {
            return;
        }

        void fetchHistoricalTimetableContent(selected.historyId);
    }

    function syncSelectionWithData() {
        if (toValue(options.isCurrentTimetableAvailable)) {
            selectedTimetableSourceKey.value = 'current';
            return;
        }

        if (
            toValue(options.currentState) !== 'empty' ||
            historyItems.value.length === 0
        ) {
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
            () => toValue(options.modelValue),
            () => toValue(options.normalizedTrainCode)
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
        [
            () => toValue(options.currentState),
            () => toValue(options.isCurrentTimetableAvailable),
            () => historyItems.value,
            () => historyLoadingState.value
        ],
        () => {
            syncSelectionWithData();
            ensureHistoricalContentLoaded();
        },
        { immediate: true, deep: true }
    );

    watch(
        () => selectedTimetableSourceKey.value,
        () => {
            historyContentLoadToken += 1;
            historyContentState.value = 'idle';
            historyContentErrorMessage.value = '';
            ensureHistoricalContentLoaded();
        }
    );

    onMounted(() => {
        if (
            toValue(options.modelValue) &&
            toValue(options.normalizedTrainCode).length > 0
        ) {
            void fetchHistoricalTimetableList();
        }
    });

    return {
        historyLoadingState,
        historyErrorMessage,
        historyItems,
        selectedTimetableSourceKey,
        historyContentState,
        historyContentErrorMessage,
        isCurrentView,
        selectedHistoricalItem,
        selectedHistoricalContent,
        historyTimetableOptions,
        shouldShowHistoryTimetableSelector,
        resetHistoryViewState
    };
}
