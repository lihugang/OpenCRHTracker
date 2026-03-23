<template>
    <main
        class="flex min-h-screen flex-col bg-[linear-gradient(180deg,#f8fafc_0%,#eef5fb_100%)] text-crh-grey-dark">
        <div
            class="pointer-events-none absolute inset-x-0 top-0 h-[24rem] bg-[radial-gradient(circle_at_top,_rgba(0,82,155,0.14),_transparent_58%)]" />
        <div
            class="pointer-events-none absolute inset-x-0 top-20 h-40 bg-[linear-gradient(90deg,_rgba(90,132,162,0.12),_rgba(90,132,162,0))] blur-3xl" />

        <div
            class="relative mx-auto flex w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
            <section class="mx-auto flex w-full max-w-6xl flex-col gap-6">
                <UiCard
                    variant="accent"
                    class="admin-hero-card">
                    <div class="space-y-6">
                        <div
                            class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div class="space-y-3">
                                <p
                                    class="text-xs font-semibold uppercase tracking-[0.28em] text-crh-blue/80">
                                    Admin
                                </p>
                                <div class="space-y-2">
                                    <h1
                                        class="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                                        异常检测工作台
                                    </h1>
                                    <p
                                        class="max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
                                        管理员可以查看日志中的
                                        warning/error，观察 12306 请求曲线，
                                        并按日期主动扫描日记录里的异常车次和异常车组。
                                    </p>
                                </div>
                            </div>

                            <UiButton
                                type="button"
                                variant="secondary"
                                @click="goHome">
                                返回首页
                            </UiButton>
                        </div>

                        <div class="motion-divider" />

                        <div
                            class="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
                            <div
                                class="rounded-[1.15rem] border border-white/75 bg-white/90 px-5 py-5 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.24)]">
                                <div
                                    class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                                    <div class="space-y-4">
                                        <div class="space-y-1">
                                            <p
                                                class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                                                Current Session
                                            </p>
                                            <div
                                                class="flex flex-wrap items-center gap-3">
                                                <span
                                                    class="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                                                    Admin Active
                                                </span>
                                                <span
                                                    class="inline-flex items-center rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white">
                                                    {{
                                                        session?.issuer ??
                                                        'webapp'
                                                    }}
                                                </span>
                                            </div>
                                        </div>

                                        <dl class="grid gap-4 sm:grid-cols-2">
                                            <div class="space-y-1">
                                                <dt
                                                    class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                                    用户名
                                                </dt>
                                                <dd
                                                    class="text-lg font-semibold text-slate-900">
                                                    {{
                                                        session?.userId ?? '--'
                                                    }}
                                                </dd>
                                            </div>
                                            <div class="space-y-1">
                                                <dt
                                                    class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                                    当前日期
                                                </dt>
                                                <dd
                                                    class="text-lg font-semibold text-crh-blue">
                                                    {{ selectedDateYmd }}
                                                </dd>
                                            </div>
                                        </dl>
                                    </div>

                                    <div class="space-y-3">
                                        <UiField
                                            label="检测日期"
                                            help="主动检测和被动告警都基于这个日期。">
                                            <input
                                                v-model="selectedDateInput"
                                                type="date"
                                                class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark"
                                                :max="todayDateInputValue" />
                                        </UiField>

                                        <div class="flex flex-wrap gap-3">
                                            <UiButton
                                                type="button"
                                                variant="secondary"
                                                :disabled="!isSelectedDateValid"
                                                :loading="
                                                    passiveAlertsStatus ===
                                                    'pending'
                                                "
                                                @click="refreshPassiveAlerts()">
                                                刷新告警
                                            </UiButton>
                                            <UiButton
                                                type="button"
                                                :disabled="!isSelectedDateValid"
                                                :loading="
                                                    anomalyScanStatus ===
                                                    'pending'
                                                "
                                                @click="runAnomalyScan">
                                                开始检测
                                            </UiButton>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div
                                class="rounded-[1.15rem] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-5 py-5 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.22)]">
                                <p
                                    class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                                    Highlights
                                </p>
                                <dl class="mt-4 grid gap-4">
                                    <div
                                        class="rounded-2xl bg-slate-50/90 px-4 py-3">
                                        <dt
                                            class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                            Warning / Error
                                        </dt>
                                        <dd
                                            class="mt-1 text-2xl font-semibold text-slate-900">
                                            {{ passiveAlertsData?.total ?? 0 }}
                                        </dd>
                                    </div>
                                    <div
                                        class="rounded-2xl bg-slate-50/90 px-4 py-3">
                                        <dt
                                            class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                            请求峰值
                                        </dt>
                                        <dd
                                            class="mt-1 text-2xl font-semibold text-slate-900">
                                            {{ requestPeakCount }}
                                        </dd>
                                    </div>
                                    <div
                                        class="rounded-2xl bg-slate-50/90 px-4 py-3">
                                        <dt
                                            class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                            主动检测结果
                                        </dt>
                                        <dd
                                            class="mt-1 text-2xl font-semibold text-slate-900">
                                            {{ anomalyScanData?.total ?? 0 }}
                                        </dd>
                                    </div>
                                </dl>
                            </div>
                        </div>
                    </div>
                </UiCard>

                <div
                    class="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                    <UiCard
                        :show-accent-bar="false"
                        class="min-h-[38rem]">
                        <div class="space-y-6">
                            <div
                                class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div class="space-y-2">
                                    <p
                                        class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                                        Passive Alerts
                                    </p>
                                    <h2
                                        class="text-2xl font-semibold text-slate-900">
                                        被动告警
                                    </h2>
                                    <p class="text-sm leading-6 text-slate-600">
                                        读取当日日志中的 warning/error，并统计
                                        12306 请求半小时曲线。
                                    </p>
                                </div>

                                <div class="text-sm leading-6 text-slate-500">
                                    <p>日志文件：{{ passiveLogFileLabel }}</p>
                                    <p>
                                        展示最近
                                        {{ passiveAlertsItemCount }} 条告警
                                    </p>
                                </div>
                            </div>

                            <div class="grid gap-3 md:grid-cols-3">
                                <div
                                    class="rounded-[1rem] border border-amber-200 bg-amber-50/70 px-4 py-4">
                                    <p
                                        class="text-xs uppercase tracking-[0.18em] text-amber-700">
                                        Warnings
                                    </p>
                                    <p
                                        class="mt-2 text-3xl font-semibold text-amber-900">
                                        {{ passiveAlertsData?.warnCount ?? 0 }}
                                    </p>
                                </div>
                                <div
                                    class="rounded-[1rem] border border-rose-200 bg-rose-50/70 px-4 py-4">
                                    <p
                                        class="text-xs uppercase tracking-[0.18em] text-rose-700">
                                        Errors
                                    </p>
                                    <p
                                        class="mt-2 text-3xl font-semibold text-rose-900">
                                        {{ passiveAlertsData?.errorCount ?? 0 }}
                                    </p>
                                </div>
                                <div
                                    class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                                    <p
                                        class="text-xs uppercase tracking-[0.18em] text-slate-500">
                                        12306 Requests
                                    </p>
                                    <p
                                        class="mt-2 text-3xl font-semibold text-slate-900">
                                        {{ requestTotalCount }}
                                    </p>
                                </div>
                            </div>

                            <div
                                v-if="passiveAlertsErrorMessage"
                                class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700">
                                {{ passiveAlertsErrorMessage }}
                            </div>

                            <div
                                v-else-if="passiveAlertsStatus === 'pending'"
                                class="space-y-3">
                                <div
                                    v-for="index in 3"
                                    :key="`passive-loading:${index}`"
                                    class="h-24 animate-pulse rounded-[1rem] bg-slate-100/90" />
                            </div>

                            <template v-else>
                                <div class="space-y-3">
                                    <div
                                        class="flex items-center justify-between gap-4">
                                        <div class="space-y-1">
                                            <h3
                                                class="text-lg font-semibold text-slate-900">
                                                12306 请求半小时曲线
                                            </h3>
                                            <p
                                                class="text-sm leading-6 text-slate-500">
                                                一期只展示曲线，不自动判断涨幅异常。
                                            </p>
                                        </div>
                                        <p class="text-sm text-slate-500">
                                            峰值 {{ requestPeakCount }} / 30
                                            分钟
                                        </p>
                                    </div>

                                    <div
                                        v-if="
                                            requestBuckets.length > 0 &&
                                            requestPeakCount > 0
                                        "
                                        class="space-y-3 rounded-[1rem] border border-slate-200 bg-slate-50/70 px-4 py-4">
                                        <div class="request-chart">
                                            <div
                                                v-for="bucket in requestBuckets"
                                                :key="bucket.startAt"
                                                class="request-chart__bar"
                                                :style="{
                                                    height: `${getRequestBarHeight(bucket)}%`
                                                }"
                                                :title="
                                                    getRequestBucketTitle(
                                                        bucket
                                                    )
                                                " />
                                        </div>
                                        <div
                                            class="grid grid-cols-4 text-xs text-slate-400 sm:grid-cols-8">
                                            <span
                                                v-for="label in requestAxisLabels"
                                                :key="label.value"
                                                class="text-center">
                                                {{ label.label }}
                                            </span>
                                        </div>
                                    </div>

                                    <UiEmptyState
                                        v-else
                                        eyebrow="No Traffic"
                                        title="暂无 12306 请求曲线"
                                        description="当前日志里还没有新的请求计数事件，后续请求会自动进入曲线。" />
                                </div>

                                <div class="space-y-3">
                                    <div
                                        class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                        <div class="space-y-1">
                                            <h3
                                                class="text-lg font-semibold text-slate-900">
                                                高频来源
                                            </h3>
                                            <p
                                                class="text-sm leading-6 text-slate-500">
                                                按 warning/error 计数排序。
                                            </p>
                                        </div>
                                    </div>

                                    <div
                                        v-if="
                                            passiveAlertsData &&
                                            passiveAlertsData.topLoggers
                                                .length > 0
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
                                        eyebrow="No Alerts"
                                        title="当天没有 warning/error"
                                        description="如果后台运行稳定，这里会保持为空。" />
                                </div>

                                <div class="space-y-3">
                                    <div
                                        class="flex items-center justify-between gap-4">
                                        <div class="space-y-1">
                                            <h3
                                                class="text-lg font-semibold text-slate-900">
                                                最新告警
                                            </h3>
                                            <p
                                                v-if="
                                                    passiveAlertsData?.truncated
                                                "
                                                class="text-sm leading-6 text-slate-500">
                                                结果已截断，仅显示最近 200 条。
                                            </p>
                                        </div>
                                    </div>

                                    <div
                                        v-if="
                                            passiveAlertsData &&
                                            passiveAlertsData.items.length > 0
                                        "
                                        class="space-y-3">
                                        <article
                                            v-for="item in passiveAlertsData.items"
                                            :key="`${item.timestamp}:${item.logger}:${item.message}`"
                                            class="rounded-[1rem] border px-4 py-4"
                                            :class="
                                                item.level === 'ERROR'
                                                    ? 'border-rose-200 bg-rose-50/60'
                                                    : 'border-amber-200 bg-amber-50/60'
                                            ">
                                            <div
                                                class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
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
                                                    {{
                                                        formatTimestamp(
                                                            item.timestamp
                                                        )
                                                    }}
                                                </span>
                                            </div>
                                        </article>
                                    </div>

                                    <UiEmptyState
                                        v-else
                                        eyebrow="Clean"
                                        title="当天没有被动告警"
                                        description="日志中没有 warning/error，或者日志文件尚未生成。" />
                                </div>
                            </template>
                        </div>
                    </UiCard>

                    <UiCard
                        :show-accent-bar="false"
                        class="min-h-[38rem]">
                        <div class="space-y-6">
                            <div
                                class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div class="space-y-2">
                                    <p
                                        class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                                        Active Scan
                                    </p>
                                    <h2
                                        class="text-2xl font-semibold text-slate-900">
                                        主动检测
                                    </h2>
                                    <p class="text-sm leading-6 text-slate-600">
                                        扫描
                                        {{ selectedDateYmd }}
                                        的日记录，识别异常重联和异常短交路。
                                    </p>
                                </div>

                                <UiButton
                                    type="button"
                                    :disabled="!isSelectedDateValid"
                                    :loading="anomalyScanStatus === 'pending'"
                                    @click="runAnomalyScan">
                                    开始检测
                                </UiButton>
                            </div>

                            <div
                                v-if="anomalyScanErrorMessage"
                                class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700">
                                {{ anomalyScanErrorMessage }}
                            </div>

                            <UiEmptyState
                                v-else-if="anomalyScanStatus === 'idle'"
                                eyebrow="Ready"
                                title="等待管理员触发检测"
                                description="选择日期后点击“开始检测”，服务端会基于当日日记录实时计算异常。" />

                            <div
                                v-else-if="anomalyScanStatus === 'pending'"
                                class="space-y-3">
                                <div
                                    v-for="index in 4"
                                    :key="`active-loading:${index}`"
                                    class="h-24 animate-pulse rounded-[1rem] bg-slate-100/90" />
                            </div>

                            <template v-else>
                                <div class="grid gap-3 sm:grid-cols-2">
                                    <div
                                        v-for="item in anomalyCounts"
                                        :key="item.type"
                                        class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                                        <p
                                            class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                            {{ item.label }}
                                        </p>
                                        <p
                                            class="mt-2 text-3xl font-semibold text-slate-900">
                                            {{ item.count }}
                                        </p>
                                    </div>
                                </div>

                                <div
                                    v-if="
                                        anomalyScanData &&
                                        anomalyScanData.items.length > 0
                                    "
                                    class="space-y-3">
                                    <article
                                        v-for="item in anomalyScanData.items"
                                        :key="`${item.type}:${item.subjectCode}`"
                                        class="rounded-[1rem] border border-slate-200 bg-white/90 px-4 py-4 shadow-sm">
                                        <div class="space-y-4">
                                            <div
                                                class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                                <div class="space-y-2">
                                                    <div
                                                        class="flex flex-wrap items-center gap-2">
                                                        <span
                                                            :class="
                                                                getAnomalyTypeBadgeClass(
                                                                    item.type
                                                                )
                                                            ">
                                                            {{
                                                                getAnomalyTypeLabel(
                                                                    item.type
                                                                )
                                                            }}
                                                        </span>
                                                        <span
                                                            class="text-sm font-semibold text-slate-900">
                                                            {{
                                                                item.subjectCode
                                                            }}
                                                        </span>
                                                    </div>
                                                    <h3
                                                        class="text-lg font-semibold text-slate-900">
                                                        {{ item.title }}
                                                    </h3>
                                                    <p
                                                        class="text-sm leading-6 text-slate-600">
                                                        {{ item.summary }}
                                                    </p>
                                                </div>
                                                <div
                                                    class="text-sm leading-6 text-slate-500">
                                                    <p>
                                                        车次
                                                        {{
                                                            item.trainCodes.join(
                                                                ' / '
                                                            ) || '--'
                                                        }}
                                                    </p>
                                                    <p>
                                                        车组
                                                        {{
                                                            item.emuCodes.join(
                                                                ' / '
                                                            ) || '--'
                                                        }}
                                                    </p>
                                                </div>
                                            </div>

                                            <div class="grid gap-3">
                                                <div
                                                    v-for="route in item.routes"
                                                    :key="route.id"
                                                    class="rounded-[0.9rem] border border-slate-200 bg-slate-50/80 px-3.5 py-3">
                                                    <div
                                                        class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                                        <div class="space-y-1">
                                                            <p
                                                                class="text-sm font-semibold text-slate-900">
                                                                {{
                                                                    route.trainCode
                                                                }}
                                                                /
                                                                {{
                                                                    route.emuCode
                                                                }}
                                                            </p>
                                                            <p
                                                                class="text-sm text-slate-600">
                                                                {{
                                                                    route.startStation
                                                                }}
                                                                ->
                                                                {{
                                                                    route.endStation
                                                                }}
                                                            </p>
                                                        </div>
                                                        <div
                                                            class="text-sm leading-6 text-slate-500">
                                                            <p>
                                                                {{
                                                                    formatTimestamp(
                                                                        route.startAt
                                                                    )
                                                                }}
                                                            </p>
                                                            <p>
                                                                {{
                                                                    formatTimestamp(
                                                                        route.endAt
                                                                    )
                                                                }}
                                                            </p>
                                                            <p>
                                                                时长
                                                                {{
                                                                    formatDuration(
                                                                        route.durationSeconds
                                                                    )
                                                                }}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </article>
                                </div>

                                <UiEmptyState
                                    v-else
                                    eyebrow="No Findings"
                                    title="当天没有命中异常规则"
                                    description="当前规则下，未发现重联异常或单日短交路异常。" />
                            </template>
                        </div>
                    </UiCard>
                </div>
            </section>
        </div>

        <AppFooter />
    </main>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type {
    Admin12306RequestBucket,
    AdminAnomalyScanResponse,
    AdminAnomalyType,
    AdminPassiveAlertLevel,
    AdminPassiveAlertsResponse
} from '~/types/admin';
import type { TrackerApiResponse } from '~/types/homepage';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import formatShanghaiDateString from '~/utils/time/formatShanghaiDateString';
import formatTrackerTimestamp from '~/utils/time/formatTrackerTimestamp';

