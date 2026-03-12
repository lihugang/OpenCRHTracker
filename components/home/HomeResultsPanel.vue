<template>
    <UiCard>
        <div class="space-y-6">
            <div class="space-y-2">
                <p
                    class="text-xs font-semibold uppercase tracking-[0.3em] text-crh-blue/70">
                    结果面板
                </p>
                <h2 class="text-2xl font-semibold text-crh-grey-dark">
                    {{ title }}
                </h2>
                <p class="text-sm leading-6 text-slate-500">
                    {{ description }}
                </p>
            </div>

            <div class="motion-divider" />

            <div
                v-if="state === 'loading' && items.length === 0"
                class="space-y-4">
                <div
                    v-for="index in 3"
                    :key="index"
                    class="animate-pulse rounded-[1.25rem] border border-slate-200 bg-slate-50/80 p-5">
                    <div class="h-5 w-1/3 rounded bg-slate-200" />
                    <div class="mt-3 h-4 w-2/3 rounded bg-slate-200" />
                    <div class="mt-6 grid gap-3 md:grid-cols-2">
                        <div class="h-20 rounded-[1rem] bg-slate-100" />
                        <div class="h-20 rounded-[1rem] bg-slate-100" />
                    </div>
                </div>
            </div>

            <UiEmptyState
                v-else-if="!hasSearched"
                eyebrow="尚未查询"
                title="先提交一个查询条件"
                description="选择上方标签页后填写条件，结果区会在这里展示结构化记录和后续分页入口。" />

            <UiEmptyState
                v-else-if="state === 'error' && items.length === 0"
                eyebrow="查询失败"
                title="这次请求没有成功"
                :description="
                    errorMessage || '请检查输入条件是否正确，或稍后再试。'
                "
                tone="danger" />

            <UiEmptyState
                v-else-if="state === 'empty'"
                eyebrow="没有结果"
                title="当前条件下未找到记录"
                description="可以尝试换一个更精确的车次、车组编号，或调整查询日期后再次提交。" />

            <div
                v-else
                class="space-y-4">
                <div
                    v-if="errorMessage"
                    class="rounded-[1rem] border border-status-delayed/15 bg-status-delayed/5 px-4 py-3 text-sm text-status-delayed">
                    {{ errorMessage }}
                </div>

                <UiResultList
                    title="查询结果"
                    :summary="summary"
                    :items="items"
                    :has-more="hasMore"
                    :loading-more="loadingMore"
                    @load-more="$emit('loadMore')" />
            </div>
        </div>
    </UiCard>
</template>

<script setup lang="ts">
import type { QueryRequestState, WorkbenchResultItem } from '~/types/homepage';

defineProps<{
    title: string;
    description: string;
    state: QueryRequestState;
    hasSearched: boolean;
    items: WorkbenchResultItem[];
    summary: string;
    errorMessage: string;
    hasMore: boolean;
    loadingMore: boolean;
}>();

defineEmits<{
    loadMore: [];
}>();
</script>
