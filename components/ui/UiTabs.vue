<template>
    <div
        class="rounded-[1.25rem] border border-slate-200 bg-white/90 p-2 shadow-ticket">
        <div class="grid gap-2 md:grid-cols-3">
            <button
                v-for="option in options"
                :key="option.value"
                type="button"
                :class="[
                    'rounded-[1rem] border px-4 py-3 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crh-blue/25 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
                    model === option.value
                        ? 'border-crh-blue/30 bg-[linear-gradient(135deg,rgba(0,82,155,0.1),rgba(255,255,255,0.95))] text-crh-grey-dark shadow-[inset_0_0_0_1px_rgba(0,82,155,0.05)]'
                        : 'border-transparent bg-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-50'
                ]"
                @click="model = option.value">
                <p class="text-sm font-semibold">{{ option.label }}</p>
                <p class="mt-1 text-xs leading-5 text-slate-500">
                    {{ option.hint }}
                </p>
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import type { QueryTabOption } from '~/types/homepage';

defineProps<{
    options: QueryTabOption[];
}>();

const model = defineModel<string>({
    required: true
});
</script>
