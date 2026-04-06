<template>
    <UiCard
        :variant="compact ? 'subtle' : 'accent'"
        allow-overflow>
        <div class="absolute inset-0 overflow-hidden rounded-[inherit]">
            <img
                src="/images/background.png"
                alt=""
                aria-hidden="true"
                class="h-full w-full object-cover object-[68%_center]" />
            <div
                class="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.95)_0%,rgba(248,250,252,0.86)_42%,rgba(248,250,252,0.72)_72%,rgba(248,250,252,0.84)_100%)]" />
        </div>

        <div
            :class="[
                'relative @container',
                compact ? (collapsed ? 'space-y-3' : 'space-y-5') : 'space-y-6'
            ]">
            <div :class="collapsed ? 'space-y-2' : 'space-y-3'">
                <div class="space-y-2">
                    <p
                        v-if="!collapsed && eyebrow"
                        class="text-xs font-medium uppercase tracking-[0.28em] text-crh-blue/70">
                        {{ eyebrow }}
                    </p>
                    <h1
                        :class="[
                            'font-semibold tracking-tight text-crh-grey-dark',
                            compact
                                ? collapsed
                                    ? 'text-lg'
                                    : 'text-2xl'
                                : 'text-2xl md:text-3xl'
                        ]">
                        {{ title }}
                    </h1>
                    <p
                        v-if="description && !collapsed"
                        :class="[
                            'leading-7 text-slate-600',
                            compact
                                ? 'text-sm'
                                : 'max-w-2xl text-sm md:text-base'
                        ]">
                        {{ description }}
                    </p>
                </div>
            </div>

            <form
                :class="collapsed ? 'space-y-3' : 'space-y-4'"
                @submit.prevent="submitCurrentValue">
                <div class="space-y-3">
                    <label
                        for="lookup-input"
                        :class="
                            collapsed
                                ? 'sr-only'
                                : 'text-sm font-medium text-crh-grey-dark'
                        ">
                        {{ inputLabel }}
                    </label>

                    <div
                        :class="[
                            'grid gap-3',
                            layoutMode === 'responsive'
                                ? '@min-[32rem]:grid-cols-[minmax(0,1fr)_auto] @min-[32rem]:items-start'
                                : ''
                        ]">
                        <div
                            ref="rootRef"
                            class="relative min-w-0 space-y-1.5">
                            <input
                                id="lookup-input"
                                ref="inputRef"
                                :value="modelValue"
                                type="text"
                                inputmode="text"
                                autocomplete="off"
                                :placeholder="props.placeholder"
                                :class="[
                                    'harmony-input w-full px-5 text-base placeholder:text-slate-400',
                                    collapsed ? 'py-2.5' : 'py-3',
                                    errorMessage
                                        ? 'border-rose-300 focus:border-rose-300 focus:ring-rose-200/60'
                                        : ''
                                ]"
                                @focus="handleFocus"
                                @input="handleInput"
                                @keydown.down.prevent="moveActive(1)"
                                @keydown.up.prevent="moveActive(-1)"
                                @keydown.enter.prevent="submitFromEnter"
                                @keydown.esc.prevent="closeMenu" />

                            <p
                                v-if="errorMessage"
                                class="flex items-center gap-1.5 pl-1 text-xs leading-5 text-[#E53E3E]">
                                <span
                                    aria-hidden="true"
                                    class="font-semibold">
                                    [!]
                                </span>
                                <span>{{ errorMessage }}</span>
                            </p>

                            <div
                                v-if="shouldRenderInlineMenu"
                                ref="inlineMenuRef"
                                :class="[
                                    'absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-slate-200/90 bg-white/96 shadow-[0_18px_40px_-18px_rgba(15,23,42,0.35)] backdrop-blur',
                                    isMeasuringOcclusion
                                        ? 'invisible pointer-events-none'
                                        : ''
                                ]">
                                <div
                                    v-if="suggestionsState === 'loading'"
                                    class="px-4 py-3 text-sm text-slate-500">
                                    {{ loadingMessage }}
                                </div>

                                <div
                                    v-else-if="suggestionsState === 'error'"
                                    class="px-4 py-3 text-sm text-status-delayed">
                                    {{ suggestionsErrorMessage || suggestionLoadErrorFallback }}
                                </div>

                                <div
                                    v-else-if="suggestionsState === 'empty'"
                                    class="px-4 py-3 text-sm text-slate-500">
                                    {{ emptyStateMessage }}
                                </div>

                                <div
                                    v-else
                                    ref="suggestionListRef"
                                    class="harmony-scrollbar max-h-72 overflow-y-auto py-2">
                                    <template
                                        v-for="section in menuSections"
                                        :key="section.id">
                                        <div
                                            v-if="section.title"
                                            class="px-4 pb-2 pt-1 text-[11px] font-medium uppercase tracking-[0.24em] text-slate-400">
                                            {{ section.title }}
                                        </div>

                                        <button
                                            v-for="entry in section.entries"
                                            :key="`${section.id}:${entry.key}`"
                                            type="button"
                                            :data-suggestion-index="entry.index"
                                            :class="[
                                                'flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition',
                                                activeIndex === entry.index
                                                    ? 'bg-blue-50 text-crh-blue'
                                                    : 'text-crh-grey-dark hover:bg-slate-50'
                                            ]"
                                            @mousedown.prevent
                                            @mouseenter="
                                                activeIndex = entry.index
                                            "
                                            @click="
                                                selectSuggestion(entry.item)
                                            ">
                                            <span
                                                :class="[
                                                    'flex min-w-0 items-start gap-3',
                                                    compact
                                                        ? 'flex-wrap gap-x-3 gap-y-1'
                                                        : ''
                                                ]">
                                                <span
                                                    class="shrink-0 text-sm font-semibold">
                                                    {{ entry.item.code }}
                                                </span>
                                                <span
                                                    class="flex min-w-0 flex-1 flex-col gap-1.5">
                                                    <span
                                                        v-if="
                                                            getSuggestionSubtitle(
                                                                entry.item
                                                            )
                                                        "
                                                        :class="[
                                                            'min-w-0 text-xs text-slate-500',
                                                            compact
                                                                ? ''
                                                                : 'truncate'
                                                        ]">
                                                        {{
                                                            getSuggestionSubtitle(
                                                                entry.item
                                                            )
                                                        }}
                                                    </span>
                                                    <span
                                                        v-if="
                                                            getSuggestionTags(
                                                                entry.item
                                                            ).length > 0
                                                        "
                                                        class="flex flex-wrap gap-1.5">
                                                        <span
                                                            v-for="tag in getSuggestionTags(
                                                                entry.item
                                                            )"
                                                            :key="tag"
                                                            class="inline-flex items-center rounded-full bg-blue-600/8 px-2 py-0.5 text-[11px] font-medium leading-none text-blue-600">
                                                            {{ tag }}
                                                        </span>
                                                    </span>
                                                </span>
                                            </span>

                                            <svg
                                                v-if="entry.isFavorite"
                                                aria-hidden="true"
                                                viewBox="0 0 20 20"
                                                class="h-4 w-4 shrink-0 fill-current text-amber-500">
                                                <path
                                                    d="M10 2.4L12.28 7.03L17.39 7.78L13.7 11.38L14.57 16.46L10 14.06L5.43 16.46L6.3 11.38L2.61 7.78L7.72 7.03L10 2.4Z" />
                                            </svg>
                                        </button>
                                    </template>
                                </div>
                            </div>
                        </div>

                        <UiButton
                            type="submit"
                            :loading="loading"
                            :class="[
                                'w-full px-6',
                                layoutMode === 'responsive'
                                    ? '@min-[32rem]:w-auto'
                                    : '',
                                collapsed ? 'h-[46px]' : 'h-[50px]'
                            ]">
                            {{ submitLabel }}
                        </UiButton>
                    </div>
                </div>
            </form>
        </div>
    </UiCard>

    <Teleport to="body">
        <div
            v-if="shouldRenderTeleportMenu && menuStyle"
            ref="menuPanelRef"
            :style="menuStyle"
            class="z-[60] overflow-hidden rounded-2xl border border-slate-200/90 bg-white/98 shadow-[0_18px_40px_-18px_rgba(15,23,42,0.35)] min-[768px]:backdrop-blur">
            <div
                v-if="suggestionsState === 'loading'"
                class="px-4 py-3 text-sm text-slate-500">
                {{ loadingMessage }}
            </div>

            <div
                v-else-if="suggestionsState === 'error'"
                class="px-4 py-3 text-sm text-status-delayed">
                {{ suggestionsErrorMessage || suggestionLoadErrorFallback }}
            </div>

            <div
                v-else-if="suggestionsState === 'empty'"
                class="px-4 py-3 text-sm text-slate-500">
                {{ emptyStateMessage }}
            </div>

            <div
                v-else
                ref="suggestionListRef"
                class="harmony-scrollbar overflow-y-auto py-2"
                :style="suggestionListStyle">
                <template
                    v-for="section in menuSections"
                    :key="section.id">
                    <div
                        v-if="section.title"
                        class="px-4 pb-2 pt-1 text-[11px] font-medium uppercase tracking-[0.24em] text-slate-400">
                        {{ section.title }}
                    </div>

                    <button
                        v-for="entry in section.entries"
                        :key="`${section.id}:${entry.key}`"
                        type="button"
                        :data-suggestion-index="entry.index"
                        :class="[
                            'flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition',
                            activeIndex === entry.index
                                ? 'bg-blue-50 text-crh-blue'
                                : 'text-crh-grey-dark hover:bg-slate-50'
                        ]"
                        @mousedown.prevent
                        @mouseenter="activeIndex = entry.index"
                        @click="selectSuggestion(entry.item)">
                        <span
                            :class="[
                                'flex min-w-0 items-start gap-3',
                                compact ? 'flex-wrap gap-x-3 gap-y-1' : ''
                            ]">
                            <span class="shrink-0 text-sm font-semibold">
                                {{ entry.item.code }}
                            </span>
                            <span class="flex min-w-0 flex-1 flex-col gap-1.5">
                                <span
                                    v-if="getSuggestionSubtitle(entry.item)"
                                    :class="[
                                        'min-w-0 text-xs text-slate-500',
                                        compact ? '' : 'truncate'
                                    ]">
                                    {{ getSuggestionSubtitle(entry.item) }}
                                </span>
                                <span
                                    v-if="getSuggestionTags(entry.item).length > 0"
                                    class="flex flex-wrap gap-1.5">
                                    <span
                                        v-for="tag in getSuggestionTags(entry.item)"
                                        :key="tag"
                                        class="inline-flex items-center rounded-full bg-blue-600/8 px-2 py-0.5 text-[11px] font-medium leading-none text-blue-600">
                                        {{ tag }}
                                    </span>
                                </span>
                            </span>
                        </span>

                        <svg
                            v-if="entry.isFavorite"
                            aria-hidden="true"
                            viewBox="0 0 20 20"
                            class="h-4 w-4 shrink-0 fill-current text-amber-500">
                            <path
                                d="M10 2.4L12.28 7.03L17.39 7.78L13.7 11.38L14.57 16.46L10 14.06L5.43 16.46L6.3 11.38L2.61 7.78L7.72 7.03L10 2.4Z" />
                        </svg>
                    </button>
                </template>
            </div>
        </div>
    </Teleport>
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
import type { CSSProperties } from 'vue';
import type {
    FavoriteLookupItem,
    LookupSuggestItem,
    LookupTargetType,
    RecentLookupSearchItem
} from '~/types/lookup';
import { useFavoriteLookups } from '~/composables/useFavoriteLookups';
import { useRecentLookupSearches } from '~/composables/useRecentLookupSearches';
import safeFocus from '~/utils/safeFocus';
import {
    buildLookupFavoriteFallbackSubtitle,
    buildLookupItemKeyFromItem,
    buildLookupItemKeyFromTarget
} from '~/utils/lookup/lookupFavorite';
import { resolveLookupTarget } from '~/utils/lookup/lookupTarget';

