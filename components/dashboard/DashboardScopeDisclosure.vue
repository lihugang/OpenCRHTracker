<template>
    <div class="space-y-2">
        <button
            type="button"
            class="group flex w-full cursor-pointer items-center justify-between gap-4 rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-3 text-left shadow-sm transition-[border-color,background-color,box-shadow,color] duration-200 ease-out hover:border-slate-300 hover:bg-white/90 hover:shadow-[0_12px_28px_-22px_rgba(15,23,42,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crh-blue/25 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
            :aria-expanded="isExpanded ? 'true' : 'false'"
            @click="toggle">
            <span
                class="text-sm font-medium text-slate-700 transition group-hover:text-slate-900">
                {{ summaryLabel }}
            </span>
            <span
                class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition group-hover:border-slate-300 group-hover:text-slate-700"
                :class="isExpanded ? 'border-crh-blue/20 text-crh-blue' : ''">
                <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    fill="none"
                    class="h-4 w-4 transition-transform duration-200 ease-out"
                    :class="isExpanded ? 'rotate-180' : ''">
                    <path
                        d="M5 7.5L10 12.5L15 7.5"
                        stroke="currentColor"
                        stroke-width="1.8"
                        stroke-linecap="round"
                        stroke-linejoin="round" />
                </svg>
            </span>
        </button>

        <Transition
            enter-active-class="transition duration-200 ease-out"
            enter-from-class="translate-y-2 opacity-0 motion-reduce:translate-y-0"
            enter-to-class="translate-y-0 opacity-100"
            leave-active-class="transition duration-180 ease-out"
            leave-from-class="translate-y-0 opacity-100"
            leave-to-class="translate-y-1 opacity-0 motion-reduce:translate-y-0">
            <div
                v-if="isExpanded"
                class="flex flex-wrap gap-2 rounded-[1rem] border border-slate-200 bg-white/85 px-5 py-4">
                <span
                    v-for="scope in scopes"
                    :key="scope"
                    class="inline-flex items-center rounded-full bg-blue-600/8 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                    {{ scope }}
                </span>
            </div>
        </Transition>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{
    scopes: string[];
    defaultExpanded?: boolean;
}>();

const isExpanded = ref(props.defaultExpanded ?? false);

const summaryLabel = computed(() => `${props.scopes.length} 条权限`);

function toggle() {
    isExpanded.value = !isExpanded.value;
}
</script>