definePageMeta({
    middleware: 'admin-required'
});

const requestFetch = import.meta.server ? useRequestFetch() : $fetch;
const { session } = useAuthState();
const todayDateValue = formatShanghaiDateString(Math.floor(Date.now() / 1000));
const todayDateInputValue = toDateInputValue(todayDateValue);

const selectedDateInput = ref(todayDateInputValue);
const anomalyScanStatus = ref<'idle' | 'pending' | 'success' | 'error'>('idle');
const anomalyScanData = ref<AdminAnomalyScanResponse | null>(null);
const anomalyScanErrorMessage = ref('');

const selectedDateYmd = computed(() =>
    fromDateInputValue(selectedDateInput.value)
);
const isSelectedDateValid = computed(() =>
    /^\d{8}$/.test(selectedDateYmd.value)
);

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
    'admin-passive-alerts',
    () => fetchPassiveAlerts(selectedDateYmd.value),
    {
        watch: [selectedDateYmd]
    }
);

const passiveAlertsErrorMessage = computed(() =>
    passiveAlertsError.value
        ? getApiErrorMessage(passiveAlertsError.value, '加载被动告警失败。')
        : ''
);
const passiveLogFileLabel = computed(() => {
    const logFile = passiveAlertsData.value?.logFile;
    if (!logFile) {
        return '未找到对应日志文件';
    }

    return logFile.replace(/^.*[\\/]/, '');
});
const passiveAlertsItemCount = computed(
    () => passiveAlertsData.value?.items.length ?? 0
);
const requestBuckets = computed(
    () => passiveAlertsData.value?.requestBuckets ?? []
);
const requestPeakCount = computed(() =>
    requestBuckets.value.reduce(
        (maxValue, bucket) => Math.max(maxValue, bucket.total),
        0
    )
);
const requestTotalCount = computed(() =>
    requestBuckets.value.reduce((total, bucket) => total + bucket.total, 0)
);
const requestAxisLabels = computed(() => {
    return requestBuckets.value
        .filter((_, index) => index % 6 === 0)
        .map((bucket) => ({
            value: bucket.startAt,
            label: formatTimeLabel(bucket.startAt)
        }));
});
const anomalyCounts = computed(
    () =>
        anomalyScanData.value?.counts ?? [
            {
                type: 'train_multi_emu' as const,
                label: '车次重联异常',
                count: 0
            },
            {
                type: 'emu_single_short_route' as const,
                label: '车组短交路异常',
                count: 0
            }
        ]
);