const DETAIL_STICKY_OVERLAY_FALLBACK_STORAGE_KEY =
    'opencrhtracker:lookup-search-overlay-fallback:detail-sticky:v1';
const MENU_SAMPLE_X_RATIOS = [0.2, 0.5, 0.8] as const;
const MENU_SAMPLE_Y_OFFSETS = [12, 36, 72] as const;
const MENU_SAMPLE_INSET_PX = 8;
const MENU_INLINE_MAX_HEIGHT_PX = 288;
const MENU_FALLBACK_MIN_HEIGHT_PX = 120;
const MENU_FALLBACK_GAP_PX = 8;
const MENU_FALLBACK_VIEWPORT_PADDING_PX = 12;
const MENU_TOP_ROW_OCCLUDED_THRESHOLD = 2;
const MENU_TOTAL_OCCLUDED_THRESHOLD = 3;
const inputLabel = '\u8f66\u6b21\u53f7 / \u8f66\u7ec4\u53f7';
const loadingMessage = '\u6b63\u5728\u52a0\u8f7d\u8865\u5168...';
const suggestionLoadErrorFallback = '\u8865\u5168\u52a0\u8f7d\u5931\u8d25';
const favoriteSectionTitle = '\u6536\u85cf';
const recentSectionTitle = '\u6700\u8fd1\u641c\u7d22';
const emptyRecentStateMessage =
    '\u6682\u65e0\u6536\u85cf\u6216\u6700\u8fd1\u641c\u7d22';
