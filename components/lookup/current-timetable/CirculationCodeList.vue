<template>
    <div :class="codeListClass">
        <template
            v-for="(code, codeIndex) in node.allCodes"
            :key="`${node.key}:${mode}:${code}`">
            <span
                v-if="isCurrentCode(code)"
                :class="currentCodeClass(node)">
                {{ code }}
            </span>
            <NuxtLink
                v-else
                :to="buildCodeLink(code)"
                :class="linkClass(node)">
                {{ code }}
            </NuxtLink>
            <span
                v-if="codeIndex < node.allCodes.length - 1"
                class="text-slate-400">
                /
            </span>
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { DisplayCirculationNode } from '~/types/lookupCurrentTimetable';

const props = defineProps<{
    node: DisplayCirculationNode;
    mode: 'desktop' | 'mobile';
    isCurrentCode: (code: string) => boolean;
    buildCodeLink: (code: string) => string;
}>();

const codeListClass = computed(() => [
    'min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-sm font-semibold',
    props.mode === 'mobile' ? 'text-crh-blue' : ''
]);

function currentCodeClass(node: DisplayCirculationNode) {
    if (props.mode === 'mobile') {
        return '';
    }

    return node.isCurrent ? 'text-crh-blue' : 'text-crh-grey-dark';
}

function linkClass(node: DisplayCirculationNode) {
    if (props.mode === 'mobile') {
        return 'transition hover:underline';
    }

    return [
        'transition hover:underline',
        node.isCurrent
            ? 'text-crh-blue'
            : 'text-crh-grey-dark hover:text-crh-blue'
    ];
}
</script>
