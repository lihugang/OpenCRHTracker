<template>
    <AdminShell
        v-model:date-input="selectedDateInput"
        :today-date-input-value="todayDateInputValue"
        :session="session"
        :show-date-input="false"
        title="会员兑换码"
        description="批量生成赞助权益兑换码，并追踪每个兑换码的使用状态。">
        <template #toolbar>
            <UiButton
                type="button"
                variant="secondary"
                :loading="codesStatus === 'pending'"
                @click="refreshCodes()">
                刷新
            </UiButton>
        </template>

        <div class="space-y-6">
            <UiCard :show-accent-bar="false">
                <div class="space-y-6">
                    <div class="space-y-2">
                        <p
                            class="text-xs font-semibold uppercase tracking-[0.22em] text-crh-blue/80">
                            Issue Batch
                        </p>
                        <h2 class="text-2xl font-semibold text-slate-900">
                            批量生成
                        </h2>
                    </div>

                    <UiEmptyState
                        v-if="createGroupOptions.length === 0"
                        eyebrow="No Assignable Groups"
                        title="暂无可生成兑换码的会员组"
                        description="当前配置中没有启用且允许授予的会员组。" />

                    <form
                        v-else
                        class="grid gap-4 md:grid-cols-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(10rem,0.6fr)_minmax(10rem,0.6fr)_auto] xl:items-end"
                        @submit.prevent="createBatch">
                        <UiField
                            label="会员组"
                            required>
                            <UiSelect
                                v-model="createForm.groupId"
                                :options="createGroupOptions"
                                :disabled="isCreating"
                                placeholder="选择会员组"
                                mobile-sheet-title="选择会员组"
                                mobile-sheet-eyebrow="兑换码" />
                        </UiField>

                        <UiField
                            label="数量"
                            required>
                            <input
                                v-model="createForm.quantity"
                                type="number"
                                inputmode="numeric"
                                min="1"
                                step="1"
                                class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark"
                                :disabled="isCreating" />
                        </UiField>

                        <UiField
                            label="时长（天）"
                            required>
                            <input
                                v-model="createForm.durationDays"
                                type="number"
                                inputmode="numeric"
                                min="1"
                                step="1"
                                class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark"
                                :disabled="isCreating" />
                        </UiField>

                        <UiButton
                            type="submit"
                            class="w-full xl:w-auto"
                            :loading="isCreating">
                            批量生成
                        </UiButton>
                    </form>

                    <p
                        v-if="createErrorMessage"
                        class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm leading-6 text-rose-700"
                        role="alert">
                        {{ createErrorMessage }}
                    </p>
                    <p
                        v-else-if="createSuccessMessage"
                        class="rounded-[1rem] border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm leading-6 text-emerald-800"
                        role="status">
                        {{ createSuccessMessage }}
                    </p>
                </div>
            </UiCard>

            <UiCard :show-accent-bar="false">
                <div class="space-y-6">
                    <div
                        class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div class="space-y-2">
                            <p
                                class="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
                                Redemption Ledger
                            </p>
                            <h2 class="text-2xl font-semibold text-slate-900">
                                兑换码台账
                            </h2>
                        </div>

                        <UiButton
                            type="button"
                            variant="secondary"
                            size="sm"
                            :disabled="codeItems.length === 0"
                            @click="copyCurrentPage">
                            <svg
                                aria-hidden="true"
                                viewBox="0 0 20 20"
                                fill="none"
                                class="h-4 w-4">
                                <rect
                                    x="6.5"
                                    y="6.5"
                                    width="9"
                                    height="9"
                                    rx="1.5"
                                    stroke="currentColor"
                                    stroke-width="1.5" />
                                <path
                                    d="M4 13.5H3.5C2.67 13.5 2 12.83 2 12V3.5C2 2.67 2.67 2 3.5 2H12C12.83 2 13.5 2.67 13.5 3.5V4"
                                    stroke="currentColor"
                                    stroke-width="1.5"
                                    stroke-linecap="round" />
                            </svg>
                            复制本页
                        </UiButton>
                    </div>

                    <div class="grid gap-3 sm:grid-cols-3">
                        <div
                            class="min-h-24 rounded-[1rem] border border-slate-200 bg-slate-50/80 px-5 py-4">
                            <p class="text-xs text-slate-500">兑换码总数</p>
                            <p
                                class="mt-2 text-3xl font-semibold text-slate-900">
                                {{ formatNumber(codesData?.total ?? 0) }}
                            </p>
                        </div>
                        <div
                            class="min-h-24 rounded-[1rem] border border-emerald-200 bg-emerald-50/70 px-5 py-4">
                            <p class="text-xs text-emerald-700">已使用</p>
                            <p
                                class="mt-2 text-3xl font-semibold text-emerald-900">
                                {{ formatNumber(codesData?.usedCount ?? 0) }}
                            </p>
                        </div>
                        <div
                            class="min-h-24 rounded-[1rem] border border-amber-200 bg-amber-50/70 px-5 py-4">
                            <p class="text-xs text-amber-700">未使用</p>
                            <p
                                class="mt-2 text-3xl font-semibold text-amber-900">
                                {{ formatNumber(codesData?.unusedCount ?? 0) }}
                            </p>
                        </div>
                    </div>

                    <div
                        class="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.1fr)_auto] xl:items-end">
                        <UiField label="会员组筛选">
                            <UiSelect
                                v-model="groupFilter"
                                :options="filterGroupOptions"
                                mobile-sheet-title="筛选会员组"
                                mobile-sheet-eyebrow="兑换码"
                                @update:model-value="
                                    handlePrimaryFilterChange
                                " />
                        </UiField>
                        <UiField label="使用状态">
                            <UiSelect
                                v-model="statusFilter"
                                :options="statusOptions"
                                mobile-sheet-title="筛选使用状态"
                                mobile-sheet-eyebrow="兑换码"
                                @update:model-value="
                                    handlePrimaryFilterChange
                                " />
                        </UiField>
                        <UiField label="批次 ID">
                            <input
                                v-model="batchFilterInput"
                                type="text"
                                autocomplete="off"
                                spellcheck="false"
                                class="harmony-input w-full px-4 py-3 font-mono text-sm text-crh-grey-dark"
                                placeholder="输入批次 ID"
                                @keyup.enter="applyBatchFilter" />
                        </UiField>
                        <UiButton
                            type="button"
                            variant="secondary"
                            class="w-full xl:w-auto"
                            @click="applyBatchFilter">
                            应用筛选
                        </UiButton>
                    </div>

                    <p
                        v-if="copyMessage"
                        class="rounded-[1rem] border border-blue-200 bg-blue-50/80 px-4 py-3 text-sm text-crh-blue"
                        role="status">
                        {{ copyMessage }}
                    </p>

                    <div
                        v-if="codesStatus === 'pending' && !codesData"
                        class="space-y-3">
                        <div
                            v-for="index in 5"
                            :key="index"
                            class="h-16 animate-pulse rounded-[1rem] bg-slate-100/90" />
                    </div>

                    <UiEmptyState
                        v-else-if="codesErrorMessage"
                        eyebrow="加载失败"
                        title="兑换码台账加载失败"
                        :description="codesErrorMessage"
                        tone="danger">
                        <UiButton
                            type="button"
                            variant="secondary"
                            @click="refreshCodes()">
                            重试
                        </UiButton>
                    </UiEmptyState>

                    <UiEmptyState
                        v-else-if="codeItems.length === 0"
                        eyebrow="No Codes"
                        title="没有匹配的兑换码"
                        description="调整筛选条件或生成一个新批次。" />

                    <div
                        v-else
                        class="overflow-x-auto rounded-[1rem] border border-slate-200 bg-white/90">
                        <table class="min-w-[86rem] divide-y divide-slate-200">
                            <thead class="bg-slate-50/90">
                                <tr>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                                        兑换码
                                    </th>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                                        会员组
                                    </th>
                                    <th
                                        class="px-4 py-3 text-right text-xs font-semibold text-slate-500">
                                        时长
                                    </th>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                                        批次
                                    </th>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                                        生成信息
                                    </th>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                                        状态
                                    </th>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                                        使用信息
                                    </th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                <tr
                                    v-for="item in codeItems"
                                    :key="item.code"
                                    class="align-top transition hover:bg-slate-50/75">
                                    <td class="px-4 py-4">
                                        <div class="flex items-center gap-2">
                                            <code
                                                class="font-mono text-sm font-semibold text-slate-900">
                                                {{ item.code }}
                                            </code>
                                            <button
                                                type="button"
                                                class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-crh-blue/30 hover:text-crh-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crh-blue/30"
                                                :aria-label="`复制兑换码 ${item.code}`"
                                                title="复制兑换码"
                                                @click="copyCode(item.code)">
                                                <svg
                                                    aria-hidden="true"
                                                    viewBox="0 0 20 20"
                                                    fill="none"
                                                    class="h-4 w-4">
                                                    <rect
                                                        x="6.5"
                                                        y="6.5"
                                                        width="9"
                                                        height="9"
                                                        rx="1.5"
                                                        stroke="currentColor"
                                                        stroke-width="1.5" />
                                                    <path
                                                        d="M4 13.5H3.5C2.67 13.5 2 12.83 2 12V3.5C2 2.67 2.67 2 3.5 2H12C12.83 2 13.5 2.67 13.5 3.5V4"
                                                        stroke="currentColor"
                                                        stroke-width="1.5"
                                                        stroke-linecap="round" />
                                                </svg>
                                            </button>
                                        </div>
                                    </td>
                                    <td
                                        class="px-4 py-4 text-sm font-semibold text-slate-800">
                                        {{ item.groupName }}
                                    </td>
                                    <td
                                        class="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-700">
                                        {{ formatNumber(item.durationDays) }} 天
                                    </td>
                                    <td
                                        class="max-w-[15rem] break-all px-4 py-4 font-mono text-xs text-slate-500">
                                        {{ item.batchId }}
                                    </td>
                                    <td
                                        class="whitespace-nowrap px-4 py-4 text-sm text-slate-700">
                                        <p class="font-semibold">
                                            {{ item.createdBy }}
                                        </p>
                                        <p class="mt-1 text-xs text-slate-500">
                                            {{
                                                formatTimestamp(item.createdAt)
                                            }}
                                        </p>
                                    </td>
                                    <td class="px-4 py-4">
                                        <UiStatusBadge
                                            :label="
                                                item.status === 'used'
                                                    ? '已使用'
                                                    : '未使用'
                                            "
                                            :tone="
                                                item.status === 'used'
                                                    ? 'success'
                                                    : 'warning'
                                            " />
                                    </td>
                                    <td
                                        class="whitespace-nowrap px-4 py-4 text-sm text-slate-700">
                                        <template v-if="item.usedAt !== null">
                                            <p class="font-semibold">
                                                {{ item.usedBy }}
                                            </p>
                                            <p
                                                class="mt-1 text-xs text-slate-500">
                                                {{
                                                    formatTimestamp(item.usedAt)
                                                }}
                                            </p>
                                        </template>
                                        <span
                                            v-else
                                            class="text-slate-400"
                                            >--</span
                                        >
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div
                        class="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p class="text-sm text-slate-500">
                            当前页 {{ formatNumber(codeItems.length) }} 条
                        </p>
                        <div class="flex gap-3">
                            <UiButton
                                type="button"
                                variant="secondary"
                                size="sm"
                                :disabled="cursorStack.length === 0"
                                @click="goPreviousPage">
                                上一页
                            </UiButton>
                            <UiButton
                                type="button"
                                variant="secondary"
                                size="sm"
                                :disabled="!codesData?.nextCursor"
                                @click="goNextPage">
                                下一页
                            </UiButton>
                        </div>
                    </div>
                </div>
            </UiCard>
        </div>
    </AdminShell>
