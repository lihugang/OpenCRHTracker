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

        <LookupStationTimetableList
            :station-name="stationName"
            :state="state"
            :items="items"
            :summary="summary"
            :error-message="errorMessage"
            :is-loading-more="isLoadingMore"
            :can-load-more="canLoadMore"
            :focus-train-codes="focusedTrainCodes"
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
import type { StationTimetableRecord } from '~/types/lookup';
import {
    buildLookupPath,
    normalizeLookupCode,
    resolveLookupTarget
} from '~/utils/lookup/lookupTarget';

const MOBILE_QUERY = '(max-width: 767px)';
const MOBILE_COLLAPSE_OFFSET = 28;
const MOBILE_STICKY_MIN_SCROLLABLE_SPACE = 160;

const route = useRoute();
const draftCode = ref('');
const inputError = ref('');
const isMobileViewport = ref(false);
const isMobileHeaderCollapsed = ref(false);
const shouldUseMobileStickyHeader = ref(false);
const focusLocateToken = ref(0);
const isLocatingFocusedTrain = ref(false);

let mobileQueryList: MediaQueryList | null = null;
let mobileQueryHandler: ((event: MediaQueryListEvent) => void) | null = null;

const stationName = computed(() => String(route.params.name ?? '').trim());
const focusedTrainCodes = computed(() => {
    const rawValue = route.query.focusTrain;
    const rawCodes = Array.isArray(rawValue) ? rawValue : [rawValue];

    return Array.from(
        new Set(
            rawCodes
                .filter((value): value is string => typeof value === 'string')
                .map((code) => code.trim().toUpperCase())
                .filter((code) => code.length > 0)
        )
    );
});

const target = computed(() => {
    if (!stationName.value) {
        return null;
    }

    return {
        type: 'station' as const,
        code: stationName.value
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
} = useStationTimetableList(target);

const searchTitle = computed(() => '车站时刻表查询');
const searchDescription = computed(() => '');

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

function recordMatchesFocusedTrain(
    item: StationTimetableRecord,
    focusCodeSet: Set<string>
) {
    const normalizedTrainCode = item.trainCode.trim().toUpperCase();
    if (
        normalizedTrainCode.length > 0 &&
        focusCodeSet.has(normalizedTrainCode)
    ) {
        return true;
    }

    return item.allCodes.some((code) => {
        const normalizedCode = code.trim().toUpperCase();
        return normalizedCode.length > 0 && focusCodeSet.has(normalizedCode);
    });
}

function hasFocusedTrainMatch() {
    if (focusedTrainCodes.value.length === 0) {
        return false;
    }

    const focusCodeSet = new Set(focusedTrainCodes.value);
    return items.value.some((item) =>
        recordMatchesFocusedTrain(item, focusCodeSet)
    );
}

async function ensureFocusedTrainLoaded() {
    if (!import.meta.client) {
        return;
    }

    if (
        focusedTrainCodes.value.length === 0 ||
        state.value !== 'success' ||
        hasFocusedTrainMatch() ||
        !canLoadMore.value ||
        isLocatingFocusedTrain.value
    ) {
        return;
    }

    const currentToken = focusLocateToken.value;
    isLocatingFocusedTrain.value = true;

    try {
        while (
            currentToken === focusLocateToken.value &&
            focusedTrainCodes.value.length > 0 &&
            state.value === 'success' &&
            !hasFocusedTrainMatch() &&
            canLoadMore.value &&
            !errorMessage.value
        ) {
            await loadMore();
            await nextTick();
        }
    } finally {
        if (currentToken === focusLocateToken.value) {
            isLocatingFocusedTrain.value = false;
        }
    }
}

watch(
    stationName,
    (value) => {
        draftCode.value = normalizeLookupCode(value);
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

watch(
    () => [stationName.value, focusedTrainCodes.value.join('|')],
    () => {
        focusLocateToken.value += 1;
        isLocatingFocusedTrain.value = false;
    },
    {
        immediate: true
    }
);

watch(
    () => [
        stationName.value,
        focusedTrainCodes.value.join('|'),
        state.value,
        items.value.length,
        canLoadMore.value,
        isLoadingMore.value,
        errorMessage.value
    ],
    () => {
        void ensureFocusedTrainLoaded();
    },
    {
        immediate: true
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
    title: () => `${stationName.value} | 车站时刻表`,
    description: () => `${stationName.value} 车站时刻表`,
    path: () => '/station/' + encodeURIComponent(stationName.value),
    noindex: true
});

async function submitSearch() {
    const resolvedTarget = resolveLookupTarget(draftCode.value);
    if (!resolvedTarget) {
        inputError.value = '请输入车次号、车组号或车站名。';
        return;
    }

    inputError.value = '';
    await navigateTo(buildLookupPath(resolvedTarget));
}
</script>
