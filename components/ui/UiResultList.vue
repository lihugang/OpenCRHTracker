<template>
    <div class="space-y-4">
        <div
            class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
                <h3 class="text-lg font-semibold text-crh-grey-dark">
                    {{ title }}
                </h3>
                <p class="mt-1 text-sm text-slate-500">
                    {{ summary }}
                </p>
            </div>
        </div>

        <div class="space-y-4">
            <UiCard
                v-for="item in items"
                :key="item.id"
                variant="subtle">
                <div class="space-y-4">
                    <div
                        class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div class="space-y-1">
                            <h4
                                class="font-mono text-lg font-semibold text-crh-blue">
                                {{ item.title }}
                            </h4>
                            <p class="text-sm text-slate-500">
                                {{ item.subtitle }}
                            </p>
                        </div>
                        <p
                            v-if="item.timestampLabel"
                            class="font-mono text-xs font-medium text-slate-500">
                            {{ item.timestampLabel }}
                        </p>
                    </div>

                    <div
                        v-if="item.badges.length > 0"
                        class="flex flex-wrap gap-2">
                        <span
                            v-for="badge in item.badges"
                            :key="badge"
                            class="rounded-full border border-crh-blue/15 bg-blue-50 px-3 py-1 text-xs font-medium text-crh-blue">
                            {{ badge }}
                        </span>
                    </div>

                    <div
                        class="grid gap-4 lg:grid-cols-[minmax(12rem,0.7fr)_minmax(0,1.3fr)]">
                        <UiTimelineNode
                            v-if="item.route"
                            :start="item.route.start"
                            :end="item.route.end" />

                        <div
                            v-else
                            class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-500">
                            {{ item.subtitle }}
                        </div>

                        <dl class="grid gap-3 md:grid-cols-2">
                            <div
                                v-for="meta in item.meta"
                                :key="`${item.id}-${meta.label}`"
                                class="rounded-[1rem] border border-slate-200 bg-white/90 px-4 py-3">
                                <dt
                                    class="text-xs uppercase tracking-[0.2em] text-slate-400">
                                    {{ meta.label }}
                                </dt>
                                <dd
                                    class="mt-2 break-all font-mono text-sm font-medium text-crh-grey-dark">
                                    {{ meta.value }}
                                </dd>
                            </div>
                        </dl>
                    </div>
                </div>
            </UiCard>
        </div>

        <div
            v-if="hasMore"
            class="pt-2">
            <UiButton
                block
                variant="secondary"
                :loading="loadingMore"
                @click="$emit('loadMore')">
                继续加载
            </UiButton>
        </div>
    </div>
</template>

<script setup lang="ts">
import type { WorkbenchResultItem } from '~/types/homepage';

defineProps<{
    title: string;
    summary: string;
    items: WorkbenchResultItem[];
    hasMore: boolean;
    loadingMore: boolean;
}>();

defineEmits<{
    loadMore: [];
}>();
</script>
