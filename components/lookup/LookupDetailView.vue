<template>
    <main
        :class="['flex min-h-screen flex-col bg-crh-slate text-crh-grey-dark']">
        <div
            :class="[
                'pointer-events-none absolute inset-x-0 top-0 bg-[radial-gradient(circle_at_top,_rgba(0,82,155,0.1),_transparent_58%)] transition-[height,opacity] duration-200 ease-out',
                isMobileHeaderCollapsed ? 'h-[5.25rem]' : 'h-[18rem]'
            ]" />

        <div
            :class="[
                'relative mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 pb-10 sm:px-6 lg:px-8 transition-[padding-top] duration-200 ease-out',
                isMobileHeaderCollapsed ? 'pt-3' : 'pt-6'
            ]">
            <div
                class="grid gap-6 min-[960px]:landscape:grid-cols-[minmax(18rem,20%)_minmax(0,1fr)] min-[960px]:landscape:items-start">
                <div
                    :class="[
                        shouldUseMobileStickyHeader
                            ? 'max-[767px]:sticky max-[767px]:top-3 max-[767px]:z-20'
                            : '',
                        'min-[960px]:landscape:sticky min-[960px]:landscape:top-6 min-[960px]:landscape:min-w-[18rem]'
                    ]">
                    <LookupSearchCard
                        v-model="draftCode"
                        compact
                        :collapsed="isMobileHeaderCollapsed"
                        :title="searchTitle"
                        :description="searchDescription"
                        eyebrow="Quick Lookup"
                        :detected-type="detectedTarget?.type ?? null"
                        :error-message="inputError"
                        auto-focus
                        submit-label="重新查询"
                        @submit="submitSearch" />

                    <UiCard
                        :show-accent-bar="false"
                        :class="[
                            'mt-4 transition-[opacity,transform,max-height,margin-top] duration-200 ease-out',
                            isMobileHeaderCollapsed
                                ? 'max-[767px]:mt-2 max-[767px]:max-h-0 max-[767px]:overflow-hidden max-[767px]:opacity-0 max-[767px]:pointer-events-none max-[767px]:-translate-y-2'
                                : ''
                        ]">
                        <div class="space-y-3">
                            <p
                                class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                                Quick Links
                            </p>
                            <AppFooterLinks
                                class="justify-center min-[960px]:landscape:justify-start" />
                        </div>
                    </UiCard>
                </div>

                <div>
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
                </div>
            </div>
        </div>

        <AppFooter />
    </main>
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
import {
    buildLookupPath,
    normalizeLookupCode,
    resolveLookupTarget
} from '~/utils/lookup/lookupTarget';

const MOBILE_QUERY = '(max-width: 767px)';
const MOBILE_COLLAPSE_OFFSET = 28;
const MOBILE_STICKY_MIN_SCROLLABLE_SPACE = 160;

const props = defineProps<{
    targetType: LookupTargetType;
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
    state,
    items,
    errorMessage,
    summary,
    isLoadingMore,
    canLoadMore,
    loadMore
} = useRecentHistoryList(target);

const searchTitle = computed(() => {
    return props.targetType === 'train' ? '车次详情查询' : '车组详情查询';
});

const searchDescription = computed(() => {
    return props.targetType === 'train'
        ? '查看该车次的担当历史，并继续检索其他车次或车组。'
        : '查看该车组的运行历史，并继续检索其他车次或车组。';
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

useHead(() => ({
    title:
        props.targetType === 'train'
            ? `${normalizedCode.value} | 车次历史`
            : `${normalizedCode.value} | 车组历史`,
    meta: [
        {
            name: 'description',
            content:
                props.targetType === 'train'
                    ? `${normalizedCode.value} 由哪些车组担当。`
                    : `${normalizedCode.value} 担当了哪些车次。`
        }
    ]
}));

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
