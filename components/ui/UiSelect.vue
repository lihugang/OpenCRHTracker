<template>
    <div
        ref="rootRef"
        class="relative">
        <button
            :id="buttonId"
            ref="buttonRef"
            type="button"
            :disabled="disabled"
            class="harmony-input flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            :class="isOpen ? 'border-crh-blue/70 bg-white' : ''"
            aria-haspopup="listbox"
            :aria-expanded="isOpen ? 'true' : 'false'"
            :aria-controls="listboxId"
            @click="toggleOpen"
            @keydown.down.prevent="handleArrowOpen(1)"
            @keydown.up.prevent="handleArrowOpen(-1)"
            @keydown.enter.prevent="handleEnter"
            @keydown.space.prevent="toggleOpen"
            @keydown.esc.prevent="close"
            @keydown.home.prevent="setBoundaryIndex('start')"
            @keydown.end.prevent="setBoundaryIndex('end')">
            <span class="block min-w-0">
                <span
                    class="block truncate font-medium"
                    :class="
                        hasSelectedOption || !props.placeholder
                            ? 'text-slate-900'
                            : 'text-slate-400'
                    ">
                    {{ selectedLabel }}
                </span>
            </span>

            <span
                aria-hidden="true"
                class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white/90 text-crh-blue transition"
                :class="isOpen ? 'border-crh-blue/25 bg-blue-50/80' : ''">
                <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    class="h-4 w-4 transition-transform duration-200 ease-out"
                    :class="isOpen ? 'rotate-180' : ''">
                    <path
                        d="M5 7.5L10 12.5L15 7.5"
                        stroke="currentColor"
                        stroke-width="1.8"
                        stroke-linecap="round"
                        stroke-linejoin="round" />
                </svg>
            </span>
        </button>

        <Transition
            enter-active-class="transition duration-180 ease-out"
            enter-from-class="translate-y-2 opacity-0 motion-reduce:translate-y-0"
            enter-to-class="translate-y-0 opacity-100"
            leave-active-class="transition duration-150 ease-out"
            leave-from-class="translate-y-0 opacity-100"
            leave-to-class="translate-y-1 opacity-0 motion-reduce:translate-y-0">
            <div
                v-if="isOpen && props.options.length > 0"
                :id="listboxId"
                ref="listboxRef"
                class="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-[1.15rem] border border-slate-200/90 bg-white/98 shadow-[0_22px_48px_-22px_rgba(15,23,42,0.35)] backdrop-blur"
                role="listbox"
                :aria-labelledby="buttonId">
                <div class="motion-divider" />
                <div class="harmony-scrollbar max-h-64 overflow-y-auto py-2">
                    <button
                        v-for="(option, index) in props.options"
                        :key="option.value"
                        type="button"
                        role="option"
                        :aria-selected="
                            option.value === model ? 'true' : 'false'
                        "
                        :data-option-index="index"
                        class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition"
                        :class="
                            index === activeIndex
                                ? 'bg-blue-50 text-crh-blue'
                                : option.value === model
                                  ? 'bg-white text-slate-900 hover:bg-slate-50'
                                  : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                        "
                        @mousedown.prevent
                        @mouseenter="activeIndex = index"
                        @click="selectOption(option.value)">
                        <span class="min-w-0 truncate font-medium">
                            {{ option.label }}
                        </span>
                        <span
                            class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium transition"
                            :class="
                                option.value === model
                                    ? 'border-crh-blue/25 bg-blue-50 text-crh-blue'
                                    : 'border-slate-200 bg-white text-transparent'
                            ">
                            <svg
                                v-if="option.value === model"
                                aria-hidden="true"
                                viewBox="0 0 20 20"
                                fill="none"
                                class="h-4 w-4">
                                <path
                                    d="M5 10.5L8.5 14L15 7.5"
                                    stroke="currentColor"
                                    stroke-width="1.8"
                                    stroke-linecap="round"
                                    stroke-linejoin="round" />
                            </svg>
                            <span v-else>·</span>
                        </span>
                    </button>
                </div>
            </div>
        </Transition>

        <UiBottomSheet
            :model-value="usesBottomSheet && isOpen"
            :eyebrow="mobileSheetEyebrow"
            :title="mobileSheetTitle"
            @update:model-value="handleBottomSheetVisibilityChange">
            <div class="space-y-3">
                <button
                    v-for="option in props.options"
                    :key="`sheet:${option.value}`"
                    type="button"
                    class="flex w-full items-center justify-between gap-4 rounded-[1rem] border px-4 py-4 text-left transition"
                    :class="
                        option.value === model
                            ? 'border-crh-blue/20 bg-blue-50/80 text-crh-blue'
                            : 'border-slate-200 bg-white/90 text-slate-700 hover:border-slate-300 hover:bg-slate-50/80'
                    "
                    :aria-pressed="option.value === model ? 'true' : 'false'"
                    @click="selectOption(option.value)">
                    <span class="text-sm font-medium">
                        {{ option.label }}
                    </span>
                    <span
                        class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium transition"
                        :class="
                            option.value === model
                                ? 'border-crh-blue/25 bg-blue-50 text-crh-blue'
                                : 'border-slate-200 bg-white text-transparent'
                        ">
                        <svg
                            v-if="option.value === model"
                            aria-hidden="true"
                            viewBox="0 0 20 20"
                            fill="none"
                            class="h-4 w-4">
                            <path
                                d="M5 10.5L8.5 14L15 7.5"
                                stroke="currentColor"
                                stroke-width="1.8"
                                stroke-linecap="round"
                                stroke-linejoin="round" />
                        </svg>
                        <span v-else>·</span>
                    </span>
                </button>
            </div>
        </UiBottomSheet>
    </div>
