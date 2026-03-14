<template>
    <div class="rounded-xl border border-slate-200 bg-slate-100 p-1">
        <div
            class="grid gap-1"
            :style="gridStyle">
            <button
                v-for="option in options"
                :key="option.value"
                type="button"
                class="rounded-lg px-4 py-2.5 text-center text-sm font-medium transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crh-blue/20 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                :class="
                    model === option.value
                        ? 'border border-slate-300 bg-white text-slate-900 shadow-sm'
                        : 'border border-transparent bg-transparent text-slate-500 hover:bg-white/70 hover:text-slate-700'
                "
                @click="model = option.value">
                <span>{{ option.label }}</span>
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface TabOption {
    value: string;
    label: string;
    hint?: string;
}

const props = defineProps<{
    options: TabOption[];
}>();

const model = defineModel<string>({
    required: true
});

const gridStyle = computed(() => ({
    gridTemplateColumns: `repeat(${props.options.length}, minmax(0, 1fr))`
}));
</script>
