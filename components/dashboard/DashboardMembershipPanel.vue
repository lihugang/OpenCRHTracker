<template>
    <div
        class="overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white/90 shadow-[0_18px_44px_-34px_rgba(15,23,42,0.35)]">
        <section class="p-6 sm:p-7">
            <div class="space-y-6">
                <div
                    class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div class="space-y-2">
                        <p
                            class="text-xs font-medium uppercase tracking-[0.26em] text-crh-blue/80">
                            Sponsorship
                        </p>
                        <h2 class="text-2xl font-semibold text-slate-900">
                            赞助权益摘要
                        </h2>
                        <p class="max-w-2xl text-sm leading-6 text-slate-600">
                            当前配额与权限会根据所有生效中的赞助组自动合并。
                        </p>
                    </div>

                    <UiButton
                        type="button"
                        variant="secondary"
                        :loading="state === 'pending'"
                        @click="emit('refresh')">
                        刷新
                    </UiButton>
                </div>

                <div class="motion-divider" />

                <div
                    v-if="state === 'pending' && !data"
                    class="space-y-4"
                    aria-label="正在加载赞助权益">
                    <div
                        class="h-36 animate-pulse rounded-[1rem] bg-slate-100/90" />
                    <div class="grid gap-3 sm:grid-cols-2">
                        <div
                            v-for="index in 2"
                            :key="`sponsorship-summary-skeleton:${index}`"
                            class="h-16 animate-pulse rounded-[1rem] bg-slate-100/70" />
                    </div>
                </div>

                <UiEmptyState
                    v-else-if="errorMessage && !data"
                    eyebrow="加载失败"
                    title="赞助权益加载失败"
                    :description="errorMessage"
                    tone="danger">
                    <UiButton
                        type="button"
                        variant="secondary"
                        @click="emit('refresh')">
                        重试
                    </UiButton>
                </UiEmptyState>

                <template v-else-if="data">
                    <div
                        class="relative overflow-hidden rounded-[1rem] border border-slate-800 bg-slate-900 text-white shadow-[0_20px_48px_-30px_rgba(15,23,42,0.7)]">
                        <div
                            aria-hidden="true"
                            class="absolute inset-y-0 left-0 w-1.5 bg-amber-400" />
                        <dl class="grid min-h-36 sm:grid-cols-2 xl:grid-cols-4">
                            <div
                                class="flex min-h-28 flex-col justify-between border-white/10 px-6 py-5 sm:border-r xl:min-h-36">
                                <dt
                                    class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                                    最终 token 上限
                                </dt>
                                <dd class="mt-4 text-3xl font-semibold">
                                    {{
                                        formatNumber(
                                            data.effectiveQuota.tokenLimit
                                        )
                                    }}
                                </dd>
                            </div>
                            <div
                                class="flex min-h-28 flex-col justify-between border-t border-white/10 px-6 py-5 sm:border-r sm:border-t-0 xl:min-h-36">
                                <dt
                                    class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                                    每周期恢复
                                </dt>
                                <dd class="mt-4 text-3xl font-semibold">
                                    {{
                                        formatNumber(
                                            data.effectiveQuota.refillAmount
                                        )
                                    }}
                                </dd>
                            </div>
                            <div
                                class="flex min-h-28 flex-col justify-between border-t border-white/10 px-6 py-5 sm:border-r xl:min-h-36 xl:border-t-0">
                                <dt
                                    class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                                    恢复周期
                                </dt>
                                <dd class="mt-4 text-xl font-semibold">
                                    {{
                                        formatDuration(
                                            data.effectiveQuota
                                                .refillIntervalSeconds
                                        )
                                    }}
                                </dd>
                            </div>
                            <div
                                class="flex min-h-28 flex-col justify-between border-t border-white/10 px-6 py-5 sm:border-t xl:min-h-36 xl:border-t-0">
                                <dt
                                    class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                                    当前可用权限
                                </dt>
                                <dd class="mt-4 text-3xl font-semibold">
                                    {{
                                        formatNumber(data.accountScopes.length)
                                    }}
                                </dd>
                            </div>
                        </dl>
                    </div>

                    <dl
                        class="grid divide-y divide-slate-200 overflow-hidden rounded-[1rem] border border-slate-200 bg-slate-50/75 md:grid-cols-3 md:divide-x md:divide-y-0">
                        <div class="min-h-28 px-5 py-4">
                            <dt
                                class="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                                基础配额
                            </dt>
                            <dd
                                class="mt-3 text-sm font-semibold leading-6 text-slate-900">
                                {{
                                    formatQuotaPair(
                                        data.quotaBreakdown.baseline
                                    )
                                }}
                            </dd>
                        </div>
                        <div class="min-h-28 px-5 py-4">
                            <dt
                                class="text-xs font-medium uppercase tracking-[0.18em] text-emerald-700">
                                赞助组贡献
                            </dt>
                            <dd
                                class="mt-3 text-sm font-semibold leading-6 text-slate-900">
                                {{
                                    formatQuotaPair(
                                        data.quotaBreakdown.sponsorship,
                                        '当前无配额提升'
                                    )
                                }}
                            </dd>
                        </div>
                        <div class="min-h-28 px-5 py-4">
                            <dt
                                class="text-xs font-medium uppercase tracking-[0.18em] text-amber-700">
                                手工覆盖
                            </dt>
                            <dd
                                class="mt-3 text-sm font-semibold leading-6 text-slate-900">
                                {{
                                    formatQuotaPair(
                                        data.quotaBreakdown.manualOverride,
                                        '当前未设置'
                                    )
                                }}
                            </dd>
                        </div>
                    </dl>

                    <div
                        v-if="errorMessage"
                        class="rounded-[1rem] border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm leading-6 text-amber-900">
                        刷新失败，当前显示的是最近一次成功加载的结果。{{
                            errorMessage
                        }}
                    </div>

                    <details
                        v-if="data.accountScopes.length > 0"
                        class="group rounded-[1rem] border border-slate-200 bg-slate-50/75 px-4 py-3">
                        <summary
                            class="cursor-pointer text-sm font-semibold text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-crh-blue/30">
                            查看当前可用权限
                        </summary>
                        <div class="mt-4 flex flex-wrap gap-2">
                            <code
                                v-for="scope in data.accountScopes"
                                :key="scope"
                                class="max-w-full break-all rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700">
                                {{ scope }}
                            </code>
                        </div>
                    </details>
                </template>
            </div>
        </section>

        <section
            v-if="data"
            class="border-t border-slate-200 p-6 sm:p-7">
            <div class="space-y-6">
                <div
                    class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div class="space-y-2">
                        <p
                            class="text-xs font-medium uppercase tracking-[0.26em] text-emerald-700">
                            Current access
                        </p>
                        <h2 class="text-2xl font-semibold text-slate-900">
                            当前赞助组
                        </h2>
                        <p class="text-sm leading-6 text-slate-600">
                            生效中与已排期的赞助组会在这里显示。
                        </p>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        <UiStatusBadge
                            :label="`${activeItems.length} 个生效中`"
                            tone="success" />
                        <UiStatusBadge
                            :label="`${scheduledItems.length} 个已排期`"
                            tone="warning" />
                    </div>
                </div>

                <UiEmptyState
                    v-if="grantItems.length === 0"
                    eyebrow="暂无赞助组"
                    title="当前没有已开通的赞助权益"
                    description="可在下方查看当前开放的赞助组。" />

                <div
                    v-else
                    class="divide-y divide-slate-200 overflow-hidden rounded-[1rem] border border-slate-200 bg-white/80">
                    <article
                        v-for="item in grantItems"
                        :key="`${item.groupId}:${item.startsAt}`"
                        class="px-5 py-5 sm:px-6">
                        <div
                            class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                            <div class="min-w-0 flex-1 space-y-4">
                                <div class="space-y-2">
                                    <div
                                        class="flex flex-wrap items-center gap-2">
                                        <h3
                                            class="text-lg font-semibold text-slate-900">
                                            {{
                                                item.group?.name ?? item.groupId
                                            }}
                                        </h3>
                                        <UiStatusBadge
                                            :label="getStatusLabel(item.status)"
                                            :tone="
                                                getStatusTone(item.status)
                                            " />
                                    </div>
                                    <p
                                        v-if="item.group?.description"
                                        class="max-w-3xl text-sm leading-6 text-slate-600">
                                        {{ item.group.description }}
                                    </p>
                                    <p
                                        v-else-if="!item.group"
                                        class="text-sm leading-6 text-rose-700">
                                        当前赞助组配置缺失，请联系站点管理员处理。
                                    </p>
                                </div>

                                <div class="flex flex-wrap gap-2">
                                    <UiStatusBadge
                                        :label="getQuotaLabel(item.group)"
                                        tone="neutral" />
                                    <UiStatusBadge
                                        :label="getPermissionLabel(item.group)"
                                        tone="info" />
                                </div>
                            </div>

                            <dl
                                class="grid shrink-0 gap-3 text-sm sm:grid-cols-2 lg:w-[24rem]">
                                <div
                                    class="rounded-[0.9rem] border border-slate-200 bg-slate-50/80 px-4 py-3">
                                    <dt class="text-xs text-slate-500">
                                        开始时间
                                    </dt>
                                    <dd
                                        class="mt-1 font-semibold text-slate-900">
                                        {{ formatTimestamp(item.startsAt) }}
                                    </dd>
                                </div>
                                <div
                                    class="rounded-[0.9rem] border border-slate-200 bg-slate-50/80 px-4 py-3">
                                    <dt class="text-xs text-slate-500">
                                        到期时间
                                    </dt>
                                    <dd
                                        class="mt-1 font-semibold text-slate-900">
                                        {{
                                            item.expiresAt === null
                                                ? '长期有效'
                                                : formatTimestamp(
                                                      item.expiresAt
                                                  )
                                        }}
                                    </dd>
                                </div>
                            </dl>
                        </div>
                    </article>
                </div>
            </div>
        </section>

        <section
            v-if="data"
            class="border-t border-slate-200 p-6 sm:p-7">
            <div class="space-y-6">
                <div class="space-y-2">
                    <p
                        class="text-xs font-medium uppercase tracking-[0.26em] text-amber-700">
                        Sponsorship catalog
                    </p>
                    <h2 class="text-2xl font-semibold text-slate-900">
                        可订阅的赞助组
                    </h2>
                </div>

                <UiEmptyState
                    v-if="data.catalog.length === 0"
                    eyebrow="暂无可用赞助组"
                    title="当前未开放新的赞助组"
                    description="站点管理员开放后会显示在这里。" />

                <div
                    v-else
                    class="divide-y divide-slate-200 overflow-hidden rounded-[1rem] border border-slate-200 bg-white/70">
                    <article
                        v-for="group in data.catalog"
                        :key="group.id"
                        class="flex flex-col gap-6 px-5 py-5 transition hover:bg-slate-50/80 lg:flex-row lg:items-start lg:justify-between sm:px-6">
                        <div class="min-w-0 flex-1 space-y-5">
                            <div class="space-y-2">
                                <div
                                    class="flex flex-wrap items-center justify-between gap-2">
                                    <h3
                                        class="text-lg font-semibold text-slate-900">
                                        {{ group.name }}
                                    </h3>
                                    <UiStatusBadge
                                        v-if="getCatalogStatus(group.id)"
                                        :label="getCatalogStatus(group.id)"
                                        :tone="
                                            getCatalogStatusTone(group.id)
                                        " />
                                </div>
                                <p class="text-sm leading-6 text-slate-600">
                                    {{ group.description }}
                                </p>
                            </div>

                            <dl class="grid gap-3 sm:grid-cols-2">
                                <div
                                    class="rounded-[0.9rem] border border-slate-200 bg-slate-50/75 px-4 py-3">
                                    <dt class="text-xs text-slate-500">
                                        配额贡献
                                    </dt>
                                    <dd
                                        class="mt-1 text-sm font-semibold text-slate-900">
                                        {{ getQuotaLabel(group) }}
                                    </dd>
                                </div>
                                <div
                                    class="rounded-[0.9rem] border border-slate-200 bg-slate-50/75 px-4 py-3">
                                    <dt class="text-xs text-slate-500">
                                        权限组
                                    </dt>
                                    <dd
                                        class="mt-1 text-sm font-semibold text-slate-900">
                                        {{ getPermissionLabel(group) }}
                                    </dd>
                                </div>
                            </dl>
                        </div>

                        <div
                            class="flex shrink-0 items-center justify-start lg:min-h-24 lg:w-48 lg:justify-end">
                            <a
                                v-if="group.enabled && group.subscriptionUrl"
                                :href="group.subscriptionUrl"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2">
                                前往赞助页面
                                <svg
                                    aria-hidden="true"
                                    viewBox="0 0 20 20"
                                    fill="none"
                                    class="h-4 w-4">
                                    <path
                                        d="M8 5H5.75A1.75 1.75 0 004 6.75v7.5C4 15.217 4.783 16 5.75 16h7.5A1.75 1.75 0 0015 14.25V12M11 4h5v5M9 11l7-7"
                                        stroke="currentColor"
                                        stroke-width="1.7"
                                        stroke-linecap="round"
                                        stroke-linejoin="round" />
                                </svg>
                            </a>
                            <UiStatusBadge
                                v-else
                                label="暂未开放外部赞助"
                                tone="neutral" />
                        </div>
                    </article>
                </div>
            </div>
        </section>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type {
    AuthMembershipsResponse,
    SponsorshipGroupCatalogItem,
    UserMembershipStatus
} from '~/types/membership';
import formatTrackerTimestamp from '~/utils/time/formatTrackerTimestamp';

