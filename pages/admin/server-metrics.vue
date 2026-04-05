<template>
    <AdminShell
        v-model:date-input="selectedDateInput"
        :today-date-input-value="todayDateInputValue"
        :session="session"
        :show-date-input="false"
        title="服务器监控"
        description="查看近 4 小时和 24 小时窗口内的 CPU、内存、系统负载与 SSR / API 请求处理时长走势。">
        <template #toolbar>
            <UiButton
                type="button"
                variant="secondary"
                :loading="serverMetricsStatus === 'pending'"
                @click="refreshServerMetrics()">
                刷新监控
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
                                    Runtime Metrics
                                </p>
                                <h2
                                    class="text-2xl font-semibold text-slate-900">
                                    相对时间窗口
                                </h2>
                                <p class="text-sm leading-6 text-slate-700">
                                    指标会持续在后台采样并写入 runtime
                                    文件，服务重启后会尽量从持久化文件恢复当前窗口。
                                </p>
                            </div>

                            <dl class="grid gap-3 sm:grid-cols-3">
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
                                                serverMetricsData?.startedAt ?? 0
                                            )
                                        }}
                                    </dd>
                                </div>
                                <div
                                    class="rounded-[0.95rem] border border-white/80 bg-white/85 px-4 py-3">
                                    <dt
                                        class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                        最新采样
                                    </dt>
                                    <dd
                                        class="mt-2 text-sm font-semibold text-slate-900">
                                        {{
                                            formatTimestamp(
                                                serverMetricsData?.lastSampleAt ??
                                                    0
                                            )
                                        }}
                                    </dd>
                                </div>
                                <div
                                    class="rounded-[0.95rem] border border-white/80 bg-white/85 px-4 py-3">
                                    <dt
                                        class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                        最新刷新
                                    </dt>
                                    <dd
                                        class="mt-2 text-sm font-semibold text-slate-900">
                                        {{
                                            formatTimestamp(
                                                serverMetricsData?.asOf ?? 0
                                            )
                                        }}
                                    </dd>
                                </div>
                            </dl>
                        </div>
                    </div>

                    <div
                        v-if="serverMetricsErrorMessage"
                        class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700">
                        {{ serverMetricsErrorMessage }}
                    </div>

                    <div
                        v-else-if="
                            serverMetricsStatus === 'pending' &&
                            !serverMetricsData
                        "
                        class="space-y-3">
                        <div
                            v-for="index in 3"
                            :key="`server-metrics-loading:${index}`"
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
                                            formatCoverage(
                                                activeWindow.coverageSeconds
                                            )
                                        }}
                                        <template v-if="activeWindow.isPartial">
                                            ，窗口尚未完全填满
                                        </template>
                                    </p>
                                    <p class="text-xs leading-5 text-slate-500">
                                        {{
                                            serverMetricsData
                                                ?.loadAverageSupported
                                                ? '系统负载采用 1 分钟 load average。'
                                                : '当前平台不支持 load average，系统负载将显示为 --。'
                                        }}
                                    </p>
                                </div>

                                <div class="w-full lg:max-w-sm">
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
                                            formatCoverage(
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

                            <div class="grid gap-4 xl:grid-cols-3">
                                <UiCard
                                    v-for="card in systemMetricCards"
                                    :key="card.key"
                                    :show-accent-bar="false"
                                    class="server-metric-card">
                                    <div class="space-y-5">
                                        <div
                                            class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                            <div class="space-y-1">
                                                <p
                                                    class="text-xs font-semibold uppercase tracking-[0.22em]"
                                                    :class="
                                                        card.eyebrowClass
                                                    ">
                                                    {{ card.eyebrow }}
                                                </p>
                                                <h3
                                                    class="text-xl font-semibold text-slate-900">
                                                    {{ card.title }}
                                                </h3>
                                            </div>

                                            <div class="text-left md:text-right">
                                                <p
                                                    class="text-3xl font-semibold text-slate-900">
                                                    {{ card.valueLabel }}
                                                </p>
                                                <p
                                                    class="mt-1 text-xs leading-5 text-slate-500">
                                                    {{ card.detailLabel }}
                                                </p>
                                            </div>
                                        </div>

                                        <div
                                            class="rounded-[1rem] border border-slate-200 bg-slate-50/70 px-4 py-4">
                                            <div
                                                class="server-chart"
                                                :style="chartGridStyle">
                                                <div
                                                    v-for="bucket in activeWindow.buckets"
                                                    :key="`${card.key}:${bucket.startAt}`"
                                                    class="server-chart__bar"
                                                    :class="card.barClass"
                                                    :style="{
                                                        height: `${getBarHeight(bucket, card.seriesKey, card.peakKey)}%`
                                                    }"
                                                    :title="
                                                        getSystemMetricBucketTitle(
                                                            bucket,
                                                            card
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

                                        <p class="text-xs leading-5 text-slate-500">
                                            峰值桶：{{ card.peakLabel }}
                                        </p>
                                    </div>
                                </UiCard>
                            </div>

                            <div class="grid gap-4 xl:grid-cols-2">
                                <UiCard
                                    v-for="card in latencyCards"
                                    :key="card.key"
                                    :show-accent-bar="false"
                                    class="server-metric-card">
                                    <div class="space-y-5">
                                        <div
                                            class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                            <div class="space-y-1">
                                                <p
                                                    class="text-xs font-semibold uppercase tracking-[0.22em]"
                                                    :class="
                                                        card.eyebrowClass
                                                    ">
                                                    {{ card.eyebrow }}
                                                </p>
                                                <h3
                                                    class="text-xl font-semibold text-slate-900">
                                                    {{ card.title }}
                                                </h3>
                                            </div>

                                            <div class="text-left md:text-right">
                                                <p
                                                    class="text-3xl font-semibold text-slate-900">
                                                    {{
                                                        formatRequestCount(
                                                            card.requestCount
                                                        )
                                                    }}
                                                </p>
                                                <p
                                                    class="mt-1 text-xs leading-5 text-slate-500">
                                                    当前桶请求数
                                                </p>
                                            </div>
                                        </div>

                                        <div
                                            class="grid gap-3 sm:grid-cols-2">
                                            <div
                                                class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                                                <p
                                                    class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                                    Avg
                                                </p>
                                                <p
                                                    class="mt-2 text-2xl font-semibold text-slate-900">
                                                    {{
                                                        formatDurationMs(
                                                            card.avgValue
                                                        )
                                                    }}
                                                </p>
                                            </div>
                                            <div
                                                class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                                                <p
                                                    class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                                    P95
                                                </p>
                                                <p
                                                    class="mt-2 text-2xl font-semibold text-slate-900">
                                                    {{
                                                        formatDurationMs(
                                                            card.p95Value
                                                        )
                                                    }}
                                                </p>
                                            </div>
                                        </div>

                                        <div
                                            v-for="line in card.lines"
                                            :key="`${card.key}:${line.label}`"
                                            class="space-y-3 rounded-[1rem] border border-slate-200 bg-slate-50/70 px-4 py-4">
                                            <div
                                                class="flex items-center justify-between gap-3">
                                                <div class="space-y-1">
                                                    <p
                                                        class="text-sm font-semibold text-slate-900">
                                                        {{ line.label }}
                                                    </p>
                                                    <p
                                                        class="text-xs leading-5 text-slate-500">
                                                        峰值桶：{{
                                                            line.peakLabel
                                                        }}
                                                    </p>
                                                </div>
                                                <p
                                                    class="text-sm font-semibold text-slate-900">
                                                    {{
                                                        formatDurationMs(
                                                            line.latestValue
                                                        )
                                                    }}
                                                </p>
                                            </div>

                                            <div
                                                class="server-chart"
                                                :style="chartGridStyle">
                                                <div
                                                    v-for="bucket in activeWindow.buckets"
                                                    :key="`${card.key}:${line.label}:${bucket.startAt}`"
                                                    class="server-chart__bar"
                                                    :class="line.barClass"
                                                    :style="{
                                                        height: `${getBarHeight(bucket, line.seriesKey, line.peakKey)}%`
                                                    }"
                                                    :title="
                                                        getLatencyMetricBucketTitle(
                                                            bucket,
                                                            card.requestKind,
                                                            line
                                                        )
                                                    " />
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
                        title="暂无监控数据"
                        description="当前运行时监控尚未生成可用的采样窗口。" />
                </div>
            </UiCard>
        </div>
    </AdminShell>