const emptySuggestionStateMessage = '\u672a\u627e\u5230\u5339\u914d\u9879';

type OverlayFallbackProfile = 'none' | 'detail-sticky';
type MenuRenderMode = 'inline' | 'teleport';

const props = withDefaults(
    defineProps<{
        modelValue: string;
        title: string;
        description: string;
        eyebrow?: string;
        loading?: boolean;
        compact?: boolean;
        collapsed?: boolean;
        errorMessage?: string;
        detectedType?: LookupTargetType | null;
        submitLabel?: string;
        placeholder?: string;
        autoFocus?: boolean;
        layoutMode?: 'responsive' | 'stacked';
        overlayFallbackProfile?: OverlayFallbackProfile;
    }>(),
    {
        eyebrow: 'OpenCRHTracker',
        loading: false,
        autoFocus: false,
        compact: false,
        collapsed: false,
        errorMessage: '',
        detectedType: null,
        submitLabel: '\u67e5\u8be2',
        placeholder: 'D2212 \u6216 CR400AF-C-2214',
        layoutMode: 'responsive',
        overlayFallbackProfile: 'none'
    }
);

const emit = defineEmits<{
    submit: [];
    'update:modelValue': [value: string];
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const rootRef = ref<HTMLElement | null>(null);
const inlineMenuRef = ref<HTMLElement | null>(null);
const suggestionListRef = ref<HTMLElement | null>(null);
const menuPanelRef = ref<HTMLElement | null>(null);
const activeIndex = ref(-1);
const isMenuOpen = ref(false);
const isClient = ref(false);
const isMeasuringOcclusion = ref(false);
const renderMode = ref<MenuRenderMode>('inline');
const hasDetailStickyFallbackCache = ref(false);
const menuStyle = ref<CSSProperties | null>(null);
const suggestionListStyle = ref<CSSProperties>({
    maxHeight: `${MENU_INLINE_MAX_HEIGHT_PX}px`
});
let hasTeleportListeners = false;

const {
    state: suggestionsState,
    items: suggestionItems,
    errorMessage: suggestionsErrorMessage,
    mode: suggestionMode
} = useLookupSuggestions(() => props.modelValue);
const { addRecentSearch } = useRecentLookupSearches();
const { items: favoriteItems, favoriteKeySet } = useFavoriteLookups();

const recentMenuItems = computed(() => {
    if (suggestionMode.value !== 'recent') {
        return [];
    }

    return suggestionItems.value.filter(
        (item) => !favoriteKeySet.value.has(buildLookupItemKeyFromItem(item))
    );
});

type LookupMenuItem = LookupSuggestItem | FavoriteLookupItem;

const menuSections = computed(() => {
    const sections: Array<{
        id: 'favorites' | 'recent' | 'suggestions';
        title: string;
        entries: Array<{
            item: LookupMenuItem;
            index: number;
            key: string;
            isFavorite: boolean;
        }>;
    }> = [];
    let currentIndex = 0;

    function pushSection(
        id: 'favorites' | 'recent' | 'suggestions',
        title: string,
        items: LookupMenuItem[]
    ) {
        if (items.length === 0) {
            return;
        }

        sections.push({
            id,
            title,
            entries: items.map((item) => {
                const entry = {
                    item,
                    index: currentIndex,
                    key: buildLookupItemKeyFromItem(item),
                    isFavorite: favoriteKeySet.value.has(
                        buildLookupItemKeyFromItem(item)
                    )
                };

                currentIndex += 1;
                return entry;
            })
        });
    }

    if (suggestionMode.value === 'recent') {
        pushSection('favorites', favoriteSectionTitle, favoriteItems.value);
        pushSection('recent', recentSectionTitle, recentMenuItems.value);
        return sections;
    }

    pushSection('suggestions', '', suggestionItems.value);
    return sections;
});

const menuEntries = computed(() =>
    menuSections.value.flatMap((section) => section.entries)
);

const shouldShowMenu = computed(() => {
    if (!isMenuOpen.value) {
        return false;
    }

    return (
        suggestionsState.value === 'loading' ||
        suggestionsState.value === 'error' ||
        suggestionsState.value === 'empty' ||
        menuEntries.value.length > 0
    );
});

const shouldRenderInlineMenu = computed(
    () =>
        shouldShowMenu.value &&
        (renderMode.value === 'inline' || isMeasuringOcclusion.value)
);

const shouldRenderTeleportMenu = computed(
    () =>
        isClient.value &&
        shouldShowMenu.value &&
        renderMode.value === 'teleport'
);

const isTeleportMenuActive = computed(
    () => shouldShowMenu.value && renderMode.value === 'teleport'
);

const shouldUseDetailStickyFallbackProfile = computed(
    () => props.overlayFallbackProfile === 'detail-sticky'
);

const emptyStateMessage = computed(() =>
    suggestionMode.value === 'recent'
        ? emptyRecentStateMessage
        : emptySuggestionStateMessage
);

function readDetailStickyFallbackCache() {
    if (!import.meta.client) {
        return false;
    }

    try {
        return (
            window.localStorage.getItem(
                DETAIL_STICKY_OVERLAY_FALLBACK_STORAGE_KEY
            ) === '1'
        );
    } catch {
        return false;
    }
}

function persistDetailStickyFallbackCache() {
    if (!import.meta.client) {
        return;
    }

    try {
        window.localStorage.setItem(
            DETAIL_STICKY_OVERLAY_FALLBACK_STORAGE_KEY,
            '1'
        );
    } catch {
        // Keep the runtime fallback even if storage is unavailable.
    }
}

function closeMenu() {
    isMenuOpen.value = false;
    activeIndex.value = -1;
    isMeasuringOcclusion.value = false;
    renderMode.value = 'inline';
    menuStyle.value = null;
    suggestionListStyle.value = {
        maxHeight: `${MENU_INLINE_MAX_HEIGHT_PX}px`
    };
}

function handleFocus() {
    void openMenu();
}

function handleInput(event: Event) {
    emit('update:modelValue', (event.target as HTMLInputElement).value);
    activeIndex.value = -1;

    if (!isMenuOpen.value) {
        void openMenu();
    }
}

async function moveActive(direction: 1 | -1) {
    if (!isMenuOpen.value) {
        await openMenu();
    }

    if (menuEntries.value.length === 0) {
        return;
    }

    if (activeIndex.value < 0) {
        activeIndex.value = direction > 0 ? 0 : menuEntries.value.length - 1;
        return;
    }

    activeIndex.value =
        (activeIndex.value + direction + menuEntries.value.length) %
        menuEntries.value.length;
}

function toRecentLookupSearchItem(
    item: LookupMenuItem
): RecentLookupSearchItem {
    if ('subtitle' in item) {
        return item;
    }

    return {
        type: item.type,
        code: item.code,
        subtitle: buildLookupFavoriteFallbackSubtitle(item.type),
        tags: item.tags
    };
}

async function selectSuggestion(item: LookupMenuItem) {
    emit('update:modelValue', item.code);
    addRecentSearch(toRecentLookupSearchItem(item));
    closeMenu();
    await nextTick();
    emit('submit');
}

function getSingleSuggestion() {
    if (
        suggestionMode.value !== 'suggestions' ||
        suggestionsState.value !== 'success' ||
        menuEntries.value.length !== 1
    ) {
        return null;
    }

    const item = menuEntries.value[0]?.item ?? null;
    return item && 'subtitle' in item ? item : null;
}

function getSuggestionSubtitle(item: LookupMenuItem) {
    if (!('subtitle' in item) || typeof item.subtitle !== 'string') {
        return '';
    }

    return item.subtitle.trim();
}

function getSuggestionTags(item: LookupMenuItem) {
    return Array.isArray(item.tags)
        ? item.tags
              .filter((tag): tag is string => typeof tag === 'string')
              .map((tag) => tag.trim())
              .filter((tag) => tag.length > 0)
        : [];
}

function isSameSuggestionItem(
    left: LookupSuggestItem,
    right: { type: LookupTargetType; code: string }
) {
    return (
        buildLookupItemKeyFromItem(left) === buildLookupItemKeyFromTarget(right)
    );
}

function resolveRecentSearchItem() {
    const resolvedTarget = resolveLookupTarget(props.modelValue);
    if (!resolvedTarget) {
        return null;
    }

    const matchedSuggestion = suggestionItems.value.find((item) =>
        isSameSuggestionItem(item, resolvedTarget)
    );

    if (matchedSuggestion) {
        return matchedSuggestion;
    }

    return {
        type: resolvedTarget.type,
        code: resolvedTarget.code,
        subtitle: buildLookupFavoriteFallbackSubtitle(resolvedTarget.type),
        tags: []
    } satisfies RecentLookupSearchItem;
}

function recordCurrentSearch() {
    const recentSearchItem = resolveRecentSearchItem();
    if (!recentSearchItem) {
        return;
    }

    addRecentSearch(recentSearchItem);
}

async function submitCurrentValue() {
    const singleSuggestion = getSingleSuggestion();
    if (singleSuggestion) {
        await selectSuggestion(singleSuggestion);
        return;
    }

    recordCurrentSearch();
    closeMenu();
    emit('submit');
}

async function submitFromEnter() {
    const activeItem =
        shouldShowMenu.value && activeIndex.value >= 0
            ? (menuEntries.value[activeIndex.value]?.item ?? null)
            : null;

    if (activeItem) {
        await selectSuggestion(activeItem);
        return;
    }

    await submitCurrentValue();
}

function handleDocumentPointerDown(event: PointerEvent) {
    if (!rootRef.value) {
        return;
    }

    if (event.target instanceof Node && rootRef.value.contains(event.target)) {
        return;
    }

    if (
        renderMode.value === 'teleport' &&
        event.target instanceof Node &&
        menuPanelRef.value?.contains(event.target)
    ) {
        return;
    }

    closeMenu();
}

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

function buildInlineMenuSamplePoints(rect: DOMRect) {
    const viewportWidth =
        window.visualViewport?.width ?? document.documentElement.clientWidth;
    const viewportHeight =
        window.visualViewport?.height ?? window.innerHeight;
    const minX = rect.left + MENU_SAMPLE_INSET_PX;
    const maxX = rect.right - MENU_SAMPLE_INSET_PX;
    const minY = rect.top + MENU_SAMPLE_INSET_PX;
    const maxY = rect.bottom - MENU_SAMPLE_INSET_PX;
    const fallbackX = clamp(
        rect.left + rect.width / 2,
        MENU_SAMPLE_INSET_PX,
        Math.max(viewportWidth - MENU_SAMPLE_INSET_PX, MENU_SAMPLE_INSET_PX)
    );
    const fallbackY = clamp(
        rect.top + rect.height / 2,
        MENU_SAMPLE_INSET_PX,
        Math.max(viewportHeight - MENU_SAMPLE_INSET_PX, MENU_SAMPLE_INSET_PX)
    );

    return MENU_SAMPLE_Y_OFFSETS.flatMap((offset, rowIndex) =>
        MENU_SAMPLE_X_RATIOS.map((ratio) => {
            const rawX = rect.left + rect.width * ratio;
            const rawY = rect.top + offset;
            const x =
                minX <= maxX
                    ? clamp(rawX, minX, maxX)
                    : fallbackX;
            const y =
                minY <= maxY
                    ? clamp(rawY, minY, maxY)
                    : fallbackY;

            return {
                x: clamp(
                    x,
                    MENU_SAMPLE_INSET_PX,
                    Math.max(
                        viewportWidth - MENU_SAMPLE_INSET_PX,
                        MENU_SAMPLE_INSET_PX
                    )
                ),
                y: clamp(
                    y,
                    MENU_SAMPLE_INSET_PX,
                    Math.max(
                        viewportHeight - MENU_SAMPLE_INSET_PX,
                        MENU_SAMPLE_INSET_PX
                    )
                ),
                rowIndex
            };
        })
    );
}

function detectInlineMenuOcclusion() {
    if (!import.meta.client || !inlineMenuRef.value) {
        return false;
    }

    const menuRect = inlineMenuRef.value.getBoundingClientRect();
    if (menuRect.width <= 0 || menuRect.height <= 0) {
        return false;
    }

    const samplePoints = buildInlineMenuSamplePoints(menuRect);
    let topRowOccludedPoints = 0;
    let totalOccludedPoints = 0;

    for (const point of samplePoints) {
        const topElement = document.elementFromPoint(point.x, point.y);

        if (!topElement || inlineMenuRef.value.contains(topElement)) {
            continue;
        }

        totalOccludedPoints += 1;

        if (point.rowIndex === 0) {
            topRowOccludedPoints += 1;
        }
    }

    return (
        topRowOccludedPoints >= MENU_TOP_ROW_OCCLUDED_THRESHOLD ||
        totalOccludedPoints >= MENU_TOTAL_OCCLUDED_THRESHOLD
    );
}

function waitForAnimationFrame() {
    return new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
    });
}

