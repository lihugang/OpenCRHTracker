<template>
    <Teleport to="body">
        <Transition
            enter-active-class="transition duration-200 ease-out"
            enter-from-class="opacity-0"
            enter-to-class="opacity-100"
            leave-active-class="transition duration-180 ease-out"
            leave-from-class="opacity-100"
            leave-to-class="opacity-0">
            <div
                v-if="modelValue"
                class="fixed inset-0 z-[95]">
                <div
                    class="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]"
                    @click="handleBackdropClick" />

                <div class="absolute inset-x-0 bottom-0 flex justify-center p-3 sm:p-6">
                    <Transition
                        appear
                        enter-active-class="transition duration-200 ease-out"
                        enter-from-class="translate-y-3 opacity-0"
                        enter-to-class="translate-y-0 opacity-100"
                        leave-active-class="transition duration-180 ease-out"
                        leave-from-class="translate-y-0 opacity-100"
                        leave-to-class="translate-y-3 opacity-0">
                        <div
                            v-if="modelValue"
                            :class="[
                                'relative w-full overflow-hidden rounded-[1.5rem] border border-slate-200/90 bg-white/98 shadow-[0_28px_80px_-28px_rgba(15,23,42,0.38)] sm:rounded-[1.75rem]',
                                sizeClass
                            ]">
                            <div class="flex justify-center px-6 pt-3">
                                <span
                                    aria-hidden="true"
                                    class="h-1.5 w-12 rounded-full bg-slate-300/90" />
                            </div>

                            <div class="flex items-start justify-between gap-4 px-6 pb-5 pt-4">
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
                                    aria-label="关闭抽屉"
                                    @click="close">
                                    x
                                </button>
                            </div>

                            <div class="motion-divider" />

                            <div class="harmony-scrollbar max-h-[min(70vh,36rem)] overflow-y-auto px-6 py-5">
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
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue';

const props = withDefaults(
    defineProps<{
        modelValue: boolean;
        title: string;
        eyebrow?: string;
        description?: string;
        closeOnBackdrop?: boolean;
        size?: 'md' | 'lg';
    }>(),
    {
        eyebrow: '选择',
        description: '',
        closeOnBackdrop: true,
        size: 'md'
    }
);

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
}>();

const sizeClass = computed(() =>
    props.size === 'lg' ? 'max-w-2xl' : 'max-w-xl'
);

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

watch(
    () => props.modelValue,
    (isOpen) => {
        if (!import.meta.client) {
            return;
        }

        if (isOpen) {
            window.addEventListener('keydown', handleKeydown);
            document.body.style.overflow = 'hidden';
            return;
        }

        window.removeEventListener('keydown', handleKeydown);
        document.body.style.overflow = '';
    },
    {
        immediate: true
    }
);

onBeforeUnmount(() => {
    if (!import.meta.client) {
        return;
    }

    window.removeEventListener('keydown', handleKeydown);
    document.body.style.overflow = '';
});
</script>