</template>

<script setup lang="ts">
import useTrackedRequestFetch, {
    type TrackedRequestFetch
} from '~/composables/useTrackedRequestFetch';
import { useAdminDateQuery } from '~/composables/useAdminDateQuery';
import type {
    AdminCreateMembershipCodeBatchResponse,
    AdminMembershipCodeListResponse
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

const groupFilter = ref('');
const statusFilter = ref('');
const batchFilterInput = ref('');
const appliedBatchId = ref('');
const cursor = ref('');
const cursorStack = ref<string[]>([]);
const createForm = reactive({
    groupId: '',
    quantity: '10',
    durationDays: '30'
});
const isCreating = ref(false);
const createErrorMessage = ref('');
const createSuccessMessage = ref('');
const copyMessage = ref('');

async function fetchCodes() {
    const query: Record<string, string | number> = {
        limit: 50
    };
    if (groupFilter.value) query.groupId = groupFilter.value;
    if (statusFilter.value) query.status = statusFilter.value;
    if (appliedBatchId.value) query.batchId = appliedBatchId.value;
    if (cursor.value) query.cursor = cursor.value;

    const response = await requestFetch<
        TrackerApiResponse<AdminMembershipCodeListResponse>
    >('/api/v1/admin/membership-codes', {
        query,
        retry: 0
    });
    if (!response.ok) {
        throw { data: response };
    }
    return response.data;
}

const {
    data: codesData,
    status: codesStatus,
    error: codesError,
    refresh: refreshCodes
} = await useAsyncData('admin-membership-codes', fetchCodes);

const codesErrorMessage = computed(() =>
    codesError.value
        ? getApiErrorMessage(codesError.value, '加载兑换码台账失败。')
        : ''
);
const codeItems = computed(() => codesData.value?.items ?? []);
const createGroupOptions = computed(() =>
    (codesData.value?.catalog ?? [])
        .filter((group) => group.enabled && group.assignable)
        .map((group) => ({ value: group.id, label: group.name }))
);
const filterGroupOptions = computed(() => [
    { value: '', label: '全部会员组' },
    ...(codesData.value?.catalog ?? []).map((group) => ({
        value: group.id,
        label: group.name
    }))
]);
const statusOptions = [
    { value: '', label: '全部状态' },
    { value: 'unused', label: '未使用' },
    { value: 'used', label: '已使用' }
];

watch(
    createGroupOptions,
    (options) => {
        if (!options.some((option) => option.value === createForm.groupId)) {
            createForm.groupId = options[0]?.value ?? '';
        }
    },
    { immediate: true }
);

function parsePositiveInteger(value: string, label: string) {
    const normalized = value.trim();
    if (!/^[0-9]+$/.test(normalized)) {
        throw new Error(`${label}必须为正整数。`);
    }
    const parsed = Number.parseInt(normalized, 10);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error(`${label}必须为正整数。`);
    }
    return parsed;
}

