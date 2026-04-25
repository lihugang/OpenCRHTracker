<template>
    <component
        :is="isMobile ? UiBottomSheet : UiModal"
        :model-value="modelValue"
        eyebrow="重联扫描"
        :title="modalTitle"
        :description="modalDescription"
        size="lg"
        height="tall"
        @update:model-value="emit('update:modelValue', $event)">
        <div class="space-y-5">
            <div
                v-if="loadStatus === 'pending'"
                class="space-y-3">
                <div
                    v-for="index in 3"
                    :key="`coupling-task-loading:${index}`"
                    class="h-24 animate-pulse rounded-[1rem] bg-slate-100/90" />
            </div>

            <div
                v-else-if="errorMessage"
                class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700">
                {{ errorMessage }}
            </div>

            <div
                v-else-if="responseData && !responseData.requestMetricsEnabled"
                class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-600">
                当前未启用 12306 trace 记录，无法展示重联扫描任务明细。
            </div>

            <div
                v-else-if="responseData && !responseData.requestMetricsRetained"
                class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-600">
                当前日期超出 trace 保留窗口，仅保留最近
                {{ responseData.requestMetricsRetentionDays }} 天。
            </div>

            <div
                v-else-if="!responseData || !hasRenderableContent"
                class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-600">
                没有找到该重联扫描任务的可展示结果。旧 trace 数据如果未记录任务号，将无法打开任务弹窗。
            </div>

            <template v-else>
                <div
                    v-if="responseData.task"
                    class="grid gap-3 md:grid-cols-2">
                    <div
                        class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                        <div class="flex items-center gap-2">
                            <span
                                class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]"
                                :class="getTaskStatusClass(responseData.task.status)">
                                {{ getTaskStatusLabel(responseData.task.status) }}
                            </span>
                            <span class="text-sm font-semibold text-slate-900">
                                #{{ responseData.task.taskId }}
                            </span>
                        </div>
                        <div class="mt-3 space-y-1.5 text-sm leading-6 text-slate-600">
                            <p>执行器：{{ responseData.task.executor || '--' }}</p>
                            <p>担当局：{{ responseData.task.bureau || '--' }}</p>
                            <p>车型：{{ responseData.task.model || '--' }}</p>
                        </div>
                    </div>

                    <div
                        class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-600">
                        <p>开始时间：{{ formatTimestamp(responseData.task.startedAt) || '--' }}</p>
                        <p>结束时间：{{ formatTimestamp(responseData.task.endedAt) || '--' }}</p>
                        <p>汇总条目：{{ responseData.summaries.length }}</p>
                        <p>结果分组：{{ responseData.groups.length }}</p>
                    </div>
                </div>

                <section
                    v-if="responseData.summaries.length > 0"
                    class="space-y-3">
                    <div class="space-y-1">
                        <h3 class="text-lg font-semibold text-slate-900">
                            任务汇总
                        </h3>
                        <p class="text-sm leading-6 text-slate-600">
                            展示本次 `detect_coupled_emu_group` 任务本身的总结与跳过原因。
                        </p>
                    </div>

                    <div class="grid gap-3">
                        <article
                            v-for="item in responseData.summaries"
                            :key="item.id"
                            class="rounded-[1rem] border border-slate-200 bg-white/90 px-4 py-4 shadow-sm">
                            <div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                <div class="space-y-1">
                                    <p class="text-sm font-semibold text-slate-900">
                                        {{ item.title }}
                                    </p>
                                    <p class="text-sm leading-6 text-slate-600">
                                        {{ item.detail || '--' }}
                                    </p>
                                </div>
                                <div class="flex items-center gap-2 text-xs text-slate-500">
                                    <span
                                        class="inline-flex items-center rounded-full px-2.5 py-1 font-semibold uppercase tracking-[0.08em]"
                                        :class="getLevelClass(item.level)">
                                        {{ item.level }}
                                    </span>
                                    <span>{{ formatTimestamp(item.timestamp) || '--' }}</span>
                                </div>
                            </div>
                        </article>
                    </div>
                </section>

                <section class="space-y-3">
                    <div class="space-y-1">
                        <h3 class="text-lg font-semibold text-slate-900">
                            扫描结果
                        </h3>
                        <p class="text-sm leading-6 text-slate-600">
                            按车次分组展示该任务记录到的所有结果，包含跳过与告警项。
                        </p>
                    </div>

                    <div class="space-y-4">
                        <article
                            v-for="group in responseData.groups"
                            :key="group.key"
                            class="rounded-[1rem] border border-slate-200 bg-white/90 px-4 py-4 shadow-sm">
                            <div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                <div class="space-y-1">
                                    <div class="flex flex-wrap items-center gap-2">
                                        <span
                                            class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]"
                                            :class="
                                                group.isUnassigned
                                                    ? 'bg-slate-200 text-slate-700'
                                                    : 'bg-sky-100 text-sky-800'
                                            ">
                                            {{ group.isUnassigned ? '未关联车次' : '车次分组' }}
                                        </span>
                                        <h4 class="text-base font-semibold text-slate-900">
                                            {{
                                                group.isUnassigned
                                                    ? '未关联车次'
                                                    : group.trainCodes.join(' / ')
                                            }}
                                        </h4>
                                    </div>
                                    <p class="text-sm leading-6 text-slate-600">
                                        共 {{ group.items.length }} 条记录
                                    </p>
                                </div>
                            </div>

                            <div class="mt-4 space-y-3">
                                <div
                                    v-for="item in group.items"
                                    :key="item.id"
                                    class="rounded-[0.9rem] border border-slate-200 bg-slate-50/80 px-3.5 py-3">
                                    <div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                        <div class="space-y-1.5">
                                            <div class="flex flex-wrap items-center gap-2">
                                                <span
                                                    class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]"
                                                    :class="getToneClass(item.tone)">
                                                    {{ item.title }}
                                                </span>
                                                <span class="text-sm font-semibold text-slate-900">
                                                    {{ item.result }}
                                                </span>
                                            </div>
                                            <p class="text-sm leading-6 text-slate-600">
                                                {{ item.detail || '--' }}
                                            </p>
                                            <p
                                                v-if="item.emuCodes.length > 0"
                                                class="text-sm leading-6 text-slate-500">
                                                编组：{{ item.emuCodes.join(' / ') }}
                                            </p>
                                        </div>
                                        <div class="text-sm leading-6 text-slate-500">
                                            <p>{{ formatTimestamp(item.timestamp) || '--' }}</p>
                                            <p>
                                                发车：
                                                {{ formatTimestamp(item.startAt) || '--' }}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </article>
                    </div>
                </section>
            </template>
        </div>
    </component>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import UiBottomSheet from '~/components/ui/UiBottomSheet.vue';