</template>

<script setup lang="ts">
import type {
    AdminServerMetricsBucket,
    AdminServerMetricsPeak,
    AdminServerMetricsResponse,
    AdminServerMetricsWindow,
    AdminServerMetricsWindowSummary
} from '~/types/admin';
import type { TrackerApiResponse } from '~/types/homepage';
import { useAdminDateQuery } from '~/composables/useAdminDateQuery';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import formatTrackerTimestamp from '~/utils/time/formatTrackerTimestamp';

definePageMeta({
    middleware: 'admin-required'
});

type SystemSeriesKey = 'cpuPercent' | 'memoryUsedRatio' | 'load1m';
type LatencySeriesKey =
    | 'ssrAvgDurationMs'
    | 'ssrP95DurationMs'
    | 'apiAvgDurationMs'
    | 'apiP95DurationMs';
type PeakKey = keyof AdminServerMetricsWindowSummary['peaks'];

interface SystemMetricCard {
    key: string;
    eyebrow: string;
    title: string;
    seriesKey: SystemSeriesKey;
    peakKey: PeakKey;
    eyebrowClass: string;
    barClass: string;
    valueLabel: string;
    detailLabel: string;
    peakLabel: string;
}

interface LatencyMetricLine {
    label: string;
    seriesKey: LatencySeriesKey;
    peakKey: PeakKey;
    barClass: string;
    latestValue: number | null;
    peakLabel: string;
}

