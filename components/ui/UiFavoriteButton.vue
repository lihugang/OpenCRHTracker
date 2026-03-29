<template>
    <button
        type="button"
        :disabled="disabled || loading"
        :aria-pressed="active ? 'true' : 'false'"
        :class="[
            'inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crh-blue/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60',
            active
                ? 'border-amber-300 bg-amber-50 text-amber-700 hover:border-amber-400 hover:bg-amber-100/80'
                : 'border-slate-200 bg-white/90 text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900',
            size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm'
        ]"
        @click="emit('click')">
        <span
            v-if="loading"
            class="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
        <svg
            v-else
            aria-hidden="true"
            viewBox="0 0 20 20"
            class="h-4 w-4"
            :class="active ? 'fill-current' : 'fill-none'">
            <path
                d="M10 2.4L12.28 7.03L17.39 7.78L13.7 11.38L14.57 16.46L10 14.06L5.43 16.46L6.3 11.38L2.61 7.78L7.72 7.03L10 2.4Z"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linejoin="round" />
        </svg>
        <span v-if="showLabel">
            {{ active ? activeLabel : inactiveLabel }}
        </span>
    </button>
</template>

<script setup lang="ts">
const props = withDefaults(
    defineProps<{
        active: boolean;
        loading?: boolean;
        disabled?: boolean;
        size?: 'sm' | 'md';
        showLabel?: boolean;
        activeLabel?: string;
        inactiveLabel?: string;
    }>(),
    {
        loading: false,
        disabled: false,
        size: 'md',
        showLabel: true,
        activeLabel: '已收藏',
        inactiveLabel: '收藏'
    }
);

const emit = defineEmits<{
    click: [];
}>();
</script>
