<template>
    <button
        type="button"
        :disabled="disabled || loading"
        :aria-pressed="active ? 'true' : 'false'"
        :class="[
            'inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crh-blue/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60',
            active
                ? 'border-crh-blue/25 bg-blue-50 text-crh-blue hover:border-crh-blue/35 hover:bg-blue-100/80'
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
            fill="none"
            class="h-4 w-4">
            <path
                d="M10 3.5C7.51472 3.5 5.5 5.51472 5.5 8V10.1237C5.5 10.9281 5.19622 11.7029 4.65 12.2929L3.5 13.5357V14.5H16.5V13.5357L15.35 12.2929C14.8038 11.7029 14.5 10.9281 14.5 10.1237V8C14.5 5.51472 12.4853 3.5 10 3.5Z"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linejoin="round" />
            <path
                d="M8 15.5C8.31023 16.3725 9.14259 17 10 17C10.8574 17 11.6898 16.3725 12 15.5"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round" />
        </svg>
        <span v-if="showLabel">
            {{ active ? activeLabel : inactiveLabel }}
        </span>
    </button>
</template>

<script setup lang="ts">
withDefaults(
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
        activeLabel: '已订阅',
        inactiveLabel: '订阅'
    }
);

const emit = defineEmits<{
    click: [];
}>();
</script>
