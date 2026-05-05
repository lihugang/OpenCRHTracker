import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import useTrackedRequestFetch, {
    type TrackedRequestFetch
} from '~/composables/useTrackedRequestFetch';
import type { TrackerApiResponse } from '~/types/homepage';
import type {
    LookupTarget,
    RecentAssignmentsState,
    StationTimetableRecord,
    StationTimetableResponse
} from '~/types/lookup';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';

const REQUEST_LIMIT = 40;

type RequestFetch = <T>(
    request: string,
    options?: {
        query?: {
            limit: number;
            cursor?: string | undefined;
        };
    }
) => Promise<T>;

function buildStationQuery(cursor: string) {
    return {
        limit: REQUEST_LIMIT,
        cursor: cursor || undefined
    };
}

async function fetchStationPage(
    requestFetch: RequestFetch,
    target: LookupTarget,
    cursor: string
) {
    const response = await requestFetch<
        TrackerApiResponse<StationTimetableResponse>
    >(`/api/v1/timetable/station/${encodeURIComponent(target.code)}`, {
        query: buildStationQuery(cursor)
    });

    if (!response.ok) {
        throw {
            data: response
        };
    }

    return response.data;
}

function isResponseForTarget(
    target: LookupTarget,
    response: StationTimetableResponse | null
) {
    if (!response || target.type !== 'station') {
        return false;
    }

    return response.stationName === target.code;
}

export function useStationTimetableList(
    targetSource: MaybeRefOrGetter<LookupTarget | null>
) {
    const requestFetch: TrackedRequestFetch = import.meta.server
        ? useTrackedRequestFetch()
        : ($fetch as TrackedRequestFetch);
    const extraItems = ref<StationTimetableRecord[]>([]);
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
        useAsyncData<StationTimetableResponse | null>(
            asyncDataKey,
            async () => {
                const target = toValue(targetSource);

                if (!target || target.type !== 'station') {
                    return null;
                }

                return await fetchStationPage(requestFetch, target, '');
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

    const initialItems = computed(() => initialResponse.value?.items ?? []);

    const items = computed(() => [...initialItems.value, ...extraItems.value]);

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

    const summary = computed(() => {
        return '';
    });

    function resetTransientState() {
        extraItems.value = [];
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
            const response = await fetchStationPage(
                requestFetch,
                target,
                cursor
            );

            if (currentRequestVersion !== requestVersion.value) {
                return;
            }

            extraItems.value = [...extraItems.value, ...response.items];
            manualNextCursor.value = response.nextCursor ?? '';
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
