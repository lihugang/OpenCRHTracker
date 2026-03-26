<template>
    <AdminShell
        v-model:date-input="selectedDateInput"
        :today-date-input-value="todayDateInputValue"
        :session="session"
        title="管理员概览"
        description="查看当日被动告警摘要，并快速进入各个管理员功能页面。">
        <template #toolbar>
            <UiButton
                type="button"
                variant="secondary"
                :loading="passiveAlertsStatus === 'pending'"
                @click="refreshPassiveAlerts()">
                刷新概览
            </UiButton>
        </template>

        <div
            class="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <UiCard :show-accent-bar="false">
                <div class="space-y-6">
                    <div class="space-y-2">
                        <p
                            class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                            概览
                        </p>
                        <h2 class="text-2xl font-semibold text-slate-900">
                            当日快照
                        </h2>
                        <p class="text-sm leading-6 text-slate-600">
                            基于 {{ selectedDateYmd }} 的被动告警数据生成。
                        </p>
                    </div>

                    <div
                        v-if="passiveAlertsErrorMessage"
                        class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700">
                        {{ passiveAlertsErrorMessage }}
                    </div>

                    <div
                        v-else
                        class="grid gap-3 sm:grid-cols-3">
                        <div
                            class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                            <p
                                class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                告警总数
                            </p>
                            <p
                                class="mt-2 text-3xl font-semibold text-slate-900">
                                {{ passiveAlertsData?.total ?? 0 }}
                            </p>
                        </div>
                        <div
                            class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                            <p
                                class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                Warning 数
                            </p>
                            <p
                                class="mt-2 text-3xl font-semibold text-amber-700">
                                {{ passiveAlertsData?.warnCount ?? 0 }}
                            </p>
                        </div>
                        <div
                            class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                            <p
                                class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                请求峰值
                            </p>
                            <p
                                class="mt-2 text-3xl font-semibold text-slate-900">
                                {{ requestPeakCount }}
                            </p>
                        </div>
                    </div>

                    <div class="space-y-3">
                        <div class="flex items-center justify-between gap-4">
                            <div class="space-y-1">
                                <h3
                                    class="text-lg font-semibold text-slate-900">
                                    最近告警
                                </h3>
                                <p class="text-sm leading-6 text-slate-500">
                                    这里只预览最新 5 条，完整列表请进入被动告警页查看。
                                </p>
                            </div>

                            <UiButton
                                type="button"
                                variant="secondary"
                                @click="goToPassiveAlerts">
                                查看详情
                            </UiButton>
                        </div>

                        <div
                            v-if="passiveAlertsStatus === 'pending'"
                            class="space-y-3">
                            <div
                                v-for="index in 3"
                                :key="`overview-loading:${index}`"
                                class="h-20 animate-pulse rounded-[1rem] bg-slate-100/90" />
                        </div>

                        <div
                            v-else-if="recentAlerts.length > 0"
                            class="space-y-3">
                            <article
                                v-for="item in recentAlerts"
                                :key="`${item.timestamp}:${item.logger}:${item.message}`"
                                class="rounded-[1rem] border px-4 py-4"
                                :class="
                                    item.level === 'ERROR'
                                        ? 'border-rose-200 bg-rose-50/60'
                                        : 'border-amber-200 bg-amber-50/60'
                                ">
                                <div
                                    class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                    <div class="space-y-2">
                                        <div
                                            class="flex flex-wrap items-center gap-2">
                                            <span
                                                :class="
                                                    getAlertLevelBadgeClass(
                                                        item.level
                                                    )
                                                ">
                                                {{ item.level }}
                                            </span>
                                            <span
                                                class="text-sm font-medium text-slate-900">
                                                {{ item.logger }}
                                            </span>
                                        </div>
                                        <p
                                            class="text-sm leading-6 text-slate-700">
                                            {{ item.message }}
                                        </p>
                                    </div>
                                    <span
                                        class="shrink-0 text-xs text-slate-500">
                                        {{ formatTimestamp(item.timestamp) }}
                                    </span>
                                </div>
                            </article>
                        </div>

                        <UiEmptyState
                            v-else
                            eyebrow="正常"
                            title="当天没有被动告警"
                            description="所选日期没有 warning 或 error 日志。" />
                    </div>
                </div>
            </UiCard>

            <div class="space-y-6">
                <UiCard :show-accent-bar="false">
                    <div class="space-y-5">
                        <div class="space-y-2">
                            <p
                                class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                                导航
                            </p>
                            <h2 class="text-2xl font-semibold text-slate-900">
                                快速操作
                            </h2>
                        </div>

                        <div class="space-y-3">
                            <button
                                type="button"
                                class="w-full rounded-[1rem] border border-slate-200 bg-white/90 px-4 py-4 text-left transition hover:border-slate-300 hover:bg-slate-50/80"
                                @click="goToPassiveAlerts">
                                <p
                                    class="text-base font-semibold text-slate-900">
                                    被动告警
                                </p>
                                <p
                                    class="mt-2 text-sm leading-6 text-slate-600">
                                    查看完整 warning/error 列表、高频来源和 12306 请求曲线。
                                </p>
                            </button>

                            <button
                                type="button"
                                class="w-full rounded-[1rem] border border-slate-200 bg-white/90 px-4 py-4 text-left transition hover:border-slate-300 hover:bg-slate-50/80"
                                @click="goToAnomalyScan">
                                <p
                                    class="text-base font-semibold text-slate-900">
                                    主动扫描
                                </p>
                                <p
                                    class="mt-2 text-sm leading-6 text-slate-600">
                                    对所选日期执行异常扫描，并查看命中的交路明细。
                                </p>
                            </button>

                            <button
                                type="button"
                                class="w-full rounded-[1rem] border border-slate-200 bg-white/90 px-4 py-4 text-left transition hover:border-slate-300 hover:bg-slate-50/80"
                                @click="goToTraffic">
                                <p
                                    class="text-base font-semibold text-slate-900">
                                    流量统计
                                </p>
                                <p
                                    class="mt-2 text-sm leading-6 text-slate-600">
                                    查看 3h、24h 和 7days 窗口内的网站请求、API 调用、独立访客和活跃用户走势。
                                </p>
                            </button>
                        </div>
                    </div>
                </UiCard>

                <UiCard :show-accent-bar="false">
                    <div class="space-y-5">
                        <div class="space-y-2">
                            <p
                                class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                                高频来源
                            </p>
                            <h2 class="text-2xl font-semibold text-slate-900">
                                热点来源
                            </h2>
                        </div>

                        <div
                            v-if="
                                passiveAlertsData &&
                                passiveAlertsData.topLoggers.length > 0
                            "
                            class="flex flex-wrap gap-2">
                            <span
                                v-for="item in passiveAlertsData.topLoggers"
                                :key="item.logger"
                                class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700">
                                <span>{{ item.logger }}</span>
                                <span class="text-slate-400">{{
                                    item.count
                                }}</span>
                            </span>
                        </div>

                        <UiEmptyState
                            v-else
                            eyebrow="无热点"
                            title="暂无高频来源"
                            description="如果所选日期告警较少，这里会保持为空。" />
                    </div>
                </UiCard>
            </div>
        </div>
    </AdminShell>