function syncMenuPosition() {
    if (!import.meta.client || !shouldRenderTeleportMenu.value || !rootRef.value) {
        return;
    }

    const rootRect = rootRef.value.getBoundingClientRect();
    if (rootRect.width <= 0 || rootRect.height <= 0) {
        return;
    }

    const viewportWidth =
        window.visualViewport?.width ?? document.documentElement.clientWidth;
    const viewportHeight =
        window.visualViewport?.height ?? window.innerHeight;
    const maxMenuWidth = Math.max(
        viewportWidth - MENU_FALLBACK_VIEWPORT_PADDING_PX * 2,
        0
    );
    const menuWidth = Math.min(rootRect.width, maxMenuWidth);
    const maxLeft =
        MENU_FALLBACK_VIEWPORT_PADDING_PX +
        Math.max(maxMenuWidth - menuWidth, 0);
    const left = Math.min(
        Math.max(rootRect.left, MENU_FALLBACK_VIEWPORT_PADDING_PX),
        maxLeft
    );
    const top = Math.max(
        rootRect.bottom + MENU_FALLBACK_GAP_PX,
        MENU_FALLBACK_VIEWPORT_PADDING_PX
    );
    const availableHeight = Math.max(
        viewportHeight - top - MENU_FALLBACK_VIEWPORT_PADDING_PX,
        MENU_FALLBACK_MIN_HEIGHT_PX
    );

    menuStyle.value = {
        position: 'fixed',
        top: `${Math.round(top)}px`,
        left: `${Math.round(left)}px`,
        width: `${Math.round(menuWidth)}px`
    };
    suggestionListStyle.value = {
        maxHeight: `${Math.round(
            Math.min(availableHeight, MENU_INLINE_MAX_HEIGHT_PX)
        )}px`
    };
}

