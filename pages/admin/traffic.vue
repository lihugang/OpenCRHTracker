<template>
    <AdminShell
        v-model:date-input="selectedDateInput"
        :today-date-input-value="todayDateInputValue"
        :session="session"
        :show-date-input="false"
        title="流量统计"
        description="查看内存中的实时窗口统计，覆盖网站请求、API 调用、独立访客和网页登录活跃用户。">
        <template #toolbar>
            <UiButton
                type="button"
                variant="secondary"
                :loading="trafficStatus === 'pending'"
                @click="refreshTraffic()">
                刷新统计
            </UiButton>
        </template>

        <div class="space-y-6">
            <UiCard :show-accent-bar="false">
                <div class="space-y-6">
                    <div
                        class="rounded-[1rem] border border-sky-200 bg-sky-50/80 px-5 py-4">
                        <div
                            class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div class="space-y-2">
                                <p
                                    class="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
                                    Runtime Stats
                                </p>
                                <h2
                                    class="text-2xl font-semibold text-slate-900">
                                    相对时间窗口
                                </h2>
                                <p class="text-sm leading-6 text-slate-700">
                                    数据来自运行时统计文件，服务重启后会自动恢复；如删除统计文件则重新开始。网站请求仅统计页面访问，不包含静态资源。
                                </p>
                            </div>

                            <dl class="grid gap-3 sm:grid-cols-2">
                                <div
                                    class="rounded-[0.95rem] border border-white/80 bg-white/85 px-4 py-3">
                                    <dt
                                        class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                        启动时间
                                    </dt>
                                    <dd
                                        class="mt-2 text-sm font-semibold text-slate-900">
                                        {{
                                            formatTimestamp(
                                                trafficData?.startedAt ?? 0
                                            )
                                        }}
                                    </dd>
                                </div>
                                <div
                                    class="rounded-[0.95rem] border border-white/80 bg-white/85 px-4 py-3">
                                    <dt
                                        class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                        最新截止
                                    </dt>
                                    <dd
                                        class="mt-2 text-sm font-semibold text-slate-900">
                                        {{
                                            formatTimestamp(
                                                trafficData?.asOf ?? 0
                                            )
                                        }}
                                    </dd>
                                </div>
                            </dl>
                        </div>
                    </div>

                    <div
                        v-if="trafficErrorMessage"
                        class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700">
                        {{ trafficErrorMessage }}
                    </div>

                    <div
                        v-else-if="trafficStatus === 'pending' && !trafficData"
                        class="space-y-3">
                        <div
                            v-for="index in 3"
                            :key="`traffic-loading:${index}`"
                            class="h-28 animate-pulse rounded-[1rem] bg-slate-100/90" />
                    </div>

                    <template v-else-if="activeWindow">
                        <div class="space-y-4">
                            <div
                                class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                                <div class="space-y-1">
                                    <h3
                                        class="text-lg font-semibold text-slate-900">
                                        窗口选择
                                    </h3>
                                    <p class="text-sm leading-6 text-slate-500">
                                        当前已覆盖
                                        {{
                                            formatDuration(
                                                activeWindow.coverageSeconds
                                            )
                                        }}
                                        <template v-if="activeWindow.isPartial">
                                            ，尚未覆盖完整
                                            {{ activeWindow.label }}
                                        </template>
                                    </p>
                                    <p
                                        v-if="
                                            activeWindow.estimatedMetrics
                                                .length > 0
                                        "
                                        class="text-xs leading-5 text-amber-700">
                                        7days 的独立访客和活跃用户为估算值。
                                    </p>
                                </div>

                                <div class="w-full lg:max-w-md">
                                    <UiTabs
                                        v-model="selectedWindow"
                                        :options="windowOptions" />
                                </div>
                            </div>

                            <div
                                class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                <div
                                    class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                                    <p
                                        class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                        已覆盖时长
                                    </p>
                                    <p
                                        class="mt-2 text-2xl font-semibold text-slate-900">
                                        {{
                                            formatDuration(
                                                activeWindow.coverageSeconds
                                            )
                                        }}
                                    </p>
                                </div>
                                <div
                                    class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                                    <p
                                        class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                        时间精度
                                    </p>
                                    <p
                                        class="mt-2 text-2xl font-semibold text-slate-900">
                                        {{
                                            formatBucketSeconds(
                                                activeWindow.bucketSeconds
                                            )
                                        }}
                                    </p>
                                </div>
                                <div
                                    class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                                    <p
                                        class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                        桶数量
                                    </p>
                                    <p
                                        class="mt-2 text-2xl font-semibold text-slate-900">
                                        {{ activeWindow.bucketCount }}
                                    </p>
                                </div>
                                <div
                                    class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                                    <p
                                        class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                        覆盖状态
                                    </p>
                                    <p
                                        class="mt-2 text-2xl font-semibold text-slate-900">
                                        {{
                                            activeWindow.isPartial
                                                ? '部分'
                                                : '完整'
                                        }}
                                    </p>
                                </div>
                            </div>

                            <div class="grid gap-4 xl:grid-cols-2">
                                <UiCard
                                    v-for="metric in metricCards"
                                    :key="metric.key"
                                    :show-accent-bar="false"
                                    class="traffic-metric-card">
                                    <div class="space-y-5">
                                        <div
                                            class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                            <div class="space-y-1">
                                                <p
                                                    class="text-xs font-semibold uppercase tracking-[0.22em]"
                                                    :class="
                                                        metric.eyebrowClass
                                                    ">
                                                    {{ metric.eyebrow }}
                                                </p>
                                                <div
                                                    class="flex flex-wrap items-center gap-2">
                                                    <h3
                                                        class="text-xl font-semibold text-slate-900">
                                                        {{ metric.title }}
                                                    </h3>
                                                    <span
                                                        v-if="metric.estimated"
                                                        class="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-700">
                                                        估算
                                                    </span>
                                                </div>
                                            </div>

                                            <div
                                                class="text-left md:text-right">
                                                <p
                                                    class="text-3xl font-semibold text-slate-900">
                                                    {{
                                                        formatNumber(
                                                            metric.total
                                                        )
                                                    }}
                                                </p>
                                                <p
                                                    class="mt-1 text-xs leading-5 text-slate-500">
                                                    {{
                                                        metric.estimated
                                                            ? '估算峰值桶：'
                                                            : '峰值桶：'
                                                    }}{{ metric.peakLabel }}
                                                </p>
                                            </div>
                                        </div>

                                        <div
                                            class="rounded-[1rem] border border-slate-200 bg-slate-50/70 px-4 py-4">
                                            <div
                                                class="traffic-chart"
                                                :style="{
                                                    gridTemplateColumns: `repeat(${activeWindow.bucketCount}, minmax(0, 1fr))`
                                                }">
                                                <div
                                                    v-for="bucket in activeWindow.buckets"
                                                    :key="`${metric.key}:${bucket.startAt}`"
                                                    class="traffic-chart__bar"
                                                    :class="metric.barClass"
                                                    :style="{
                                                        height: `${getMetricBarHeight(bucket, metric.key)}%`
                                                    }"
                                                    :title="
                                                        getMetricBucketTitle(
                                                            bucket,
                                                            metric.key,
                                                            metric.estimated
                                                        )
                                                    " />
                                            </div>

                                            <div
                                                class="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-400">
                                                <span
                                                    v-for="label in axisLabels"
                                                    :key="`${selectedWindow}:${label.value}`">
                                                    {{ label.label }}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </UiCard>
                            </div>
                        </div>
                    </template>

                    <UiEmptyState
                        v-else
                        eyebrow="No Data"
                        title="暂无统计数据"
                        description="当前内存统计还没有可用的采样结果。" />
                </div>
            </UiCard>
        </div>
    </AdminShell>
