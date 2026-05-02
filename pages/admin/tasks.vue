<template>
    <AdminShell
        v-model:date-input="selectedDateInput"
        :today-date-input-value="todayDateInputValue"
        :session="session"
        title="任务"
        description="查看当前剩余任务规模，并手动创建后台任务，用于补跑导出文件或立即刷新指定车次的 route info。">
        <template #toolbar>
            <UiButton
                type="button"
                variant="secondary"
                :loading="taskOverviewStatus === 'pending'"
                @click="refreshTaskOverview()">
                刷新
            </UiButton>
        </template>

        <div class="space-y-6">
            <UiCard :show-accent-bar="false">
                <div class="space-y-6">
                    <div
                        class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div class="space-y-2">
                            <p
                                class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                                Overview
                            </p>
                            <h2 class="text-2xl font-semibold text-slate-900">
                                剩余任务概览
                            </h2>
                            <p class="text-sm leading-6 text-slate-600">
                                统计当前任务队列中的未完成任务，10 分钟、30 分钟和 1
                                小时均为累计口径，并包含已超时但仍未执行的任务。
                            </p>
                        </div>

                        <div
                            class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-5 py-4 lg:w-[16rem]">
                            <p
                                class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                As Of
                            </p>
                            <p class="mt-2 text-lg font-semibold text-slate-900">
                                {{
                                    formatTimestamp(taskOverviewData?.asOf ?? 0)
                                }}
                            </p>
                            <p class="mt-2 text-sm leading-6 text-slate-500">
                                当前统计截止时间
                            </p>
                        </div>
                    </div>

                    <div
                        v-if="taskOverviewErrorMessage"
                        class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700">
                        {{ taskOverviewErrorMessage }}
                    </div>

                    <div
                        v-else-if="taskOverviewStatus === 'pending' && !taskOverviewData"
                        class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <div
                            v-for="index in 4"
                            :key="`task-overview-loading:${index}`"
                            class="h-28 animate-pulse rounded-[1rem] bg-slate-100/90" />
                    </div>

                    <div
                        v-else
                        class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <div
                            v-for="metric in overviewMetrics"
                            :key="metric.label"
                            class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-5 py-4">
                            <p
                                class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                {{ metric.eyebrow }}
                            </p>
                            <p class="mt-2 text-3xl font-semibold text-slate-900">
                                {{ formatNumber(metric.value) }}
                            </p>
                            <p class="mt-2 text-sm leading-6 text-slate-500">
                                {{ metric.label }}
                            </p>
                        </div>
                    </div>
                </div>
            </UiCard>

            <UiCard :show-accent-bar="false">
                <div class="space-y-6">
                    <div class="space-y-2">
                        <p
                            class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                            Templates
                        </p>
                        <h2 class="text-2xl font-semibold text-slate-900">
                            手动创建任务
                        </h2>
                        <p class="text-sm leading-6 text-slate-600">
                            按需补跑导出文件，或立即追加指定车次的 route info
                            刷新任务。
                        </p>
                    </div>

                    <div class="grid gap-6 xl:grid-cols-2">
                        <div
                            class="rounded-[1rem] border border-slate-200 bg-white/90 px-5 py-5">
                            <div class="space-y-6">
                                <div class="space-y-2">
                                    <p
                                        class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                                        Export
                                    </p>
                                    <h3
                                        class="text-xl font-semibold text-slate-900">
                                        指定日期重生成导出文件
                                    </h3>
                                    <p class="text-sm leading-6 text-slate-600">
                                        为选定日期立即创建一个导出补跑任务，重新生成该日的
                                        CSV 和 JSONL 导出文件。
                                    </p>
                                </div>

                                <UiField
                                    label="导出日期"
                                    help="默认跟随管理员共享日期，可单独调整。">
                                    <input
                                        v-model="exportDateInput"
                                        type="date"
                                        class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark"
                                        :max="todayDateInputValue" />
                                </UiField>

                                <div
                                    v-if="exportTaskErrorMessage"
                                    class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700">
                                    {{ exportTaskErrorMessage }}
                                </div>

                                <div
                                    v-else-if="exportTaskResponse"
                                    class="rounded-[1rem] border border-emerald-200 bg-emerald-50/80 px-4 py-4 text-sm leading-6 text-emerald-800">
                                    <p class="font-semibold">
                                        {{ exportTaskResponse.summary }}
                                    </p>
                                    <div class="mt-3 space-y-1 text-emerald-900">
                                        <p>
                                            任务 ID：{{
                                                exportTaskResponse.createdTasks
                                                    .map((item) => item.taskId)
                                                    .join('、')
                                            }}
                                        </p>
                                        <p>
                                            执行时间：{{
                                                formatExecutionTime(
                                                    exportTaskResponse
                                                        .createdTasks[0]
                                                        ?.executionTime ?? 0
                                                )
                                            }}
                                        </p>
                                    </div>
                                </div>

                                <div class="flex justify-end">
                                    <UiButton
                                        type="button"
                                        :loading="exportTaskStatus === 'pending'"
                                        @click="createExportTask">
                                        创建导出补跑任务
                                    </UiButton>
                                </div>
                            </div>
                        </div>

                        <div
                            class="rounded-[1rem] border border-slate-200 bg-white/90 px-5 py-5">
                            <div class="space-y-6">
                                <div class="space-y-2">
                                    <p
                                        class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                                        Refresh
                                    </p>
                                    <h3
                                        class="text-xl font-semibold text-slate-900">
                                        手动添加车次 refresh 信息任务
                                    </h3>
                                    <p class="text-sm leading-6 text-slate-600">
                                        输入多个车次后立即创建 route info
                                        刷新任务。后端会自动标准化、去重，并按批大小拆分。
                                    </p>
                                </div>

                                <UiField
                                    label="车次列表"
                                    help="支持换行、空格、英文逗号和中文逗号分隔。">
                                    <textarea
                                        v-model="refreshTrainCodesInput"
                                        rows="8"
                                        class="harmony-input w-full px-4 py-3 text-base leading-7 text-crh-grey-dark"
                                        placeholder="例如：&#10;G1&#10;G3 G5&#10;D1234，D5678" />
                                </UiField>

                                <div
                                    class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                                    <p
                                        class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                        预览
                                    </p>
                                    <p class="mt-2 text-sm leading-6 text-slate-700">
                                        已识别
                                        {{ normalizedTrainCodesPreview.length }}
                                        个车次
                                    </p>
                                    <p
                                        class="mt-2 break-all text-sm leading-6 text-slate-500">
                                        {{
                                            normalizedTrainCodesPreview.length > 0
                                                ? normalizedTrainCodesPreview.join(
                                                      ' / '
                                                  )
                                                : '当前还没有可提交的有效车次'
                                        }}
                                    </p>
                                </div>

                                <div
                                    v-if="refreshTaskErrorMessage"
                                    class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700">
                                    {{ refreshTaskErrorMessage }}
                                </div>

                                <div
                                    v-else-if="refreshTaskResponse"
                                    class="rounded-[1rem] border border-emerald-200 bg-emerald-50/80 px-4 py-4 text-sm leading-6 text-emerald-800">
                                    <p class="font-semibold">
                                        {{ refreshTaskResponse.summary }}
                                    </p>
                                    <div class="mt-3 space-y-1 text-emerald-900">
                                        <p>
                                            创建任务数：{{
                                                refreshTaskResponse.createdCount
                                            }}
                                        </p>
                                        <p>
                                            任务 ID：{{
                                                refreshTaskResponse.createdTasks
                                                    .map((item) => item.taskId)
                                                    .join('、')
                                            }}
                                        </p>
                                        <p>
                                            归一化车次：{{
                                                refreshTaskResponse.normalizedTrainCodes?.join(
                                                    ' / '
                                                ) ?? '--'
                                            }}
                                        </p>
                                    </div>
                                </div>

                                <div class="flex justify-end">
                                    <UiButton
                                        type="button"
                                        :loading="refreshTaskStatus === 'pending'"
                                        @click="createRefreshTask">
                                        创建立即刷新任务
                                    </UiButton>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </UiCard>
        </div>
    </AdminShell>
