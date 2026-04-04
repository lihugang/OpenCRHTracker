<template>
    <LookupDetailShell
        :is-header-collapsed="isMobileHeaderCollapsed"
        :should-use-mobile-sticky-header="shouldUseMobileStickyHeader"
        expanded-background-height-class="h-[18rem]"
        collapsed-background-height-class="h-[5.25rem]"
        expanded-top-padding-class="pt-6"
        collapsed-top-padding-class="pt-3">
        <template #search>
            <LookupSearchCard
                v-model="draftCode"
                compact
                :collapsed="isMobileHeaderCollapsed"
                :title="searchTitle"
                :description="searchDescription"
                eyebrow="Quick Lookup"
                :detected-type="detectedTarget?.type ?? null"
                :error-message="inputError"
                submit-label="重新查询"
                @submit="submitSearch" />
        </template>

        <template #sidebar-favorite>
            <UiCard
                v-if="favoriteItem && eventSubscriptionTarget"
                :show-accent-bar="false"
                class="hidden min-[960px]:landscape:block">
                <div class="space-y-3">
                    <p
                        class="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                        ACTIONS
                    </p>

                    <div class="space-y-2">
                        <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                                <p
                                    class="truncate text-sm font-normal text-crh-grey-dark">
                                    {{ favoriteItem.code }}
                                </p>
                            </div>

                            <UiFavoriteButton
                                :active="isFavorited(favoriteItem)"
                                :loading="isFavoritePending(favoriteItem)"
                                size="sm"
                                @click="toggleFavoriteItem" />
                        </div>

                        <div class="flex justify-end">
                            <UiSubscriptionButton
                                :active="isSubscribed(eventSubscriptionTarget)"
                                :loading="isSubscriptionActionPending"
                                size="sm"
                                @click="toggleEventSubscriptionItem" />
                        </div>

                        <p
                            v-if="favoriteErrorMessage"
                            class="flex items-center gap-1.5 text-xs leading-5 text-[#E53E3E]">
                            <span
                                aria-hidden="true"
                                class="font-semibold">
                                [!]
                            </span>
                            <span>{{ favoriteErrorMessage }}</span>
                        </p>
                        <p
                            v-if="eventSubscriptionErrorMessage"
                            class="flex items-center gap-1.5 text-xs leading-5 text-[#E53E3E]">
                            <span
                                aria-hidden="true"
                                class="font-semibold">
                                [!]
                            </span>
                            <span>{{ eventSubscriptionErrorMessage }}</span>
                        </p>
                    </div>
                </div>
            </UiCard>
        </template>

        <div
            v-if="favoriteItem && eventSubscriptionTarget"
            class="px-1 min-[960px]:landscape:hidden">
            <div class="space-y-2">
                <UiFavoriteButton
                    :active="isFavorited(favoriteItem)"
                    :loading="isFavoritePending(favoriteItem)"
                    @click="toggleFavoriteItem" />
                <UiSubscriptionButton
                    :active="isSubscribed(eventSubscriptionTarget)"
                    :loading="isSubscriptionActionPending"
                    @click="toggleEventSubscriptionItem" />
                <p
                    v-if="favoriteErrorMessage"
                    class="flex items-center gap-1.5 pl-1 text-xs leading-5 text-[#E53E3E]">
                    <span
                        aria-hidden="true"
                        class="font-semibold">
                        [!]
                    </span>
                    <span>{{ favoriteErrorMessage }}</span>
                </p>
                <p
                    v-if="eventSubscriptionErrorMessage"
                    class="flex items-center gap-1.5 pl-1 text-xs leading-5 text-[#E53E3E]">
                    <span
                        aria-hidden="true"
                        class="font-semibold">
                        [!]
                    </span>
                    <span>{{ eventSubscriptionErrorMessage }}</span>
                </p>
            </div>
        </div>

        <LookupHistoryList
            :type="props.targetType"
            :code="normalizedCode"
            :state="state"
            :items="items"
            :summary="summary"
            :error-message="errorMessage"
            :is-loading-more="isLoadingMore"
            :can-load-more="canLoadMore"
            @request-more="loadMore" />
    </LookupDetailShell>
</template>

<script setup lang="ts">
import {
    computed,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    watch
} from 'vue';
import type { LookupTargetType } from '~/types/lookup';
import type { NotificationTarget } from '~/types/notifications';
import { useFavoriteLookups } from '~/composables/useFavoriteLookups';
import {
    buildLookupPath,
    normalizeLookupCode,
    resolveLookupTarget
} from '~/utils/lookup/lookupTarget';

const MOBILE_QUERY = '(max-width: 767px)';
const MOBILE_COLLAPSE_OFFSET = 28;
const MOBILE_STICKY_MIN_SCROLLABLE_SPACE = 160;
type LookupDetailTargetType = Extract<LookupTargetType, 'train' | 'emu'>;

const props = defineProps<{
    targetType: LookupDetailTargetType;
}>();

const route = useRoute();
const draftCode = ref('');
const inputError = ref('');
const isMobileViewport = ref(false);
const isMobileHeaderCollapsed = ref(false);
const shouldUseMobileStickyHeader = ref(false);

let mobileQueryList: MediaQueryList | null = null;
let mobileQueryHandler: ((event: MediaQueryListEvent) => void) | null = null;