function attachTeleportListeners() {
    if (!import.meta.client || hasTeleportListeners) {
        return;
    }

    window.addEventListener('scroll', syncMenuPosition, {
        passive: true,
        capture: true
    });
    window.addEventListener('resize', syncMenuPosition, {
        passive: true
    });
    window.visualViewport?.addEventListener('resize', syncMenuPosition);
    window.visualViewport?.addEventListener('scroll', syncMenuPosition);
    hasTeleportListeners = true;
}

function detachTeleportListeners() {
    if (!import.meta.client || !hasTeleportListeners) {
        return;
    }

    window.removeEventListener('scroll', syncMenuPosition, true);
    window.removeEventListener('resize', syncMenuPosition);
    window.visualViewport?.removeEventListener('resize', syncMenuPosition);
    window.visualViewport?.removeEventListener('scroll', syncMenuPosition);
    hasTeleportListeners = false;
}

async function openMenu() {
    if (isMenuOpen.value) {
        return;
    }

    isMenuOpen.value = true;
    renderMode.value = 'inline';
    isMeasuringOcclusion.value = false;
    menuStyle.value = null;
    suggestionListStyle.value = {
        maxHeight: `${MENU_INLINE_MAX_HEIGHT_PX}px`
    };

    if (!shouldUseDetailStickyFallbackProfile.value) {
        return;
    }

    if (hasDetailStickyFallbackCache.value) {
        renderMode.value = 'teleport';
        await nextTick();
        syncMenuPosition();
        return;
    }

    isMeasuringOcclusion.value = true;
    await nextTick();
    await waitForAnimationFrame();

    if (!isMenuOpen.value) {
        return;
    }

    const isOccluded = detectInlineMenuOcclusion();
    isMeasuringOcclusion.value = false;

    if (!isOccluded) {
        return;
    }

    hasDetailStickyFallbackCache.value = true;
    persistDetailStickyFallbackCache();
    renderMode.value = 'teleport';
    await nextTick();
    syncMenuPosition();
}

