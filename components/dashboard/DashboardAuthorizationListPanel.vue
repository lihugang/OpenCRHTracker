<template>
    <UiCard :show-accent-bar="false">
        <div class="space-y-5">
            <div class="space-y-2">
                <p
                    class="text-xs font-medium uppercase tracking-[0.26em] text-crh-blue/80">
                    Authorizations
                </p>
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <h3 class="text-xl font-semibold text-slate-900">
                        已授权应用
                    </h3>
                    <div class="flex items-center gap-3">
                        <span
                            class="inline-flex items-center rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-white">
                            {{ items.length }} 个应用
                        </span>
                        <UiButton
                            type="button"
                            variant="secondary"
                            :disabled="isLoading || !canReadAuthorizations"
                            @click="emit('refresh')">
                            刷新
                        </UiButton>
                    </div>
                </div>
            </div>

            <div class="motion-divider opacity-70" />

            <p
                v-if="!canReadAuthorizations"
                class="rounded-[1rem] border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm leading-6 text-amber-800">
                当前会话不包含 <code>api.auth.authorizations.read</code>
                权限，无法读取已授权应用列表。
            </p>

            <p
                v-else-if="!canRevokeAuthorizations"
                class="rounded-[1rem] border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm leading-6 text-amber-800">
                当前会话不包含 <code>api.auth.authorizations.revoke</code>
                权限，只能查看授权记录，无法取消授权。
            </p>

            <UiEmptyState
                v-if="canReadAuthorizations && isLoading"
                eyebrow="LOADING"
                title="正在加载已授权应用"
                description="请稍候，正在同步你的授权记录。" />

            <UiEmptyState
                v-else-if="canReadAuthorizations && errorMessage && items.length === 0"
                eyebrow="ERROR"
                title="授权列表加载失败"
                :description="errorMessage"
                tone="danger" />

            <UiEmptyState
                v-else-if="canReadAuthorizations && items.length === 0"
                eyebrow="EMPTY"
                title="还没有已授权应用"
                description="当你使用第三方 OAuth 应用登录或授权后，这里会显示对应的应用记录。" />

            <div
                v-else-if="canReadAuthorizations"
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
                    :key="item.clientId"
                    class="dashboard-glass-card rounded-[1rem] border px-4 py-4">
                    <div class="space-y-4">
                        <div
                            class="flex flex-wrap items-start justify-between gap-4">
                            <div class="min-w-0 flex-1 space-y-3">
                                <div class="flex flex-wrap items-center gap-2">
                                    <h4
                                        class="text-base font-semibold text-slate-900">
                                        {{ item.name }}
                                    </h4>
                                    <span :class="getClientStatusBadgeClass(item.status)">
                                        {{ getClientStatusLabel(item.status) }}
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

                            <UiButton
                                type="button"
                                variant="secondary"
                                class="shrink-0 border-rose-200 bg-white text-rose-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800"
                                :disabled="!canRevokeAuthorizations || isPending(item.clientId)"
                                :loading="isPending(item.clientId)"
                                @click="emit('revoke', item)">
                                取消授权
                            </UiButton>
                        </div>

                        <div class="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                            <div class="space-y-4">
                                <div class="space-y-2">
                                    <p
                                        class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                                        描述
                                    </p>
                                    <p class="text-sm leading-6 text-slate-600">
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

                                <div class="space-y-2">
                                    <p
                                        class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                                        开发者
                                    </p>
                                    <p class="text-sm font-medium text-slate-700">
                                        {{ item.ownerUserId }}
                                    </p>
                                </div>
                            </div>

                            <dl class="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                                <div
                                    class="dashboard-soft-surface rounded-[1rem] border px-4 py-3">
                                    <dt
                                        class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                        首次授权
                                    </dt>
                                    <dd
                                        class="mt-1 text-sm font-semibold text-slate-900">
                                        {{ formatTimestamp(item.grantedAt) }}
                                    </dd>
                                </div>
                                <div
                                    class="dashboard-soft-surface rounded-[1rem] border px-4 py-3">
                                    <dt
                                        class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                        最近授权
                                    </dt>
                                    <dd
                                        class="mt-1 text-sm font-semibold text-slate-900">
                                        {{ formatTimestamp(item.updatedAt) }}
                                    </dd>
                                </div>
                            </dl>
                        </div>

                        <div class="space-y-3">
                            <div
                                class="flex flex-wrap items-center justify-between gap-3">
                                <p
                                    class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                                    已授权权限
                                </p>
                                <p class="text-sm text-slate-500">
                                    {{ item.grantedScopes.length }} 项
                                </p>
                            </div>

                            <div class="space-y-2">
                                <div
                                    v-for="scope in item.grantedScopes"
                                    :key="`${item.clientId}:${scope}`"
                                    class="dashboard-soft-surface rounded-[1rem] border px-4 py-3">
                                    <p
                                        class="break-all font-mono text-sm text-slate-700">
                                        {{ scope }}
                                    </p>
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
    AuthAuthorizationItem,
    OAuthClientStatus
} from '~/types/auth';

defineProps<{
    items: AuthAuthorizationItem[];
    isLoading: boolean;
    errorMessage: string;
    canReadAuthorizations: boolean;
    canRevokeAuthorizations: boolean;
    formatTimestamp: (timestamp: number) => string;
    isPending: (clientId: string) => boolean;
}>();

const emit = defineEmits<{
    refresh: [];
    revoke: [item: AuthAuthorizationItem];
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
</script>