watch(selectedDateYmd, () => {
    anomalyScanStatus.value = 'idle';
    anomalyScanData.value = null;
    anomalyScanErrorMessage.value = '';
});

useSiteSeo({
    title: '管理员异常检测 | Open CRH Tracker',
    description: '查看被动告警并按日期主动扫描异常日记录。',
    path: '/admin',
    noindex: true
});

async function runAnomalyScan() {
    if (!isSelectedDateValid.value || anomalyScanStatus.value === 'pending') {
        return;
    }

    anomalyScanStatus.value = 'pending';
    anomalyScanErrorMessage.value = '';

    try {
        const response = await requestFetch<
            TrackerApiResponse<AdminAnomalyScanResponse>
        >('/api/v1/admin/anomaly-scan', {
            retry: 0,
            query: {
                date: selectedDateYmd.value
            }
        });

        if (!response.ok) {
            throw {
                data: response
            };
        }

        anomalyScanData.value = response.data;
        anomalyScanStatus.value = 'success';
    } catch (error) {
        anomalyScanErrorMessage.value = getApiErrorMessage(
            error,
            '执行主动检测失败。'
        );
        anomalyScanStatus.value = 'error';
    }
}

async function goHome() {
    await navigateTo('/');
}

function toDateInputValue(value: string) {
    if (!/^\d{8}$/.test(value)) {
        return '';
    }

    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function fromDateInputValue(value: string) {
    return value.replaceAll('-', '');
}

function formatTimestamp(timestamp: number) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return '--';
    }

    return formatTrackerTimestamp(timestamp);
}