const props = defineProps<{
    data: AuthMembershipsResponse | null;
    state: 'idle' | 'pending' | 'success' | 'error';
    errorMessage: string;
}>();

const emit = defineEmits<{
    refresh: [];
}>();

const grantItems = computed(() =>
    (props.data?.items ?? []).filter(
        (item) => item.status === 'active' || item.status === 'scheduled'
    )
);
const activeItems = computed(() =>
    grantItems.value.filter((item) => item.status === 'active')
);
const scheduledItems = computed(() =>
    grantItems.value.filter((item) => item.status === 'scheduled')
);

function formatNumber(value: number) {
    return value.toLocaleString('zh-CN');
}

function formatTimestamp(timestamp: number) {
    return formatTrackerTimestamp(timestamp) || '--';
}

function formatDuration(seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0) {
        return '--';
    }

    if (seconds % 86400 === 0) {
        return `${formatNumber(seconds / 86400)} 天`;
    }

    if (seconds % 3600 === 0) {
        return `${formatNumber(seconds / 3600)} 小时`;
    }

    if (seconds % 60 === 0) {
        return `${formatNumber(seconds / 60)} 分钟`;
    }

    return `${formatNumber(seconds)} 秒`;
}

function getStatusLabel(status: UserMembershipStatus) {
    switch (status) {
        case 'active':
            return '生效中';
        case 'scheduled':
            return '已排期';
        case 'expired':
            return '已到期';
        case 'revoked':
            return '已撤销';
        case 'disabled':
            return '赞助组已停用';
        case 'unknown':
            return '配置异常';
    }
}