const normalizedCode = computed(() =>
    normalizeLookupCode(String(route.params.code ?? ''))
);

const target = computed(() => {
    if (!normalizedCode.value) {
        return null;
    }

    return {
        type: props.targetType,
        code: normalizedCode.value
    };
});

const detectedTarget = computed(() => resolveLookupTarget(draftCode.value));
const {
    errorMessage: favoriteErrorMessage,
    addFavorite,
    isFavorited,
    isFavoritePending,
    toggleFavorite
} = useFavoriteLookups();
const {
    errorMessage: eventSubscriptionErrorMessage,
    isSubscribed,
    isPending: isEventSubscriptionPending,
    toggleEventSubscription
} = useEventSubscriptions();
const { isRefreshingCurrentDevice } = useSubscriptionDevices();
const {
    state,
    items,
    errorMessage,
    summary,
    isLoadingMore,
    canLoadMore,
    loadMore
} = useRecentHistoryList(target);

const favoriteItem = computed(() => {
    if (!target.value) {
        return null;
    }

    return {
        type: target.value.type,
        code: target.value.code,
        tags: []
    };
});
const eventSubscriptionTarget = computed<NotificationTarget | null>(() => {
    if (!target.value) {
        return null;
    }

    return {
        targetType: target.value.type,
        targetId: target.value.code
    };
});
const isSubscriptionActionPending = computed(() => {
    if (!favoriteItem.value || !eventSubscriptionTarget.value) {
        return false;
    }

    return (
        isFavoritePending(favoriteItem.value) ||
        isEventSubscriptionPending(eventSubscriptionTarget.value) ||
        isRefreshingCurrentDevice.value
    );
});

const searchTitle = computed(() => {
    return props.targetType === 'train' ? '车次详情查询' : '车组详情查询';
});

const searchDescription = computed(() => {
    return '';
});

function syncHeaderCollapsedState() {
    if (!import.meta.client) {
        return;
    }

    if (!shouldUseMobileStickyHeader.value) {
        isMobileHeaderCollapsed.value = false;
        return;
    }

    isMobileHeaderCollapsed.value = window.scrollY > MOBILE_COLLAPSE_OFFSET;
}

function syncMobileStickyHeaderState() {
    if (!import.meta.client) {
        return;
    }

    const scrollableSpace = Math.max(
        document.documentElement.scrollHeight - window.innerHeight,
        0
    );

    shouldUseMobileStickyHeader.value =
        isMobileViewport.value &&
        scrollableSpace >= MOBILE_STICKY_MIN_SCROLLABLE_SPACE;

    syncHeaderCollapsedState();
}

function handleScroll() {
    syncHeaderCollapsedState();
}

watch(
    normalizedCode,
    (value) => {
        draftCode.value = value;
        inputError.value = '';
    },
    {
        immediate: true
    }
);

watch(
    () => [state.value, items.value.length],
    async () => {
        await nextTick();
        syncMobileStickyHeaderState();
    }
);

onMounted(() => {
    mobileQueryList = window.matchMedia(MOBILE_QUERY);
    isMobileViewport.value = mobileQueryList.matches;
    mobileQueryHandler = (event: MediaQueryListEvent) => {
        isMobileViewport.value = event.matches;
        syncMobileStickyHeaderState();
    };
    mobileQueryList.addEventListener('change', mobileQueryHandler);
    window.addEventListener('resize', syncMobileStickyHeaderState, {
        passive: true
    });
    window.addEventListener('scroll', handleScroll, {
        passive: true
    });
    syncMobileStickyHeaderState();
});

onBeforeUnmount(() => {
    if (mobileQueryList && mobileQueryHandler) {
        mobileQueryList.removeEventListener('change', mobileQueryHandler);
    }

    window.removeEventListener('resize', syncMobileStickyHeaderState);
    window.removeEventListener('scroll', handleScroll);
});

useSiteSeo({
    title: () =>
        props.targetType === 'train'
            ? `${normalizedCode.value} | 车次历史记录`
            : `${normalizedCode.value} | 动车组历史记录`,
    description: () =>
        props.targetType === 'train'
            ? `${normalizedCode.value} 由哪些动车组担当`
            : `${normalizedCode.value} 最近担当过哪些车次`,
    path: () =>
        props.targetType === 'train'
            ? '/train/' + normalizedCode.value
            : '/emu/' + normalizedCode.value,
    noindex: true
});

async function toggleFavoriteItem() {
    if (!favoriteItem.value) {
        return;
    }

    await toggleFavorite(favoriteItem.value);
}

async function toggleEventSubscriptionItem() {
    if (!eventSubscriptionTarget.value) {
        return;
    }

    if (
        favoriteItem.value &&
        !isSubscribed(eventSubscriptionTarget.value) &&
        !isFavorited(favoriteItem.value)
    ) {
        const favoriteAdded = await addFavorite(favoriteItem.value);
        if (!favoriteAdded) {
            return;
        }
    }

    await toggleEventSubscription(eventSubscriptionTarget.value);
}

async function submitSearch() {
    const resolvedTarget = resolveLookupTarget(draftCode.value);
    if (!resolvedTarget) {
        inputError.value = '请输入车次号或车组号。';
        return;
    }

    inputError.value = '';
    await navigateTo(buildLookupPath(resolvedTarget));
}
</script>
