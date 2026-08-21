<template>
    <svg
        viewBox="0 0 28 20"
        fill="none"
        aria-hidden="true">
        <path
            d="M5.5 5.5h17a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-17a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z"
            stroke="currentColor"
            stroke-width="1.5" />
        <path
            d="M9 8v5M14 8v5M19 8v5"
            stroke="currentColor"
            stroke-width="1.25"
            stroke-linecap="round"
            opacity="0.45" />
        <path
            :d="position === 'I' ? 'M3.5 7.5v6' : 'M24.5 7.5v6'"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round" />
        <circle cx="8" cy="17" r="1" fill="currentColor" />
        <circle cx="20" cy="17" r="1" fill="currentColor" />
        <circle
            :cx="position === 'I' ? 4.5 : 23.5"
            cy="3.5"
            r="3"
            fill="currentColor" />
        <path
            v-if="position === 'I'"
            d="M4.5 2.3v2.4"
            stroke="white"
            stroke-width="1.1"
            stroke-linecap="round" />
        <path
            v-else
            d="M22.7 2.7c.25-.3.55-.45.9-.45.55 0 .9.3.9.75 0 .35-.2.6-.65.9l-1.15.85h1.9"
            stroke="white"
            stroke-width="0.9"
            stroke-linecap="round"
            stroke-linejoin="round" />
    </svg>
</template>

<script setup lang="ts">
defineProps<{
    position: 'I' | 'II';
}>();
</script>
