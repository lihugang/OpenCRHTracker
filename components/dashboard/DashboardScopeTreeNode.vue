<template>
    <div class="space-y-2">
        <label
            :class="[
                'flex cursor-pointer items-start gap-3 rounded-[1rem] border px-4 py-3 transition',
                isChecked
                    ? 'border-crh-blue/35 bg-blue-50/70'
                    : 'border-slate-200 bg-white/85 hover:border-slate-300 hover:bg-slate-50/70'
            ]">
            <input
                :checked="isChecked"
                :indeterminate="isIndeterminate"
                type="checkbox"
                class="mt-0.5 h-4 w-4 rounded border-slate-300 text-crh-blue focus:ring-crh-blue/30"
                @change="handleToggle" />

            <span class="min-w-0 space-y-1">
                <span class="block text-sm font-medium text-slate-900">
                    {{ node.label }}
                </span>
                <span
                    class="block text-xs uppercase tracking-[0.16em] text-slate-400">
                    {{ node.fullScope ?? `${node.leafScopes.length} 项权限` }}
                </span>
            </span>
        </label>

        <div
            v-if="node.children.length > 0"
            class="ml-3 space-y-2 border-l border-slate-200/90 pl-4">
            <DashboardScopeTreeNode
                v-for="child in node.children"
                :key="child.id"
                :node="child"
                :selected-scopes="selectedScopes"
                @toggle-subtree="handleChildToggle" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { DashboardScopeTreeNodeItem } from '~/types/dashboard';

defineOptions({
    name: 'DashboardScopeTreeNode'
});

const props = defineProps<{
    node: DashboardScopeTreeNodeItem;
    selectedScopes: string[];
}>();

const emit = defineEmits<{
    toggleSubtree: [leafScopes: string[], checked: boolean];
}>();

const selectedScopeSet = computed(() => new Set(props.selectedScopes));

const selectedLeafCount = computed(
    () =>
        props.node.leafScopes.filter((scope) =>
            selectedScopeSet.value.has(scope)
        ).length
);

const isChecked = computed(
    () =>
        props.node.leafScopes.length > 0 &&
        selectedLeafCount.value === props.node.leafScopes.length
);

const isIndeterminate = computed(
    () =>
        selectedLeafCount.value > 0 &&
        selectedLeafCount.value < props.node.leafScopes.length
);

function handleToggle(event: Event) {
    const target = event.target as HTMLInputElement;
    emit('toggleSubtree', props.node.leafScopes, target.checked);
}

function handleChildToggle(leafScopes: string[], checked: boolean) {
    emit('toggleSubtree', leafScopes, checked);
}
</script>