</template>

<script setup lang="ts">
import type {
    AdminTrafficBucket,
    AdminTrafficMetricKey,
    AdminTrafficMetricPeak,
    AdminTrafficResponse,
    AdminTrafficWindow,
    AdminTrafficWindowSummary
} from '~/types/admin';
import type { TrackerApiResponse } from '~/types/homepage';
import { useAdminDateQuery } from '~/composables/useAdminDateQuery';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import formatTrackerTimestamp from '~/utils/time/formatTrackerTimestamp';

definePageMeta({
    middleware: 'admin-required'
});

const requestFetch = import.meta.server ? useRequestFetch() : $fetch;
const { session } = useAuthState();
const { selectedDateInput, todayDateInputValue } = await useAdminDateQuery();
const selectedWindow = ref<AdminTrafficWindow>('3h');

const windowOptions = [
    {
        value: '3h',
        label: '3h / 10 分钟'
    },
    {
        value: '24h',
        label: '24h / 30 分钟'
    },
    {
        value: '7d',
        label: '7days / 2 小时'
    }
] satisfies Array<{
    value: AdminTrafficWindow;
    label: string;
}>;

async function fetchTraffic() {
    const response = await requestFetch<
        TrackerApiResponse<AdminTrafficResponse>
    >('/api/v1/admin/traffic', {
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
    data: trafficData,
    status: trafficStatus,
    error: trafficError,
    refresh: refreshTraffic
} = await useAsyncData('admin-traffic', fetchTraffic);

const trafficErrorMessage = computed(() =>
    trafficError.value
        ? getApiErrorMessage(trafficError.value, '加载流量统计失败。')
        : ''
);
const activeWindow = computed<AdminTrafficWindowSummary | null>(() => {
    const windows = trafficData.value?.windows ?? [];
    return (
        windows.find((windowItem) => windowItem.key === selectedWindow.value) ??
        windows[0] ??
        null
    );
});
const axisLabels = computed(() => {
    if (!activeWindow.value) {
        return [];
    }

    const buckets = activeWindow.value.buckets;
    const step = Math.max(1, Math.floor(buckets.length / 6));

    return buckets
        .filter(
            (_, index) =>
                index === 0 ||
                index === buckets.length - 1 ||
                index % step === 0
        )
        .map((bucket) => ({
            value: bucket.startAt,
            label: formatAxisLabel(
                bucket.startAt,
                activeWindow.value!.bucketSeconds
            )
        }));
});
const metricCards = computed(() => {
    if (!activeWindow.value) {
        return [];
    }

    return [
        buildMetricCard(
            activeWindow.value,
            'webRequests',
            'Website',
            '网站请求量',
            'text-sky-700',
            'traffic-chart__bar--sky'
        ),
        buildMetricCard(
            activeWindow.value,
            'apiCalls',
            'API',
            'API 调用量',
            'text-indigo-700',
            'traffic-chart__bar--indigo'
        ),
        buildMetricCard(
            activeWindow.value,
            'uniqueVisitors',
            'Visitors',
            '网站独立访客量',
            'text-emerald-700',
            'traffic-chart__bar--emerald'
        ),
        buildMetricCard(
            activeWindow.value,
            'activeUsers',
            'Active',
            '网站活跃用户量',
            'text-amber-700',
            'traffic-chart__bar--amber'
        )
    ];
});

watch(
    () => trafficData.value?.windows,
    (windows) => {
        if (
            !windows ||
            windows.some((item) => item.key === selectedWindow.value)
        ) {
            return;
        }

        selectedWindow.value = windows[0]?.key ?? '3h';
    },
    {
        immediate: true
    }
);

useSiteSeo({
    title: '流量统计 | Open CRH Tracker',
    description: '查看管理员内存流量统计窗口。',
    path: '/admin/traffic',
    noindex: true
});

function buildMetricCard(
    windowSummary: AdminTrafficWindowSummary,
    key: AdminTrafficMetricKey,
    eyebrow: string,
    title: string,
    eyebrowClass: string,
    barClass: string
) {
    const peak = getMetricPeak(windowSummary, key);
    const estimated = windowSummary.estimatedMetrics.includes(key);

    return {
        key,
        eyebrow,
        title,
        total: windowSummary.totals[key],
        estimated,
        peakLabel:
            peak && peak.value > 0
                ? `${formatBucketRange(peak.startAt, peak.endAt)} / ${formatNumber(peak.value)}`
                : '--',
        eyebrowClass,
        barClass
    };
}

function getMetricPeak(
    windowSummary: AdminTrafficWindowSummary,
    key: AdminTrafficMetricKey
): AdminTrafficMetricPeak | null {
    switch (key) {
        case 'webRequests':
            return windowSummary.peaks.webRequestsBucket;
        case 'apiCalls':
            return windowSummary.peaks.apiCallsBucket;
        case 'uniqueVisitors':
            return windowSummary.peaks.uniqueVisitorsBucket;
        case 'activeUsers':
            return windowSummary.peaks.activeUsersBucket;
    }
}

function getMetricBarHeight(
    bucket: AdminTrafficBucket,
    key: AdminTrafficMetricKey
) {
    const peakValue = getMetricPeak(activeWindow.value!, key)?.value ?? 0;
    const currentValue = bucket[key];

    if (peakValue <= 0 || currentValue <= 0) {
        return 0;
    }

    return Math.max(6, (currentValue / peakValue) * 100);
}

function getMetricBucketTitle(
    bucket: AdminTrafficBucket,
    key: AdminTrafficMetricKey,
    estimated: boolean
) {
    const labels: Record<AdminTrafficMetricKey, string> = {
        webRequests: '网站请求',
        apiCalls: 'API 调用',
        uniqueVisitors: '独立访客',
        activeUsers: '活跃用户'
    };

    return `${estimated ? '估算 ' : ''}${formatBucketRange(bucket.startAt, bucket.endAt)}: ${labels[key]} ${formatNumber(bucket[key])}`;
}

function formatTimestamp(timestamp: number) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return '--';
    }

    return formatTrackerTimestamp(timestamp);
}

