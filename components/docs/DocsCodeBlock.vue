<template>
    <div class="group/code relative min-w-0 max-w-full">
        <div class="pointer-events-none absolute right-3 top-3 z-10">
            <UiButton
                type="button"
                variant="secondary"
                size="sm"
                class="pointer-events-auto opacity-0 shadow-sm transition-opacity duration-150 group-hover/code:opacity-100 group-focus-within/code:opacity-100"
                @click="copyCode">
                {{ copyLabel }}
            </UiButton>
        </div>

        <pre
            :class="[
                'max-w-full overflow-x-auto rounded-[1rem] bg-slate-950/95 text-slate-100',
                paddingClass,
                textClass
            ]"><code>{{ code }}</code></pre>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';

const props = withDefaults(
    defineProps<{
        code: string;
        textClass?: string;
        paddingClass?: string;
    }>(),
    {
        textClass: 'text-sm leading-7',
        paddingClass: 'p-4 pr-24'
    }
);

const copyState = ref<'idle' | 'success' | 'error'>('idle');
let resetTimer: ReturnType<typeof setTimeout> | null = null;

const copyLabel = computed(() => {
    switch (copyState.value) {
        case 'success':
            return '已复制';
        case 'error':
            return '复制失败';
        default:
            return '复制';
    }
});

function clearResetTimer() {
    if (!resetTimer) {
        return;
    }

    clearTimeout(resetTimer);
    resetTimer = null;
}

function scheduleReset() {
    clearResetTimer();
    resetTimer = setTimeout(() => {
        copyState.value = 'idle';
        resetTimer = null;
    }, 2000);
}

async function copyCode() {
    if (!import.meta.client) {
        return;
    }

    try {
        await navigator.clipboard.writeText(props.code);
        copyState.value = 'success';
    } catch {
        copyState.value = 'error';
    }

    scheduleReset();
}

onBeforeUnmount(() => {
    clearResetTimer();
});
</script>