async function createBatch() {
    if (isCreating.value || !createForm.groupId) {
        return;
    }

    createErrorMessage.value = '';
    createSuccessMessage.value = '';
    let quantity: number;
    let durationDays: number;
    try {
        quantity = parsePositiveInteger(createForm.quantity, '数量');
        durationDays = parsePositiveInteger(createForm.durationDays, '时长');
    } catch (error) {
        createErrorMessage.value =
            error instanceof Error ? error.message : '生成参数无效。';
        return;
    }

    isCreating.value = true;
    try {
        const { data, error } = await useCsrfFetch<
            TrackerApiResponse<AdminCreateMembershipCodeBatchResponse>
        >('/api/v1/admin/membership-codes', {
            method: 'POST',
            retry: 0,
            body: {
                groupId: createForm.groupId,
                quantity,
                durationDays
            },
            key: `admin:membership-codes:create:${Date.now()}`,
            watch: false,
            server: false
        });
        if (error.value) throw error.value;
        const response = data.value;
        if (!response)
            throw new Error('Missing membership code batch response');
        if (!response.ok) throw { data: response };

        const batch = response.data.batch;
        createSuccessMessage.value = `已为 ${batch.groupName} 生成 ${formatNumber(batch.quantity)} 个 ${formatNumber(batch.durationDays)} 天兑换码。`;
        batchFilterInput.value = batch.batchId;
        appliedBatchId.value = batch.batchId;
        cursor.value = '';
        cursorStack.value = [];
        await refreshCodes();
    } catch (error) {
        createErrorMessage.value = getApiErrorMessage(
            error,
            '批量生成兑换码失败。'
        );
    } finally {
        isCreating.value = false;
    }
}

