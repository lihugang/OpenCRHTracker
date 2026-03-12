import { computed, reactive, ref } from 'vue';
import type {
    PaginatedQueryResponse,
    QueryRequestState,
    TrackerApiResponse,
    WorkbenchResultItem
} from '~/types/homepage';
import getApiErrorMessage from '~/utils/getApiErrorMessage';

type QueryFormShape = Record<string, string>;

interface TrackerQueryRequest {
    path: string;
    query: Record<string, number | string | undefined>;
}

interface TrackerQueryConfig<
    TForm extends QueryFormShape,
    TResponse extends PaginatedQueryResponse<unknown>
> {
    initialForm: TForm;
    validate: (form: TForm) => string | null;
    buildRequest: (form: TForm, cursor: string) => TrackerQueryRequest;
    mapItems: (data: TResponse) => WorkbenchResultItem[];
    getSummary?: (data: TResponse, items: WorkbenchResultItem[]) => string;
}

function cloneForm<TForm extends QueryFormShape>(form: TForm) {
    return { ...form };
}

export function useTrackerQuery<
    TForm extends QueryFormShape,
    TResponse extends PaginatedQueryResponse<unknown>
>(config: TrackerQueryConfig<TForm, TResponse>) {
    const form = reactive(cloneForm(config.initialForm)) as TForm;
    const state = ref<QueryRequestState>('idle');
    const hasSearched = ref(false);
    const errorMessage = ref('');
    const summary = ref('');
    const items = ref<WorkbenchResultItem[]>([]);
    const nextCursor = ref('');
    const isLoadingMore = ref(false);

    const isSubmitting = computed(() => state.value === 'loading');
    const canLoadMore = computed(
        () =>
            state.value === 'success' &&
            nextCursor.value.length > 0 &&
            !isLoadingMore.value
    );

    async function request(append: boolean) {
        const validationError = config.validate(form);
        if (validationError) {
            if (!append) {
                items.value = [];
                nextCursor.value = '';
            }

            hasSearched.value = true;
            state.value = 'error';
            errorMessage.value = validationError;
            summary.value = '';
            return;
        }

        const cursor = append ? nextCursor.value : '';
        const { path, query } = config.buildRequest(form, cursor);

        if (append) {
            isLoadingMore.value = true;
        } else {
            state.value = 'loading';
            items.value = [];
            nextCursor.value = '';
            summary.value = '';
        }

        errorMessage.value = '';

        try {
            const response = await $fetch<TrackerApiResponse<TResponse>>(path, {
                query
            });

            if (!response.ok) {
                throw {
                    data: response
                };
            }

            const mappedItems = config.mapItems(response.data);
            const mergedItems = append
                ? [...items.value, ...mappedItems]
                : mappedItems;

            items.value = mergedItems;
            nextCursor.value = response.data.nextCursor ?? '';
            summary.value =
                config.getSummary?.(response.data, mergedItems) ??
                `已加载 ${mergedItems.length} 条结果`;
            state.value = mergedItems.length > 0 ? 'success' : 'empty';
            hasSearched.value = true;
        } catch (error) {
            const message = getApiErrorMessage(error);

            if (append) {
                errorMessage.value = `加载更多失败：${message}`;
            } else {
                state.value = 'error';
                errorMessage.value = message;
                summary.value = '';
            }

            hasSearched.value = true;
        } finally {
            if (append) {
                isLoadingMore.value = false;
            }
        }
    }

    async function submit() {
        await request(false);
    }

    async function loadMore() {
        if (!canLoadMore.value) {
            return;
        }

        await request(true);
    }

    function reset() {
        Object.assign(form, cloneForm(config.initialForm));
        state.value = 'idle';
        hasSearched.value = false;
        errorMessage.value = '';
        summary.value = '';
        items.value = [];
        nextCursor.value = '';
        isLoadingMore.value = false;
    }

    return {
        form,
        state,
        hasSearched,
        errorMessage,
        summary,
        items,
        nextCursor,
        isSubmitting,
        isLoadingMore,
        canLoadMore,
        submit,
        loadMore,
        reset
    };
}
