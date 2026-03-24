<template>
    <AdminShell
        v-model:date-input="selectedDateInput"
        :today-date-input-value="todayDateInputValue"
        :session="session"
        title="任务创建"
        description="手动创建后台任务，用于补跑导出文件或立即刷新指定车次的 route info。">
        <div class="grid gap-6 xl:grid-cols-2">
            <UiCard :show-accent-bar="false">
                <div class="space-y-6">
                    <div class="space-y-2">
                        <p
                            class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                            EXPORT
                        </p>
                        <h2 class="text-2xl font-semibold text-slate-900">
                            指定日期重生成导出文件
                        </h2>
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
                                        exportTaskResponse.createdTasks[0]
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
            </UiCard>

            <UiCard :show-accent-bar="false">
                <div class="space-y-6">
                    <div class="space-y-2">
                        <p
                            class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                            REFRESH
                        </p>
                        <h2 class="text-2xl font-semibold text-slate-900">
                            手动添加车次 refresh 信息任务
                        </h2>
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
                            {{ normalizedTrainCodesPreview.length }} 个车次
                        </p>
                        <p
                            class="mt-2 break-all text-sm leading-6 text-slate-500">
                            {{
                                normalizedTrainCodesPreview.length > 0
                                    ? normalizedTrainCodesPreview.join(' / ')
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
            </UiCard>
        </div>
    </AdminShell>
</template>

<script setup lang="ts">
import type {
    AdminCreateTaskResponse,
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

async function postAdminTask<TBody extends object>(body: TBody) {
    const response = await requestFetch<
        TrackerApiResponse<AdminCreateTaskResponse>
    >('/api/v1/admin/tasks', {
        method: 'POST',
        retry: 0,
        body
    });

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

useSiteSeo({
    title: '任务创建 | Open CRH Tracker',
    description:
        '管理员任务创建页，用于手动补跑导出文件和立即刷新车次 route info。',
    path: '/admin/tasks',
    noindex: true
});
</script>