interface LatencyMetricCard {
    key: string;
    eyebrow: string;
    title: string;
    requestKind: 'ssr' | 'api';
    requestCount: number;
    avgValue: number | null;
    p95Value: number | null;
    eyebrowClass: string;
    lines: LatencyMetricLine[];
}

const requestFetch = import.meta.server ? useRequestFetch() : $fetch;
const { session } = useAuthState();
const { selectedDateInput, todayDateInputValue } = await useAdminDateQuery();
const selectedWindow = ref<AdminServerMetricsWindow>('4h');

const windowOptions = [
    {
        value: '4h',
        label: '4h / 5 分钟'
    },
    {
        value: '24h',
        label: '24h / 30 分钟'
    }
] satisfies Array<{
    value: AdminServerMetricsWindow;
    label: string;
}>;

async function fetchServerMetrics() {
    const response = await requestFetch<
        TrackerApiResponse<AdminServerMetricsResponse>
    >('/api/v1/admin/server-metrics', {
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
    data: serverMetricsData,
    status: serverMetricsStatus,
    error: serverMetricsError,
    refresh: refreshServerMetrics
} = await useAsyncData('admin-server-metrics', fetchServerMetrics);

const serverMetricsErrorMessage = computed(() =>
    serverMetricsError.value
        ? getApiErrorMessage(
              serverMetricsError.value,
              '加载服务器监控数据失败。'
          )
        : ''
);
const activeWindow = computed<AdminServerMetricsWindowSummary | null>(() => {
    const windows = serverMetricsData.value?.windows ?? [];
    return (
        windows.find((windowItem) => windowItem.key === selectedWindow.value) ??
        windows[0] ??
        null
    );
});
const chartGridStyle = computed(() => ({
    gridTemplateColumns: `repeat(${activeWindow.value?.bucketCount ?? 1}, minmax(0, 1fr))`
}));
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
            label: formatAxisLabel(bucket.startAt)
        }));
});
const systemMetricCards = computed<SystemMetricCard[]>(() => {
    if (!activeWindow.value) {
        return [];
    }

    const latest = activeWindow.value.latest;

    return [
        {
            key: 'cpu',
            eyebrow: 'CPU',
            title: 'CPU 使用率',
            seriesKey: 'cpuPercent',
            peakKey: 'cpuPercentBucket',
            eyebrowClass: 'text-sky-700',
            barClass: 'server-chart__bar--sky',
            valueLabel: formatPercent(latest?.cpuPercent ?? null),
            detailLabel: '当前桶平均值',
            peakLabel: formatPeakLabel(
                activeWindow.value.peaks.cpuPercentBucket,
                formatPercent
            )
        },
        {
            key: 'memory',
            eyebrow: 'Memory',
            title: '内存使用',
            seriesKey: 'memoryUsedRatio',
            peakKey: 'memoryUsedRatioBucket',
            eyebrowClass: 'text-emerald-700',
            barClass: 'server-chart__bar--emerald',
            valueLabel: formatPercent(
                latest?.memoryUsedRatio !== null &&
                    latest?.memoryUsedRatio !== undefined
                    ? latest.memoryUsedRatio * 100
                    : null
            ),
            detailLabel: formatMemoryDetail(latest),
            peakLabel: formatPeakLabel(
                activeWindow.value.peaks.memoryUsedRatioBucket,
                (value) => formatPercent(value * 100)
            )
        },
        {
            key: 'load',
            eyebrow: 'Load 1m',
            title: '系统负载',
            seriesKey: 'load1m',
            peakKey: 'load1mBucket',
            eyebrowClass: 'text-amber-700',
            barClass: 'server-chart__bar--amber',
            valueLabel:
                serverMetricsData.value?.loadAverageSupported === false
                    ? '--'
                    : formatLoad(latest?.load1m ?? null),
            detailLabel:
                serverMetricsData.value?.loadAverageSupported === false
                    ? '当前平台不支持'
                    : '1 分钟平均负载',
            peakLabel:
                serverMetricsData.value?.loadAverageSupported === false
                    ? '--'
                    : formatPeakLabel(
                          activeWindow.value.peaks.load1mBucket,
                          formatLoad
                      )
        }
    ];
});
const latencyCards = computed<LatencyMetricCard[]>(() => {
    if (!activeWindow.value) {
        return [];
    }

    const latest = activeWindow.value.latest;

    return [
        {
            key: 'ssr',
            eyebrow: 'SSR',
            title: 'SSR 请求处理时长',
            requestKind: 'ssr',
            requestCount: latest?.ssrRequestCount ?? 0,
            avgValue: latest?.ssrAvgDurationMs ?? null,
            p95Value: latest?.ssrP95DurationMs ?? null,
            eyebrowClass: 'text-indigo-700',
            lines: [
                {
                    label: 'Avg',
                    seriesKey: 'ssrAvgDurationMs',
                    peakKey: 'ssrAvgDurationMsBucket',
                    barClass: 'server-chart__bar--indigo',
                    latestValue: latest?.ssrAvgDurationMs ?? null,
                    peakLabel: formatPeakLabel(
                        activeWindow.value.peaks.ssrAvgDurationMsBucket,
                        formatDurationMs
                    )
                },
                {
                    label: 'P95',
                    seriesKey: 'ssrP95DurationMs',
                    peakKey: 'ssrP95DurationMsBucket',
                    barClass: 'server-chart__bar--violet',
                    latestValue: latest?.ssrP95DurationMs ?? null,
                    peakLabel: formatPeakLabel(
                        activeWindow.value.peaks.ssrP95DurationMsBucket,
                        formatDurationMs
                    )
                }
            ]
        },
        {
            key: 'api',
            eyebrow: 'API',
            title: 'API 请求处理时长',
            requestKind: 'api',
            requestCount: latest?.apiRequestCount ?? 0,
            avgValue: latest?.apiAvgDurationMs ?? null,
            p95Value: latest?.apiP95DurationMs ?? null,
            eyebrowClass: 'text-rose-700',
            lines: [
                {
                    label: 'Avg',
                    seriesKey: 'apiAvgDurationMs',
                    peakKey: 'apiAvgDurationMsBucket',
                    barClass: 'server-chart__bar--rose',
                    latestValue: latest?.apiAvgDurationMs ?? null,
                    peakLabel: formatPeakLabel(
                        activeWindow.value.peaks.apiAvgDurationMsBucket,
                        formatDurationMs
                    )
                },
                {
                    label: 'P95',
                    seriesKey: 'apiP95DurationMs',
                    peakKey: 'apiP95DurationMsBucket',
                    barClass: 'server-chart__bar--amber',
                    latestValue: latest?.apiP95DurationMs ?? null,
                    peakLabel: formatPeakLabel(
                        activeWindow.value.peaks.apiP95DurationMsBucket,
                        formatDurationMs
                    )
                }
            ]
        }
    ];
});

