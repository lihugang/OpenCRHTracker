import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import type {
    CurrentTrainTimetableData,
    HistoricalTimetableData,
    RecentAssignmentsState
} from '~/types/lookup';
import type {
    HistoricalTimetableOption,
    LookupTimetableLoadState,
    TimetableSourceKey,
    TimetableSourceOption
} from '~/types/lookupCurrentTimetable';
import { fetchTrainTimetableHistory } from '~/utils/api/v2/domain/lookup';
import { epochServiceDayToShanghaiDayStartUnixSeconds } from '~/utils/api/v2/mappers/serviceDay';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import {
    formatHistoryOptionLabel,
    formatServiceDateLabel
} from '~/utils/lookup/timetableDisplay';

interface ComparableTimetableStop {
    stationNo: number;
    stationName: string;
    stationTrainCode: string;
    arriveOffset: number | null;
    departOffset: number | null;
    isStart: boolean;
    isEnd: boolean;
}

function normalizeComparableText(value: string | null | undefined) {
    return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function normalizeCurrentStops(
    timetable: CurrentTrainTimetableData | null
): ComparableTimetableStop[] | null {
    if (!timetable || timetable.serviceDay === null) {
        return null;
    }

    const dayStart = epochServiceDayToShanghaiDayStartUnixSeconds(
        timetable.serviceDay
    );
    if (dayStart === null) {
        return null;
    }

    return timetable.stops.map((stop) => ({
        stationNo: stop.stationNo,
        stationName: normalizeComparableText(stop.stationName),
        stationTrainCode: normalizeComparableText(stop.stationTrainCode),
        arriveOffset: stop.arriveAt === null ? null : stop.arriveAt - dayStart,
        departOffset: stop.departAt === null ? null : stop.departAt - dayStart,
        isStart: stop.isStart,
        isEnd: stop.isEnd
    }));
}

function normalizeHistoricalStops(
    content: HistoricalTimetableData | null
): ComparableTimetableStop[] | null {
    if (!content) {
        return null;
    }

    return content.stops.map((stop) => ({
        stationNo: stop.stationNo,
        stationName: normalizeComparableText(stop.stationName),
        stationTrainCode: normalizeComparableText(stop.stationTrainCode),
        arriveOffset: stop.arriveOffset,
        departOffset: stop.departOffset,
        isStart: stop.isStart,
        isEnd: stop.isEnd
    }));
}

function areTimetablesEqual(
    current: CurrentTrainTimetableData | null,
    historical: HistoricalTimetableData | null
) {
    const currentStops = normalizeCurrentStops(current);
    const historicalStops = normalizeHistoricalStops(historical);
    if (!currentStops || !historicalStops) {
        return false;
    }
    if (currentStops.length !== historicalStops.length) {
        return false;
    }

    return currentStops.every((stop, index) => {
        const other = historicalStops[index]!;
        return (
            stop.stationNo === other.stationNo &&
            stop.stationName === other.stationName &&
            stop.stationTrainCode === other.stationTrainCode &&
            stop.arriveOffset === other.arriveOffset &&
            stop.departOffset === other.departOffset &&
            stop.isStart === other.isStart &&
            stop.isEnd === other.isEnd
        );
    });
}

export default function useLookupTimetableHistory(options: {
    modelValue: MaybeRefOrGetter<boolean>;
    normalizedTrainCode: MaybeRefOrGetter<string>;
    currentState: MaybeRefOrGetter<RecentAssignmentsState>;
    isCurrentTimetableAvailable: MaybeRefOrGetter<boolean>;
    currentTimetable: MaybeRefOrGetter<CurrentTrainTimetableData | null>;
    requestedTimetableId?: MaybeRefOrGetter<number | null>;
}) {
    const historyLoadingState = ref<LookupTimetableLoadState>('idle');
    const historyErrorMessage = ref('');
    const historyItems = ref<HistoricalTimetableOption[]>([]);
    const selectedTimetableSourceKey = ref<TimetableSourceKey>('current');
    const hiddenTimetableIds = ref<Set<number>>(new Set());
    let historyListRequestToken = 0;

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

    const selectedHistoricalContent = computed(
        () => selectedHistoricalItem.value?.content ?? null
    );

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
        const sourceOptions: TimetableSourceOption[] = [];

        if (toValue(options.isCurrentTimetableAvailable)) {
            sourceOptions.push({
                value: 'current',
                label: currentTimetableOptionLabel.value
            });
        }

        for (const item of historyItems.value) {
            if (hiddenTimetableIds.value.has(item.timetableId)) {
                continue;
            }
            sourceOptions.push({
                value: item.sourceKey,
                label: formatHistoryOptionLabel(item),
                disabled: item.content === null
            });
        }

        return sourceOptions;
    });

    const shouldShowHistoryTimetableSelector = computed(
        () =>
            historyTimetableOptions.value.length > 1 ||
            historyTimetableOptions.value.some((option) => option.disabled)
    );

    function resetHistoryViewState() {
        historyListRequestToken += 1;
        historyLoadingState.value = 'idle';
        historyErrorMessage.value = '';
        historyItems.value = [];
        selectedTimetableSourceKey.value = 'current';
        hiddenTimetableIds.value = new Set();
    }

    function resolveInitialSelection() {
        const current = toValue(options.currentTimetable);
        const items = historyItems.value;
        const requestedId = toValue(options.requestedTimetableId) ?? null;
        const requestedItem =
            requestedId === null
                ? null
                : (items.find((item) => item.timetableId === requestedId) ??
                  null);

        if (requestedItem?.content) {
            if (
                requestedItem.content &&
                current &&
                areTimetablesEqual(current, requestedItem.content)
            ) {
                selectedTimetableSourceKey.value = 'current';
                hiddenTimetableIds.value = new Set([requestedItem.timetableId]);
                return;
            }

            selectedTimetableSourceKey.value = requestedItem.sourceKey;
            hiddenTimetableIds.value = new Set();
            return;
        }

        if (toValue(options.isCurrentTimetableAvailable)) {
            selectedTimetableSourceKey.value = 'current';
            hiddenTimetableIds.value = new Set();
            return;
        }

        if (
            toValue(options.currentState) === 'idle' ||
            toValue(options.currentState) === 'loading'
        ) {
            selectedTimetableSourceKey.value = 'current';
            hiddenTimetableIds.value = new Set();
            return;
        }

        selectedTimetableSourceKey.value =
            items.find((item) => item.content)?.sourceKey ?? 'current';
        hiddenTimetableIds.value = new Set();
    }

    function syncSelectionWithData() {
        const currentAvailable = toValue(options.isCurrentTimetableAvailable);
        const selectedExists = historyItems.value.some(
            (item) => item.sourceKey === selectedTimetableSourceKey.value
        );

        if (currentAvailable) {
            if (
                !selectedExists &&
                selectedTimetableSourceKey.value !== 'current'
            ) {
                selectedTimetableSourceKey.value = 'current';
            }
            return;
        }

        if (
            toValue(options.currentState) !== 'empty' &&
            historyItems.value.length === 0
        ) {
            return;
        }

        if (!selectedExists || selectedTimetableSourceKey.value === 'current') {
            selectedTimetableSourceKey.value =
                historyItems.value.find((item) => item.content)?.sourceKey ??
                'current';
        }
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
        selectedTimetableSourceKey.value = 'current';
        hiddenTimetableIds.value = new Set();

        try {
            const result = await fetchTrainTimetableHistory(requestTrainCode);
            if (
                requestToken !== historyListRequestToken ||
                requestTrainCode !== toValue(options.normalizedTrainCode)
            ) {
                return;
            }

            historyItems.value = result.items;
            historyLoadingState.value = 'ready';
            resolveInitialSelection();
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
            () => toValue(options.currentTimetable),
            () => toValue(options.isCurrentTimetableAvailable),
            () => toValue(options.currentState),
            () => historyItems.value.length
        ],
        () => {
            if (historyLoadingState.value !== 'ready') {
                return;
            }

            const requestedId = toValue(options.requestedTimetableId) ?? null;
            if (requestedId !== null) {
                resolveInitialSelection();
                return;
            }

            syncSelectionWithData();
        },
        { immediate: true, deep: false }
    );

    watch(
        () => toValue(options.requestedTimetableId),
        () => {
            if (historyLoadingState.value === 'ready') {
                resolveInitialSelection();
            }
        }
    );

    return {
        historyLoadingState,
        historyErrorMessage,
        historyItems,
        selectedTimetableSourceKey,
        historyContentState: historyLoadingState,
        historyContentErrorMessage: historyErrorMessage,
        isCurrentView,
        selectedHistoricalItem,
        selectedHistoricalContent,
        historyTimetableOptions,
        shouldShowHistoryTimetableSelector,
        resetHistoryViewState
    };
}