</template>

<script setup lang="ts">
import {
    computed,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    useId,
    watch
} from 'vue';

interface SelectOption {
    value: string;
    label: string;
}

const props = withDefaults(
    defineProps<{
        options: SelectOption[];
        disabled?: boolean;
        mobileSheetTitle?: string;
        mobileSheetEyebrow?: string;
        mobilePresentation?: 'sheet' | 'dropdown';
        placeholder?: string;
    }>(),
    {
        disabled: false,
        mobileSheetTitle: '选择选项',
        mobileSheetEyebrow: 'SELECT',
        mobilePresentation: 'sheet',
        placeholder: ''
    }
);

const model = defineModel<string>({
    required: true
});

const rootRef = ref<HTMLElement | null>(null);
const buttonRef = ref<HTMLButtonElement | null>(null);
const listboxRef = ref<HTMLElement | null>(null);
const isOpen = ref(false);
const activeIndex = ref(-1);
const isPortraitViewport = ref(false);
const buttonId = `ui-select-button-${useId()}`;
const listboxId = `ui-select-listbox-${useId()}`;
const mediaQuery = ref<MediaQueryList | null>(null);

const usesBottomSheet = computed(
    () => props.mobilePresentation === 'sheet' && isPortraitViewport.value
);
const mobileSheetTitle = computed(() => props.mobileSheetTitle);
const mobileSheetEyebrow = computed(() => props.mobileSheetEyebrow);

const selectedIndex = computed(() =>
    props.options.findIndex((option) => option.value === model.value)
);
const hasSelectedOption = computed(() => selectedIndex.value >= 0);

const selectedLabel = computed(() => {
    const selectedOption = props.options[selectedIndex.value];

    if (selectedOption) {
        return selectedOption.label;
    }

    if (props.placeholder) {
        return props.placeholder;
    }

    return props.options[0]?.label ?? '';
});

function syncActiveIndexToSelection() {
    activeIndex.value =
        selectedIndex.value >= 0
            ? selectedIndex.value
            : props.options.length > 0
              ? 0
              : -1;
}

function close() {
    isOpen.value = false;
}

async function open() {
    if (props.disabled || props.options.length === 0) {
        return;
    }

    syncActiveIndexToSelection();
    isOpen.value = true;

    if (usesBottomSheet.value) {
        return;
    }

    await nextTick();
    scrollActiveOptionIntoView();
}

async function toggleOpen() {
    if (isOpen.value) {
        close();
        return;
    }

    await open();
}

function selectOption(value: string) {
    model.value = value;
    close();
    buttonRef.value?.focus({ preventScroll: true });
}

async function handleArrowOpen(direction: 1 | -1) {
    if (props.options.length === 0) {
        return;
    }

    if (!isOpen.value) {
        await open();
        if (selectedIndex.value < 0) {
            activeIndex.value = direction > 0 ? 0 : props.options.length - 1;
        }
        return;
    }

    activeIndex.value =
        activeIndex.value < 0
            ? direction > 0
                ? 0
                : props.options.length - 1
            : (activeIndex.value + direction + props.options.length) %
              props.options.length;

    await nextTick();
    scrollActiveOptionIntoView();
}

function handleEnter() {
    if (usesBottomSheet.value) {
        void open();
        return;
    }

    if (!isOpen.value) {
        void open();
        return;
    }

    const activeOption = props.options[activeIndex.value];
    if (!activeOption) {
        return;
    }

    selectOption(activeOption.value);
}

function setBoundaryIndex(boundary: 'start' | 'end') {
    if (!isOpen.value || props.options.length === 0) {
        return;
    }

    activeIndex.value = boundary === 'start' ? 0 : props.options.length - 1;
    void nextTick().then(scrollActiveOptionIntoView);
}

function scrollActiveOptionIntoView() {
    if (!listboxRef.value || activeIndex.value < 0) {
        return;
    }

    const activeOption = listboxRef.value.querySelector<HTMLElement>(
        `[data-option-index="${activeIndex.value}"]`
    );
    activeOption?.scrollIntoView({
        block: 'nearest'
    });
}

function handleDocumentPointerDown(event: PointerEvent) {
    if (usesBottomSheet.value) {
        return;
    }

    if (!rootRef.value) {
        return;
    }

    if (event.target instanceof Node && rootRef.value.contains(event.target)) {
        return;
    }

    close();
}

function handleWindowKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') {
        return;
    }

    close();
}

function handleBottomSheetVisibilityChange(nextValue: boolean) {
    isOpen.value = nextValue;
}

function handleMediaQueryChange(event: MediaQueryListEvent) {
    isPortraitViewport.value = event.matches;
    if (!event.matches || props.mobilePresentation !== 'sheet') {
        return;
    }

    close();
}

watch(
    () => props.options,
    () => {
        syncActiveIndexToSelection();
    },
    {
        immediate: true
    }
);

watch(
    () => model.value,
    () => {
        if (!isOpen.value) {
            syncActiveIndexToSelection();
        }
    }
);

onMounted(() => {
    document.addEventListener('pointerdown', handleDocumentPointerDown);
    window.addEventListener('keydown', handleWindowKeydown);
    mediaQuery.value = window.matchMedia('(orientation: portrait)');
    isPortraitViewport.value = mediaQuery.value.matches;
    mediaQuery.value.addEventListener('change', handleMediaQueryChange);
});

onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', handleDocumentPointerDown);
    window.removeEventListener('keydown', handleWindowKeydown);
    mediaQuery.value?.removeEventListener('change', handleMediaQueryChange);
});
</script>