watch(
    () => serverMetricsData.value?.windows,
    (windows) => {
        if (
            !windows ||
            windows.some((item) => item.key === selectedWindow.value)
        ) {
            return;
        }

        selectedWindow.value = windows[0]?.key ?? '4h';
    },
    {
        immediate: true
    }
);

useSiteSeo({
    title: '服务器监控 | Open CRH Tracker',
    description: '查看管理员服务器监控窗口。',
    path: '/admin/server-metrics',
    noindex: true
});

function getPeak(windowSummary: AdminServerMetricsWindowSummary, key: PeakKey) {
    return windowSummary.peaks[key];
}

function getMetricValue(
    bucket: AdminServerMetricsBucket,
    key: SystemSeriesKey | LatencySeriesKey
) {
    return bucket[key];
}

function getBarHeight(
    bucket: AdminServerMetricsBucket,
    metricKey: SystemSeriesKey | LatencySeriesKey,
    peakKey: PeakKey
) {
    if (!activeWindow.value) {
        return 0;
    }

    const peakValue = getPeak(activeWindow.value, peakKey)?.value ?? 0;
    const currentValue = getMetricValue(bucket, metricKey);

    if (currentValue === null || peakValue <= 0 || currentValue <= 0) {
        return 0;
    }

    return Math.max(6, (currentValue / peakValue) * 100);
}

