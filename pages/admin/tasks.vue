<template>
    <AdminShell
        v-model:date-input="selectedDateInput"
        :today-date-input-value="todayDateInputValue"
        :session="session"
        title="任务"
        description="查看当前剩余任务规模，并手动创建后台任务，用于补跑导出、立即刷新指定车次线路信息、发起重联扫描或立即执行固定车组畅行码检测。">
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
                                概览
                            </p>
                            <h2 class="text-2xl font-semibold text-slate-900">
                                剩余任务概览
                            </h2>
                            <p class="text-sm leading-6 text-slate-600">
                                统计当前任务队列中的待执行任务，10 分钟、30
                                分钟和 1
                                小时均为累计口径，并包含已超时但仍未执行的任务。
                            </p>
                        </div>

                        <div
                            class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-5 py-4 lg:w-[16rem]">
                            <p
                                class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                统计时间
                            </p>
                            <p
                                class="mt-2 text-lg font-semibold text-slate-900">
                                {{
                                    formatTimestamp(taskOverviewData?.asOf ?? 0)
                                }}
                            </p>
                            <p class="mt-2 text-sm leading-6 text-slate-500">
                                当前统计截止时间
                            </p>
                            <div class="mt-4 border-t border-slate-200 pt-4">
                                <p
                                    class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                    下一任务
                                </p>
                                <p
                                    class="mt-2 text-lg font-semibold text-slate-900">
                                    {{ nextTaskIdText }}
                                </p>
                                <p
                                    class="mt-2 text-sm leading-6 text-slate-500">
                                    当前队列中最早待执行任务的任务 ID。
                                </p>
                            </div>
                        </div>
                    </div>

                    <div
                        v-if="taskOverviewErrorMessage"
                        class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700">
                        {{ taskOverviewErrorMessage }}
                    </div>

                    <div
                        v-else-if="
                            taskOverviewStatus === 'pending' &&
                            !taskOverviewData
                        "
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
                            <p
                                class="mt-2 text-3xl font-semibold text-slate-900">
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
                            操作
                        </p>
                        <h2 class="text-2xl font-semibold text-slate-900">
                            手动创建任务
                        </h2>
                        <p class="text-sm leading-6 text-slate-600">
                            按任务模板立即补派后台任务，适用于导出补跑、线路刷新、重联扫描和固定车组畅行码检测。
                        </p>
                    </div>

                    <div class="grid gap-6 xl:grid-cols-2">
                        <div
                            class="rounded-[1rem] border border-slate-200 bg-white/90 px-5 py-5">
                            <div class="space-y-6">
                                <div class="space-y-2">
                                    <p
                                        class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                                        畅行码
                                    </p>
                                    <h3
                                        class="text-xl font-semibold text-slate-900">
                                        立即执行固定车组畅行码检测
                                    </h3>
                                    <p class="text-sm leading-6 text-slate-600">
                                        立即按当前时间创建
                                        `qrcode_detection.json`
                                        中全部配置车组的畅行码检测任务，不再手动选择
                                        `detectedAt`。
                                    </p>
                                </div>

                                <div
                                    class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                                    <p
                                        class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                        执行方式
                                    </p>
                                    <p
                                        class="mt-2 text-sm leading-6 text-slate-700">
                                        点击后将直接使用当前北京时间作为本次检测时间，并对配置文件中的全部目标车组立即发起检测。
                                    </p>
                                </div>

                                <StatusPanel
                                    :error-message="
                                        qrcodeDetectionTaskErrorMessage
                                    "
                                    :response="qrcodeDetectionTaskResponse"
                                    :format-execution-time="
                                        formatExecutionTime
                                    " />

                                <div class="flex justify-end">
                                    <UiButton
                                        type="button"
                                        :loading="
                                            qrcodeDetectionTaskStatus ===
                                            'pending'
                                        "
                                        @click="createQrcodeDetectionTask">
                                        创建固定车组畅行码检测任务
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
    AdminCouplingScanOptionGroup,
    AdminDetectCoupledEmuGroupNowTaskRequest,
    AdminRunQrcodeDetectionNowTaskRequest,
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

