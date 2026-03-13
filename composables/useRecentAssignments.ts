import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import type { TrackerApiResponse } from '~/types/homepage';
import type {
    EmuHistoryRecord,
    EmuHistoryResponse,
    LookupHistoryListItem,
    LookupTarget,
    RecentAssignmentsState,
    TrainHistoryRecord,
    TrainHistoryResponse
} from '~/types/lookup';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';

const REQUEST_LIMIT = 20;

type HistoryPageResponse = TrainHistoryResponse | EmuHistoryResponse;

function buildHistoryQuery(cursor: string) {
    return {
        limit: REQUEST_LIMIT,
        cursor: cursor || undefined
    };
}

async function fetchTrainHistoryPage(target: LookupTarget, cursor: string) {
    const response = await $fetch<TrackerApiResponse<TrainHistoryResponse>>(
        `/api/v1/history/train/${encodeURIComponent(target.code)}`,
        {
            query: buildHistoryQuery(cursor)
        }
    );

    if (!response.ok) {
        throw {
            data: response
        };
    }

    return response.data;
}

async function fetchEmuHistoryPage(target: LookupTarget, cursor: string) {
    const response = await $fetch<TrackerApiResponse<EmuHistoryResponse>>(
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

    return response.data;
}

function toTrainHistoryListItems(items: TrainHistoryRecord[]) {
    return items.map<LookupHistoryListItem>((item) => ({
        id: item.id,
        startAt: item.startAt,
        endAt: item.endAt,
        code: item.emuCode,
        startStation: item.startStation,
        endStation: item.endStation
    }));
}

function toEmuHistoryListItems(items: EmuHistoryRecord[]) {
    return items.map<LookupHistoryListItem>((item) => ({
        id: item.id,
        startAt: item.startAt,
        endAt: item.endAt,
        code: item.trainCode,
        startStation: item.startStation,
        endStation: item.endStation
    }));
}

async function fetchPage(target: LookupTarget, cursor: string) {
    return target.type === 'train'
        ? fetchTrainHistoryPage(target, cursor)
        : fetchEmuHistoryPage(target, cursor);
}

function mapResponseItems(target: LookupTarget, response: HistoryPageResponse) {
    return target.type === 'train'
        ? toTrainHistoryListItems(response.items as TrainHistoryRecord[])
        : toEmuHistoryListItems(response.items as EmuHistoryRecord[]);
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
        useAsyncData<HistoryPageResponse | null>(
            asyncDataKey,
            async () => {
                const target = toValue(targetSource);

                if (!target) {
                    return null;
                }

                return await fetchPage(target, '');
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

    const initialItems = computed(() => {
        const target = toValue(targetSource);

        if (!target || !initialResponse.value) {
            return [];
        }

        return mapResponseItems(target, initialResponse.value);
    });

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
            const response = await fetchPage(target, cursor);

            if (currentRequestVersion !== requestVersion.value) {
                return;
            }

            extraItems.value = [
                ...extraItems.value,
                ...mapResponseItems(target, response)
            ];
            manualNextCursor.value = response.nextCursor ?? '';
        } catch (error) {
            if (currentRequestVersion !== requestVersion.value) {
                return;
            }

            loadMoreErrorMessage.value = getApiErrorMessage(
                error,
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