function formatPeakLabel(
    peak: AdminServerMetricsPeak | null,
    formatter: (value: number) => string
) {
    if (!peak) {
        return '--';
    }

    return `${formatBucketRange(peak.startAt, peak.endAt)} / ${formatter(peak.value)}`;
}

function formatTimestamp(timestamp: number) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return '--';
    }

    return formatTrackerTimestamp(timestamp);
}

function formatAxisLabel(timestamp: number) {
    const formatted = formatTrackerTimestamp(timestamp);
    return formatted.slice(11, 16);
}

function formatShortTimestamp(timestamp: number) {
    const formatted = formatTrackerTimestamp(timestamp);
    return formatted.slice(5, 16);
}

function formatBucketRange(startAt: number, endAt: number) {
    return `${formatShortTimestamp(startAt)} - ${formatShortTimestamp(endAt)}`;
}

function formatBucketSeconds(bucketSeconds: number) {
    if (bucketSeconds % (60 * 60) === 0) {
        return `${bucketSeconds / (60 * 60)} 小时`;
    }

    return `${bucketSeconds / 60} 分钟`;
}

function formatCoverage(totalSeconds: number) {
    if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
        return '0 分钟';
    }

    const hours = Math.floor(totalSeconds / (60 * 60));
    const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
    const parts: string[] = [];

    if (hours > 0) {
        parts.push(`${hours} 小时`);
    }

    if (minutes > 0) {
        parts.push(`${minutes} 分钟`);
    }

    return parts.join(' ') || '0 分钟';
}

