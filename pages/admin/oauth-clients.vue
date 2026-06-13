<template>
    <AdminShell
        v-model:date-input="selectedDateInput"
        :today-date-input-value="todayDateInputValue"
        :session="session"
        :show-date-input="false"
        title="OAuth 客户端"
        description="审核开发者 OAuth 客户端、切换 trusted 状态，并在需要时停用或吊销 token。">
        <template #toolbar>
            <UiButton
                type="button"
                variant="secondary"
                :loading="status === 'pending'"
                @click="refresh()">
                刷新
            </UiButton>
        </template>

        <UiCard :show-accent-bar="false">
            <div class="space-y-6">
                <UiEmptyState
                    v-if="errorMessage"
                    eyebrow="加载失败"
                    title="OAuth 客户端加载失败"
                    :description="errorMessage"
                    tone="danger" />

                <UiEmptyState
                    v-else-if="items.length === 0 && status !== 'pending'"
                    eyebrow="Empty"
                    title="暂无 OAuth 客户端"
                    description="开发者创建后会显示在这里。" />

                <div
                    v-else
                    class="grid gap-4">
                    <div
                        v-for="item in items"
                        :key="item.clientId"
                        class="dashboard-glass-card rounded-[1.15rem] border px-5 py-5">
                        <div class="space-y-5">
                            <div
                                class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                <div class="min-w-0 space-y-3">
                                    <div
                                        class="flex flex-wrap items-center gap-2">
                                        <h2
                                            class="text-lg font-semibold text-slate-900">
                                            {{ item.name }}
                                        </h2>
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

                                <div class="flex flex-wrap gap-2">
                                    <UiButton
                                        type="button"
                                        variant="secondary"
                                        @click="toggleTrust(item)">
                                        {{
                                            item.isTrusted
                                                ? '取消信任'
                                                : '设为信任'
                                        }}
                                    </UiButton>
                                    <UiButton
                                        type="button"
                                        variant="secondary"
                                        class="border-rose-200 bg-white text-rose-700 hover:border-rose-300 hover:bg-rose-50"
                                        @click="toggleStatus(item)">
                                        {{
                                            item.status === 'active'
                                                ? '停用'
                                                : '启用'
                                        }}
                                    </UiButton>
                                    <UiButton
                                        type="button"
                                        variant="secondary"
                                        @click="revokeTokens(item)">
                                        吊销 Token
                                    </UiButton>
                                </div>
                            </div>

                            <div
                                class="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
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

                                <dl class="grid gap-3 sm:grid-cols-2">
                                    <div
                                        class="dashboard-soft-surface rounded-[1rem] border px-4 py-3">
                                        <dt
                                            class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                            所属用户
                                        </dt>
                                        <dd
                                            class="mt-1 break-all text-sm font-semibold text-slate-900">
                                            {{ item.ownerUserId }}
                                        </dd>
                                    </div>
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
                                        class="dashboard-soft-surface rounded-[1rem] border px-4 py-3 sm:col-span-2">
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
                                            Scope 审核
                                        </p>
                                        <p class="text-sm text-slate-500">
                                            {{ item.scopeRequests.length }} 项
                                        </p>
                                    </div>

                                    <div
                                        v-if="item.scopeRequests.length > 0"
                                        class="space-y-2">
                                        <label
                                            v-for="scope in item.scopeRequests"
                                            :key="scope.scope"
                                            class="dashboard-soft-surface flex flex-col gap-3 rounded-[1rem] border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                            <div class="min-w-0 space-y-2">
                                                <p
                                                    class="break-all font-mono text-sm text-slate-700">
                                                    {{ scope.scope }}
                                                </p>
                                                <span
                                                    :class="
                                                        getScopeReviewBadgeClass(
                                                            scope.reviewStatus
                                                        )
                                                    ">
                                                    {{
                                                        getScopeReviewLabel(
                                                            scope.reviewStatus
                                                        )
                                                    }}
                                                </span>
                                            </div>
                                            <select
                                                class="harmony-input min-w-[8rem] px-3 py-2 text-sm text-crh-grey-dark"
                                                :value="scope.reviewStatus"
                                                @change="
                                                    updateScopeReview(
                                                        item,
                                                        scope.scope,
                                                        $event
                                                    )
                                                ">
                                                <option value="pending">
                                                    待审核
                                                </option>
                                                <option value="approved">
                                                    已通过
                                                </option>
                                                <option value="rejected">
                                                    已拒绝
                                                </option>
                                            </select>
                                        </label>
                                    </div>

                                    <div
                                        v-else
                                        class="dashboard-soft-surface rounded-[1rem] border border-dashed px-4 py-4 text-sm leading-6 text-slate-500">
                                        当前没有申请任何权限。
                                    </div>
                                </div>
                            </div>

                            <div
                                class="dashboard-soft-surface flex flex-col gap-4 rounded-[1rem] border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                                <div class="min-w-0 space-y-2">
                                    <p
                                        class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                                        管理员权限
                                    </p>
                                    <div class="flex flex-wrap gap-2">
                                        <span
                                            :class="
                                                getAdminGrantBadgeClass(
                                                    item.adminGrants
                                                        .notificationSend
                                                )
                                            ">
                                            通知发送
                                            {{
                                                item.adminGrants
                                                    .notificationSend
                                                    ? '已启用'
                                                    : '未启用'
                                            }}
                                        </span>
                                    </div>
                                    <p
                                        v-if="
                                            item.adminGrants
                                                .notificationSendUpdatedAt
                                        "
                                        class="text-xs leading-5 text-slate-500">
                                        {{
                                            formatAdminGrantUpdate(item)
                                        }}
                                    </p>
                                </div>
                                <UiButton
                                    type="button"
                                    variant="secondary"
                                    @click="toggleNotificationSend(item)">
                                    {{
                                        item.adminGrants.notificationSend
                                            ? '关闭通知权限'
                                            : '启用通知权限'
                                    }}
                                </UiButton>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </UiCard>
    </AdminShell>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import useTrackedRequestFetch from '~/composables/useTrackedRequestFetch';