const StatusPanel = defineComponent({
    props: {
        errorMessage: {
            type: String,
            required: true
        },
        response: {
            type: Object as PropType<AdminCreateTaskResponse | null>,
            required: true
        },
        formatExecutionTime: {
            type: Function as PropType<(timestamp: number) => string>,
            required: true
        }
    },
    setup(props) {
        return () => {
            if (props.errorMessage.length > 0) {
                return h(
                    'div',
                    {
                        class: 'rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700'
                    },
                    props.errorMessage
                );
            }

            if (!props.response) {
                return null;
            }

            return h(
                'div',
                {
                    class: 'rounded-[1rem] border border-emerald-200 bg-emerald-50/80 px-4 py-4 text-sm leading-6 text-emerald-800'
                },
                [
                    h('p', { class: 'font-semibold' }, props.response.summary),
                    h('div', { class: 'mt-3 space-y-1 text-emerald-900' }, [
                        h('p', `已创建任务：${props.response.createdCount}`),
                        h(
                            'p',
                            `任务 ID：${props.response.createdTasks.map((item) => item.taskId).join(', ') || '--'}`
                        ),
                        h(
                            'p',
                            `执行时间：${props.formatExecutionTime(props.response.createdTasks[0]?.executionTime ?? 0)}`
                        )
                    ])
                ]
            );
        };
    }
});

const requestFetch = import.meta.server ? useRequestFetch() : $fetch;
const { session } = useAuthState();
const { selectedDateInput, todayDateInputValue } = await useAdminDateQuery();

const exportDateInput = ref(selectedDateInput.value);
const refreshTrainCodesInput = ref('');
const selectedCouplingScanBureau = ref('');
const selectedCouplingScanModel = ref('');

const exportTaskStatus = ref<TaskRequestStatus>('idle');
const exportTaskErrorMessage = ref('');
const exportTaskResponse = ref<AdminCreateTaskResponse | null>(null);

const refreshTaskStatus = ref<TaskRequestStatus>('idle');
const refreshTaskErrorMessage = ref('');
const refreshTaskResponse = ref<AdminCreateTaskResponse | null>(null);

const couplingScanTaskStatus = ref<TaskRequestStatus>('idle');
const couplingScanTaskErrorMessage = ref('');
const couplingScanTaskResponse = ref<AdminCreateTaskResponse | null>(null);

const qrcodeDetectionTaskStatus = ref<TaskRequestStatus>('idle');
const qrcodeDetectionTaskErrorMessage = ref('');
const qrcodeDetectionTaskResponse = ref<AdminCreateTaskResponse | null>(null);

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
                .split(/[\s,，]+/u)
                .map((item) => item.trim().toUpperCase())
                .filter((item) => item.length > 0)
        )
    )
);
const couplingScanOptions = computed<AdminCouplingScanOptionGroup[]>(
    () => taskOverviewData.value?.couplingScanOptions ?? []
);
const couplingScanBureauOptions = computed(() =>
    couplingScanOptions.value.map((group) => ({
        value: group.bureau,
        label: group.bureau
    }))
);
const selectedCouplingScanOptionGroup = computed(
    () =>
        couplingScanOptions.value.find(
            (group) => group.bureau === selectedCouplingScanBureau.value
        ) ?? null
);
const currentCouplingScanModelOptions = computed(() =>
    (selectedCouplingScanOptionGroup.value?.models ?? []).map((model) => ({
        value: model,
        label: model
    }))
);
const canCreateCouplingScanTask = computed(
    () =>
        selectedCouplingScanBureau.value.trim().length > 0 &&
        selectedCouplingScanModel.value.trim().length > 0 &&
        currentCouplingScanModelOptions.value.some(
            (option) => option.value === selectedCouplingScanModel.value
        )
);
const taskOverviewErrorMessage = computed(() =>
    taskOverviewError.value
        ? getApiErrorMessage(taskOverviewError.value, '加载任务概览失败。')
        : ''
);
const nextTaskIdText = computed(() => {
    const nextTaskId = taskOverviewData.value?.nextTaskId ?? null;
    return nextTaskId === null ? '--' : `#${nextTaskId}`;
});
const overviewMetrics = computed(() => [
    {
        eyebrow: '总量',
        label: '全部待执行任务',
        value: taskOverviewData.value?.remainingTotal ?? 0
    },
    {
        eyebrow: '10 分钟',
        label: '10 分钟内待执行任务',
        value: taskOverviewData.value?.remainingWithin10Minutes ?? 0
    },
    {
        eyebrow: '30 分钟',
        label: '30 分钟内待执行任务',
        value: taskOverviewData.value?.remainingWithin30Minutes ?? 0
    },
    {
        eyebrow: '1 小时',
        label: '1 小时内待执行任务',
        value: taskOverviewData.value?.remainingWithin1Hour ?? 0
    }
]);

