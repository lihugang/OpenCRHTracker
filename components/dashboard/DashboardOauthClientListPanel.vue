<template>
    <UiCard
        :show-accent-bar="false"
        class="min-h-[32rem]">
        <div class="space-y-6">
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
                class="grid gap-3">
                <div
                    v-for="index in 4"
                    :key="`oauth-client-skeleton:${index}`"
                    class="dashboard-skeleton-surface animate-pulse rounded-[1.15rem] border px-5 py-5">
                    <div class="dashboard-skeleton-block h-5 w-36 rounded" />
                    <div
                        class="dashboard-skeleton-block-muted mt-3 h-4 w-64 rounded" />
                    <div class="mt-4 grid gap-3 sm:grid-cols-2">
                        <div
                            class="dashboard-skeleton-block-muted h-20 w-full rounded" />
                        <div
                            class="dashboard-skeleton-block-muted h-20 w-full rounded" />
                    </div>
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
                    class="dashboard-glass-card rounded-[1.15rem] border px-5 py-5">
                    <div class="space-y-5">
                        <div class="space-y-4">
                            <div
                                class="flex flex-wrap items-start justify-between gap-4">
                                <div class="min-w-0 space-y-3">
                                    <div
                                        class="flex flex-wrap items-center gap-2">
                                        <h3
                                            class="text-lg font-semibold text-slate-900">
                                            {{ item.name }}
                                        </h3>
                                        <span
                                            :class="
                                                getClientStatusBadgeClass(
                                                    item.status
                                                )
                                            ">
                                            {{
                                                getClientStatusLabel(
                                                    item.status
                                                )
                                            }}
                                        </span>
                                        <span
                                            v-if="item.isTrusted"
                                            class="inline-flex shrink-0 whitespace-nowrap items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-emerald-700">
                                            Trusted
                                        </span>
                                    </div>

                                    <div class="space-y-1">
                                        <p
                                            class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                                            Client ID
                                        </p>
                                        <p
                                            class="break-all font-mono text-sm font-semibold text-crh-blue">
                                            {{ item.clientId }}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div
                                class="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
                                <div class="space-y-4">
                                    <div class="space-y-2">
                                        <p
                                            class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                                            描述
                                        </p>
                                        <p
                                            class="text-sm leading-6 text-slate-600">
                                            {{ item.description || '无描述' }}
                                        </p>
                                    </div>

                                    <div class="space-y-2">
                                        <p
                                            class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                                            主页
                                        </p>
                                        <a
                                            v-if="item.homepageUrl"
                                            :href="item.homepageUrl"
                                            target="_blank"
                                            rel="noreferrer noopener"
                                            class="break-all text-sm font-medium text-crh-blue underline decoration-crh-blue/30 underline-offset-4 transition hover:text-[#0A6DC2] hover:decoration-crh-blue/60">
                                            {{ item.homepageUrl }}
                                        </a>
                                        <p
                                            v-else
                                            class="text-sm leading-6 text-slate-500">
                                            未设置主页链接
                                        </p>
                                    </div>
                                </div>

                                <dl
                                    class="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                                    <div
                                        class="dashboard-soft-surface rounded-[1rem] border px-4 py-3">
                                        <dt
                                            class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                            创建时间
                                        </dt>
                                        <dd
                                            class="mt-1 text-sm font-semibold text-slate-900">
                                            {{
                                                formatTimestamp(item.createdAt)
                                            }}
                                        </dd>
                                    </div>
                                    <div
                                        class="dashboard-soft-surface rounded-[1rem] border px-4 py-3">
                                        <dt
                                            class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                            更新时间
                                        </dt>
                                        <dd
                                            class="mt-1 text-sm font-semibold text-slate-900">
                                            {{
                                                formatTimestamp(item.updatedAt)
                                            }}
                                        </dd>
                                    </div>
                                </dl>
                            </div>

                            <div class="grid gap-4 lg:grid-cols-2">
                                <div class="space-y-3">
                                    <p
                                        class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                                        回调地址
                                    </p>
                                    <ul class="space-y-2">
                                        <li
                                            v-for="redirect in item.redirectUris"
                                            :key="redirect.value"
                                            class="dashboard-soft-surface rounded-[1rem] border px-4 py-3">
                                            <p
                                                class="break-all font-mono text-sm text-slate-700">
                                                {{ redirect.value }}
                                            </p>
                                        </li>
                                    </ul>
                                </div>

                                <div class="space-y-3">
                                    <div
                                        class="flex flex-wrap items-center justify-between gap-3">
                                        <p
                                            class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                                            申请权限
                                        </p>
                                        <p class="text-sm text-slate-500">
                                            {{ item.scopeRequests.length }} 项
                                        </p>
                                    </div>

                                    <div
                                        v-if="item.scopeRequests.length > 0"
                                        class="space-y-2">
                                        <div
                                            v-for="scopeItem in item.scopeRequests"
                                            :key="`${item.clientId}:${scopeItem.scope}`"
                                            class="dashboard-soft-surface flex flex-wrap items-center justify-between gap-3 rounded-[1rem] border px-4 py-3">
                                            <span
                                                class="break-all font-mono text-sm text-slate-700">
                                                {{ scopeItem.scope }}
                                            </span>
                                            <span
                                                :class="
                                                    getScopeReviewBadgeClass(
                                                        scopeItem.reviewStatus
                                                    )
                                                ">
                                                {{
                                                    getScopeReviewLabel(
                                                        scopeItem.reviewStatus
                                                    )
                                                }}
                                            </span>
                                        </div>
                                    </div>

                                    <div
                                        v-else
                                        class="dashboard-soft-surface rounded-[1rem] border border-dashed px-4 py-4 text-sm leading-6 text-slate-500">
                                        当前没有申请任何权限。
                                    </div>
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
import type {
    OAuthClientPublicItem,
    OAuthClientScopeReviewStatus,
    OAuthClientStatus
} from '~/types/auth';

defineProps<{
    items: OAuthClientPublicItem[];
    isLoading: boolean;
    errorMessage: string;
    formatTimestamp: (timestamp: number) => string;
}>();

const emit = defineEmits<{
    refresh: [];
}>();

function getClientStatusLabel(status: OAuthClientStatus) {
    return status === 'active' ? '启用中' : '已停用';
}

function getClientStatusBadgeClass(status: OAuthClientStatus) {
    if (status === 'active') {
        return 'inline-flex shrink-0 whitespace-nowrap items-center rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-white';
    }

    return 'inline-flex shrink-0 whitespace-nowrap items-center rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-slate-700';
}

function getScopeReviewLabel(status: OAuthClientScopeReviewStatus) {
    if (status === 'approved') {
        return '已通过';
    }

    if (status === 'rejected') {
        return '已拒绝';
    }

    return '待审核';
}

function getScopeReviewBadgeClass(status: OAuthClientScopeReviewStatus) {
    if (status === 'approved') {
        return 'inline-flex shrink-0 whitespace-nowrap items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-emerald-700';
    }

    if (status === 'rejected') {
        return 'inline-flex shrink-0 whitespace-nowrap items-center rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-rose-700';
    }

    return 'inline-flex shrink-0 whitespace-nowrap items-center rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-amber-700';
}
</script>