import { useAdminDateQuery } from '~/composables/useAdminDateQuery';
import type {
    OAuthClientPublicItem,
    OAuthClientScopeReviewStatus,
    OAuthClientStatus
} from '~/types/auth';
import type { TrackerApiResponse } from '~/types/homepage';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import formatTrackerTimestamp from '~/utils/time/formatTrackerTimestamp';

definePageMeta({
    middleware: 'auth-required'
});

const { session } = useAuthState();
const requestFetch = useTrackedRequestFetch();
const { selectedDateInput, todayDateInputValue } = await useAdminDateQuery();

async function fetchClients() {
    return await requestFetch<
        TrackerApiResponse<{ items: OAuthClientPublicItem[] }>
    >('/api/v1/admin/oauth/clients', {
        retry: 0
    });
}

const { data, status, error, refresh } = await useAsyncData(
    'admin-oauth-clients',
    fetchClients
);

const items = computed(() => (data.value?.ok ? data.value.data.items : []));
const errorMessage = computed(() =>
    error.value
        ? getApiErrorMessage(error.value, '加载 OAuth 客户端失败。')
        : !data.value || data.value.ok
          ? ''
          : data.value.data
);

async function patchClient(
    item: OAuthClientPublicItem,
    overrides: Partial<{
        status: 'active' | 'disabled';
        isTrusted: boolean;
        adminGrants: {
            notificationSend: boolean;
        };
        scopeReviews: Array<{
            scope: string;
            reviewStatus: OAuthClientScopeReviewStatus;
        }>;
    }>
) {
    const { data, error } = await useCsrfFetch<
        TrackerApiResponse<{ client: OAuthClientPublicItem }>
    >(`/api/v1/admin/oauth/clients/${encodeURIComponent(item.clientId)}`, {
        method: 'PATCH',
        body: {
            status: overrides.status ?? item.status,
            isTrusted: overrides.isTrusted ?? item.isTrusted,
            adminGrants:
                overrides.adminGrants ??
                {
                    notificationSend: item.adminGrants.notificationSend
                },
            scopeReviews:
                overrides.scopeReviews ??
                item.scopeRequests.map((scope) => ({
                    scope: scope.scope,
                    reviewStatus: scope.reviewStatus
                }))
        },
        retry: 0,
        key: `admin:oauth-client:patch:${item.clientId}:${Date.now()}`,
        watch: false,
        server: false
    });

    if (error.value) {
        throw error.value;
    }

    const response = data.value;
    if (!response) {
        throw new Error('Missing admin OAuth client update response');
    }

    if (!response.ok) {
        throw {
            data: response
        };
    }

    await refresh();
}

async function revokeTokens(item: OAuthClientPublicItem) {
    const { data, error } = await useCsrfFetch<TrackerApiResponse<number>>(
        `/api/v1/admin/oauth/clients/${encodeURIComponent(item.clientId)}/revoke-tokens`,
        {
            method: 'POST',
            retry: 0,
            key: `admin:oauth-client:revoke:${item.clientId}:${Date.now()}`,
            watch: false,
            server: false
        }
    );

    if (error.value) {
        throw error.value;
    }

    const response = data.value;
    if (!response) {
        throw new Error('Missing admin OAuth client revoke response');
    }

    if (!response.ok) {
        throw {
            data: response
        };
    }

    await refresh();
}

async function toggleTrust(item: OAuthClientPublicItem) {
    await patchClient(item, {
        isTrusted: !item.isTrusted
    });
}

async function toggleStatus(item: OAuthClientPublicItem) {
    await patchClient(item, {
        status: item.status === 'active' ? 'disabled' : 'active'
    });
}

async function toggleNotificationSend(item: OAuthClientPublicItem) {
    await patchClient(item, {
        adminGrants: {
            notificationSend: !item.adminGrants.notificationSend
        }
    });
}

async function updateScopeReview(
    item: OAuthClientPublicItem,
    scopeName: string,
    event: Event
) {
    const reviewStatus = (event.target as HTMLSelectElement)
        .value as OAuthClientScopeReviewStatus;
    await patchClient(item, {
        scopeReviews: item.scopeRequests.map((scope) => ({
            scope: scope.scope,
            reviewStatus:
                scope.scope === scopeName ? reviewStatus : scope.reviewStatus
        }))
    });
}

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

function getAdminGrantBadgeClass(enabled: boolean) {
    if (enabled) {
        return 'inline-flex shrink-0 whitespace-nowrap items-center rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-sky-700';
    }

    return 'inline-flex shrink-0 whitespace-nowrap items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-slate-600';
}

function formatAdminGrantUpdate(item: OAuthClientPublicItem) {
    const updatedAt = item.adminGrants.notificationSendUpdatedAt;
    if (!updatedAt) {
        return '';
    }

    const actor = item.adminGrants.notificationSendUpdatedBy ?? '未知管理员';
    return `${actor} 于 ${formatTimestamp(updatedAt)} 更新`;
}

function formatTimestamp(timestamp: number) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return '--';
    }

    return formatTrackerTimestamp(timestamp);
}
</script>