function handlePrimaryFilterChange() {
    cursor.value = '';
    cursorStack.value = [];
    void refreshCodes();
}

function applyBatchFilter() {
    appliedBatchId.value = batchFilterInput.value.trim();
    cursor.value = '';
    cursorStack.value = [];
    void refreshCodes();
}

function goNextPage() {
    const nextCursor = codesData.value?.nextCursor;
    if (!nextCursor) return;
    cursorStack.value.push(cursor.value);
    cursor.value = nextCursor;
    void refreshCodes();
}

function goPreviousPage() {
    const previousCursor = cursorStack.value.pop();
    if (previousCursor === undefined) return;
    cursor.value = previousCursor;
    void refreshCodes();
}

async function copyText(value: string, successMessage: string) {
    try {
        await navigator.clipboard.writeText(value);
        copyMessage.value = successMessage;
    } catch {
        copyMessage.value = '浏览器未允许写入剪贴板。';
    }
}

function copyCode(code: string) {
    void copyText(code, `已复制兑换码 ${code}`);
}

function copyCurrentPage() {
    void copyText(
        codeItems.value.map((item) => item.code).join('\n'),
        `已复制当前页 ${formatNumber(codeItems.value.length)} 个兑换码。`
    );
}

function formatTimestamp(timestamp: number) {
    return formatTrackerTimestamp(timestamp) || '--';
}

function formatNumber(value: number) {
    return value.toLocaleString('zh-CN');
}

useSiteSeo({
    title: '会员兑换码 | Open CRH Tracker',
    description: '批量生成会员兑换码并查看使用状态。',
    path: '/admin/membership-codes',
    noindex: true
});
</script>