</template>

<script setup lang="ts">
import type {
    AdminPassiveAlertLevel,
    AdminPassiveAlertsResponse
} from '~/types/admin';
import type { TrackerApiResponse } from '~/types/homepage';
import {
    buildAdminRoute,
    useAdminDateQuery
} from '~/composables/useAdminDateQuery';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import formatTrackerTimestamp from '~/utils/time/formatTrackerTimestamp';

definePageMeta({
    middleware: 'admin-required'
});

const requestFetch = import.meta.server ? useRequestFetch() : $fetch;
const { session } = useAuthState();
const { selectedDateInput, selectedDateYmd, todayDateInputValue } =
    await useAdminDateQuery();

async function fetchPassiveAlerts(date: string) {
    const response = await requestFetch<
        TrackerApiResponse<AdminPassiveAlertsResponse>
    >('/api/v1/admin/passive-alerts', {
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

    return response.data;
}

const {
    data: passiveAlertsData,
    status: passiveAlertsStatus,
    error: passiveAlertsError,
    refresh: refreshPassiveAlerts
} = await useAsyncData(
    'admin-overview-passive-alerts',
    () => fetchPassiveAlerts(selectedDateYmd.value),
    {
        watch: [selectedDateYmd]
    }
);

const passiveAlertsErrorMessage = computed(() =>
    passiveAlertsError.value
        ? getApiErrorMessage(passiveAlertsError.value, '加载管理员概览失败。')
        : ''
);
const requestPeakCount = computed(() =>
    (passiveAlertsData.value?.requestBuckets ?? []).reduce(
        (maxValue, bucket) => Math.max(maxValue, bucket.total),
        0
    )
);
const recentAlerts = computed(
    () => passiveAlertsData.value?.items.slice(0, 5) ?? []
);

useSiteSeo({
    title: '管理员概览 | Open CRH Tracker',
    description: '查看管理员概览并进入详细功能页面。',
    path: '/admin',
    noindex: true
});

async function goToPassiveAlerts() {
    await navigateTo(
        buildAdminRoute('/admin/passive-alerts', selectedDateInput.value)
    );
}

async function goToAnomalyScan() {
    await navigateTo(
        buildAdminRoute('/admin/anomaly-scan', selectedDateInput.value)
    );
}

async function goToTraffic() {
    await navigateTo(buildAdminRoute('/admin/traffic', selectedDateInput.value));
}

function formatTimestamp(timestamp: number) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return '--';
    }

    return formatTrackerTimestamp(timestamp);
}

function getAlertLevelBadgeClass(level: AdminPassiveAlertLevel) {
    return level === 'ERROR'
        ? 'inline-flex items-center rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-rose-800'
        : 'inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-amber-800';
}
</script>
