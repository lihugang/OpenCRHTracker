<template>
    <UiCard :show-accent-bar="false">
        <div class="space-y-5">
            <div class="space-y-2">
                <p
                    class="text-xs font-medium uppercase tracking-[0.26em] text-crh-blue/80">
                    Favorites
                </p>
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <h3 class="text-xl font-semibold text-slate-900">收藏</h3>
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
                title="正在加载收藏"
                description="请稍候，正在同步你的收藏列表。" />

            <UiEmptyState
                v-else-if="errorMessage && items.length === 0"
                eyebrow="ERROR"
                title="收藏列表加载失败"
                :description="errorMessage"
                tone="danger" />

            <UiEmptyState
                v-else-if="items.length === 0"
                eyebrow="EMPTY"
                title="还没有收藏"
                description="在车次、车组或车站详情页点击星标后，这里会显示你的收藏。" />

            <div
                v-else
                class="space-y-3">
                <div
                    v-if="errorMessage"
                    class="flex items-center gap-1.5 text-sm leading-6 text-[#E53E3E]">
                    <span
                        aria-hidden="true"
                        class="font-semibold">
                        [!]
                    </span>
                    <span>{{ errorMessage }}</span>
                </div>

                <div
                    v-for="item in items"
                    :key="`${item.type}:${item.code}`"
                    class="dashboard-glass-card rounded-[1rem] border px-4 py-4">
                    <div class="flex items-start justify-between gap-4">
                        <NuxtLink
                            :to="buildLookupPath(item)"
                            class="min-w-0 flex-1 space-y-1 transition hover:text-crh-blue">
                            <p class="text-base font-semibold text-slate-900">
                                {{ item.code }}
                            </p>
                            <div
                                v-if="item.tags.length > 0"
                                class="flex flex-wrap gap-1.5 pt-1">
                                <span
                                    v-for="tag in item.tags"
                                    :key="tag"
                                    class="inline-flex items-center rounded-full bg-blue-600/8 px-2 py-0.5 text-[11px] font-medium leading-none text-blue-600">
                                    {{ tag }}
                                </span>
                            </div>
                            <p class="pt-2 text-xs text-slate-400">
                                收藏于 {{ formatTimestamp(item.starredAt) }}
                            </p>
                        </NuxtLink>

                        <UiFavoriteButton
                            active
                            size="sm"
                            active-label="取消收藏"
                            :loading="isFavoritePending(item)"
                            @click="emit('toggle-favorite', item)" />
                    </div>
                </div>
            </div>
        </div>
    </UiCard>
</template>

<script setup lang="ts">
import type { FavoriteLookupItem } from '~/types/lookup';
import { buildLookupPath } from '~/utils/lookup/lookupTarget';

const props = defineProps<{
    items: FavoriteLookupItem[];
    isLoading: boolean;
    errorMessage: string;
    maxEntries: number;
    formatTimestamp: (timestamp: number) => string;
    isFavoritePending: (
        item: Pick<FavoriteLookupItem, 'type' | 'code'>
    ) => boolean;
}>();

const emit = defineEmits<{
    'toggle-favorite': [item: FavoriteLookupItem];
}>();
</script>