function formatPercent(value: number | null, digits = 1) {
    if (value === null || !Number.isFinite(value)) {
        return '--';
    }

    return `${value.toFixed(digits)}%`;
}

function formatLoad(value: number | null) {
    if (value === null || !Number.isFinite(value)) {
        return '--';
    }

    return value.toFixed(2);
}

function formatBytes(value: number | null) {
    if (value === null || !Number.isFinite(value) || value < 0) {
        return '--';
    }

    const gib = value / 1024 ** 3;
    if (gib >= 1) {
        return `${gib.toFixed(2)} GiB`;
    }

    const mib = value / 1024 ** 2;
    return `${mib.toFixed(0)} MiB`;
}

function formatDurationMs(value: number | null) {
    if (value === null || !Number.isFinite(value)) {
        return '--';
    }

    if (value >= 1000) {
        return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} s`;
    }

    return `${Math.round(value)} ms`;
}

function formatRequestCount(value: number) {
    return value.toLocaleString('zh-CN');
}

function formatMemoryDetail(bucket: AdminServerMetricsBucket | null) {
    if (!bucket) {
        return '--';
    }

    return `${formatBytes(bucket.memoryUsedBytes)} / ${formatBytes(bucket.memoryTotalBytes)}`;
}

function getSystemMetricBucketTitle(
    bucket: AdminServerMetricsBucket,
    card: SystemMetricCard
) {
    if (card.key === 'memory') {
        return `${formatBucketRange(bucket.startAt, bucket.endAt)}: 内存 ${formatPercent(
            bucket.memoryUsedRatio !== null ? bucket.memoryUsedRatio * 100 : null
        )} (${formatMemoryDetail(bucket)})`;
    }

    if (card.key === 'cpu') {
        return `${formatBucketRange(bucket.startAt, bucket.endAt)}: CPU ${formatPercent(bucket.cpuPercent)}`;
    }

    return `${formatBucketRange(bucket.startAt, bucket.endAt)}: 负载 ${formatLoad(bucket.load1m)}`;
}

function getLatencyMetricBucketTitle(
    bucket: AdminServerMetricsBucket,
    requestKind: 'ssr' | 'api',
    line: LatencyMetricLine
) {
    const requestCount =
        requestKind === 'ssr' ? bucket.ssrRequestCount : bucket.apiRequestCount;

    return (
        `${formatBucketRange(bucket.startAt, bucket.endAt)}: ` +
        `${requestKind.toUpperCase()} ${line.label} ${formatDurationMs(
            bucket[line.seriesKey]
        )}, 请求数 ${formatRequestCount(requestCount)}`
    );
}
</script>

<style scoped>
.server-metric-card.server-metric-card {
    background: linear-gradient(
        180deg,
        rgba(248, 250, 252, 0.96),
        rgba(255, 255, 255, 0.96)
    );
}

.server-chart {
    display: grid;
    align-items: end;
    gap: 0.22rem;
    min-height: 12rem;
}

.server-chart__bar {
    min-height: 0;
    border-radius: 9999px 9999px 0.35rem 0.35rem;
    box-shadow: 0 10px 20px -16px rgba(15, 23, 42, 0.48);
}

.server-chart__bar--sky {
    background: linear-gradient(180deg, #0ea5e9 0%, #38bdf8 100%);
}

.server-chart__bar--emerald {
    background: linear-gradient(180deg, #059669 0%, #34d399 100%);
}

.server-chart__bar--amber {
    background: linear-gradient(180deg, #d97706 0%, #fbbf24 100%);
}

.server-chart__bar--indigo {
    background: linear-gradient(180deg, #4f46e5 0%, #818cf8 100%);
}

.server-chart__bar--violet {
    background: linear-gradient(180deg, #7c3aed 0%, #a78bfa 100%);
}

.server-chart__bar--rose {
    background: linear-gradient(180deg, #e11d48 0%, #fb7185 100%);
}
</style>
