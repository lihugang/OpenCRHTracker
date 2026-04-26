<template>
    <AdminShell
        v-model:date-input="selectedDateInput"
        :today-date-input-value="todayDateInputValue"
        :session="session"
        :show-date-input="false"
        title="服务器监控"
        description="查看近 4 小时和 24 小时窗口内的系统资源、请求处理时长与慢路径分布。">
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
                            class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div class="space-y-2">
                                <p
                                    class="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
                                    Runtime Metrics
                                </p>
                                <h2
                                    class="text-2xl font-semibold text-slate-900">
                                    相对时间窗口
                                </h2>
                                <p
                                    class="max-w-3xl text-sm leading-6 text-slate-700">
                                    监控数据会持续写入 runtime
                                    文件并在重启后尽量恢复。 SSR / API
                                    延迟图显示 Avg、P50、P75、P95 四条曲线， Top
                                    5 路径会跟随当前窗口切换。
                                </p>
                                <p
                                    class="max-w-3xl text-xs leading-5 text-sky-700">
                                    慢路径会优先按动态路由模板聚合，例如
                                    /train/:code 和
                                    /api/v1/feedback/topics/:id。
                                </p>
                            </div>

                            <dl class="grid gap-3 sm:grid-cols-3">
                                <div
                                    class="rounded-[0.95rem] border border-white/80 bg-white/90 px-4 py-3">
                                    <dt
                                        class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                        启动时间
                                    </dt>
                                    <dd
                                        class="mt-2 text-sm font-semibold text-slate-900">
                                        {{
                                            formatTimestamp(
                                                serverMetricsData?.startedAt ??
                                                    0
                                            )
                                        }}
                                    </dd>
                                </div>
                                <div
                                    class="rounded-[0.95rem] border border-white/80 bg-white/90 px-4 py-3">
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
                                    class="rounded-[0.95rem] border border-white/80 bg-white/90 px-4 py-3">
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
                                            ，窗口尚未完全填满。
                                        </template>
                                    </p>
                                    <p class="text-xs leading-5 text-slate-500">
                                        {{
                                            serverMetricsData?.loadAverageSupported
                                                ? 'Load 1m 为 1 分钟 load average。'
                                                : '当前平台不支持 load average，Load 1m 将显示为 --。'
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
                                                    :class="card.eyebrowClass">
                                                    {{ card.eyebrow }}
                                                </p>
                                                <h3
                                                    class="text-xl font-semibold text-slate-900">
                                                    {{ card.title }}
                                                </h3>
                                            </div>

                                            <div
                                                class="text-left md:text-right">
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
                                            class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                                            <svg
                                                class="metric-chart"
                                                :viewBox="card.chart.viewBox"
                                                preserveAspectRatio="none"
                                                aria-hidden="true">
                                                <line
                                                    v-for="guide in card.chart
                                                        .guides"
                                                    :key="`${card.key}:guide:${guide}`"
                                                    x1="14"
                                                    :x2="
                                                        String(CHART_WIDTH - 14)
                                                    "
                                                    :y1="String(guide)"
                                                    :y2="String(guide)"
                                                    class="metric-chart__guide" />
                                                <path
                                                    v-for="series in card.chart
                                                        .series"
                                                    :key="`${card.key}:${series.label}`"
                                                    :d="series.path"
                                                    :stroke="series.stroke"
                                                    class="metric-chart__line" />
                                                <rect
                                                    v-for="band in card.chart
                                                        .hoverBands"
                                                    :key="`${card.key}:${band.key}`"
                                                    :x="band.x"
                                                    y="0"
                                                    :width="band.width"
                                                    :height="CHART_HEIGHT"
                                                    class="metric-chart__hover">
                                                    <title>
                                                        {{ band.title }}
                                                    </title>
                                                </rect>
                                            </svg>

                                            <div
                                                class="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-400">
                                                <span
                                                    v-for="label in axisLabels"
                                                    :key="`${selectedWindow}:${label.value}`">
                                                    {{ label.label }}
                                                </span>
                                            </div>
                                        </div>

                                        <p
                                            class="text-xs leading-5 text-slate-500">
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
                                                    :class="card.eyebrowClass">
                                                    {{ card.eyebrow }}
                                                </p>
                                                <h3
                                                    class="text-xl font-semibold text-slate-900">
                                                    {{ card.title }}
                                                </h3>
                                            </div>

                                            <div
                                                class="text-left md:text-right">
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

                                        <div class="grid gap-3 sm:grid-cols-4">
                                            <div
                                                v-for="summary in card.summaryItems"
                                                :key="`${card.key}:${summary.label}`"
                                                class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                                                <p
                                                    class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                                    {{ summary.label }}
                                                </p>
                                                <p
                                                    class="mt-2 text-2xl font-semibold text-slate-900">
                                                    {{
                                                        formatDurationMs(
                                                            summary.value
                                                        )
                                                    }}
                                                </p>
                                            </div>
                                        </div>

                                        <div
                                            class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                                            <div
                                                class="mb-4 flex flex-wrap items-center gap-3">
                                                <div
                                                    v-for="series in card.lines"
                                                    :key="`${card.key}:${series.label}`"
                                                    class="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs text-slate-600">
                                                    <span
                                                        class="metric-legend__dot"
                                                        :style="{
                                                            backgroundColor:
                                                                series.stroke
                                                        }" />
                                                    <span>{{
                                                        series.label
                                                    }}</span>
                                                    <span
                                                        class="text-slate-400">
                                                        {{
                                                            formatDurationMs(
                                                                series.latestValue
                                                            )
                                                        }}
                                                    </span>
                                                </div>
                                            </div>

                                            <svg
                                                class="metric-chart"
                                                :viewBox="card.chart.viewBox"
                                                preserveAspectRatio="none"
                                                aria-hidden="true">
                                                <line
                                                    v-for="guide in card.chart
                                                        .guides"
                                                    :key="`${card.key}:guide:${guide}`"
                                                    x1="14"
                                                    :x2="
                                                        String(CHART_WIDTH - 14)
                                                    "
                                                    :y1="String(guide)"
                                                    :y2="String(guide)"
                                                    class="metric-chart__guide" />
                                                <path
                                                    v-for="series in card.chart
                                                        .series"
                                                    :key="`${card.key}:${series.label}`"
                                                    :d="series.path"
                                                    :stroke="series.stroke"
                                                    class="metric-chart__line" />
                                                <rect
                                                    v-for="band in card.chart
                                                        .hoverBands"
                                                    :key="`${card.key}:${band.key}`"
                                                    :x="band.x"
                                                    y="0"
                                                    :width="band.width"
                                                    :height="CHART_HEIGHT"
                                                    class="metric-chart__hover">
                                                    <title>
                                                        {{ band.title }}
                                                    </title>
                                                </rect>
                                            </svg>

                                            <div
                                                class="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-400">
                                                <span
                                                    v-for="label in axisLabels"
                                                    :key="`${card.key}:${label.value}`">
                                                    {{ label.label }}
                                                </span>
                                            </div>
                                        </div>

                                        <div class="space-y-3">
                                            <div
                                                class="flex items-center justify-between gap-3">
                                                <h4
                                                    class="text-sm font-semibold text-slate-900">
                                                    Top 5 慢路径
                                                </h4>
                                                <p
                                                    class="text-xs leading-5 text-slate-500">
                                                    按 Avg 降序
                                                </p>
                                            </div>

                                            <div
                                                class="overflow-hidden rounded-[1rem] border border-slate-200 bg-white/90">
                                                <div class="overflow-x-auto">
                                                    <table
                                                        class="min-w-full text-sm">
                                                        <thead
                                                            class="bg-slate-50 text-slate-500">
                                                            <tr>
                                                                <th
                                                                    class="px-4 py-3 text-left font-medium">
                                                                    Path
                                                                </th>
                                                                <th
                                                                    class="px-4 py-3 text-right font-medium">
                                                                    Count
                                                                </th>
                                                                <th
                                                                    class="px-4 py-3 text-right font-medium">
                                                                    Avg
                                                                </th>
                                                                <th
                                                                    class="px-4 py-3 text-right font-medium">
                                                                    P50
                                                                </th>
                                                                <th
                                                                    class="px-4 py-3 text-right font-medium">
                                                                    P75
                                                                </th>
                                                                <th
                                                                    class="px-4 py-3 text-right font-medium">
                                                                    P95
                                                                </th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            <tr
                                                                v-for="route in card.topRoutes"
                                                                :key="`${card.key}:${route.path}`"
                                                                class="border-t border-slate-100">
                                                                <td
                                                                    class="max-w-[18rem] px-4 py-3 font-mono text-xs text-slate-700">
                                                                    <span
                                                                        class="line-clamp-2 break-all">
                                                                        {{
                                                                            route.path
                                                                        }}
                                                                    </span>
                                                                </td>
                                                                <td
                                                                    class="px-4 py-3 text-right text-slate-600">
                                                                    {{
                                                                        formatRequestCount(
                                                                            route.requestCount
                                                                        )
                                                                    }}
                                                                </td>
                                                                <td
                                                                    class="px-4 py-3 text-right text-slate-900">
                                                                    {{
                                                                        formatDurationMs(
                                                                            route.avgDurationMs
                                                                        )
                                                                    }}
                                                                </td>
                                                                <td
                                                                    class="px-4 py-3 text-right text-slate-600">
                                                                    {{
                                                                        formatDurationMs(
                                                                            route.p50DurationMs
                                                                        )
                                                                    }}
                                                                </td>
                                                                <td
                                                                    class="px-4 py-3 text-right text-slate-600">
                                                                    {{
                                                                        formatDurationMs(
                                                                            route.p75DurationMs
                                                                        )
                                                                    }}
                                                                </td>
                                                                <td
                                                                    class="px-4 py-3 text-right text-slate-600">
                                                                    {{
                                                                        formatDurationMs(
                                                                            route.p95DurationMs
                                                                        )
                                                                    }}
                                                                </td>
                                                            </tr>
                                                            <tr
                                                                v-if="
                                                                    card
                                                                        .topRoutes
                                                                        .length ===
                                                                    0
                                                                ">
                                                                <td
                                                                    colspan="6"
                                                                    class="px-4 py-8 text-center text-sm text-slate-400">
                                                                    当前窗口暂无路径样本
                                                                </td>
                                                            </tr>
                                                        </tbody>
                                                    </table>
                                                </div>
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
    AdminServerMetricsTopRoute,
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

const CHART_WIDTH = 480;
const CHART_HEIGHT = 188;
const CHART_PADDING_X = 14;
const CHART_PADDING_Y = 16;
const CHART_GUIDE_COUNT = 4;

type SystemSeriesKey = 'cpuPercent' | 'memoryUsedRatio' | 'load1m';
type LatencySeriesKey =
    | 'ssrAvgDurationMs'
    | 'ssrP50DurationMs'
    | 'ssrP75DurationMs'
    | 'ssrP95DurationMs'
    | 'apiAvgDurationMs'
    | 'apiP50DurationMs'
    | 'apiP75DurationMs'
    | 'apiP95DurationMs';
type MetricSeriesKey = SystemSeriesKey | LatencySeriesKey;
type PeakKey = keyof AdminServerMetricsWindowSummary['peaks'];

interface AxisLabel {
    value: number;
    label: string;
}

interface ChartHoverBand {
    key: string;
    x: number;
    width: number;
    title: string;
}

interface ChartSeriesModel {
    label: string;
    stroke: string;
    path: string;
}

interface ChartModel {
    viewBox: string;
    guides: number[];
    hoverBands: ChartHoverBand[];
    series: ChartSeriesModel[];
}

interface MetricLine {
    label: string;
    seriesKey: MetricSeriesKey;
    peakKey: PeakKey;
    stroke: string;
    latestValue: number | null;
    peakLabel: string;
}

interface SystemMetricCard {
    key: string;
    eyebrow: string;
    title: string;
    eyebrowClass: string;
    valueLabel: string;
    detailLabel: string;
    peakLabel: string;
    chart: ChartModel;
}

interface LatencyMetricCard {
    key: string;
    eyebrow: string;
    title: string;
    requestKind: 'ssr' | 'api';
    requestCount: number;
    eyebrowClass: string;
    summaryItems: Array<{
        label: string;
        value: number | null;
    }>;
    lines: MetricLine[];
    chart: ChartModel;
    topRoutes: AdminServerMetricsTopRoute[];
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

const axisLabels = computed<AxisLabel[]>(() => {
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
    const buckets = activeWindow.value.buckets;

    return [
        {
            key: 'cpu',
            eyebrow: 'CPU',
            title: 'CPU 使用率',
            eyebrowClass: 'text-sky-700',
            valueLabel: formatPercent(latest?.cpuPercent ?? null),
            detailLabel: '当前桶平均值',
            peakLabel: formatPeakLabel(
                activeWindow.value.peaks.cpuPercentBucket,
                formatPercent
            ),
            chart: buildChartModel(
                buckets,
                [
                    {
                        label: 'CPU',
                        seriesKey: 'cpuPercent',
                        stroke: '#0284c7'
                    }
                ],
                (bucket) =>
                    `${formatBucketRange(bucket.startAt, bucket.endAt)}\nCPU ${formatPercent(bucket.cpuPercent)}`
            )
        },
        {
            key: 'memory',
            eyebrow: 'Memory',
            title: '内存使用',
            eyebrowClass: 'text-emerald-700',
            valueLabel: formatRatioPercent(latest?.memoryUsedRatio ?? null),
            detailLabel: formatMemoryDetail(latest),
            peakLabel: formatPeakLabel(
                activeWindow.value.peaks.memoryUsedRatioBucket,
                (value) => formatRatioPercent(value)
            ),
            chart: buildChartModel(
                buckets,
                [
                    {
                        label: 'Memory',
                        seriesKey: 'memoryUsedRatio',
                        stroke: '#059669'
                    }
                ],
                (bucket) =>
                    `${formatBucketRange(bucket.startAt, bucket.endAt)}\nMemory ${formatRatioPercent(
                        bucket.memoryUsedRatio
                    )}\n${formatMemoryDetail(bucket)}`
            )
        },
        {
            key: 'load',
            eyebrow: 'Load 1m',
            title: '系统负载',
            eyebrowClass: 'text-amber-700',
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
                      ),
            chart: buildChartModel(
                buckets,
                [
                    {
                        label: 'Load 1m',
                        seriesKey: 'load1m',
                        stroke: '#d97706'
                    }
                ],
                (bucket) =>
                    `${formatBucketRange(bucket.startAt, bucket.endAt)}\nLoad 1m ${formatLoad(
                        bucket.load1m
                    )}`
            )
        }
    ];
});

const latencyCards = computed<LatencyMetricCard[]>(() => {
    if (!activeWindow.value) {
        return [];
    }

    const latest = activeWindow.value.latest;
    const buckets = activeWindow.value.buckets;

    const ssrLines: MetricLine[] = [
        {
            label: 'Avg',
            seriesKey: 'ssrAvgDurationMs',
            peakKey: 'ssrAvgDurationMsBucket',
            stroke: '#4338ca',
            latestValue: latest?.ssrAvgDurationMs ?? null,
            peakLabel: formatPeakLabel(
                activeWindow.value.peaks.ssrAvgDurationMsBucket,
                formatDurationMs
            )
        },
        {
            label: 'P50',
            seriesKey: 'ssrP50DurationMs',
            peakKey: 'ssrP50DurationMsBucket',
            stroke: '#0f766e',
            latestValue: latest?.ssrP50DurationMs ?? null,
            peakLabel: formatPeakLabel(
                activeWindow.value.peaks.ssrP50DurationMsBucket,
                formatDurationMs
            )
        },
        {
            label: 'P75',
            seriesKey: 'ssrP75DurationMs',
            peakKey: 'ssrP75DurationMsBucket',
            stroke: '#c2410c',
            latestValue: latest?.ssrP75DurationMs ?? null,
            peakLabel: formatPeakLabel(
                activeWindow.value.peaks.ssrP75DurationMsBucket,
                formatDurationMs
            )
        },
        {
            label: 'P95',
            seriesKey: 'ssrP95DurationMs',
            peakKey: 'ssrP95DurationMsBucket',
            stroke: '#be123c',
            latestValue: latest?.ssrP95DurationMs ?? null,
            peakLabel: formatPeakLabel(
                activeWindow.value.peaks.ssrP95DurationMsBucket,
                formatDurationMs
            )
        }
    ];

    const apiLines: MetricLine[] = [
        {
            label: 'Avg',
            seriesKey: 'apiAvgDurationMs',
            peakKey: 'apiAvgDurationMsBucket',
            stroke: '#4338ca',
            latestValue: latest?.apiAvgDurationMs ?? null,
            peakLabel: formatPeakLabel(
                activeWindow.value.peaks.apiAvgDurationMsBucket,
                formatDurationMs
            )
        },
        {
            label: 'P50',
            seriesKey: 'apiP50DurationMs',
            peakKey: 'apiP50DurationMsBucket',
            stroke: '#0f766e',
            latestValue: latest?.apiP50DurationMs ?? null,
            peakLabel: formatPeakLabel(
                activeWindow.value.peaks.apiP50DurationMsBucket,
                formatDurationMs
            )
        },
        {
            label: 'P75',
            seriesKey: 'apiP75DurationMs',
            peakKey: 'apiP75DurationMsBucket',
            stroke: '#c2410c',
            latestValue: latest?.apiP75DurationMs ?? null,
            peakLabel: formatPeakLabel(
                activeWindow.value.peaks.apiP75DurationMsBucket,
                formatDurationMs
            )
        },
        {
            label: 'P95',
            seriesKey: 'apiP95DurationMs',
            peakKey: 'apiP95DurationMsBucket',
            stroke: '#be123c',
            latestValue: latest?.apiP95DurationMs ?? null,
            peakLabel: formatPeakLabel(
                activeWindow.value.peaks.apiP95DurationMsBucket,
                formatDurationMs
            )
        }
    ];

    return [
        {
            key: 'ssr',
            eyebrow: 'SSR',
            title: 'SSR 请求处理时长',
            requestKind: 'ssr',
            requestCount: latest?.ssrRequestCount ?? 0,
            eyebrowClass: 'text-indigo-700',
            summaryItems: [
                {
                    label: 'Avg',
                    value: latest?.ssrAvgDurationMs ?? null
                },
                {
                    label: 'P50',
                    value: latest?.ssrP50DurationMs ?? null
                },
                {
                    label: 'P75',
                    value: latest?.ssrP75DurationMs ?? null
                },
                {
                    label: 'P95',
                    value: latest?.ssrP95DurationMs ?? null
                }
            ],
            lines: ssrLines,
            chart: buildChartModel(
                buckets,
                ssrLines.map((line) => ({
                    label: line.label,
                    seriesKey: line.seriesKey,
                    stroke: line.stroke
                })),
                (bucket) =>
                    [
                        formatBucketRange(bucket.startAt, bucket.endAt),
                        `Count ${formatRequestCount(bucket.ssrRequestCount)}`,
                        `Avg ${formatDurationMs(bucket.ssrAvgDurationMs)}`,
                        `P50 ${formatDurationMs(bucket.ssrP50DurationMs)}`,
                        `P75 ${formatDurationMs(bucket.ssrP75DurationMs)}`,
                        `P95 ${formatDurationMs(bucket.ssrP95DurationMs)}`
                    ].join('\n')
            ),
            topRoutes: activeWindow.value.topRoutes.ssr
        },
        {
            key: 'api',
            eyebrow: 'API',
            title: 'API 请求处理时长',
            requestKind: 'api',
            requestCount: latest?.apiRequestCount ?? 0,
            eyebrowClass: 'text-rose-700',
            summaryItems: [
                {
                    label: 'Avg',
                    value: latest?.apiAvgDurationMs ?? null
                },
                {
                    label: 'P50',
                    value: latest?.apiP50DurationMs ?? null
                },
                {
                    label: 'P75',
                    value: latest?.apiP75DurationMs ?? null
                },
                {
                    label: 'P95',
                    value: latest?.apiP95DurationMs ?? null
                }
            ],
            lines: apiLines,
            chart: buildChartModel(
                buckets,
                apiLines.map((line) => ({
                    label: line.label,
                    seriesKey: line.seriesKey,
                    stroke: line.stroke
                })),
                (bucket) =>
                    [
                        formatBucketRange(bucket.startAt, bucket.endAt),
                        `Count ${formatRequestCount(bucket.apiRequestCount)}`,
                        `Avg ${formatDurationMs(bucket.apiAvgDurationMs)}`,
                        `P50 ${formatDurationMs(bucket.apiP50DurationMs)}`,
                        `P75 ${formatDurationMs(bucket.apiP75DurationMs)}`,
                        `P95 ${formatDurationMs(bucket.apiP95DurationMs)}`
                    ].join('\n')
            ),
            topRoutes: activeWindow.value.topRoutes.api
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

function getMetricValue(
    bucket: AdminServerMetricsBucket,
    key: MetricSeriesKey
) {
    return bucket[key];
}

function getChartX(index: number, count: number) {
    if (count <= 1) {
        return CHART_WIDTH / 2;
    }

    const innerWidth = CHART_WIDTH - CHART_PADDING_X * 2;
    return CHART_PADDING_X + (innerWidth * index) / (count - 1);
}

function getChartBandStart(index: number, count: number) {
    if (count <= 1) {
        return 0;
    }

    const currentX = getChartX(index, count);
    if (index === 0) {
        return 0;
    }

    return (getChartX(index - 1, count) + currentX) / 2;
}

function getChartBandEnd(index: number, count: number) {
    if (count <= 1) {
        return CHART_WIDTH;
    }

    const currentX = getChartX(index, count);
    if (index === count - 1) {
        return CHART_WIDTH;
    }

    return (currentX + getChartX(index + 1, count)) / 2;
}

function getChartY(value: number, maxValue: number) {
    const innerHeight = CHART_HEIGHT - CHART_PADDING_Y * 2;
    return (
        CHART_HEIGHT -
        CHART_PADDING_Y -
        Math.max(0, Math.min(1, value / maxValue)) * innerHeight
    );
}

function buildChartPath(values: Array<number | null>, maxValue: number) {
    const points: string[] = [];
    let hasStarted = false;

    for (const [index, value] of values.entries()) {
        if (value === null || !Number.isFinite(value)) {
            hasStarted = false;
            continue;
        }

        const x = getChartX(index, values.length);
        const y = getChartY(value, maxValue);
        points.push(`${hasStarted ? 'L' : 'M'} ${x} ${y}`);
        hasStarted = true;
    }

    return points.join(' ');
}

function buildChartModel(
    buckets: AdminServerMetricsBucket[],
    seriesDefinitions: Array<{
        label: string;
        seriesKey: MetricSeriesKey;
        stroke: string;
    }>,
    getTitle: (bucket: AdminServerMetricsBucket) => string
): ChartModel {
    const values = seriesDefinitions.flatMap(({ seriesKey }) =>
        buckets.map((bucket) => {
            const value = getMetricValue(bucket, seriesKey);
            return value !== null && Number.isFinite(value) ? value : null;
        })
    );
    const maxValue: number =
        values.reduce<number>((max, value) => {
            if (value === null || value <= 0) {
                return max;
            }

            return Math.max(max, value);
        }, 0) || 1;
    const guides = Array.from({ length: CHART_GUIDE_COUNT }, (_, index) =>
        getChartY(maxValue * ((index + 1) / CHART_GUIDE_COUNT), maxValue)
    );

    return {
        viewBox: `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`,
        guides,
        hoverBands: buckets.map((bucket, index) => {
            const x = getChartBandStart(index, buckets.length);
            const width =
                getChartBandEnd(index, buckets.length) - x || CHART_WIDTH;

            return {
                key: String(bucket.startAt),
                x,
                width,
                title: getTitle(bucket)
            };
        }),
        series: seriesDefinitions.map((seriesDefinition) => ({
            label: seriesDefinition.label,
            stroke: seriesDefinition.stroke,
            path: buildChartPath(
                buckets.map((bucket) =>
                    getMetricValue(bucket, seriesDefinition.seriesKey)
                ),
                maxValue
            )
        }))
    };
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

function formatRatioPercent(value: number | null) {
    if (value === null || !Number.isFinite(value)) {
        return '--';
    }

    return formatPercent(value * 100);
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
</script>

<style scoped>
.server-metric-card.server-metric-card {
    background: linear-gradient(
        180deg,
        rgba(248, 250, 252, 0.96),
        rgba(255, 255, 255, 0.98)
    );
}

.metric-chart {
    display: block;
    width: 100%;
    min-height: 12rem;
    overflow: visible;
}

.metric-chart__guide {
    stroke: rgba(148, 163, 184, 0.22);
    stroke-dasharray: 4 6;
    stroke-width: 1;
}

.metric-chart__line {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 3;
}

.metric-chart__hover {
    fill: transparent;
}

.metric-legend__dot {
    display: inline-block;
    width: 0.65rem;
    height: 0.65rem;
    flex: 0 0 auto;
    border-radius: 9999px;
}
</style>
