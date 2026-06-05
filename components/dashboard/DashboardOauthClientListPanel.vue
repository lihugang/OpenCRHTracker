<template>
    <UiCard
        :show-accent-bar="false"
        class="min-h-[32rem]">
        <div class="space-y-5">
            <div
                class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div class="space-y-2">
                    <p
                        class="text-xs font-medium uppercase tracking-[0.26em] text-crh-blue/80">
                        OAUTH CLIENTS
                    </p>
                    <h2 class="text-2xl font-semibold text-slate-900">
                        OAuth 客户端列表
                    </h2>
                </div>

                <UiButton
                    type="button"
                    variant="secondary"
                    :disabled="isLoading"
                    @click="emit('refresh')">
                    刷新
                </UiButton>
            </div>

            <div class="motion-divider" />

            <div
                v-if="isLoading"
                class="grid gap-4">
                <div
                    v-for="index in 4"
                    :key="`oauth-client-skeleton:${index}`"
                    class="dashboard-skeleton-surface animate-pulse rounded-[1.15rem] border px-5 py-5">
                    <div class="dashboard-skeleton-block h-5 w-36 rounded" />
                    <div
                        class="dashboard-skeleton-block-muted mt-3 h-4 w-64 rounded" />
                    <div
                        class="dashboard-skeleton-block-muted mt-4 h-16 w-full rounded" />
                </div>
            </div>

            <UiEmptyState
                v-else-if="errorMessage"
                eyebrow="加载失败"
                title="OAuth 客户端列表加载失败"
                :description="errorMessage"
                tone="danger">
                <UiButton
                    type="button"
                    variant="secondary"
                    @click="emit('refresh')">
                    重试
                </UiButton>
            </UiEmptyState>

            <UiEmptyState
                v-else-if="items.length === 0"
                eyebrow="空状态"
                title="暂无 OAuth 客户端"
                description="" />

            <div
                v-else
                class="grid gap-4">
                <div
                    v-for="item in items"
                    :key="item.clientId"
                    class="rounded-[1rem] border border-slate-200 bg-white/90 px-5 py-5">
                    <div
                        class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div class="min-w-0 space-y-3">
                            <div class="flex flex-wrap items-center gap-2">
                                <h3 class="text-lg font-semibold text-slate-900">
                                    {{ item.name }}
                                </h3>
                                <span
                                    class="inline-flex rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-white">
                                    {{ item.status }}
                                </span>
                                <span
                                    v-if="item.isTrusted"
                                    class="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-emerald-700">
                                    trusted
                                </span>
                            </div>

                            <p class="break-all font-mono text-sm text-crh-blue">
                                {{ item.clientId }}
                            </p>
                            <p class="text-sm leading-6 text-slate-600">
                                {{ item.description || '无描述' }}
                            </p>

                            <div
                                v-if="item.homepageUrl"
                                class="text-sm text-slate-600">
                                <p class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                    主页
                                </p>
                                <p class="mt-1 break-all">
                                    {{ item.homepageUrl }}
                                </p>
                            </div>

                            <div class="text-sm text-slate-600">
                                <p class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                    回调地址
                                </p>
                                <ul class="mt-1 space-y-1">
                                    <li
                                        v-for="redirect in item.redirectUris"
                                        :key="redirect.value"
                                        class="break-all">
                                        {{ redirect.value }}
                                    </li>
                                </ul>
                            </div>

                            <div class="text-sm text-slate-600">
                                <p class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                    申请 Scopes
                                </p>
                                <div class="mt-2 flex flex-wrap gap-2">
                                    <span
                                        v-for="scopeItem in item.scopeRequests"
                                        :key="`${item.clientId}:${scopeItem.scope}`"
                                        class="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-700">
                                        <span>{{ scopeItem.scope }}</span>
                                        <span class="uppercase text-slate-500">
                                            {{ scopeItem.reviewStatus }}
                                        </span>
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </UiCard>
</template>

<script setup lang="ts">
import type { OAuthClientPublicItem } from '~/types/auth';

defineProps<{
    items: OAuthClientPublicItem[];
    isLoading: boolean;
    errorMessage: string;
}>();

const emit = defineEmits<{
    refresh: [];
}>();
</script>
