<template>
    <Teleport to="body">
        <div
            v-if="isRendered"
            class="fixed inset-0 z-[90] p-4 sm:p-6">
            <Transition
                appear
                enter-active-class="transition duration-200 ease-out"
                enter-from-class="opacity-0"
                enter-to-class="opacity-100"
                leave-active-class="transition duration-180 ease-out"
                leave-from-class="opacity-100"
                leave-to-class="opacity-0">
                <div
                    v-if="modelValue"
                    class="absolute inset-0 bg-slate-950/35"
                    @click="handleBackdropClick" />
            </Transition>

            <div
                class="relative flex h-full items-center justify-center"
                @click.self="handleBackdropClick">
                <Transition
                    appear
                    enter-active-class="transition duration-200 ease-out"
                    enter-from-class="translate-y-3 opacity-0 motion-reduce:translate-y-0"
                    enter-to-class="translate-y-0 opacity-100"
                    leave-active-class="transition duration-180 ease-out"
                    leave-from-class="translate-y-0 opacity-100"
                    leave-to-class="translate-y-2 opacity-0 motion-reduce:translate-y-0"
                    @after-leave="handlePanelAfterLeave">
                    <div
                        v-if="modelValue"
                        :class="[
                            'relative flex w-full flex-col overflow-hidden rounded-[1.5rem] border border-slate-200/90 bg-white/98 shadow-[0_28px_80px_-28px_rgba(15,23,42,0.38)]',
                            panelClass
                        ]">
                        <div
                            class="flex items-start justify-between gap-4 px-6 py-5">
                            <div class="space-y-2">
                                <p
                                    class="text-xs font-semibold uppercase tracking-[0.28em] text-crh-blue/80">
                                    {{ eyebrow }}
                                </p>
                                <div class="space-y-1.5">
                                    <h2
                                        class="text-xl font-semibold tracking-tight text-slate-900">
                                        {{ title }}
                                    </h2>
                                    <p
                                        v-if="description"
                                        class="text-sm leading-6 text-slate-600">
                                        {{ description }}
                                    </p>
                                </div>
                            </div>

                            <button
                                type="button"
                                class="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
                                aria-label="关闭弹窗"
                                @click="close">
                                x
                            </button>
                        </div>

                        <div class="motion-divider" />

                        <div
                            class="harmony-scrollbar overflow-y-auto px-6 py-5">
                            <slot />
                        </div>

                        <div
                            v-if="$slots.footer"
                            class="border-t border-slate-200/80 bg-slate-50/70 px-6 py-4">
                            <slot name="footer" />
                        </div>
                    </div>
                </Transition>
            </div>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

const props = withDefaults(
    defineProps<{
        modelValue: boolean;
        title: string;
        eyebrow?: string;
        description?: string;
        size?: 'md' | 'lg';
        height?: 'default' | 'tall';
        closeOnBackdrop?: boolean;
    }>(),
    {
        eyebrow: '操作',
        description: '',
        size: 'md',
        height: 'default',
        closeOnBackdrop: true
    }
);

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
}>();

const sizeClass = computed(() =>
    props.size === 'lg' ? 'max-w-4xl' : 'max-w-2xl'
);
const heightClass = computed(() =>
    props.height === 'tall'
        ? 'max-h-[min(92vh,64rem)]'
        : 'max-h-[min(86vh,48rem)]'
);
const panelClass = computed(() => [sizeClass.value, heightClass.value]);
const isRendered = ref(props.modelValue);

function applyGlobalModalState() {
    if (!import.meta.client) {
        return;
    }

    window.addEventListener('keydown', handleKeydown);
    document.body.style.overflow = 'hidden';
}

function clearGlobalModalState() {
    if (!import.meta.client) {
        return;
    }

    window.removeEventListener('keydown', handleKeydown);
    document.body.style.overflow = '';
}

function close() {
    emit('update:modelValue', false);
}

function handleBackdropClick() {
    if (!props.closeOnBackdrop) {
        return;
    }

    close();
}

function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') {
        return;
    }

    close();
}

function handlePanelAfterLeave() {
    if (props.modelValue) {
        return;
    }

    isRendered.value = false;
    clearGlobalModalState();
}

watch(
    () => props.modelValue,
    (isOpen) => {
        if (isOpen) {
            isRendered.value = true;
            applyGlobalModalState();
            return;
        }

        if (!isRendered.value) {
            clearGlobalModalState();
        }
    },
    {
        immediate: true
    }
);

onBeforeUnmount(() => {
    clearGlobalModalState();
});
</script>
