<template>
    <div class="space-y-4">
        <div class="flex flex-wrap items-center gap-2">
            <button
                type="button"
                class="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                @click="selectAll">
                全选
            </button>
            <button
                type="button"
                class="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                @click="clearAll">
                清空
            </button>
            <p class="text-xs text-slate-500">
                已选择 {{ modelValue.length }} / {{ scopes.length }} 个叶子权限
            </p>
        </div>

        <div class="space-y-3">
            <DashboardScopeTreeNode
                v-for="node in tree"
                :key="node.id"
                :node="node"
                :selected-scopes="modelValue"
                @toggle-subtree="toggleSubtree" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import DashboardScopeTreeNode from '~/components/dashboard/DashboardScopeTreeNode.vue';
import type { DashboardScopeTreeNodeItem } from '~/types/dashboard';

const props = defineProps<{
    scopes: string[];
    modelValue: string[];
    labelMap?: Record<string, string>;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: string[]];
}>();

interface MutableTreeNode {
    id: string;
    segment: string;
    path: string;
    fullScope: string | null;
    children: MutableTreeNode[];
}

function resolveNodeLabel(path: string, segment: string) {
    if (props.labelMap?.[path]) {
        return props.labelMap[path];
    }

    if (props.labelMap?.[segment]) {
        return props.labelMap[segment];
    }

    return segment;
}

const tree = computed<DashboardScopeTreeNodeItem[]>(() => {
    const rootNodes: MutableTreeNode[] = [];

    for (const scope of props.scopes) {
        const segments = scope.split('.');
        let siblings = rootNodes;
        let currentPath = '';
        let currentNode: MutableTreeNode | null = null;

        for (const segment of segments) {
            currentPath = currentPath ? `${currentPath}.${segment}` : segment;
            const existingNode = siblings.find(
                (node) => node.segment === segment
            );

            if (existingNode) {
                currentNode = existingNode;
                siblings = existingNode.children;
                continue;
            }

            const nextNode: MutableTreeNode = {
                id: currentPath,
                segment,
                path: currentPath,
                fullScope: null,
                children: []
            };

            siblings.push(nextNode);
            siblings.sort((left, right) =>
                left.segment.localeCompare(right.segment)
            );

            currentNode = nextNode;
            siblings = nextNode.children;
        }

        if (currentNode) {
            currentNode.fullScope = scope;
        }
    }

    function finalize(node: MutableTreeNode): DashboardScopeTreeNodeItem {
        const children = node.children
            .map(finalize)
            .sort((left, right) => left.label.localeCompare(right.label));

        const leafScopes =
            children.length > 0
                ? children.flatMap((child) => child.leafScopes)
                : node.fullScope
                  ? [node.fullScope]
                  : [];

        return {
            id: node.id,
            label: resolveNodeLabel(node.path, node.segment),
            fullScope: node.fullScope,
            children,
            leafScopes
        };
    }

    return [...rootNodes]
        .sort((left, right) => left.segment.localeCompare(right.segment))
        .map(finalize);
});

function toggleSubtree(leafScopes: string[], checked: boolean) {
    const nextSelectedScopes = new Set(props.modelValue);

    for (const scope of leafScopes) {
        if (checked) {
            nextSelectedScopes.add(scope);
            continue;
        }

        nextSelectedScopes.delete(scope);
    }

    emit(
        'update:modelValue',
        props.scopes.filter((scope) => nextSelectedScopes.has(scope))
    );
}

function selectAll() {
    emit('update:modelValue', [...props.scopes]);
}

function clearAll() {
    emit('update:modelValue', []);
}
</script>
