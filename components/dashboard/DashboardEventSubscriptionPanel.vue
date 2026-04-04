<template>
    <UiCard :show-accent-bar="false">
        <div class="space-y-5">
            <div class="space-y-2">
                <p class="text-xs font-medium uppercase tracking-[0.26em] text-crh-blue/80">
                    Targets
                </p>
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <h3 class="text-xl font-semibold text-slate-900">
                        订阅对象
                    </h3>
                    <span
                        class="inline-flex items-center rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-white">
                        {{ items.length }} / {{ maxEntries }}
                    </span>
                </div>
            </div>
            <div class="motion-divider opacity-70" />


            <UiEmptyState
                v-if="isLoading"
                eyebrow="LOADING"
                title="正在加载订阅对象"
                description="请稍候，正在同步你的订阅对象列表。" />

            <UiEmptyState
                v-else-if="errorMessage"
                eyebrow="ERROR"
                title="订阅对象加载失败"
                :description="errorMessage"
                tone="danger" />

            <UiEmptyState
                v-else-if="items.length === 0"
                eyebrow="EMPTY"
                title="还没有订阅对象"
                description="" />

            <div
                v-else
                class="space-y-3">
                <div
                    v-for="item in items"
                    :key="`${item.targetType}:${item.targetId}`"
                    class="rounded-[1rem] border border-slate-200 bg-white/85 px-4 py-4 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
                    <div class="flex items-start justify-between gap-4">
                        <NuxtLink
                            :to="item.path"
                            class="min-w-0 flex-1 space-y-1 transition hover:text-crh-blue">
                            <p class="text-base font-semibold text-slate-900">
                                {{ item.label }}
                            </p>
                            <p class="text-sm text-slate-500">
                                {{ item.targetId }}
                            </p>
                            <p class="pt-2 text-xs text-slate-400">
                                订阅于 {{ formatTimestamp(item.createdAt) }}
                            </p>
                        </NuxtLink>

                        <UiSubscriptionButton
                            active
                            size="sm"
                            active-label="取消订阅"
                            :loading="isPending(item)"
                            @click="emit('delete-subscription', item)" />
                    </div>
                </div>
            </div>
        </div>
    </UiCard>
</template>

<script setup lang="ts">
import type { AuthEventSubscriptionItem } from '~/types/auth';

defineProps<{
    items: AuthEventSubscriptionItem[];
    isLoading: boolean;
    errorMessage: string;
    maxEntries: number;
    deviceCount: number;
    formatTimestamp: (timestamp: number) => string;
    isPending: (
        item: Pick<AuthEventSubscriptionItem, 'targetType' | 'targetId'>
    ) => boolean;
}>();

const emit = defineEmits<{
    'delete-subscription': [item: AuthEventSubscriptionItem];
}>();
</script>
