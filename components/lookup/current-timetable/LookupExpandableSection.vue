<template>
    <UiCard
        :data-guide="guide"
        :show-accent-bar="false"
        variant="subtle">
        <div class="space-y-4">
            <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                    <p
                        class="text-xs uppercase tracking-[0.16em] text-slate-400">
                        {{ title }}
                    </p>
                    <p
                        v-if="!modelValue && summary"
                        class="mt-2 text-sm text-slate-500">
                        {{ summary }}
                    </p>
                </div>

                <button
                    v-if="showToggle"
                    type="button"
                    class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crh-blue/25 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                    :class="
                        modelValue ? 'border-crh-blue/20 text-crh-blue' : ''
                    "
                    :aria-controls="sectionId"
                    :aria-expanded="modelValue ? 'true' : 'false'"
                    :aria-label="modelValue ? collapseLabel : expandLabel"
                    @click="emit('update:modelValue', !modelValue)">
                    <svg
                        aria-hidden="true"
                        viewBox="0 0 20 20"
                        fill="none"
                        class="h-4 w-4 transition-transform duration-200 ease-out"
                        :class="modelValue ? 'rotate-180' : ''">
                        <path
                            d="M5 7.5L10 12.5L15 7.5"
                            stroke="currentColor"
                            stroke-width="1.8"
                            stroke-linecap="round"
                            stroke-linejoin="round" />
                    </svg>
                </button>
            </div>

            <slot name="notice" />

            <Transition
                enter-active-class="transition duration-200 ease-out"
                enter-from-class="translate-y-2 opacity-0 motion-reduce:translate-y-0"
                enter-to-class="translate-y-0 opacity-100"
                leave-active-class="transition duration-180 ease-out"
                leave-from-class="translate-y-0 opacity-100"
                leave-to-class="translate-y-1 opacity-0 motion-reduce:translate-y-0">
                <div
                    v-if="modelValue"
                    :id="sectionId"
                    class="space-y-3">
                    <slot />
                </div>
            </Transition>
        </div>
    </UiCard>
</template>

<script setup lang="ts">
defineProps<{
    modelValue: boolean;
    title: string;
    sectionId: string;
    summary?: string;
    collapseLabel: string;
    expandLabel: string;
    showToggle?: boolean;
    guide?: string;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
}>();
</script>
