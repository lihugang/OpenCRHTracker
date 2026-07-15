<template>
    <main class="flex min-h-screen flex-col bg-slate-50 text-crh-grey-dark">
        <div
            class="relative mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
            <header
                class="flex flex-col gap-5 px-1 sm:flex-row sm:items-end sm:justify-between">
                <div class="space-y-3">
                    <p
                        class="text-xs font-medium uppercase tracking-[0.26em] text-crh-blue/80">
                        Account sponsorship
                    </p>
                    <div class="space-y-2">
                        <h1 class="text-3xl font-semibold text-slate-900">
                            赞助权益
                        </h1>
                        <p class="max-w-2xl text-sm leading-6 text-slate-600">
                            查看当前赞助组、合并后的配额与可用权限。
                        </p>
                    </div>
                </div>

                <div class="flex flex-wrap items-center gap-3">
                    <UiStatusBadge
                        v-if="session"
                        :label="session.userId"
                        tone="neutral" />
                    <UiButton
                        type="button"
                        variant="secondary"
                        @click="goToDashboard">
                        <svg
                            aria-hidden="true"
                            viewBox="0 0 20 20"
                            fill="none"
                            class="h-4 w-4">
                            <path
                                d="M11.5 5.5L7 10L11.5 14.5"
                                stroke="currentColor"
                                stroke-width="1.8"
                                stroke-linecap="round"
                                stroke-linejoin="round" />
                        </svg>
                        返回设置
                    </UiButton>
                </div>
            </header>

            <DashboardMembershipPanel
                :data="membershipsData"
                :state="membershipsStatus"
                :error-message="membershipsErrorMessage"
                @refresh="refreshMemberships" />
        </div>

        <AppFooter />
    </main>
</template>

<script setup lang="ts">
import useTrackedRequestFetch, {
    type TrackedRequestFetch
} from '~/composables/useTrackedRequestFetch';
import type { TrackerApiResponse } from '~/types/homepage';
import type { AuthMembershipsResponse } from '~/types/membership';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';

definePageMeta({
    middleware: 'auth-required'
});

const requestFetch: TrackedRequestFetch = import.meta.server
    ? useTrackedRequestFetch()
    : ($fetch as TrackedRequestFetch);
const { session, setSession } = useAuthState();

async function fetchMemberships() {
    const response = await requestFetch<
        TrackerApiResponse<AuthMembershipsResponse>
    >('/api/v1/auth/memberships', {
        retry: 0
    });

    if (!response.ok) {
        throw {
            data: response
        };
    }

    if (session.value) {
        setSession({
            ...session.value,
            scopes: response.data.accountScopes,
            dailyTokenLimit: response.data.effectiveQuota.tokenLimit
        });
    }

    return response.data;
}

const {
    data: membershipsData,
    status: membershipsStatus,
    error: membershipsError,
    refresh: refreshMemberships
} = await useAsyncData('auth-memberships', fetchMemberships);

const membershipsErrorMessage = computed(() =>
    membershipsError.value
        ? getApiErrorMessage(
              membershipsError.value,
              '加载赞助权益失败，请稍后重试。'
          )
        : ''
);

useSiteSeo({
    title: '赞助权益 | Open CRH Tracker',
    description: '查看当前赞助组、账号配额与可用权限。',
    path: '/membership',
    noindex: true
});

function goToDashboard() {
    return navigateTo('/dashboard');
}
</script>
