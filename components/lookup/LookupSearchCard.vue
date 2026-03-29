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
                        车次号 / 车组号
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
                                v-if="shouldShowMenu"
                                class="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-slate-200/90 bg-white/96 shadow-[0_18px_40px_-18px_rgba(15,23,42,0.35)] backdrop-blur">
                                <div
                                    v-if="suggestionsState === 'loading'"
                                    class="px-4 py-3 text-sm text-slate-500">
                                    正在加载补全...
                                </div>

                                <div
                                    v-else-if="suggestionsState === 'error'"
                                    class="px-4 py-3 text-sm text-status-delayed">
                                    {{
                                        suggestionsErrorMessage ||
                                        '补全加载失败'
                                    }}
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
                                            @mouseenter="activeIndex = entry.index"
                                            @click="selectSuggestion(entry.item)">
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
                                                        v-if="getSuggestionSubtitle(entry.item)"
                                                        :class="[
                                                            'min-w-0 text-xs text-slate-500',
                                                            compact
                                                                ? ''
                                                                : 'truncate'
                                                        ]">
                                                        {{ getSuggestionSubtitle(entry.item) }}
                                                    </span>
                                                    <span
                                                        v-if="
                                                            getSuggestionTags(entry.item)
                                                                .length > 0
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
    }>(),
    {
        eyebrow: 'OpenCRHTracker',
        loading: false,
        autoFocus: false,
        compact: false,
        collapsed: false,
        errorMessage: '',
        detectedType: null,
        submitLabel: '查询',
        placeholder: 'D2212 或 CR400AF-C-2214',
        layoutMode: 'responsive'
    }
);

const emit = defineEmits<{
    submit: [];
    'update:modelValue': [value: string];
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const rootRef = ref<HTMLElement | null>(null);
const suggestionListRef = ref<HTMLElement | null>(null);
const activeIndex = ref(-1);
const isMenuOpen = ref(false);

const {
    state: suggestionsState,
    items: suggestionItems,
    errorMessage: suggestionsErrorMessage,
    mode: suggestionMode
} = useLookupSuggestions(() => props.modelValue);
const { addRecentSearch } = useRecentLookupSearches();
const {
    items: favoriteItems,
    favoriteKeySet
} = useFavoriteLookups();

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
        pushSection('favorites', '收藏', favoriteItems.value);
        pushSection('recent', '最近搜索', recentMenuItems.value);
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

const emptyStateMessage = computed(() =>
    suggestionMode.value === 'recent'
        ? '暂无收藏或最近搜索'
        : '未找到匹配项'
);


function closeMenu() {
    isMenuOpen.value = false;
    activeIndex.value = -1;
}

function handleFocus() {
    isMenuOpen.value = true;
}

function handleInput(event: Event) {
    emit('update:modelValue', (event.target as HTMLInputElement).value);
    isMenuOpen.value = true;
    activeIndex.value = -1;
}

function moveActive(direction: 1 | -1) {
    if (menuEntries.value.length === 0) {
        return;
    }

    isMenuOpen.value = true;

    if (activeIndex.value < 0) {
        activeIndex.value =
            direction > 0 ? 0 : menuEntries.value.length - 1;
        return;
    }

    activeIndex.value =
        (activeIndex.value + direction + menuEntries.value.length) %
        menuEntries.value.length;
}

function toRecentLookupSearchItem(item: LookupMenuItem): RecentLookupSearchItem {
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
    return buildLookupItemKeyFromItem(left) === buildLookupItemKeyFromTarget(right);
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

    closeMenu();
}

onMounted(() => {
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
</script>
