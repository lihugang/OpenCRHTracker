<template>
    <span
        :class="[
            'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium backdrop-blur',
            toneClasses
        ]">
        {{ label }}
    </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
    defineProps<{
        label: string;
        tone?: 'info' | 'success' | 'warning' | 'danger' | 'neutral';
    }>(),
    {
        tone: 'info'
    }
);

const toneClasses = computed(() => {
    switch (props.tone) {
        case 'success':
            return 'border-status-running/20 bg-status-running/10 text-status-running';
        case 'warning':
            return 'border-crh-blue/20 bg-crh-blue/10 text-crh-blue';
        case 'danger':
            return 'border-status-delayed/20 bg-status-delayed/10 text-status-delayed';
        case 'neutral':
            return 'border-slate-200 bg-slate-100/80 text-slate-600';
        default:
            return 'border-crh-blue/20 bg-blue-50 text-crh-blue';
    }
});
</script>
