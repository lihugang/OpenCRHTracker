<template>
    <span
        :class="[
            'relative inline-block h-6 shrink-0 overflow-hidden',
            mode === 'active-half' ? 'w-6' : 'w-12'
        ]">
        <svg
            :class="[
                'absolute top-0 h-6 w-12 max-w-none',
                mode === 'active-half' && position === 'II'
                    ? '-translate-x-6'
                    : 'left-0'
            ]"
            width="48"
            height="24"
            viewBox="0 0 48 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true">
            <path
                d="M21 5H8C4 5 2 7.5 2 11.5V19H21V5Z"
                :stroke="position === 'I' ? '#00478B' : '#CBD5E1'"
                stroke-width="2" />
            <text
                v-if="position === 'I'"
                x="11.5"
                y="15.5"
                fill="#00478B"
                font-size="10"
                font-family="system-ui, -apple-system, sans-serif"
                font-weight="800"
                text-anchor="middle">
                1
            </text>
            <line
                x1="21"
                y1="14"
                x2="27"
                y2="14"
                stroke="#CBD5E1"
                stroke-width="2" />
            <path
                d="M27 5H40C44 5 46 7.5 46 11.5V19H27V5Z"
                :stroke="position === 'II' ? '#00478B' : '#CBD5E1'"
                stroke-width="2" />
            <text
                v-if="position === 'II'"
                x="36.5"
                y="15.5"
                fill="#00478B"
                font-size="10"
                font-family="system-ui, -apple-system, sans-serif"
                font-weight="800"
                text-anchor="middle">
                2
            </text>
        </svg>
    </span>
</template>

<script setup lang="ts">
withDefaults(
    defineProps<{
        position: 'I' | 'II';
        mode?: 'full' | 'active-half';
    }>(),
    {
        mode: 'full'
    }
);
</script>