function formatShortTimestamp(timestamp: number) {
    const formatted = formatTrackerTimestamp(timestamp);
    return formatted.slice(5, 16);
}

function formatBucketRange(startAt: number, endAt: number) {
    return `${formatShortTimestamp(startAt)} - ${formatShortTimestamp(endAt)}`;
}

function formatAxisLabel(timestamp: number, bucketSeconds: number) {
    const formatted = formatTrackerTimestamp(timestamp);
    if (bucketSeconds >= 2 * 60 * 60) {
        return formatted.slice(5, 16);
    }

    return formatted.slice(11, 16);
}

function formatBucketSeconds(bucketSeconds: number) {
    if (bucketSeconds % (60 * 60) === 0) {
        return `${bucketSeconds / (60 * 60)} 小时`;
    }

    return `${bucketSeconds / 60} 分钟`;
}

function formatNumber(value: number) {
    return value.toLocaleString('zh-CN');
}

function formatDuration(totalSeconds: number) {
    if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
        return '0 分钟';
    }

    const days = Math.floor(totalSeconds / (24 * 60 * 60));
    const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
    const parts: string[] = [];

    if (days > 0) {
        parts.push(`${days} 天`);
    }

    if (hours > 0) {
        parts.push(`${hours} 小时`);
    }

    if (days === 0 && minutes > 0) {
        parts.push(`${minutes} 分钟`);
    }

    return parts.slice(0, 2).join(' ') || '0 分钟';
}
</script>

<style scoped>
.traffic-metric-card.traffic-metric-card {
    background: linear-gradient(
        180deg,
        rgba(248, 250, 252, 0.96),
        rgba(255, 255, 255, 0.96)
    );
}

.traffic-chart {
    display: grid;
    align-items: end;
    gap: 0.22rem;
    min-height: 12rem;
}

.traffic-chart__bar {
    min-height: 0;
    border-radius: 9999px 9999px 0.35rem 0.35rem;
    box-shadow: 0 10px 20px -16px rgba(15, 23, 42, 0.48);
}

.traffic-chart__bar--sky {
    background: linear-gradient(180deg, #0ea5e9 0%, #38bdf8 100%);
}

.traffic-chart__bar--indigo {
    background: linear-gradient(180deg, #4f46e5 0%, #818cf8 100%);
}

.traffic-chart__bar--emerald {
    background: linear-gradient(180deg, #059669 0%, #34d399 100%);
}

.traffic-chart__bar--amber {
    background: linear-gradient(180deg, #d97706 0%, #fbbf24 100%);
}
</style>