function getStatusTone(status: UserMembershipStatus) {
    switch (status) {
        case 'active':
            return 'success' as const;
        case 'scheduled':
            return 'warning' as const;
        case 'expired':
        case 'revoked':
            return 'neutral' as const;
        case 'disabled':
        case 'unknown':
            return 'danger' as const;
    }
}

function getQuotaLabel(group: SponsorshipGroupCatalogItem | null) {
    if (!group) {
        return '配额未知';
    }

    const labels: string[] = [];
    if (group.quota.tokenLimit !== null) {
        labels.push(`上限 ${formatNumber(group.quota.tokenLimit)}`);
    }
    if (group.quota.refillAmount !== null) {
        labels.push(`恢复 ${formatNumber(group.quota.refillAmount)}`);
    }

    return labels.length > 0 ? labels.join(' / ') : '沿用基础配额';
}

function formatQuotaPair(
    quota: {
        tokenLimit: number | null;
        refillAmount: number | null;
    },
    emptyLabel = ''
) {
    const labels: string[] = [];
    if (quota.tokenLimit !== null) {
        labels.push(`上限 ${formatNumber(quota.tokenLimit)}`);
    }
    if (quota.refillAmount !== null) {
        labels.push(`恢复 ${formatNumber(quota.refillAmount)}`);
    }

    return labels.length > 0 ? labels.join(' / ') : emptyLabel || '--';
}

function getPermissionLabel(group: SponsorshipGroupCatalogItem | null) {
    if (!group) {
        return '权限未知';
    }

    if (group.permissionGroups.length === 0) {
        return '不增加权限组';
    }

    return group.permissionGroups.map((item) => item.name).join('、');
}

function getCatalogStatus(groupId: string) {
    const item = grantItems.value.find((entry) => entry.groupId === groupId);
    return item ? getStatusLabel(item.status) : '';
}

function getCatalogStatusTone(groupId: string) {
    const item = grantItems.value.find((entry) => entry.groupId === groupId);
    return item ? getStatusTone(item.status) : ('neutral' as const);
}
</script>
