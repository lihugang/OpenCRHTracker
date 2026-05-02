import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import {
    hydrateEmuHistoryRecords,
    hydrateTrainHistoryRecords,
    toLookupHistoryListItems
} from '~/composables/useHistoricalTimetableContent';
import type { TrackerApiResponse } from '~/types/homepage';
import type {
    EmuHistoryResponse,
    LookupHistoryListItem,
    LookupTarget,
    RecentAssignmentsState,
    TrainHistoryResponse
} from '~/types/lookup';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';

const REQUEST_LIMIT = 20;

type HistoryPageResponse = TrainHistoryResponse | EmuHistoryResponse;
type HistoryPageResult = {
    response: HistoryPageResponse;
    items: LookupHistoryListItem[];
};
type HistoryRequestOptions = {
    query?: Record<string, number | string | undefined>;
};
type RequestFetch = <T>(
    request: string,
    options?: HistoryRequestOptions
) => Promise<T>;

function buildHistoryQuery(cursor: string) {
    return {
        limit: REQUEST_LIMIT,
        cursor: cursor || undefined
    };
}

async function fetchTrainHistoryPage(
    requestFetch: RequestFetch,
    target: LookupTarget,
    cursor: string
) {
    const response = await requestFetch<
        TrackerApiResponse<TrainHistoryResponse>
    >(`/api/v1/history/train/${encodeURIComponent(target.code)}`, {
        query: buildHistoryQuery(cursor)
    });

    if (!response.ok) {
        throw {
            data: response
        };
    }

    const items = await hydrateTrainHistoryRecords(
        requestFetch,
        target.code,
        response.data.items
    );

    return {
        response: response.data,
        items: toLookupHistoryListItems('train', items)
    } satisfies HistoryPageResult;
}

async function fetchEmuHistoryPage(
    requestFetch: RequestFetch,
    target: LookupTarget,
    cursor: string
) {
    const response = await requestFetch<TrackerApiResponse<EmuHistoryResponse>>(
        `/api/v1/history/emu/${encodeURIComponent(target.code)}`,
        {
            query: buildHistoryQuery(cursor)
        }
    );

    if (!response.ok) {
        throw {
            data: response
        };
    }

    const items = await hydrateEmuHistoryRecords(
        requestFetch,
        response.data.items
    );

    return {
        response: response.data,
        items: toLookupHistoryListItems('emu', items)
    } satisfies HistoryPageResult;
}

async function fetchPage(
    requestFetch: RequestFetch,
    target: LookupTarget,
    cursor: string
) {
    return target.type === 'train'
        ? fetchTrainHistoryPage(requestFetch, target, cursor)
        : fetchEmuHistoryPage(requestFetch, target, cursor);
}

function isResponseForTarget(
    target: LookupTarget,
    response: HistoryPageResponse | null
) {
    if (!response) {
        return false;
    }

    if (target.type === 'train') {
        return 'trainCode' in response && response.trainCode === target.code;
    }

    return 'emuCode' in response && response.emuCode === target.code;
}

export function useRecentHistoryList(
    targetSource: MaybeRefOrGetter<LookupTarget | null>
) {
    const requestFetch = import.meta.server ? useRequestFetch() : $fetch;
    const extraItems = ref<LookupHistoryListItem[]>([]);
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
            ? `recent-history:${targetKey.value}`
            : 'recent-history:empty'
    );

    const { data, error, pending, refresh } =
        useAsyncData<HistoryPageResult | null>(
            asyncDataKey,
            async () => {
                const target = toValue(targetSource);

                if (!target) {
                    return null;
                }

                return await fetchPage(requestFetch, target, '');
            },
            {
                watch: [targetKey],
                default: () => null
            }
        );

    const initialResponse = computed(() => {
        const target = toValue(targetSource);
        const response = data.value?.response ?? null;

        if (!target || !isResponseForTarget(target, response)) {
            return null;
        }

        return response;
    });

    const initialItems = computed(() => data.value?.items ?? []);

    const items = computed(() => [...initialItems.value, ...extraItems.value]);

    const nextCursor = computed(() => {
        if (manualNextCursor.value !== null) {
            return manualNextCursor.value;
        }

        return initialResponse.value?.nextCursor ?? '';
    });

    const state = computed<RecentAssignmentsState>(() => {
        const target = toValue(targetSource);

        if (!target) {
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
                '历史记录加载失败，请稍后重试。'
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
        const target = toValue(targetSource);

        if (!target) {
            return '';
        }

        if (state.value === 'loading') {
            return `正在加载 ${target.code} 的历史记录`;
        }

        if (state.value === 'success') {
            if (isLoadingMore.value) {
                return `已加载 ${items.value.length} 条，正在继续加载更多记录`;
            }

            if (nextCursor.value) {
                return `已加载 ${items.value.length} 条，滚动到底部可继续加载`;
            }

            return `共加载 ${items.value.length} 条历史记录`;
        }

        if (state.value === 'empty') {
            return '没有查询到历史记录';
        }

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

        if (!target) {
            return;
        }

        await refresh();
    }

    async function loadMore() {
        const target = toValue(targetSource);
        const cursor = nextCursor.value;

        if (!target || !cursor || !canLoadMore.value) {
            return;
        }

        const currentRequestVersion = requestVersion.value;

        isLoadingMore.value = true;
        loadMoreErrorMessage.value = '';

        try {
            const result = await fetchPage(requestFetch, target, cursor);

            if (currentRequestVersion !== requestVersion.value) {
                return;
            }

            extraItems.value = [...extraItems.value, ...result.items];
            manualNextCursor.value = result.response.nextCursor ?? '';
        } catch (loadMoreError) {
            if (currentRequestVersion !== requestVersion.value) {
                return;
            }

            loadMoreErrorMessage.value = getApiErrorMessage(
                loadMoreError,
                '加载更多历史记录失败，请稍后重试。'
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