</template>

<script setup lang="ts">
import type {
    AdminCreateTaskRequest,
    AdminCreateTaskResponse,
    AdminTaskOverviewResponse,
    AdminRefreshRouteInfoNowTaskRequest,
    AdminRegenerateDailyExportTaskRequest
} from '~/types/admin';
import type { TrackerApiResponse } from '~/types/homepage';
import { useAdminDateQuery } from '~/composables/useAdminDateQuery';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import formatTrackerTimestamp from '~/utils/time/formatTrackerTimestamp';

definePageMeta({
    middleware: 'admin-required'
});

type TaskRequestStatus = 'idle' | 'pending';

const requestFetch = import.meta.server ? useRequestFetch() : $fetch;
const { session } = useAuthState();
const { selectedDateInput, todayDateInputValue } = await useAdminDateQuery();

const exportDateInput = ref(selectedDateInput.value);
const refreshTrainCodesInput = ref('');

const exportTaskStatus = ref<TaskRequestStatus>('idle');
const exportTaskErrorMessage = ref('');
const exportTaskResponse = ref<AdminCreateTaskResponse | null>(null);

const refreshTaskStatus = ref<TaskRequestStatus>('idle');
const refreshTaskErrorMessage = ref('');
const refreshTaskResponse = ref<AdminCreateTaskResponse | null>(null);