onMounted(() => {
    isClient.value = true;
    hasDetailStickyFallbackCache.value = readDetailStickyFallbackCache();
    document.addEventListener('pointerdown', handleDocumentPointerDown);

    if (props.autoFocus) {
        safeFocus(inputRef.value, {
            preventScroll: true,
            source: 'mount'
        });
    }
});

onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', handleDocumentPointerDown);
    detachTeleportListeners();
});

watch(activeIndex, async (value) => {
    if (value < 0 || !suggestionListRef.value) {
        return;
    }

    await nextTick();

    const activeItem = suggestionListRef.value.querySelector<HTMLElement>(
        `[data-suggestion-index="${value}"]`
    );
    activeItem?.scrollIntoView({
        block: 'nearest'
    });
});

watch(
    isTeleportMenuActive,
    async (value) => {
        if (!value) {
            detachTeleportListeners();
            return;
        }

        attachTeleportListeners();
        await nextTick();
        syncMenuPosition();
    },
    {
        immediate: true
    }
);

watch(
    () => [
        props.collapsed,
        props.modelValue,
        suggestionsState.value,
        menuEntries.value.length
    ],
    async () => {
        if (!isTeleportMenuActive.value) {
            return;
        }

        await nextTick();
        syncMenuPosition();
    }
);
</script>