import UiModal from '~/components/ui/UiModal.vue';
import type { Admin12306CouplingTaskResponse, Admin12306TraceEventLevel, Admin12306TraceStatus } from '~/types/admin';
import type { TrackerApiResponse } from '~/types/homepage';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import formatTrackerTimestamp from '~/utils/time/formatTrackerTimestamp';

const props = defineProps<{
    modelValue: boolean;
    isMobile: boolean;
    taskId: number | null;
    date: string;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
}>();

const requestFetch = import.meta.server ? useRequestFetch() : $fetch;
const loadStatus = ref<'idle' | 'pending' | 'success' | 'error'>('idle');
const responseData = ref<Admin12306CouplingTaskResponse | null>(null);
const errorMessage = ref('');
const activeRequestKey = ref('');

const modalTitle = computed(() =>
    props.taskId ? `重联扫描任务 #${props.taskId}` : '重联扫描任务'
);
const modalDescription = computed(() =>
    props.date ? `查看 ${props.date} 当天该任务记录到的所有扫描结果。` : ''
);
const hasRenderableContent = computed(() => {
    return Boolean(
        responseData.value &&
            (responseData.value.task ||
                responseData.value.summaries.length > 0 ||
                responseData.value.groups.length > 0)
    );
});

watch(
    () => [props.modelValue, props.taskId, props.date] as const,
    ([isOpen, taskId, date]) => {
        if (!isOpen || !taskId || !/^\d{8}$/.test(date)) {
            return;
        }

        void loadTask(taskId, date);
    },
    {
        immediate: true
    }
);

async function loadTask(taskId: number, date: string) {
    const requestKey = `${date}:${taskId}:${Date.now()}`;
    activeRequestKey.value = requestKey;
    loadStatus.value = 'pending';
    errorMessage.value = '';

    try {
        const response = await requestFetch<
            TrackerApiResponse<Admin12306CouplingTaskResponse>
        >(`/api/v1/admin/12306-coupling-tasks/${taskId}`, {
            retry: 0,
            query: {
                date
            }
        });

        if (!response.ok) {
            throw {
                data: response
            };
        }

        if (activeRequestKey.value !== requestKey) {
            return;
        }

        responseData.value = response.data;
        loadStatus.value = 'success';
    } catch (error) {
        if (activeRequestKey.value !== requestKey) {
            return;
        }

        responseData.value = null;
        loadStatus.value = 'error';
        errorMessage.value = getApiErrorMessage(
            error,
            '加载重联扫描任务结果失败。'
        );
    }
}

function formatTimestamp(timestamp: number | null) {
    if (!timestamp || timestamp <= 0) {
        return '';
    }

    return formatTrackerTimestamp(timestamp);
}

function getTaskStatusLabel(status: Admin12306TraceStatus) {
    switch (status) {
        case 'success':
            return '成功';
        case 'warning':
            return '告警';
        case 'error':
            return '失败';
        default:
            return '运行中';
    }
}

function getTaskStatusClass(status: Admin12306TraceStatus) {
    switch (status) {
        case 'success':
            return 'bg-emerald-100 text-emerald-800';
        case 'warning':
            return 'bg-amber-100 text-amber-800';
        case 'error':
            return 'bg-rose-100 text-rose-800';
        default:
            return 'bg-slate-200 text-slate-700';
    }
}

function getLevelClass(level: Admin12306TraceEventLevel) {
    switch (level) {
        case 'ERROR':
            return 'bg-rose-100 text-rose-800';
        case 'WARN':
            return 'bg-amber-100 text-amber-800';
        default:
            return 'bg-slate-200 text-slate-700';
    }
}

function getToneClass(tone: Admin12306CouplingTaskResponse['groups'][number]['items'][number]['tone']) {
    switch (tone) {
        case 'success':
            return 'bg-emerald-100 text-emerald-800';
        case 'warning':
            return 'bg-amber-100 text-amber-800';
        case 'danger':
            return 'bg-rose-100 text-rose-800';
        default:
            return 'bg-slate-200 text-slate-700';
    }
}
</script>