async function fetchTaskOverview() {
    const response = await requestFetch<
        TrackerApiResponse<AdminTaskOverviewResponse>
    >('/api/v1/admin/tasks', {
        retry: 0
    });

    if (!response.ok) {
        throw {
            data: response
        };
    }

    return response.data;
}

const {
    data: taskOverviewData,
    status: taskOverviewStatus,
    error: taskOverviewError,
    refresh: refreshTaskOverview
} = await useAsyncData('admin-task-overview', fetchTaskOverview);

watch(
    selectedDateInput,
    (value) => {
        exportDateInput.value = value;
    },
    {
        immediate: true
    }
);

const normalizedTrainCodesPreview = computed(() =>
    Array.from(
        new Set(
            refreshTrainCodesInput.value
                .split(/[\s,，、]+/u)
                .map((item) => item.trim().toUpperCase())
                .filter((item) => item.length > 0)
        )
    )
);
const taskOverviewErrorMessage = computed(() =>
    taskOverviewError.value
        ? getApiErrorMessage(taskOverviewError.value, '加载任务概览失败。')
        : ''
);
const overviewMetrics = computed(() => [
    {
        eyebrow: 'Total',
        label: '当前剩余任务数',
        value: taskOverviewData.value?.remainingTotal ?? 0
    },
    {
        eyebrow: '10m',
        label: '10 分钟内剩余任务数',
        value: taskOverviewData.value?.remainingWithin10Minutes ?? 0
    },
    {
        eyebrow: '30m',
        label: '30 分钟内剩余任务数',
        value: taskOverviewData.value?.remainingWithin30Minutes ?? 0
    },
    {
        eyebrow: '1h',
        label: '1 小时内剩余任务数',
        value: taskOverviewData.value?.remainingWithin1Hour ?? 0
    }
]);

async function postAdminTask(body: AdminCreateTaskRequest) {
    const { data, error } = await useCsrfFetch<
        TrackerApiResponse<AdminCreateTaskResponse>
    >('/api/v1/admin/tasks', {
        method: 'POST',
        retry: 0,
        body,
        key: `admin:tasks:create:${body.type}:${Date.now()}`,
        watch: false,
        server: false
    });

    if (error.value) {
        throw error.value;
    }

    const response = data.value;
    if (!response) {
        throw new Error('Missing admin task creation response');
    }

    if (!response.ok) {
        throw {
            data: response
        };
    }

    return response.data;
}

async function createExportTask() {
    exportTaskStatus.value = 'pending';
    exportTaskErrorMessage.value = '';
    exportTaskResponse.value = null;

    const body: AdminRegenerateDailyExportTaskRequest = {
        type: 'regenerate_daily_export',
        payload: {
            date: exportDateInput.value.replaceAll('-', '')
        }
    };

    try {
        exportTaskResponse.value = await postAdminTask(body);
        try {
            await refreshTaskOverview();
        } catch {
            // Keep the creation success state visible even if overview refresh fails.
        }
    } catch (error) {
        exportTaskErrorMessage.value = getApiErrorMessage(
            error,
            '创建导出补跑任务失败。'
        );
    } finally {
        exportTaskStatus.value = 'idle';
    }
}

async function createRefreshTask() {
    refreshTaskStatus.value = 'pending';
    refreshTaskErrorMessage.value = '';
    refreshTaskResponse.value = null;

    const body: AdminRefreshRouteInfoNowTaskRequest = {
        type: 'refresh_route_info_now',
        payload: {
            trainCodes: normalizedTrainCodesPreview.value
        }
    };

    try {
        refreshTaskResponse.value = await postAdminTask(body);
        try {
            await refreshTaskOverview();
        } catch {
            // Keep the creation success state visible even if overview refresh fails.
        }
    } catch (error) {
        refreshTaskErrorMessage.value = getApiErrorMessage(
            error,
            '创建车次 refresh 任务失败。'
        );
    } finally {
        refreshTaskStatus.value = 'idle';
    }
}

function formatExecutionTime(timestamp: number) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return '--';
    }

    return formatTrackerTimestamp(timestamp);
}

function formatTimestamp(timestamp: number) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return '--';
    }

    return formatTrackerTimestamp(timestamp);
}

function formatNumber(value: number) {
    return value.toLocaleString('zh-CN');
}

useSiteSeo({
    title: '任务 | Open CRH Tracker',
    description:
        '管理员任务页，用于查看剩余任务概览，并手动补跑导出文件和立即刷新车次 route info。',
    path: '/admin/tasks',
    noindex: true
});
</script>
