<template>
    <button
        :type="type"
        :disabled="disabled || loading"
        :class="[
            'inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl font-medium transition-[box-shadow,background-color,border-color,color] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crh-blue/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60',
            sizeClasses,
            variantClasses,
            block ? 'w-full' : ''
        ]">
        <span
            v-if="loading"
            class="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
        <slot />
    </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
    defineProps<{
        type?: 'button' | 'submit' | 'reset';
        variant?: 'primary' | 'secondary' | 'ghost';
        size?: 'sm' | 'md';
        block?: boolean;
        loading?: boolean;
        disabled?: boolean;
    }>(),
    {
        type: 'button',
        variant: 'primary',
        size: 'md',
        block: false,
        loading: false,
        disabled: false
    }
);

const variantClasses = computed(() => {
    switch (props.variant) {
        case 'secondary':
            return 'border border-slate-200 bg-white text-crh-blue shadow-sm hover:border-crh-blue/25 hover:bg-blue-50 hover:shadow-[0_10px_22px_-18px_rgba(15,23,42,0.35)]';
        case 'ghost':
            return 'bg-transparent text-crh-blue hover:bg-blue-50/80';
        default:
            return 'bg-[linear-gradient(180deg,#00529b_0%,#004c92_100%)] text-white shadow-[0_8px_20px_-10px_rgba(0,82,155,0.7)] hover:bg-[linear-gradient(180deg,#004f96_0%,#00478a_100%)] hover:shadow-[0_14px_28px_-18px_rgba(0,82,155,0.72)]';
    }
});

const sizeClasses = computed(() => {
    return props.size === 'sm' ? 'px-3.5 py-2 text-sm' : 'px-5 py-3 text-sm';
});
</script>
