import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import type {
    LookupHistoryListItem,
    LookupTarget,
    RecentAssignmentsState
} from '~/types/lookup';
import {
    fetchEmuHistoryPage,
    fetchTrainHistoryPage,
    type LookupHistoryPageResult
} from '~/utils/api/v2/domain/lookup';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import getShanghaiDayStartUnixSeconds from '~/utils/time/getShanghaiDayStartUnixSeconds';
import { parseCanonicalTrainCode } from '~/utils/api/v2/mappers/trainCode';

const REQUEST_LIMIT = 100;

function getHistorySortTimestamp(item: LookupHistoryListItem) {
    if (
        item.startAt !== null &&
        Number.isFinite(item.startAt) &&
        item.startAt > 0
    ) {
        return item.startAt;
    }

    return (
        getShanghaiDayStartUnixSeconds(item.serviceDate) ??
        Number.NEGATIVE_INFINITY
    );
}

function compareHistoryItemsByTimeDescending(
    left: LookupHistoryListItem,
    right: LookupHistoryListItem
) {
    const leftTimestamp = getHistorySortTimestamp(left);
    const rightTimestamp = getHistorySortTimestamp(right);
    if (leftTimestamp === rightTimestamp) {
        return 0;
    }
    return leftTimestamp > rightTimestamp ? -1 : 1;
}

function dedupeHistoryItems(items: LookupHistoryListItem[]) {
    const seen = new Set<string>();
    return items.filter((item) => {
        if (seen.has(item.id)) {
            return false;
        }
        seen.add(item.id);
        return true;
    });
}

function mergeHistoryPage(
    currentItems: readonly LookupHistoryListItem[],
    pageItems: readonly LookupHistoryListItem[]
) {
    return dedupeHistoryItems([...currentItems, ...pageItems]).sort(
        compareHistoryItemsByTimeDescending
    );
}

async function fetchPage(
    target: LookupTarget,
    cursor: string
): Promise<LookupHistoryPageResult> {
    if (target.type === 'train') {
        return fetchTrainHistoryPage(target.code, {
            cursor: cursor || undefined,
            limit: REQUEST_LIMIT
        });
    }

    return fetchEmuHistoryPage(target.code, {
        cursor: cursor || undefined,
        limit: REQUEST_LIMIT
    });
}

function isResponseForTarget(
    target: LookupTarget,
    response: LookupHistoryPageResult | null
) {
    if (!response) {
        return false;
    }

    const requestedCode = response.requestedTargetCode.trim().toUpperCase();
    const targetCode = target.code.trim().toUpperCase();
    if (requestedCode.length === 0) {
        return response.emuCode === targetCode;
    }

    if (target.type === 'train') {
        const requestedTrainCode = parseCanonicalTrainCode(requestedCode);
        const targetTrainCode = parseCanonicalTrainCode(targetCode);
        return (
            requestedTrainCode !== null &&
            targetTrainCode !== null &&
            requestedTrainCode.prefix === targetTrainCode.prefix &&
            requestedTrainCode.number === targetTrainCode.number
        );
    }

    return requestedCode === targetCode;
}

export function useRecentHistoryList(
    targetSource: MaybeRefOrGetter<LookupTarget | null>
) {
    const extraPages = ref<LookupHistoryPageResult[]>([]);
    const manualNextCursor = ref<string | null>(null);
    const isLoadingMore = ref(false);
    const loadMoreErrorMessage = ref('');
    const requestVersion = ref(0);
    let inFlightLoadMore: Promise<boolean> | null = null;

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
        useAsyncData<LookupHistoryPageResult | null>(
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
        const response = data.value ?? null;
        if (!target || !isResponseForTarget(target, response)) {
            return null;
        }
        return response;
    });

    const initialItems = computed(() =>
        initialResponse.value ? initialResponse.value.items : []
    );

    const items = computed(() =>
        extraPages.value.reduce(
            (mergedItems, pageItems) =>
                mergeHistoryPage(mergedItems, pageItems.items),
            mergeHistoryPage([], initialItems.value)
        )
    );

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

    const oldestLoadedServiceDate = computed(() => {
        const dates = items.value
            .map((item) => item.serviceDate)
            .filter((date) => /^\d{8}$/.test(date));
        return dates.reduce((oldest, date) => {
            if (!oldest || date < oldest) {
                return date;
            }
            return oldest;
        }, '');
    });

    const isHistoryExhausted = computed(
        () => state.value === 'success' && nextCursor.value.length === 0
    );

    function resetTransientState() {
        extraPages.value = [];
        manualNextCursor.value = null;
        isLoadingMore.value = false;
        loadMoreErrorMessage.value = '';
        inFlightLoadMore = null;
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

    async function loadMorePage(): Promise<boolean> {
        if (inFlightLoadMore) {
            return await inFlightLoadMore;
        }

        const target = toValue(targetSource);
        const cursor = nextCursor.value;
        if (!target || !cursor || isLoadingMore.value) {
            return false;
        }

        const currentRequestVersion = requestVersion.value;
        isLoadingMore.value = true;
        loadMoreErrorMessage.value = '';

        const request = (async () => {
            try {
                const result = await fetchPage(target, cursor);
                if (currentRequestVersion !== requestVersion.value) {
                    return false;
                }
                extraPages.value = [...extraPages.value, result];
                manualNextCursor.value = result.nextCursor;
                return true;
            } catch (loadMoreError) {
                if (currentRequestVersion !== requestVersion.value) {
                    return false;
                }
                loadMoreErrorMessage.value = getApiErrorMessage(
                    loadMoreError,
                    '加载更多历史记录失败，请稍后重试。'
                );
                return false;
            } finally {
                if (currentRequestVersion === requestVersion.value) {
                    isLoadingMore.value = false;
                }
            }
        })();

        inFlightLoadMore = request;
        try {
            return await request;
        } finally {
            if (inFlightLoadMore === request) {
                inFlightLoadMore = null;
            }
        }
    }

    async function loadMore() {
        if (inFlightLoadMore) {
            await inFlightLoadMore;
            return;
        }

        if (!canLoadMore.value) {
            return;
        }

        await loadMorePage();
    }

    async function ensureLoadedThroughServiceDate(serviceDate: string) {
        if (!/^\d{8}$/.test(serviceDate)) {
            return false;
        }

        const target = toValue(targetSource);
        if (!target || state.value === 'loading' || state.value === 'error') {
            return false;
        }

        while (
            oldestLoadedServiceDate.value.length === 0 ||
            oldestLoadedServiceDate.value > serviceDate
        ) {
            if (isHistoryExhausted.value) {
                break;
            }

            const cursorBeforeLoad = nextCursor.value;
            const loaded = await loadMorePage();
            if (!loaded) {
                break;
            }
            if (nextCursor.value === cursorBeforeLoad) {
                break;
            }
        }

        return (
            oldestLoadedServiceDate.value.length > 0 &&
            oldestLoadedServiceDate.value <= serviceDate
        );
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
        oldestLoadedServiceDate,
        isHistoryExhausted,
        isLoadingMore,
        canLoadMore,
        reload,
        loadMore,
        ensureLoadedThroughServiceDate
    };
}
