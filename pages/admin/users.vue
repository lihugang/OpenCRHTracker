<template>
    <AdminShell
        v-model:date-input="selectedDateInput"
        :today-date-input-value="todayDateInputValue"
        :session="session"
        :show-date-input="false"
        title="用户"
        description="查看注册用户数量、登录情况与当前运行时 API 剩余额度。">
        <template #toolbar>
            <UiButton
                type="button"
                variant="secondary"
                :loading="usersStatus === 'pending'"
                @click="refreshUsers()">
                刷新
            </UiButton>
        </template>

        <div class="space-y-6">
            <UiCard :show-accent-bar="false">
                <div class="grid gap-4 md:grid-cols-2">
                    <div
                        class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-5 py-4">
                        <p
                            class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                            Users
                        </p>
                        <p class="mt-2 text-3xl font-semibold text-slate-900">
                            {{ formatNumber(usersData?.totalUsers ?? 0) }}
                        </p>
                        <p class="mt-2 text-sm leading-6 text-slate-500">
                            注册用户数量
                        </p>
                    </div>

                    <div
                        class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-5 py-4">
                        <p
                            class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                            As Of
                        </p>
                        <p class="mt-2 text-2xl font-semibold text-slate-900">
                            {{ formatTimestamp(usersData?.asOf ?? 0) }}
                        </p>
                        <p class="mt-2 text-sm leading-6 text-slate-500">
                            当前数据时间
                        </p>
                    </div>
                </div>
            </UiCard>

            <UiCard :show-accent-bar="false">
                <div class="space-y-6">
                    <div class="space-y-2">
                        <p
                            class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                            User List
                        </p>
                        <h2 class="text-2xl font-semibold text-slate-900">
                            注册用户
                        </h2>
                        <p class="text-sm leading-6 text-slate-600">
                            默认按最近登录时间排序，未登录用户排在后面。
                        </p>
                    </div>

                    <div
                        v-if="usersStatus === 'pending' && !usersData"
                        class="space-y-3">
                        <div
                            v-for="index in 5"
                            :key="`admin-users-skeleton:${index}`"
                            class="h-16 animate-pulse rounded-[1rem] bg-slate-100/90" />
                    </div>

                    <UiEmptyState
                        v-else-if="usersErrorMessage"
                        eyebrow="加载失败"
                        title="用户列表加载失败"
                        :description="usersErrorMessage"
                        tone="danger">
                        <UiButton
                            type="button"
                            variant="secondary"
                            @click="refreshUsers()">
                            重试
                        </UiButton>
                    </UiEmptyState>

                    <UiEmptyState
                        v-else-if="userItems.length === 0"
                        eyebrow="No Users"
                        title="暂无注册用户"
                        description="当前 users 数据库中还没有可展示的注册用户。" />

                    <div
                        v-else
                        class="overflow-x-auto rounded-[1rem] border border-slate-200 bg-white/90">
                        <table class="min-w-full divide-y divide-slate-200">
                            <thead class="bg-slate-50/80">
                                <tr>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        用户名
                                    </th>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        创建时间
                                    </th>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        最近登录时间
                                    </th>
                                    <th
                                        class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        API 剩余 cost
                                    </th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                <tr
                                    v-for="item in userItems"
                                    :key="item.userId"
                                    class="transition hover:bg-slate-50/70">
                                    <td
                                        class="px-4 py-3 text-sm text-slate-900">
                                        <span class="font-semibold">
                                            {{ item.userId }}
                                        </span>
                                    </td>
                                    <td
                                        class="px-4 py-3 text-sm text-slate-700">
                                        {{ formatTimestamp(item.createdAt) }}
                                    </td>
                                    <td
                                        class="px-4 py-3 text-sm text-slate-700">
                                        {{ formatTimestamp(item.lastLoginAt) }}
                                    </td>
                                    <td
                                        class="px-4 py-3 text-right text-sm font-semibold text-slate-900">
                                        {{ formatNumber(item.apiRemainCost) }}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </UiCard>
        </div>
    </AdminShell>
</template>

<script setup lang="ts">
import { useAdminDateQuery } from '~/composables/useAdminDateQuery';
import type { AdminUsersResponse } from '~/types/admin';
import type { TrackerApiResponse } from '~/types/homepage';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import formatTrackerTimestamp from '~/utils/time/formatTrackerTimestamp';

definePageMeta({
    middleware: 'admin-required'
});

const requestFetch = import.meta.server ? useRequestFetch() : $fetch;
const { session } = useAuthState();
const { selectedDateInput, todayDateInputValue } = await useAdminDateQuery();

async function fetchUsers() {
    const response = await requestFetch<TrackerApiResponse<AdminUsersResponse>>(
        '/api/v1/admin/users',
        {
            retry: 0
        }
    );

    if (!response.ok) {
        throw {
            data: response
        };
    }

    return response.data;
}

const {
    data: usersData,
    status: usersStatus,
    error: usersError,
    refresh: refreshUsers
} = await useAsyncData('admin-users', fetchUsers);

const usersErrorMessage = computed(() =>
    usersError.value
        ? getApiErrorMessage(usersError.value, '加载用户列表失败。')
        : ''
);
const userItems = computed(() => usersData.value?.items ?? []);

useSiteSeo({
    title: '用户 | Open CRH Tracker',
    description: '查看管理员用户列表、注册数量与当前运行时 API 剩余额度。',
    path: '/admin/users',
    noindex: true
});

function formatTimestamp(timestamp: number | null | undefined) {
    if (!Number.isFinite(timestamp) || !timestamp || timestamp <= 0) {
        return '--';
    }

    return formatTrackerTimestamp(timestamp);
}

function formatNumber(value: number) {
    return value.toLocaleString('zh-CN');
}
</script>
