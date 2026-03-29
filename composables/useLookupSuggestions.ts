import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import type { TrackerApiResponse } from '~/types/homepage';
import type {
    LookupIndexResponse,
    LookupSuggestItem,
    LookupSuggestionMode
} from '~/types/lookup';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import getLookupSuggestIndex, {
    type LookupSuggestIndex
} from '~/utils/lookup/lookupSuggestIndex';
import { normalizeLookupCode } from '~/utils/lookup/lookupTarget';
import { useRecentLookupSearches } from '~/composables/useRecentLookupSearches';

const MIN_QUERY_LENGTH = 2;
const SUGGEST_LIMIT = 25;
const EMU_PREFIX = 'CR';

let cachedIndex: LookupSuggestItem[] | null = null;
let indexRequest: Promise<LookupSuggestIndex> | null = null;

async function loadLookupIndex() {
    if (cachedIndex) {
        return getLookupSuggestIndex(cachedIndex);
    }

    if (!indexRequest) {
        indexRequest = $fetch<TrackerApiResponse<LookupIndexResponse>>(
            '/api/v1/search'
        )
            .then((response) => {
                if (!response.ok) {
                    throw {
                        data: response
                    };
                }

                cachedIndex = response.data.items;
                return getLookupSuggestIndex(cachedIndex);
            })
            .finally(() => {
                indexRequest = null;
            });
    }

    return indexRequest;
}

export function useLookupSuggestions(
    querySource: MaybeRefOrGetter<string>,
    limit = SUGGEST_LIMIT
) {
    const state = ref<'idle' | 'loading' | 'success' | 'empty' | 'error'>(
        'idle'
    );
    const items = ref<LookupSuggestItem[]>([]);
    const errorMessage = ref('');
    const mode = ref<LookupSuggestionMode>('suggestions');
    const { recentSearches } = useRecentLookupSearches();

    const normalizedQuery = computed(() =>
        normalizeLookupCode(toValue(querySource))
    );

    function reset() {
        items.value = [];
        state.value = 'idle';
        errorMessage.value = '';
    }

    function resolveQueryType(query: string) {
        return query.startsWith(EMU_PREFIX) ? 'emu' : undefined;
    }

    async function refreshSuggestions(query: string) {
        if (query.length < MIN_QUERY_LENGTH) {
            mode.value = 'recent';
            items.value = recentSearches.value.slice(0, limit);
            state.value = items.value.length > 0 ? 'success' : 'empty';
            errorMessage.value = '';
            return;
        }

        mode.value = 'suggestions';
        state.value = 'loading';
        errorMessage.value = '';

        try {
            const index = await loadLookupIndex();
            const nextItems = index.query(
                query,
                resolveQueryType(query),
                limit
            );

            items.value = nextItems;
            state.value = nextItems.length > 0 ? 'success' : 'empty';
        } catch (error) {
            items.value = [];
            state.value = 'error';
            errorMessage.value = getApiErrorMessage(error, '补全加载失败');
        }
    }

    watch(
        [normalizedQuery, recentSearches],
        async ([query]) => {
            if (import.meta.server) {
                reset();
                return;
            }

            await refreshSuggestions(query);
        },
        {
            immediate: true
        }
    );

    return {
        state,
        items,
        errorMessage,
        mode,
        normalizedQuery,
        minQueryLength: MIN_QUERY_LENGTH
    };
}
