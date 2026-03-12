<template>
    <div
        :class="[
            'rounded-[1.25rem] border px-6 py-10 text-center',
            tone === 'danger'
                ? 'border-status-delayed/15 bg-status-delayed/5'
                : 'border-slate-200 bg-white/80'
        ]">
        <p
            class="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            {{ eyebrow }}
        </p>
        <h3 class="mt-3 text-lg font-semibold text-crh-grey-dark">
            {{ title }}
        </h3>
        <p class="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
            {{ description }}
        </p>
        <div
            v-if="$slots.default"
            class="mt-5 flex justify-center">
            <slot />
        </div>
    </div>
</template>

<script setup lang="ts">
withDefaults(
    defineProps<{
        eyebrow?: string;
        title: string;
        description: string;
        tone?: 'default' | 'danger';
    }>(),
    {
        eyebrow: '准备就绪',
        tone: 'default'
    }
);
</script>
