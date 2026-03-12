<template>
    <div
        :class="[
            'ticket-card rounded-[1.25rem] border border-slate-200 text-crh-grey-dark shadow-ticket',
            cardClasses
        ]">
        <slot />
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
    defineProps<{
        variant?: 'default' | 'accent' | 'subtle';
    }>(),
    {
        variant: 'default'
    }
);

const cardClasses = computed(() => {
    switch (props.variant) {
        case 'accent':
            return 'ticket-card--accent p-6 md:p-8';
        case 'subtle':
            return 'ticket-card--subtle p-5';
        default:
            return 'bg-crh-white p-6';
    }
});
</script>