function formatTimeLabel(timestamp: number) {
    const formatted = formatTrackerTimestamp(timestamp);
    const timePart = formatted.split(' ')[1] ?? formatted;
    return timePart.slice(0, 5);
}

function formatDuration(seconds: number | null) {
    if (seconds === null || !Number.isFinite(seconds) || seconds < 0) {
        return '--';
    }

    const wholeMinutes = Math.floor(seconds / 60);
    const hours = Math.floor(wholeMinutes / 60);
    const minutes = wholeMinutes % 60;

    if (hours > 0) {
        return `${hours} 小时 ${minutes} 分钟`;
    }

    return `${minutes} 分钟`;
}

function getRequestBarHeight(bucket: Admin12306RequestBucket) {
    if (requestPeakCount.value <= 0) {
        return 0;
    }

    return Math.max(6, (bucket.total / requestPeakCount.value) * 100);
}

function getRequestBucketTitle(bucket: Admin12306RequestBucket) {
    const operationSummary = Object.entries(bucket.byOperation)
        .sort((left, right) => right[1] - left[1])
        .map(([operation, count]) => `${operation}: ${count}`)
        .join(', ');

    return (
        `${formatTimeLabel(bucket.startAt)} - ${formatTimeLabel(bucket.endAt)}: ${bucket.total}` +
        (operationSummary ? ` (${operationSummary})` : '')
    );
}

