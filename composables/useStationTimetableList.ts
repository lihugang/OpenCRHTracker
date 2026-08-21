import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import type {
    LookupTarget,
    RecentAssignmentsState,
    StationTimetableRecord
} from '~/types/lookup';
import {
    fetchStationTimetablePage,
    type StationTimetablePageResult
} from '~/utils/api/v2/domain/lookup';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import { LOOKUP_PAGE_LIMIT } from '~/utils/lookup/pagination';

function buildStationRecordKey(item: StationTimetableRecord) {
    return `${item.trainCode}:${item.arriveAt ?? ''}:${item.departAt ?? ''}`;
}

function dedupeStationRecords(items: StationTimetableRecord[]) {
    const seen = new Set<string>();
    return items.filter((item) => {
        const key = buildStationRecordKey(item);
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

async function fetchStationPage(
    target: LookupTarget,
    cursor: string
): Promise<StationTimetablePageResult> {
    return fetchStationTimetablePage(target.code, {
        cursor: cursor || undefined,
        limit: LOOKUP_PAGE_LIMIT
    });
}

function isResponseForTarget(
    target: LookupTarget,
    response: StationTimetablePageResult | null
) {
    if (!response || target.type !== 'station') {
        return false;
    }
    return response.stationName === target.code;
}

export function useStationTimetableList(
    targetSource: MaybeRefOrGetter<LookupTarget | null>
) {
    const extraPages = ref<StationTimetablePageResult[]>([]);
    const manualNextCursor = ref<string | null>(null);
    const isLoadingMore = ref(false);
    const loadMoreErrorMessage = ref('');
    const requestVersion = ref(0);

    const targetKey = computed(() => {
        const target = toValue(targetSource);
        return target ? `${target.type}:${target.code}` : '';
    });

    const asyncDataKey = computed(() =>
        targetKey.value
            ? `station-timetable:${targetKey.value}`
            : 'station-timetable:empty'
    );

    const { data, error, pending, refresh } =
        useAsyncData<StationTimetablePageResult | null>(
            asyncDataKey,
            async () => {
                const target = toValue(targetSource);
                if (!target || target.type !== 'station') {
                    return null;
                }
                return await fetchStationPage(target, '');
            },
            {
                watch: [targetKey],
                default: () => null
            }
        );

    const initialResponse = computed(() => {
        const target = toValue(targetSource);
        if (!target || !isResponseForTarget(target, data.value)) {
            return null;
        }
        return data.value;
    });

    const items = computed(() => {
        const pageItems = extraPages.value.flatMap((page) => page.items);
        return dedupeStationRecords([
            ...(initialResponse.value?.items ?? []),
            ...pageItems
        ]);
    });

    const nextCursor = computed(() => {
        if (manualNextCursor.value !== null) {
            return manualNextCursor.value;
        }
        return initialResponse.value?.nextCursor ?? '';
    });

    const state = computed<RecentAssignmentsState>(() => {
        const target = toValue(targetSource);
        if (!target || target.type !== 'station') {
            return 'empty';
        }
        if (
            pending.value &&
            !initialResponse.value &&
            items.value.length === 0
        ) {
            return 'loading';
        }
        if (error.value && items.value.length === 0) {
            return 'error';
        }
        if (items.value.length > 0) {
            return 'success';
        }
        if (initialResponse.value) {
            return 'empty';
        }
        return 'idle';
    });

    const errorMessage = computed(() => {
        if (state.value === 'error') {
            return getApiErrorMessage(
                error.value,
                '车站时刻表加载失败，请稍后重试。'
            );
        }
        return loadMoreErrorMessage.value;
    });

    const canLoadMore = computed(
        () =>
            state.value === 'success' &&
            nextCursor.value.length > 0 &&
            !isLoadingMore.value
    );

    const summary = computed(() => '');

    function resetTransientState() {
        extraPages.value = [];
        manualNextCursor.value = null;
        isLoadingMore.value = false;
        loadMoreErrorMessage.value = '';
    }

    async function reload() {
        const target = toValue(targetSource);
        requestVersion.value += 1;
        resetTransientState();
        if (!target || target.type !== 'station') {
            return;
        }
        await refresh();
    }

    async function loadMore() {
        const target = toValue(targetSource);
        const cursor = nextCursor.value;
        if (
            !target ||
            target.type !== 'station' ||
            !cursor ||
            !canLoadMore.value
        ) {
            return;
        }

        const currentRequestVersion = requestVersion.value;
        isLoadingMore.value = true;
        loadMoreErrorMessage.value = '';

        try {
            const response = await fetchStationPage(target, cursor);
            if (currentRequestVersion !== requestVersion.value) {
                return;
            }
            extraPages.value = [...extraPages.value, response];
            manualNextCursor.value = response.nextCursor;
        } catch (loadMoreError) {
            if (currentRequestVersion !== requestVersion.value) {
                return;
            }
            loadMoreErrorMessage.value = getApiErrorMessage(
                loadMoreError,
                '加载更多车站时刻表失败，请稍后重试。'
            );
        } finally {
            if (currentRequestVersion === requestVersion.value) {
                isLoadingMore.value = false;
            }
        }
    }

    watch(
        targetKey,
        () => {
            requestVersion.value += 1;
            resetTransientState();
        },
        {
            immediate: true
        }
    );

    return {
        state,
        items,
        errorMessage,
        summary,
        nextCursor,
        isLoadingMore,
        canLoadMore,
        reload,
        loadMore
    };
}
