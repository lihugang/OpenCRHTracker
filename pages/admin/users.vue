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
                                    <th
                                        class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        自定义 token 上限
                                    </th>
                                    <th
                                        class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        自定义恢复速度
                                    </th>
                                    <th
                                        class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        操作
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
                                    <td
                                        class="px-4 py-3 text-right text-sm text-slate-700">
                                        {{
                                            formatOptionalNumber(
                                                item.customTokenLimit
                                            )
                                        }}
                                    </td>
                                    <td
                                        class="px-4 py-3 text-right text-sm text-slate-700">
                                        {{
                                            formatOptionalNumber(
                                                item.customRefillAmount
                                            )
                                        }}
                                    </td>
                                    <td class="px-4 py-3 text-right">
                                        <UiButton
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            :loading="
                                                resettingQuotaUserId ===
                                                item.userId
                                            "
                                            :disabled="
                                                usersStatus === 'pending' ||
                                                resettingQuotaUserId.length > 0
                                            "
                                            @click="
                                                resetUserQuota(item.userId)
                                            ">
                                            重置限额
                                        </UiButton>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div
                        v-if="quotaResetErrorMessage"
                        class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700">
                        {{ quotaResetErrorMessage }}
                    </div>

                    <div
                        v-else-if="quotaResetSuccessMessage"
                        class="rounded-[1rem] border border-emerald-200 bg-emerald-50/80 px-4 py-4 text-sm leading-6 text-emerald-800">
                        {{ quotaResetSuccessMessage }}
                    </div>

                    <div
                        class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-5 py-5">
                        <div class="space-y-6">
                            <div class="space-y-2">
                                <p
                                    class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                                    Quota Override
                                </p>
                                <h3
                                    class="text-xl font-semibold text-slate-900">
                                    用户配额设置
                                </h3>
                                <p class="text-sm leading-6 text-slate-600">
                                    留空后保存表示清除该用户的自定义设置，恢复为全局默认值。恢复速度单位为每个恢复周期补充的
                                    token
                                    数量，恢复周期秒数继续沿用服务端全局配置。
                                </p>
                            </div>

                            <div class="grid gap-4 md:grid-cols-3">
                                <UiField
                                    label="用户名"
                                    help="填写需要设置配额的用户 ID。">
                                    <input
                                        v-model="quotaForm.userId"
                                        type="text"
                                        inputmode="text"
                                        autocomplete="off"
                                        class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark"
                                        placeholder="例如 admin" />
                                </UiField>

                                <UiField
                                    label="自定义 token 上限"
                                    help="留空表示恢复全局默认上限。">
                                    <input
                                        v-model="quotaForm.tokenLimit"
                                        type="number"
                                        inputmode="numeric"
                                        min="1"
                                        step="1"
                                        class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark"
                                        placeholder="例如 200" />
                                </UiField>

                                <UiField
                                    label="自定义恢复速度"
                                    help="留空表示恢复全局默认恢复量。">
                                    <input
                                        v-model="quotaForm.refillAmount"
                                        type="number"
                                        inputmode="numeric"
                                        min="1"
                                        step="1"
                                        class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark"
                                        placeholder="例如 5" />
                                </UiField>
                            </div>

                            <div
                                v-if="quotaSaveErrorMessage"
                                class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700">
                                {{ quotaSaveErrorMessage }}
                            </div>

                            <div
                                v-else-if="quotaSaveSuccessMessage"
                                class="rounded-[1rem] border border-emerald-200 bg-emerald-50/80 px-4 py-4 text-sm leading-6 text-emerald-800">
                                {{ quotaSaveSuccessMessage }}
                            </div>

                            <div class="flex justify-end">
                                <UiButton
                                    type="button"
                                    :loading="isSavingQuota"
                                    :disabled="usersStatus === 'pending'"
                                    @click="saveQuotaOverride">
                                    保存
                                </UiButton>
                            </div>
                        </div>
                    </div>
                </div>
            </UiCard>
        </div>
    </AdminShell>
</template>

<script setup lang="ts">
import UiField from '~/components/ui/UiField.vue';
import useTrackedRequestFetch, {
    type TrackedRequestFetch
} from '~/composables/useTrackedRequestFetch';
import { useAdminDateQuery } from '~/composables/useAdminDateQuery';
import type {
    AdminResetUserQuotaResponse,
    AdminUpdateUserQuotaResponse,
    AdminUsersResponse
} from '~/types/admin';
import type { TrackerApiResponse } from '~/types/homepage';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import formatTrackerTimestamp from '~/utils/time/formatTrackerTimestamp';

definePageMeta({
    middleware: 'admin-required'
});