function syncCouplingScanSelections() {
    const groups = couplingScanOptions.value;
    if (groups.length === 0) {
        selectedCouplingScanBureau.value = '';
        selectedCouplingScanModel.value = '';
        return;
    }

    const hasSelectedBureau = groups.some(
        (group) => group.bureau === selectedCouplingScanBureau.value
    );
    if (!hasSelectedBureau) {
        selectedCouplingScanBureau.value = groups[0]?.bureau ?? '';
    }

    const currentModels =
        groups.find(
            (group) => group.bureau === selectedCouplingScanBureau.value
        )?.models ?? [];
    if (!currentModels.includes(selectedCouplingScanModel.value)) {
        selectedCouplingScanModel.value = currentModels[0] ?? '';
    }
}

watch(couplingScanOptions, syncCouplingScanSelections, {
    immediate: true
});

watch(selectedCouplingScanBureau, () => {
    syncCouplingScanSelections();
});

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

async function refreshOverviewSilently() {
    try {
        await refreshTaskOverview();
    } catch {
        // Preserve success state when overview refresh fails.
    }
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
        await refreshOverviewSilently();
    } catch (error) {
        exportTaskErrorMessage.value = getApiErrorMessage(
            error,
            '创建导出任务失败。'
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
        await refreshOverviewSilently();
    } catch (error) {
        refreshTaskErrorMessage.value = getApiErrorMessage(
            error,
            '创建线路刷新任务失败。'
        );
    } finally {
        refreshTaskStatus.value = 'idle';
    }
}

async function createCouplingScanTask() {
    if (!canCreateCouplingScanTask.value) {
        couplingScanTaskErrorMessage.value = '请先选择有效的路局和车型。';
        return;
    }

    couplingScanTaskStatus.value = 'pending';
    couplingScanTaskErrorMessage.value = '';
    couplingScanTaskResponse.value = null;

    const body: AdminDetectCoupledEmuGroupNowTaskRequest = {
        type: 'detect_coupled_emu_group_now',
        payload: {
            bureau: selectedCouplingScanBureau.value,
            model: selectedCouplingScanModel.value
        }
    };

    try {
        couplingScanTaskResponse.value = await postAdminTask(body);
        await refreshOverviewSilently();
    } catch (error) {
        couplingScanTaskErrorMessage.value = getApiErrorMessage(
            error,
            '创建重联扫描任务失败。'
        );
    } finally {
        couplingScanTaskStatus.value = 'idle';
    }
}

async function createQrcodeDetectionTask() {
    qrcodeDetectionTaskStatus.value = 'pending';
    qrcodeDetectionTaskErrorMessage.value = '';
    qrcodeDetectionTaskResponse.value = null;

    const body: AdminRunQrcodeDetectionNowTaskRequest = {
        type: 'run_qrcode_detection_now',
        payload: {}
    };

    try {
        qrcodeDetectionTaskResponse.value = await postAdminTask(body);
        await refreshOverviewSilently();
    } catch (error) {
        qrcodeDetectionTaskErrorMessage.value = getApiErrorMessage(
            error,
            '创建固定车组畅行码检测任务失败。'
        );
    } finally {
        qrcodeDetectionTaskStatus.value = 'idle';
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
        '管理员任务页面，用于查看待执行任务规模，并手动创建导出、线路刷新、重联扫描和固定车组畅行码检测任务。',
    path: '/admin/tasks',
    noindex: true
});
</script>
