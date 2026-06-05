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
            <div class="space-y-5">
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
                        class="rounded-[1rem] border border-slate-200 bg-white/90 px-5 py-5">
                        <div class="space-y-4">
                            <div class="flex flex-wrap items-center justify-between gap-4">
                                <div class="space-y-2">
                                    <div class="flex flex-wrap items-center gap-2">
                                        <h2 class="text-lg font-semibold text-slate-900">
                                            {{ item.name }}
                                        </h2>
                                        <span class="inline-flex rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-white">
                                            {{ item.status }}
                                        </span>
                                        <span
                                            v-if="item.isTrusted"
                                            class="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-emerald-700">
                                            trusted
                                        </span>
                                    </div>
                                    <p class="font-mono text-sm text-crh-blue">
                                        {{ item.clientId }}
                                    </p>
                                    <p class="text-sm text-slate-600">
                                        owner: {{ item.ownerUserId }}
                                    </p>
                                </div>

                                <div class="flex flex-wrap gap-2">
                                    <UiButton
                                        type="button"
                                        variant="secondary"
                                        @click="toggleTrust(item)">
                                        {{ item.isTrusted ? '取消 trusted' : '设为 trusted' }}
                                    </UiButton>
                                    <UiButton
                                        type="button"
                                        variant="secondary"
                                        class="border-rose-200 bg-white text-rose-700 hover:border-rose-300 hover:bg-rose-50"
                                        @click="toggleStatus(item)">
                                        {{ item.status === 'active' ? '停用' : '启用' }}
                                    </UiButton>
                                    <UiButton
                                        type="button"
                                        variant="secondary"
                                        @click="revokeTokens(item)">
                                        吊销 Token
                                    </UiButton>
                                </div>
                            </div>

                            <div class="grid gap-4 lg:grid-cols-2">
                                <div class="space-y-2 text-sm text-slate-600">
                                    <p class="font-semibold text-slate-900">Redirect URIs</p>
                                    <ul class="space-y-1">
                                        <li
                                            v-for="redirect in item.redirectUris"
                                            :key="redirect.value"
                                            class="break-all">
                                            {{ redirect.value }}
                                        </li>
                                    </ul>
                                </div>
                                <div class="space-y-2 text-sm text-slate-600">
                                    <p class="font-semibold text-slate-900">Scope 审核</p>
                                    <div class="space-y-2">
                                        <label
                                            v-for="scope in item.scopeRequests"
                                            :key="scope.scope"
                                            class="flex items-center justify-between gap-4 rounded-[0.9rem] border border-slate-200 px-3 py-3">
                                            <span class="break-all pr-2">{{ scope.scope }}</span>
                                            <select
                                                class="harmony-input min-w-[8rem] px-3 py-2 text-sm text-crh-grey-dark"
                                                :value="scope.reviewStatus"
                                                @change="updateScopeReview(item, scope.scope, $event)">
                                                <option value="pending">pending</option>
                                                <option value="approved">approved</option>
                                                <option value="rejected">rejected</option>
                                            </select>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </UiCard>
    </AdminShell>
</template>

<script setup lang="ts">
import useTrackedRequestFetch from '~/composables/useTrackedRequestFetch';
import { useAdminDateQuery } from '~/composables/useAdminDateQuery';
import type {
    OAuthClientPublicItem,
    OAuthClientScopeReviewStatus
} from '~/types/auth';
import type { TrackerApiResponse } from '~/types/homepage';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';

definePageMeta({
    middleware: 'auth-required'
});

const { session } = useAuthState();
const requestFetch = useTrackedRequestFetch();
const { selectedDateInput, todayDateInputValue } = await useAdminDateQuery();

async function fetchClients() {
    return await requestFetch<TrackerApiResponse<{ items: OAuthClientPublicItem[] }>>(
        '/api/v1/admin/oauth/clients',
        {
            retry: 0
        }
    );
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
        scopeReviews: Array<{
            scope: string;
            reviewStatus: OAuthClientScopeReviewStatus;
        }>;
    }>
) {
    await requestFetch(`/api/v1/admin/oauth/clients/${encodeURIComponent(item.clientId)}`, {
        method: 'PATCH',
        body: {
            status: overrides.status ?? item.status,
            isTrusted: overrides.isTrusted ?? item.isTrusted,
            scopeReviews:
                overrides.scopeReviews ??
                item.scopeRequests.map((scope) => ({
                    scope: scope.scope,
                    reviewStatus: scope.reviewStatus
                }))
        },
        retry: 0
    });
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

async function updateScopeReview(
    item: OAuthClientPublicItem,
    scopeName: string,
    event: Event
) {
    const reviewStatus = (event.target as HTMLSelectElement).value as OAuthClientScopeReviewStatus;
    await patchClient(item, {
        scopeReviews: item.scopeRequests.map((scope) => ({
            scope: scope.scope,
            reviewStatus:
                scope.scope === scopeName ? reviewStatus : scope.reviewStatus
        }))
    });
}

async function revokeTokens(item: OAuthClientPublicItem) {
    await requestFetch(
        `/api/v1/admin/oauth/clients/${encodeURIComponent(item.clientId)}/revoke-tokens`,
        {
            method: 'POST',
            retry: 0
        }
    );
}
</script>
