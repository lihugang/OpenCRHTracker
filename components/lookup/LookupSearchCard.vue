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
                                    未找到匹配项
                                </div>

                                <div
                                    v-else
                                    ref="suggestionListRef"
                                    class="harmony-scrollbar max-h-72 overflow-y-auto py-2">
                                    <button
                                        v-for="(item, index) in suggestionItems"
                                        :key="`${item.type}:${item.code}`"
                                        type="button"
                                        :data-suggestion-index="index"
                                        :class="[
                                            'flex w-full items-center px-4 py-3 text-left transition',
                                            activeIndex === index
                                                ? 'bg-blue-50 text-crh-blue'
                                                : 'text-crh-grey-dark hover:bg-slate-50'
                                        ]"
                                        @mousedown.prevent
                                        @mouseenter="activeIndex = index"
                                        @click="selectSuggestion(item)">
                                        <span
                                            :class="[
                                                'flex min-w-0 items-start gap-3',
                                                compact
                                                    ? 'flex-wrap gap-x-3 gap-y-1'
                                                    : ''
                                            ]">
                                            <span
                                                class="shrink-0 text-sm font-semibold">
                                                {{ item.code }}
                                            </span>
                                            <span
                                                class="flex min-w-0 flex-1 flex-col gap-1.5">
                                                <span
                                                    :class="[
                                                        'min-w-0 text-xs text-slate-500',
                                                        compact
                                                            ? ''
                                                            : 'truncate'
                                                    ]">
                                                    {{ item.subtitle }}
                                                </span>
                                                <span
                                                    v-if="
                                                        getSuggestionTags(item)
                                                            .length > 0
                                                    "
                                                    class="flex flex-wrap gap-1.5">
                                                    <span
                                                        v-for="tag in getSuggestionTags(
                                                            item
                                                        )"
                                                        :key="tag"
                                                        class="inline-flex items-center rounded-full bg-blue-600/8 px-2 py-0.5 text-[11px] font-medium leading-none text-blue-600">
                                                        {{ tag }}
                                                    </span>
                                                </span>
                                            </span>
                                        </span>
                                    </button>
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
import type { LookupSuggestItem, LookupTargetType } from '~/types/lookup';
import safeFocus from '~/utils/safeFocus';

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
    normalizedQuery,
    minQueryLength
} = useLookupSuggestions(() => props.modelValue);

const shouldShowMenu = computed(() => {
    if (!isMenuOpen.value || normalizedQuery.value.length < minQueryLength) {
        return false;
    }

    return (
        suggestionsState.value === 'loading' ||
        suggestionsState.value === 'error' ||
        suggestionsState.value === 'empty' ||
        suggestionItems.value.length > 0
    );
});

function closeMenu() {
    isMenuOpen.value = false;
    activeIndex.value = -1;
}

function handleFocus() {
    if (normalizedQuery.value.length >= minQueryLength) {
        isMenuOpen.value = true;
    }
}

function handleInput(event: Event) {
    emit('update:modelValue', (event.target as HTMLInputElement).value);
    isMenuOpen.value = true;
    activeIndex.value = -1;
}

function moveActive(direction: 1 | -1) {
    if (suggestionItems.value.length === 0) {
        return;
    }

    isMenuOpen.value = true;

    if (activeIndex.value < 0) {
        activeIndex.value =
            direction > 0 ? 0 : suggestionItems.value.length - 1;
        return;
    }

    activeIndex.value =
        (activeIndex.value + direction + suggestionItems.value.length) %
        suggestionItems.value.length;
}

async function selectSuggestion(item: LookupSuggestItem) {
    emit('update:modelValue', item.code);
    closeMenu();
    await nextTick();
    emit('submit');
}

function getSingleSuggestion() {
    if (
        suggestionsState.value !== 'success' ||
        suggestionItems.value.length !== 1
    ) {
        return null;
    }

    return suggestionItems.value[0] ?? null;
}

function getSuggestionTags(item: LookupSuggestItem) {
    return Array.isArray(item.tags)
        ? item.tags
              .filter((tag): tag is string => typeof tag === 'string')
              .map((tag) => tag.trim())
              .filter((tag) => tag.length > 0)
        : [];
}

async function submitCurrentValue() {
    const singleSuggestion = getSingleSuggestion();
    if (singleSuggestion) {
        await selectSuggestion(singleSuggestion);
        return;
    }

    closeMenu();
    emit('submit');
}

async function submitFromEnter() {
    const activeItem =
        shouldShowMenu.value && activeIndex.value >= 0
            ? (suggestionItems.value[activeIndex.value] ?? null)
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