const requestFetch: TrackedRequestFetch = import.meta.server
    ? useTrackedRequestFetch()
    : ($fetch as TrackedRequestFetch);
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
const quotaForm = reactive({
    userId: '',
    tokenLimit: '',
    refillAmount: ''
});
const isSavingQuota = ref(false);
const quotaSaveErrorMessage = ref('');
const quotaSaveSuccessMessage = ref('');
const resettingQuotaUserId = ref('');
const quotaResetErrorMessage = ref('');
const quotaResetSuccessMessage = ref('');

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

function formatOptionalNumber(value: number | null) {
    return typeof value === 'number' ? formatNumber(value) : '--';
}

function parseOptionalPositiveInteger(value: unknown) {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value === 'number') {
        if (!Number.isSafeInteger(value) || value <= 0) {
            throw new Error('请输入大于 0 的正整数。');
        }

        return value;
    }

    if (typeof value !== 'string') {
        throw new Error('请输入正整数，或留空表示清除自定义设置。');
    }

    const normalizedValue = value.trim();
    if (normalizedValue.length === 0) {
        return null;
    }

    if (!/^[0-9]+$/.test(normalizedValue)) {
        throw new Error('请输入正整数，或留空表示清除自定义设置。');
    }

    const parsedValue = Number.parseInt(normalizedValue, 10);
    if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
        throw new Error('请输入大于 0 的正整数。');
    }

    return parsedValue;
}

async function saveQuotaOverride() {
    if (isSavingQuota.value) {
        return;
    }

    quotaSaveErrorMessage.value = '';
    quotaSaveSuccessMessage.value = '';

    const userId = quotaForm.userId.trim();
    if (userId.length === 0) {
        quotaSaveErrorMessage.value = '用户名不能为空。';
        return;
    }

    let tokenLimit: number | null;
    let refillAmount: number | null;

    try {
        tokenLimit = parseOptionalPositiveInteger(quotaForm.tokenLimit);
        refillAmount = parseOptionalPositiveInteger(quotaForm.refillAmount);
    } catch (error) {
        quotaSaveErrorMessage.value =
            error instanceof Error ? error.message : '配额输入无效。';
        return;
    }

    isSavingQuota.value = true;

    try {
        const { data, error } = await useCsrfFetch<
            TrackerApiResponse<AdminUpdateUserQuotaResponse>
        >('/api/v1/admin/users/quota', {
            method: 'POST',
            retry: 0,
            body: {
                userId,
                tokenLimit,
                refillAmount
            },
            key: `admin:users:quota:${userId}:${Date.now()}`,
            watch: false,
            server: false
        });

        if (error.value) {
            throw error.value;
        }

        const response = data.value;
        if (!response) {
            throw new Error('Missing admin user quota update response');
        }

        if (!response.ok) {
            throw {
                data: response
            };
        }

        quotaForm.userId = response.data.userId;
        quotaForm.tokenLimit =
            response.data.quotaOverride.tokenLimit === null
                ? ''
                : String(response.data.quotaOverride.tokenLimit);
        quotaForm.refillAmount =
            response.data.quotaOverride.refillAmount === null
                ? ''
                : String(response.data.quotaOverride.refillAmount);

        quotaSaveSuccessMessage.value =
            response.data.quotaOverride.tokenLimit === null &&
            response.data.quotaOverride.refillAmount === null
                ? `已清除用户 ${response.data.userId} 的自定义配额设置。`
                : `已保存用户 ${response.data.userId} 的自定义配额设置。`;

        await refreshUsers();
    } catch (error) {
        quotaSaveErrorMessage.value = getApiErrorMessage(
            error,
            '保存用户自定义配额失败。'
        );
    } finally {
        isSavingQuota.value = false;
    }
}

async function resetUserQuota(userId: string) {
    if (resettingQuotaUserId.value.length > 0) {
        return;
    }

    quotaResetErrorMessage.value = '';
    quotaResetSuccessMessage.value = '';
    resettingQuotaUserId.value = userId;

    try {
        const { data, error } = await useCsrfFetch<
            TrackerApiResponse<AdminResetUserQuotaResponse>
        >('/api/v1/admin/users/quota/reset', {
            method: 'POST',
            retry: 0,
            body: {
                userId
            },
            key: `admin:users:quota:reset:${userId}:${Date.now()}`,
            watch: false,
            server: false
        });

        if (error.value) {
            throw error.value;
        }

        const response = data.value;
        if (!response) {
            throw new Error('Missing admin user quota reset response');
        }

        if (!response.ok) {
            throw {
                data: response
            };
        }

        quotaResetSuccessMessage.value = `已重置用户 ${response.data.userId} 的当前 API 剩余额度。`;

        await refreshUsers();
    } catch (error) {
        quotaResetErrorMessage.value = getApiErrorMessage(
            error,
            '重置用户当前 API 剩余额度失败。'
        );
    } finally {
        resettingQuotaUserId.value = '';
    }
}
</script>
