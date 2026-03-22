<template>
    <UiCard
        :show-accent-bar="false"
        class="min-h-[32rem]">
        <div class="space-y-6">
            <div
                class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div class="space-y-2">
                    <p
                        class="text-xs font-semibold uppercase tracking-[0.28em] text-crh-blue/80">
                        API KEYS
                    </p>
                    <h2 class="text-2xl font-semibold text-slate-900">
                        密钥列表
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
                    v-for="index in 5"
                    :key="`api-key-skeleton:${index}`"
                    class="animate-pulse rounded-[1.15rem] border border-slate-200 bg-white/80 px-5 py-4">
                    <div class="h-4 w-24 rounded bg-slate-200" />
                    <div class="mt-3 h-4 w-56 rounded bg-slate-100" />
                    <div class="mt-4 grid gap-2 sm:grid-cols-2">
                        <div class="h-3 w-28 rounded bg-slate-100" />
                        <div class="h-3 w-24 rounded bg-slate-100" />
                    </div>
                </div>
            </div>

            <UiEmptyState
                v-else-if="errorMessage"
                eyebrow="加载失败"
                title="API 密钥列表加载失败"
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
                v-else-if="groups.length === 0"
                eyebrow="空状态"
                title="暂无 API 密钥"
                description="网页端会话密钥和手动签发的 API 密钥会显示在这里。" />

            <div
                v-else
                class="space-y-6">
                <section
                    v-for="group in groups"
                    :key="group.issuer"
                    class="space-y-3">
                    <div class="flex items-center justify-between gap-4">
                        <div class="flex items-center gap-3">
                            <span :class="getIssuerBadgeClass(group.issuer)">
                                {{ getIssuerLabel(group.issuer) }}
                            </span>
                            <h3 class="text-lg font-semibold text-slate-900">
                                {{ getIssuerSectionTitle(group.issuer) }}
                            </h3>
                        </div>
                        <p class="text-sm text-slate-500">
                            {{ group.items.length }} 项
                        </p>
                    </div>

                    <div class="grid gap-3">
                        <div
                            v-for="item in group.items"
                            :key="item.revokeId"
                            class="rounded-[1.15rem] border border-slate-200 bg-white/85 px-5 py-4 shadow-[0_16px_32px_-26px_rgba(15,23,42,0.28)]">
                            <div
                                class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div class="min-w-0 space-y-4">
                                    <div
                                        class="flex flex-wrap items-center gap-2">
                                        <span
                                            :class="getStatusBadgeClass(item)">
                                            {{ getStatusLabel(item) }}
                                        </span>
                                        <span
                                            v-if="item.isCurrent"
                                            class="inline-flex shrink-0 whitespace-nowrap items-center rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
                                            当前会话
                                        </span>
                                    </div>

                                    <div class="min-w-0 space-y-3">
                                        <div class="space-y-1">
                                            <p
                                                class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                                                密钥名称
                                            </p>
                                            <p
                                                class="truncate text-sm font-semibold text-slate-900">
                                                {{ item.name }}
                                            </p>
                                        </div>
                                        <div class="space-y-1">
                                            <p
                                                class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                                                密钥标识
                                            </p>
                                            <p
                                                class="font-mono text-sm font-semibold text-crh-blue">
                                                {{ item.maskedKeyId }}
                                            </p>
                                        </div>
                                    </div>

                                    <dl
                                        class="grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                                        <div class="space-y-1">
                                            <dt
                                                class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                                生效时间
                                            </dt>
                                            <dd
                                                class="text-base font-semibold text-slate-900">
                                                {{
                                                    formatTimestamp(
                                                        item.activeFrom
                                                    )
                                                }}
                                            </dd>
                                        </div>
                                        <div class="space-y-1">
                                            <dt
                                                class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                                失效时间
                                            </dt>
                                            <dd
                                                class="text-base font-semibold text-slate-900">
                                                {{
                                                    formatTimestamp(
                                                        item.expiresAt
                                                    )
                                                }}
                                            </dd>
                                        </div>
                                        <div
                                            v-if="item.revokedAt !== null"
                                            class="space-y-1">
                                            <dt
                                                class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                                吊销时间
                                            </dt>
                                            <dd
                                                class="text-base font-semibold text-slate-900">
                                                {{
                                                    formatTimestamp(
                                                        item.revokedAt
                                                    )
                                                }}
                                            </dd>
                                        </div>
                                    </dl>

                                    <div
                                        v-if="item.usage"
                                        class="space-y-3">
                                        <p
                                            class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                                            最近消耗
                                        </p>

                                        <dl class="grid gap-3 sm:grid-cols-3">
                                            <div
                                                class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-3">
                                                <dt
                                                    class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                                    1 小时
                                                </dt>
                                                <dd
                                                    class="mt-1 text-lg font-semibold text-slate-900">
                                                    {{
                                                        formatTokenCount(
                                                            item.usage.last1Hour
                                                        )
                                                    }}
                                                </dd>
                                            </div>
                                            <div
                                                class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-3">
                                                <dt
                                                    class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                                    8 小时
                                                </dt>
                                                <dd
                                                    class="mt-1 text-lg font-semibold text-slate-900">
                                                    {{
                                                        formatTokenCount(
                                                            item.usage.last8Hours
                                                        )
                                                    }}
                                                </dd>
                                            </div>
                                            <div
                                                class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-3">
                                                <dt
                                                    class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                                    1 天
                                                </dt>
                                                <dd
                                                    class="mt-1 text-lg font-semibold text-slate-900">
                                                    {{
                                                        formatTokenCount(
                                                            item.usage.last1Day
                                                        )
                                                    }}
                                                </dd>
                                            </div>
                                        </dl>
                                    </div>

                                    <div class="space-y-3">
                                        <p
                                            class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                                            权限
                                        </p>
                                        <DashboardScopeDisclosure
                                            :scopes="item.scopes" />
                                    </div>
                                </div>

                                <div class="flex shrink-0">
                                    <UiButton
                                        type="button"
                                        variant="secondary"
                                        class="border-rose-200 bg-white text-rose-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800"
                                        :disabled="
                                            !canRevoke ||
                                            item.revokedAt !== null
                                        "
                                        @click="emit('revoke', item)">
                                        吊销
                                    </UiButton>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    </UiCard>
</template>

<script setup lang="ts">
import type { AuthApiKeyIssuer, AuthApiKeyListItem } from '~/types/auth';

defineProps<{
    groups: Array<{
        issuer: AuthApiKeyIssuer;
        items: AuthApiKeyListItem[];
    }>;
    isLoading: boolean;
    errorMessage: string;
    canRevoke: boolean;
    formatTimestamp: (timestamp: number) => string;
    formatTokenCount: (value: number) => string;
    getIssuerLabel: (issuer: AuthApiKeyIssuer) => string;
    getIssuerSectionTitle: (issuer: AuthApiKeyIssuer) => string;
    getIssuerBadgeClass: (issuer: AuthApiKeyIssuer) => string;
    getStatusLabel: (item: AuthApiKeyListItem) => string;
    getStatusBadgeClass: (item: AuthApiKeyListItem) => string;
}>();

const emit = defineEmits<{
    refresh: [];
    revoke: [item: AuthApiKeyListItem];
}>();
</script>