function getAlertLevelBadgeClass(level: AdminPassiveAlertLevel) {
    return level === 'ERROR'
        ? 'inline-flex items-center rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-rose-800'
        : 'inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-amber-800';
}

function getAnomalyTypeLabel(type: AdminAnomalyType) {
    return type === 'train_multi_emu' ? '车次重联异常' : '车组短交路异常';
}

function getAnomalyTypeBadgeClass(type: AdminAnomalyType) {
    return type === 'train_multi_emu'
        ? 'inline-flex items-center rounded-full bg-crh-blue/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-crh-blue'
        : 'inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-emerald-800';
}
</script>

<style scoped>
.admin-hero-card.admin-hero-card {
    border-color: rgba(191, 204, 216, 0.82);
    box-shadow:
        0 18px 40px -30px rgba(15, 23, 42, 0.28),
        0 8px 20px rgba(148, 163, 184, 0.14);
}

.request-chart {
    display: grid;
    grid-template-columns: repeat(48, minmax(0, 1fr));
    align-items: end;
    gap: 0.25rem;
    min-height: 12rem;
}

.request-chart__bar {
    min-height: 0.5rem;
    border-radius: 9999px 9999px 0.35rem 0.35rem;
    background: linear-gradient(
        180deg,
        rgba(0, 82, 155, 0.92) 0%,
        rgba(73, 126, 166, 0.72) 100%
    );
    box-shadow: 0 8px 18px -14px rgba(0, 82, 155, 0.75);
}
</style>
