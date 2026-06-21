<template>
    <UiField
        :label="label"
        :required="required">
        <div
            ref="rootRef"
            class="relative">
            <input
                v-model="inputValue"
                type="text"
                inputmode="text"
                autocomplete="off"
                class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark"
                :placeholder="placeholder"
                @focus="isFocused = true"
                @keydown.down.prevent="moveActive(1)"
                @keydown.up.prevent="moveActive(-1)"
                @keydown.enter.prevent="submitActive"
                @keydown.esc.prevent="isFocused = false" />

            <div
                v-if="shouldShowMenu"
                class="absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-2xl border border-slate-200/90 bg-white/96 shadow-[0_18px_40px_-18px_rgba(15,23,42,0.35)] backdrop-blur">
                <div
                    v-if="state === 'loading'"
                    class="px-4 py-3 text-sm text-slate-500">
                    正在加载补全...
                </div>
                <div
                    v-else-if="state === 'error'"
                    class="px-4 py-3 text-sm text-status-delayed">
                    {{ errorMessage || '补全加载失败' }}
                </div>
                <div
                    v-else
                    class="harmony-scrollbar max-h-64 overflow-y-auto py-2">
                    <button
                        v-for="(item, index) in filteredItems"
                        :key="item.type + ':' + item.code"
                        type="button"
                        class="grid w-full grid-cols-[max-content_minmax(0,1fr)] gap-3 px-4 py-2 text-left transition hover:bg-slate-50"
                        :class="
                            index === activeIndex
                                ? 'bg-blue-50 text-crh-blue'
                                : 'text-slate-700'
                        "
                        @mousedown.prevent
                        @mouseenter="activeIndex = index"
                        @click="choose(item)">
                        <span class="font-mono text-sm font-semibold">
                            {{ item.code }}
                        </span>
                        <span class="min-w-0 truncate text-xs text-slate-500">
                            {{ item.subtitle }}
                        </span>
                    </button>
                </div>
            </div>
        </div>
    </UiField>
</template>

<script setup lang="ts">
import { useLookupSuggestions } from '~/composables/useLookupSuggestions';
import type { LookupSuggestItem } from '~/types/lookup';

const props = withDefaults(
    defineProps<{
        modelValue: string;
        typeFilter: LookupSuggestItem['type'];
        label: string;
        placeholder?: string;
        required?: boolean;
    }>(),
    {
        placeholder: '',
        required: false
    }
);

const emit = defineEmits<{
    'update:modelValue': [value: string];
}>();

const rootRef = ref<HTMLElement | null>(null);
const isFocused = ref(false);
const activeIndex = ref(-1);
const inputValue = computed({
    get() {
        return props.modelValue;
    },
    set(value: string) {
        emit('update:modelValue', value);
    }
});
const { state, items, errorMessage } = useLookupSuggestions(
    () => inputValue.value,
    12
);
const filteredItems = computed(() =>
    items.value.filter((item) => item.type === props.typeFilter)
);
const shouldShowMenu = computed(
    () =>
        isFocused.value &&
        (state.value === 'loading' ||
            state.value === 'error' ||
            filteredItems.value.length > 0)
);

watch(filteredItems, () => {
    activeIndex.value = filteredItems.value.length > 0 ? 0 : -1;
});

function choose(item: LookupSuggestItem) {
    inputValue.value = item.code;
    isFocused.value = false;
}

function moveActive(step: number) {
    const count = filteredItems.value.length;
    if (count === 0) {
        return;
    }

    activeIndex.value = (activeIndex.value + step + count) % count;
}

function submitActive() {
    const item = filteredItems.value[activeIndex.value];
    if (item) {
        choose(item);
    }
}

function handleDocumentPointerDown(event: PointerEvent) {
    const target = event.target;
    if (
        target instanceof Node &&
        rootRef.value &&
        !rootRef.value.contains(target)
    ) {
        isFocused.value = false;
    }
}

onMounted(() => {
    document.addEventListener('pointerdown', handleDocumentPointerDown);
});

onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', handleDocumentPointerDown);
});
</script>
