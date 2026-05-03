<template>
    <AdminShell
        v-model:date-input="selectedDateInput"
        :today-date-input-value="todayDateInputValue"
        :session="session"
        title="12306 数据"
        description="查看某日的 12306 请求统计，并按车次追踪探测来源、判定路径和重联扫描结果。">
        <template #toolbar>
            <UiButton
                type="button"
                variant="secondary"
                :loading="isRefreshingPage"
                @click="refreshAll()">
                刷新数据
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
                                    12306 Data
                                </p>
                                <h2
                                    class="text-2xl font-semibold text-slate-900">
                                    当日请求统计
                                </h2>
                                <p class="text-sm leading-6 text-slate-700">
                                    按小时汇总所有实际外发的 12306
                                    请求，只记录请求类型和是否成功；默认保留
                                    {{
                                        requestStatsData?.retentionDays ??
                                        provenanceData?.retentionDays ??
                                        7
                                    }}
                                    天，并和前一天同小时对比。
                                </p>
                            </div>

                            <dl class="grid gap-3 sm:grid-cols-2">
                                <div
                                    class="rounded-[0.95rem] border border-white/80 bg-white/85 px-4 py-3">
                                    <dt
                                        class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                        对比日期
                                    </dt>
                                    <dd
                                        class="mt-2 text-sm font-semibold text-slate-900">
                                        {{
                                            requestStatsData?.compareDate ||
                                            '--'
                                        }}
                                    </dd>
                                </div>
                                <div
                                    class="rounded-[0.95rem] border border-white/80 bg-white/85 px-4 py-3">
                                    <dt
                                        class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                        最新统计时间
                                    </dt>
                                    <dd
                                        class="mt-2 text-sm font-semibold text-slate-900">
                                        {{
                                            formatTimestamp(
                                                requestStatsData?.asOf ?? 0
                                            )
                                        }}
                                    </dd>
                                </div>
                            </dl>
                        </div>
                    </div>

                    <div
                        v-if="requestStatsErrorMessage"
                        class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700">
                        {{ requestStatsErrorMessage }}
                    </div>

                    <div
                        v-else-if="
                            requestStatsStatus === 'pending' &&
                            !requestStatsData
                        "
                        class="space-y-3">
                        <div
                            v-for="index in 4"
                            :key="`train-request-stats-loading:${index}`"
                            class="h-28 animate-pulse rounded-[1rem] bg-slate-100/90" />
                    </div>

                    <UiEmptyState
                        v-else-if="
                            requestStatsData && !requestStatsData.enabled
                        "
                        eyebrow="已禁用"
                        title="12306 数据当前已关闭"
                        description="可在 config.json 中重新启用 trainProvenance 记录。" />

                    <template v-else-if="requestStatsData">
                        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            <div
                                class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                                <p
                                    class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                    当日总请求
                                </p>
                                <p
                                    class="mt-2 text-3xl font-semibold text-slate-900">
                                    {{
                                        formatNumber(
                                            requestStatsData.totals.total
                                        )
                                    }}
                                </p>
                                <p class="mt-2 text-xs text-slate-500">
                                    同比
                                    {{
                                        formatSignedNumber(
                                            requestStatsData.totals.totalDelta
                                        )
                                    }}
                                    /
                                    {{
                                        formatSignedPercent(
                                            requestStatsData.totals
                                                .totalChangeRatio
                                        )
                                    }}
                                </p>
                            </div>
                            <div
                                class="rounded-[1rem] border border-emerald-200 bg-emerald-50/80 px-4 py-4">
                                <p
                                    class="text-xs uppercase tracking-[0.18em] text-emerald-700">
                                    成功请求
                                </p>
                                <p
                                    class="mt-2 text-3xl font-semibold text-emerald-900">
                                    {{
                                        formatNumber(
                                            requestStatsData.totals.success
                                        )
                                    }}
                                </p>
                                <p class="mt-2 text-xs text-emerald-700">
                                    成功率
                                    {{
                                        formatPercent(
                                            requestStatsData.totals.successRate
                                        )
                                    }}
                                </p>
                            </div>
                            <div
                                class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4">
                                <p
                                    class="text-xs uppercase tracking-[0.18em] text-rose-700">
                                    失败请求
                                </p>
                                <p
                                    class="mt-2 text-3xl font-semibold text-rose-900">
                                    {{
                                        formatNumber(
                                            requestStatsData.totals.failure
                                        )
                                    }}
                                </p>
                                <p class="mt-2 text-xs text-rose-700">
                                    同比
                                    {{
                                        formatSignedNumber(
                                            requestStatsData.totals.failureDelta
                                        )
                                    }}
                                    /
                                    {{
                                        formatSignedPercent(
                                            requestStatsData.totals
                                                .failureChangeRatio
                                        )
                                    }}
                                </p>
                            </div>
                            <div
                                class="rounded-[1rem] border border-slate-200 bg-white/90 px-4 py-4">
                                <p
                                    class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                    前一日同日总量
                                </p>
                                <p
                                    class="mt-2 text-3xl font-semibold text-slate-900">
                                    {{
                                        formatNumber(
                                            requestStatsData.totals.compareTotal
                                        )
                                    }}
                                </p>
                                <p class="mt-2 text-xs text-slate-500">
                                    日期 {{ requestStatsData.compareDate }}
                                </p>
                            </div>
                        </div>

                        <div class="space-y-4">
                            <div class="space-y-1">
                                <p
                                    class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                                    Hourly
                                </p>
                                <h3
                                    class="text-xl font-semibold text-slate-900">
                                    每小时总请求量
                                </h3>
                                <p class="text-sm leading-6 text-slate-500">
                                    绿色为成功请求，红色为失败请求；悬停可查看该小时与前一天同小时的对比。
                                </p>
                            </div>

                            <div
                                class="rounded-[1rem] border border-slate-200 bg-slate-50/70 px-4 py-4">
                                <div
                                    class="grid h-40 items-end gap-2"
                                    :style="{
                                        gridTemplateColumns: `repeat(${Math.max(requestHourBuckets.length, 1)}, minmax(0, 1fr))`
                                    }">
                                    <div
                                        v-for="bucket in requestHourBuckets"
                                        :key="`request-hour:${bucket.hour}`"
                                        class="flex h-full min-w-0 items-end"
                                        :title="getRequestBucketTitle(bucket)">
                                        <div
                                            class="flex w-full flex-col justify-end overflow-hidden bg-slate-200/75"
                                            :style="{
                                                height: `${getRequestHourBarHeight(bucket.total, requestPeakTotal)}%`
                                            }">
                                            <div
                                                class="bg-rose-300/90"
                                                :style="{
                                                    height: `${getRequestStackSegmentHeight(bucket.failure, bucket.total)}%`
                                                }" />
                                            <div
                                                class="bg-emerald-400/90"
                                                :style="{
                                                    height: `${getRequestStackSegmentHeight(bucket.success, bucket.total)}%`
                                                }" />
                                        </div>
                                    </div>
                                </div>

                                <div
                                    class="mt-3 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                                    <span
                                        v-for="label in requestChartAxisLabels"
                                        :key="`request-axis:${label.value}`">
                                        {{ label.label }}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div class="space-y-4">
                            <div class="space-y-1">
                                <p
                                    class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                                    Types
                                </p>
                                <h3
                                    class="text-xl font-semibold text-slate-900">
                                    按请求类型拆分
                                </h3>
                            </div>

                            <div class="grid gap-4 xl:grid-cols-2">
                                <UiCard
                                    v-for="summary in requestTypeSummaries"
                                    :key="summary.type"
                                    :show-accent-bar="false"
                                    class="border border-slate-200">
                                    <div class="space-y-5">
                                        <div
                                            class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                            <div class="space-y-1">
                                                <p
                                                    class="text-xs font-semibold uppercase tracking-[0.22em]"
                                                    :class="
                                                        getRequestTypeAccentClass(
                                                            summary.type
                                                        )
                                                    ">
                                                    {{
                                                        getRequestTypeEyebrow(
                                                            summary.type
                                                        )
                                                    }}
                                                </p>
                                                <h3
                                                    class="text-xl font-semibold text-slate-900">
                                                    {{
                                                        getRequestTypeLabel(
                                                            summary.type
                                                        )
                                                    }}
                                                </h3>
                                            </div>

                                            <div
                                                class="text-left md:text-right">
                                                <p
                                                    class="text-3xl font-semibold text-slate-900">
                                                    {{
                                                        formatNumber(
                                                            summary.total
                                                        )
                                                    }}
                                                </p>
                                                <p
                                                    class="mt-1 text-xs text-slate-500">
                                                    成功率
                                                    {{
                                                        formatPercent(
                                                            summary.successRate
                                                        )
                                                    }}
                                                </p>
                                            </div>
                                        </div>

                                        <div
                                            class="grid gap-3 rounded-[1rem] border border-slate-200 bg-slate-50/70 px-4 py-4 sm:grid-cols-3">
                                            <div>
                                                <p
                                                    class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                                    成功
                                                </p>
                                                <p
                                                    class="mt-2 text-lg font-semibold text-emerald-800">
                                                    {{
                                                        formatNumber(
                                                            summary.success
                                                        )
                                                    }}
                                                </p>
                                            </div>
                                            <div>
                                                <p
                                                    class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                                    失败
                                                </p>
                                                <p
                                                    class="mt-2 text-lg font-semibold text-rose-800">
                                                    {{
                                                        formatNumber(
                                                            summary.failure
                                                        )
                                                    }}
                                                </p>
                                            </div>
                                            <div>
                                                <p
                                                    class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                                    同比
                                                </p>
                                                <p
                                                    class="mt-2 text-lg font-semibold text-slate-900">
                                                    {{
                                                        formatSignedNumber(
                                                            summary.totalDelta
                                                        )
                                                    }}
                                                </p>
                                                <p
                                                    class="mt-1 text-xs text-slate-500">
                                                    {{
                                                        formatSignedPercent(
                                                            summary.totalChangeRatio
                                                        )
                                                    }}
                                                </p>
                                            </div>
                                        </div>

                                        <div
                                            class="rounded-[1rem] border border-slate-200 bg-white/90 px-4 py-4">
                                            <div
                                                class="grid h-32 items-end gap-2"
                                                :style="{
                                                    gridTemplateColumns: `repeat(${Math.max(requestHourBuckets.length, 1)}, minmax(0, 1fr))`
                                                }">
                                                <div
                                                    v-for="bucket in requestHourBuckets"
                                                    :key="`${summary.type}:${bucket.hour}`"
                                                    class="flex h-full min-w-0 items-end"
                                                    :title="
                                                        getRequestTypeBucketTitle(
                                                            bucket,
                                                            summary.type
                                                        )
                                                    ">
                                                    <div
                                                        class="flex w-full flex-col justify-end overflow-hidden bg-slate-200/75"
                                                        :style="{
                                                            height: `${getRequestHourBarHeight(getRequestTypeBucket(bucket, summary.type).total, getRequestTypePeakTotal(summary.type))}%`
                                                        }">
                                                        <div
                                                            class="bg-rose-300/90"
                                                            :style="{
                                                                height: `${getRequestStackSegmentHeight(getRequestTypeBucket(bucket, summary.type).failure, getRequestTypeBucket(bucket, summary.type).total)}%`
                                                            }" />
                                                        <div
                                                            class="bg-emerald-400/90"
                                                            :style="{
                                                                height: `${getRequestStackSegmentHeight(getRequestTypeBucket(bucket, summary.type).success, getRequestTypeBucket(bucket, summary.type).total)}%`
                                                            }" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </UiCard>
                            </div>
                        </div>
                    </template>
                </div>
            </UiCard>

            <UiCard :show-accent-bar="false">
                <div class="space-y-6">
                    <div class="space-y-2">
                        <p
                            class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                            Provenance
                        </p>
                        <h2 class="text-2xl font-semibold text-slate-900">
                            按车次查看来源追踪
                        </h2>
                        <p class="text-sm leading-6 text-slate-600">
                            输入车次后，可以查看该车次在所选日期的探测来源、判定路径和重联扫描结果。
                        </p>
                    </div>

                    <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                        <UiField
                            label="车次号"
                            help="支持直接输入标准车次号，提交后会按当天已记录的来源事件查询。">
                            <input
                                v-model="trainCodeInput"
                                type="text"
                                inputmode="text"
                                autocomplete="off"
                                class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark"
                                placeholder="例如 G1"
                                @keydown.enter.prevent="submitSearch" />
                        </UiField>

                        <div class="flex items-end justify-end gap-3">
                            <UiButton
                                type="button"
                                variant="secondary"
                                :disabled="
                                    normalizedTrainCodeInput.length === 0
                                "
                                @click="clearSearch">
                                清空
                            </UiButton>
                            <UiButton
                                type="button"
                                :loading="isSubmittingSearch"
                                @click="submitSearch">
                                查询
                            </UiButton>
                        </div>
                    </div>
                </div>
            </UiCard>

            <UiCard :show-accent-bar="false">
                <div class="space-y-6">
                    <div
                        v-if="!normalizedTrainCodeQuery"
                        class="py-8">
                        <UiEmptyState
                            eyebrow="待查询"
                            title="请输入车次号"
                            description="输入车次号后，可以查看该车次在所选日期的探测来源和判定过程。" />
                    </div>

                    <div
                        v-else-if="
                            provenanceStatus === 'pending' && !provenanceData
                        "
                        class="space-y-3">
                        <div
                            v-for="index in 4"
                            :key="`train-provenance-loading:${index}`"
                            class="h-24 animate-pulse rounded-[1rem] bg-slate-100/90" />
                    </div>

                    <UiEmptyState
                        v-else-if="provenanceErrorMessage"
                        eyebrow="加载失败"
                        title="来源追踪加载失败"
                        :description="provenanceErrorMessage"
                        tone="danger">
                        <UiButton
                            type="button"
                            variant="secondary"
                            @click="refreshProvenance()">
                            重试
                        </UiButton>
                    </UiEmptyState>

                    <UiEmptyState
                        v-else-if="provenanceData && !provenanceData.enabled"
                        eyebrow="已禁用"
                        title="来源追踪当前已关闭"
                        description="可在 config.json 中重新启用 trainProvenance 记录。" />

                    <UiEmptyState
                        v-else-if="departureItems.length === 0"
                        eyebrow="无记录"
                        title="没有找到来源记录"
                        description="当前日期和车次下还没有可展示的来源事件。" />

                    <template v-else>
                        <div class="space-y-3">
                            <div class="space-y-1">
                                <p
                                    class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                                    Departures
                                </p>
                                <h3
                                    class="text-xl font-semibold text-slate-900">
                                    当日班次
                                </h3>
                            </div>

                            <div class="grid gap-3 lg:grid-cols-2">
                                <button
                                    v-for="item in departureItems"
                                    :key="item.startAt"
                                    type="button"
                                    class="rounded-[1rem] border px-4 py-4 text-left transition"
                                    :class="
                                        activeStartAt === item.startAt
                                            ? 'border-crh-blue/30 bg-blue-50/80'
                                            : 'border-slate-200 bg-white/90 hover:border-slate-300 hover:bg-slate-50/80'
                                    "
                                    @click="selectDeparture(item.startAt)">
                                    <div class="space-y-3">
                                        <div
                                            class="flex flex-wrap items-center justify-between gap-3">
                                            <div class="space-y-1">
                                                <p
                                                    class="text-sm font-semibold text-slate-900">
                                                    {{
                                                        formatTimestamp(
                                                            item.startAt
                                                        )
                                                    }}
                                                </p>
                                                <p
                                                    class="text-sm text-slate-600">
                                                    {{
                                                        item.startStation ||
                                                        '--'
                                                    }}
                                                    至
                                                    {{
                                                        item.endStation || '--'
                                                    }}
                                                </p>
                                            </div>
                                            <span
                                                :class="
                                                    getDepartureStatusBadgeClass(
                                                        item.latestStatus
                                                    )
                                                ">
                                                {{
                                                    getDepartureStatusLabel(
                                                        item.latestStatus
                                                    )
                                                }}
                                            </span>
                                        </div>

                                        <p
                                            class="text-sm leading-6 text-slate-600">
                                            车组：
                                            {{
                                                item.emuCodes.length > 0
                                                    ? item.emuCodes.join(' / ')
                                                    : '--'
                                            }}
                                        </p>
                                    </div>
                                </button>
                            </div>
                        </div>

                        <div class="space-y-3">
                            <div class="space-y-1">
                                <p
                                    class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                                    Timeline
                                </p>
                                <h3
                                    class="text-xl font-semibold text-slate-900">
                                    来源时间线
                                </h3>
                            </div>

                            <UiEmptyState
                                v-if="activeStartAt === null"
                                eyebrow="请选择班次"
                                title="先选择一个班次"
                                description="如果同日同车次存在多条记录，需要先选定具体发车时间。" />

                            <UiEmptyState
                                v-else-if="timelineItems.length === 0"
                                eyebrow="无事件"
                                title="该班次暂无来源事件"
                                description="当前班次存在记录，但时间线里还没有可展示的来源事件。" />

                            <div
                                v-else
                                class="space-y-3">
                                <article
                                    v-for="item in timelineItems"
                                    :key="item.id"
                                    class="rounded-[1rem] border border-slate-200 bg-white/90 px-4 py-4 shadow-sm">
                                    <div class="space-y-4">
                                        <div
                                            class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                            <div class="space-y-2">
                                                <div
                                                    class="flex flex-wrap items-center gap-2">
                                                    <span
                                                        :class="
                                                            getTaskStatusBadgeClass(
                                                                item.taskStatus
                                                            )
                                                        ">
                                                        {{ item.taskStatus }}
                                                    </span>
                                                    <span
                                                        class="text-sm font-medium text-slate-500">
                                                        {{ item.executor }}
                                                    </span>
                                                </div>
                                                <h4
                                                    class="text-base font-semibold text-slate-900">
                                                    {{ item.summary }}
                                                </h4>
                                                <p
                                                    class="text-sm leading-6 text-slate-600">
                                                    事件：{{ item.eventType }}
                                                    <span
                                                        v-if="item.result"
                                                        class="text-slate-400">
                                                        /
                                                        {{
                                                            getEventResultLabel(
                                                                item.result
                                                            )
                                                        }}
                                                    </span>
                                                </p>
                                            </div>

                                            <div
                                                class="text-sm leading-6 text-slate-500">
                                                <p>
                                                    {{
                                                        formatTimestamp(
                                                            item.createdAt
                                                        )
                                                    }}
                                                </p>
                                                <p>
                                                    任务 #{{
                                                        item.schedulerTaskId
                                                    }}
                                                </p>
                                                <p v-if="item.emuCode">
                                                    车组：{{ item.emuCode }}
                                                </p>
                                                <p v-if="item.relatedTrainCode">
                                                    关联车次：{{
                                                        item.relatedTrainCode
                                                    }}
                                                </p>
                                            </div>
                                        </div>

                                        <div
                                            class="flex flex-wrap items-center gap-3">
                                            <UiButton
                                                v-if="
                                                    getCouplingScanActionTaskRunId(
                                                        item
                                                    ) !== null
                                                "
                                                type="button"
                                                variant="secondary"
                                                size="sm"
                                                @click="
                                                    openCouplingScanDetailForEvent(
                                                        item
                                                    )
                                                ">
                                                {{
                                                    getCouplingScanActionLabel(
                                                        item
                                                    )
                                                }}
                                            </UiButton>
                                            <span
                                                v-if="
                                                    getLinkedTaskHintText(item)
                                                "
                                                :aria-label="
                                                    getLinkedTaskHintText(item)
                                                "
                                                class="inline-flex items-center rounded-full bg-slate-100 px-3 py-1.5 text-[0px] font-medium text-slate-600">
                                                <span class="text-xs">
                                                    {{
                                                        getLinkedTaskHintText(
                                                            item
                                                        )
                                                    }}
                                                </span>
                                                扫描已排队：#{{
                                                    item.linkedSchedulerTaskId
                                                }}
                                            </span>
                                        </div>

                                        <div
                                            v-if="
                                                item.conflictDetail &&
                                                item.conflictDetail
                                                    .conflictGroups.length > 0
                                            "
                                            class="rounded-[0.875rem] border border-amber-200 bg-amber-50/70 px-4 py-4">
                                            <div class="space-y-3">
                                                <div
                                                    class="flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
                                                    <p
                                                        class="text-sm font-semibold text-slate-900">
                                                        冲突对象
                                                    </p>
                                                    <p
                                                        v-if="
                                                            item.conflictDetail
                                                                .currentGroup
                                                        "
                                                        class="text-xs leading-5 text-slate-500">
                                                        当前班次：{{
                                                            formatConflictCurrentGroup(
                                                                item
                                                                    .conflictDetail
                                                                    .currentGroup
                                                            )
                                                        }}
                                                    </p>
                                                </div>

                                                <article
                                                    v-for="(
                                                        conflictGroup, index
                                                    ) in item.conflictDetail
                                                        .conflictGroups"
                                                    :key="`${item.id}:conflict:${index}`"
                                                    class="rounded-[0.75rem] border border-white/80 bg-white/90 px-3 py-3">
                                                    <div
                                                        class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                                        <div class="space-y-2">
                                                            <div
                                                                class="flex flex-wrap items-center gap-2">
                                                                <p
                                                                    class="text-sm font-semibold text-slate-900">
                                                                    {{
                                                                        formatConflictTrainCodes(
                                                                            conflictGroup.trainCodes
                                                                        )
                                                                    }}
                                                                </p>
                                                                <span
                                                                    :class="
                                                                        getConflictStateBadgeClass(
                                                                            conflictGroup.state
                                                                        )
                                                                    ">
                                                                    {{
                                                                        getConflictStateLabel(
                                                                            conflictGroup.state
                                                                        )
                                                                    }}
                                                                </span>
                                                            </div>
                                                            <p
                                                                class="text-sm leading-6 text-slate-600">
                                                                {{
                                                                    formatConflictStations(
                                                                        conflictGroup.startStation,
                                                                        conflictGroup.endStation
                                                                    )
                                                                }}
                                                            </p>
                                                        </div>

                                                        <div
                                                            class="text-sm leading-6 text-slate-500">
                                                            <p>
                                                                该车次：{{
                                                                    formatConflictTimeRange(
                                                                        conflictGroup.startAt,
                                                                        conflictGroup.endAt
                                                                    )
                                                                }}
                                                            </p>
                                                            <p>
                                                                重叠：{{
                                                                    formatConflictTimeRange(
                                                                        conflictGroup.overlapStartAt,
                                                                        conflictGroup.overlapEndAt
                                                                    )
                                                                }}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </article>
                                            </div>
                                        </div>

                                        <div
                                            v-if="item.historicalReuse"
                                            class="rounded-[0.875rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                                            <div class="space-y-3">
                                                <div
                                                    class="flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
                                                    <p
                                                        class="text-sm font-semibold text-slate-900">
                                                        历史复用
                                                    </p>
                                                    <p
                                                        class="text-xs leading-5 text-slate-500">
                                                        结果：{{
                                                            getHistoricalReuseResultLabel(
                                                                item
                                                                    .historicalReuse
                                                                    .resultStatus
                                                            )
                                                        }}
                                                    </p>
                                                </div>

                                                <p
                                                    class="text-sm leading-6 text-slate-600">
                                                    车组：{{
                                                        formatEmuCodeList(
                                                            item.historicalReuse
                                                                .emuCodes
                                                        )
                                                    }}
                                                </p>

                                                <div
                                                    v-if="
                                                        item.historicalReuse
                                                            .historicalRoute
                                                    "
                                                    class="rounded-[0.75rem] border border-white/80 bg-white/90 px-3 py-3">
                                                    <p
                                                        class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                                        复用的历史车次
                                                    </p>
                                                    <p
                                                        class="mt-1 text-sm font-semibold text-slate-900">
                                                        {{
                                                            formatRouteSnapshotTrainCodes(
                                                                item
                                                                    .historicalReuse
                                                                    .historicalRoute
                                                            )
                                                        }}
                                                    </p>
                                                    <p
                                                        class="text-sm leading-6 text-slate-600">
                                                        {{
                                                            formatRouteSnapshotSchedule(
                                                                item
                                                                    .historicalReuse
                                                                    .historicalRoute
                                                            )
                                                        }}
                                                    </p>
                                                    <p
                                                        class="text-sm leading-6 text-slate-600">
                                                        {{
                                                            formatRouteSnapshotStations(
                                                                item
                                                                    .historicalReuse
                                                                    .historicalRoute
                                                            )
                                                        }}
                                                    </p>
                                                    <p
                                                        v-if="
                                                            item.historicalReuse
                                                                .historicalRoute
                                                                .cacheNote
                                                        "
                                                        class="text-xs leading-5"
                                                        :class="
                                                            getRouteSnapshotNoteClass(
                                                                item
                                                                    .historicalReuse
                                                                    .historicalRoute
                                                            )
                                                        ">
                                                        {{
                                                            item.historicalReuse
                                                                .historicalRoute
                                                                .cacheNote
                                                        }}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div
                                            v-if="item.coupledResolution"
                                            class="rounded-[0.875rem] border border-blue-200 bg-blue-50/70 px-4 py-4">
                                            <div class="space-y-3">
                                                <div
                                                    class="flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
                                                    <p
                                                        class="text-sm font-semibold text-slate-900">
                                                        重联判定
                                                    </p>
                                                    <p
                                                        v-if="
                                                            item
                                                                .coupledResolution
                                                                .upgradedFromSingle
                                                        "
                                                        class="text-xs leading-5 text-blue-700">
                                                        由单组升级
                                                    </p>
                                                </div>

                                                <p
                                                    class="text-sm leading-6 text-slate-600">
                                                    判定为：{{
                                                        formatEmuCodeList(
                                                            item
                                                                .coupledResolution
                                                                .emuCodes
                                                        )
                                                    }}
                                                </p>

                                                <div
                                                    v-if="
                                                        item.coupledResolution
                                                            .route
                                                    "
                                                    class="rounded-[0.75rem] border border-white/80 bg-white/90 px-3 py-3">
                                                    <p
                                                        class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                                        当前班次
                                                    </p>
                                                    <p
                                                        class="mt-1 text-sm font-semibold text-slate-900">
                                                        {{
                                                            formatRouteSnapshotTrainCodes(
                                                                item
                                                                    .coupledResolution
                                                                    .route
                                                            )
                                                        }}
                                                    </p>
                                                    <p
                                                        class="text-sm leading-6 text-slate-600">
                                                        {{
                                                            formatRouteSnapshotSchedule(
                                                                item
                                                                    .coupledResolution
                                                                    .route
                                                            )
                                                        }}
                                                    </p>
                                                    <p
                                                        class="text-sm leading-6 text-slate-600">
                                                        {{
                                                            formatRouteSnapshotStations(
                                                                item
                                                                    .coupledResolution
                                                                    .route
                                                            )
                                                        }}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </article>
                            </div>
                        </div>
                    </template>
                </div>
            </UiCard>

            <UiCard :show-accent-bar="false">
                <div class="space-y-6">
                    <div class="space-y-2">
                        <p
                            class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                            Coupling Tasks
                        </p>
                        <h2 class="text-2xl font-semibold text-slate-900">
                            当日重联扫描任务
                        </h2>
                        <p class="text-sm leading-6 text-slate-600">
                            展示所选日期的全部重联扫描任务，按开始时间升序排列，并可直接查看扫描详情。
                        </p>
                    </div>

                    <div
                        v-if="
                            couplingScanTaskListData &&
                            couplingScanTaskListData.enabled &&
                            couplingScanTaskItems.length > 0
                        "
                        class="grid gap-4 md:grid-cols-2">
                        <UiField
                            label="路局"
                            help="先选择路局，再按车型筛选任务。">
                            <UiSelect
                                v-model="selectedCouplingTaskBureau"
                                :options="couplingTaskBureauOptions"
                                placeholder="请选择路局"
                                mobile-sheet-title="选择路局"
                                mobile-sheet-eyebrow="BUREAU" />
                        </UiField>

                        <UiField
                            label="车型"
                            help="默认不渲染全部任务，需选定车型后再显示列表。">
                            <UiSelect
                                v-model="selectedCouplingTaskModel"
                                :disabled="
                                    couplingTaskModelOptions.length === 0
                                "
                                :options="couplingTaskModelOptions"
                                placeholder="请选择车型"
                                mobile-sheet-title="选择车型"
                                mobile-sheet-eyebrow="MODEL" />
                        </UiField>
                    </div>

                    <div
                        v-if="
                            couplingScanTaskListStatus === 'pending' &&
                            !couplingScanTaskListData
                        "
                        class="space-y-3">
                        <div
                            v-for="index in 4"
                            :key="`coupling-scan-task-list-loading:${index}`"
                            class="h-24 animate-pulse rounded-[1rem] bg-slate-100/90" />
                    </div>

                    <UiEmptyState
                        v-else-if="couplingScanTaskListErrorMessage"
                        eyebrow="加载失败"
                        title="重联扫描任务加载失败"
                        :description="couplingScanTaskListErrorMessage"
                        tone="danger">
                        <UiButton
                            type="button"
                            variant="secondary"
                            @click="refreshCouplingScanTaskList()">
                            重试
                        </UiButton>
                    </UiEmptyState>

                    <UiEmptyState
                        v-else-if="
                            couplingScanTaskListData &&
                            !couplingScanTaskListData.enabled
                        "
                        eyebrow="已禁用"
                        title="重联扫描记录当前已关闭"
                        description="可在 config.json 中重新启用 trainProvenance 记录。" />

                    <UiEmptyState
                        v-else-if="couplingScanTaskItems.length === 0"
                        eyebrow="无任务"
                        title="当天没有重联扫描任务"
                        description="当前日期下还没有可展示的重联扫描任务记录。" />

                    <UiEmptyState
                        v-else-if="!isCouplingTaskFilterReady"
                        eyebrow="待筛选"
                        title="请选择路局和车型"
                        description="为了避免一次渲染全部任务，请先选择一个路局和车型组合。" />

                    <UiEmptyState
                        v-else-if="filteredCouplingScanTaskItems.length === 0"
                        eyebrow="无匹配"
                        title="没有符合筛选条件的任务"
                        description="当前日期下没有匹配该路局和车型的重联扫描任务。" />

                    <div
                        v-else
                        class="space-y-3">
                        <article
                            v-for="item in filteredCouplingScanTaskItems"
                            :key="item.taskRunId"
                            class="rounded-[1rem] border border-slate-200 bg-white/90 px-4 py-4 shadow-sm">
                            <div class="space-y-4">
                                <div
                                    class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <div class="space-y-2">
                                        <div
                                            class="flex flex-wrap items-center gap-2">
                                            <span
                                                :class="
                                                    getTaskStatusBadgeClass(
                                                        item.status
                                                    )
                                                ">
                                                {{
                                                    getTaskStatusLabel(
                                                        item.status
                                                    )
                                                }}
                                            </span>
                                            <span
                                                class="text-sm font-medium text-slate-500">
                                                {{ item.executor }}
                                            </span>
                                        </div>
                                        <h3
                                            class="text-lg font-semibold text-slate-900">
                                            {{
                                                item.bureau || '--'
                                            }}
                                            /
                                            {{
                                                item.model || '--'
                                            }}
                                        </h3>
                                        <p
                                            class="text-sm leading-6 text-slate-600">
                                            扫描任务 #{{
                                                item.schedulerTaskId
                                            }}
                                        </p>
                                    </div>

                                    <div
                                        class="text-sm leading-6 text-slate-500 lg:text-right">
                                        <p>
                                            开始：{{
                                                formatTimestamp(
                                                    item.startedAt
                                                )
                                            }}
                                        </p>
                                        <p>
                                            结束：{{
                                                formatTimestamp(
                                                    item.finishedAt ?? 0
                                                )
                                            }}
                                        </p>
                                        <p>
                                            Task Run #{{ item.taskRunId }}
                                        </p>
                                    </div>
                                </div>

                                <div class="flex flex-wrap items-center gap-3">
                                    <UiButton
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        @click="
                                            openCouplingScanDetail(
                                                item.taskRunId
                                            )
                                        ">
                                        查看详情
                                    </UiButton>
                                </div>
                            </div>
                        </article>
                    </div>
                </div>
            </UiCard>
        </div>

        <component
            :is="isMobileActionSheet ? UiBottomSheet : UiModal"
            :model-value="isCouplingDetailDialogOpen"
            eyebrow="重联扫描"
            title="扫描结果"
            description="查看本次重联扫描的全部候选结果。"
            size="lg"
            :close-on-backdrop="couplingDetailStatus !== 'pending'"
            @update:model-value="handleCouplingDetailDialogVisibilityChange">
            <div class="space-y-4">
                <div
                    v-if="couplingDetailStatus === 'pending'"
                    class="space-y-3">
                    <div
                        v-for="index in 3"
                        :key="`coupling-detail-loading:${index}`"
                        class="h-20 animate-pulse rounded-[1rem] bg-slate-100/90" />
                </div>

                <p
                    v-else-if="couplingDetailErrorMessage"
                    class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700">
                    {{ couplingDetailErrorMessage }}
                </p>

                <UiEmptyState
                    v-else-if="
                        couplingDetailData &&
                        couplingDetailData.candidates.length === 0
                    "
                    eyebrow="无候选"
                    title="本次扫描没有候选结果"
                    description="任务存在，但当前没有可展示的候选扫描明细。" />

                <template v-else-if="couplingDetailData">
                    <div
                        class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-700">
                        <p>
                            扫描任务 #{{
                                couplingDetailData.taskRun?.schedulerTaskId ??
                                '--'
                            }}
                        </p>
                        <p>
                            状态：{{
                                couplingDetailData.taskRun?.status ?? '--'
                            }}
                        </p>
                        <p>
                            开始：{{
                                formatTimestamp(
                                    couplingDetailData.taskRun?.startedAt ?? 0
                                )
                            }}
                        </p>
                    </div>

                    <div class="space-y-3">
                        <article
                            v-for="item in couplingDetailData.candidates"
                            :key="item.id"
                            class="rounded-[1rem] border border-slate-200 bg-white/90 px-4 py-4">
                            <div class="space-y-4">
                                <div
                                    class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <div class="space-y-2">
                                        <div
                                            class="flex flex-wrap items-center gap-2">
                                            <span
                                                :class="
                                                    getCandidateStatusBadgeClass(
                                                        item.status
                                                    )
                                                ">
                                                {{
                                                    getCandidateStatusLabel(
                                                        item.status
                                                    )
                                                }}
                                            </span>
                                            <span
                                                class="text-sm font-semibold text-slate-900">
                                                {{ item.candidateEmuCode }}
                                            </span>
                                        </div>
                                        <p
                                            class="text-sm leading-6 text-slate-600">
                                            原因：{{ item.reason || '--' }}
                                        </p>
                                    </div>

                                    <div
                                        class="text-sm leading-6 text-slate-500">
                                        <p>#{{ item.candidateOrder }}</p>
                                        <p>
                                            {{
                                                formatTimestamp(item.createdAt)
                                            }}
                                        </p>
                                    </div>
                                </div>

                                <div
                                    v-if="item.scannedRoute"
                                    class="rounded-[0.875rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                                    <p
                                        class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                        扫描到的车次
                                    </p>
                                    <p
                                        class="mt-1 text-sm font-semibold text-slate-900">
                                        {{
                                            formatRouteSnapshotTrainCodes(
                                                item.scannedRoute
                                            )
                                        }}
                                    </p>
                                    <p class="text-sm leading-6 text-slate-600">
                                        {{
                                            formatRouteSnapshotSchedule(
                                                item.scannedRoute
                                            )
                                        }}
                                    </p>
                                    <p class="text-sm leading-6 text-slate-600">
                                        {{
                                            formatRouteSnapshotStations(
                                                item.scannedRoute
                                            )
                                        }}
                                    </p>
                                    <p
                                        v-if="item.scannedRoute.internalCode"
                                        class="text-xs leading-5 text-slate-500">
                                        trainNo:
                                        {{ item.scannedRoute.internalCode }}
                                    </p>
                                    <p
                                        v-if="item.trainRepeat"
                                        class="text-xs leading-5 text-slate-500">
                                        trainRepeat: {{ item.trainRepeat }}
                                    </p>
                                    <p
                                        v-if="item.scannedRoute.cacheNote"
                                        class="text-xs leading-5"
                                        :class="
                                            getRouteSnapshotNoteClass(
                                                item.scannedRoute
                                            )
                                        ">
                                        {{ item.scannedRoute.cacheNote }}
                                    </p>
                                </div>

                                <div
                                    v-if="item.matchedRoute"
                                    class="rounded-[0.875rem] border border-emerald-200 bg-emerald-50/70 px-4 py-4">
                                    <p
                                        class="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                                        当前追踪车次
                                    </p>
                                    <p
                                        class="mt-1 text-sm font-semibold text-slate-900">
                                        {{
                                            formatRouteSnapshotTrainCodes(
                                                item.matchedRoute
                                            )
                                        }}
                                    </p>
                                    <p class="text-sm leading-6 text-slate-600">
                                        {{
                                            formatRouteSnapshotSchedule(
                                                item.matchedRoute
                                            )
                                        }}
                                    </p>
                                    <p class="text-sm leading-6 text-slate-600">
                                        {{
                                            formatRouteSnapshotStations(
                                                item.matchedRoute
                                            )
                                        }}
                                    </p>
                                </div>

                                <div
                                    v-if="item.occupiedRoutes.length > 0"
                                    class="rounded-[0.875rem] border border-amber-200 bg-amber-50/70 px-4 py-4">
                                    <div class="space-y-3">
                                        <p
                                            class="text-sm font-semibold text-slate-900">
                                            今日占用情况
                                        </p>
                                        <article
                                            v-for="(
                                                occupiedRoute, occupiedIndex
                                            ) in item.occupiedRoutes"
                                            :key="`${item.id}:occupied:${occupiedIndex}`"
                                            class="rounded-[0.75rem] border border-white/80 bg-white/90 px-3 py-3">
                                            <p
                                                class="text-sm font-semibold text-slate-900">
                                                {{
                                                    formatRouteSnapshotTrainCodes(
                                                        occupiedRoute
                                                    )
                                                }}
                                            </p>
                                            <p
                                                class="text-sm leading-6 text-slate-600">
                                                {{
                                                    formatRouteSnapshotSchedule(
                                                        occupiedRoute
                                                    )
                                                }}
                                            </p>
                                            <p
                                                class="text-sm leading-6 text-slate-600">
                                                {{
                                                    formatRouteSnapshotStations(
                                                        occupiedRoute
                                                    )
                                                }}
                                            </p>
                                        </article>
                                    </div>
                                </div>
                            </div>
                        </article>
                    </div>
                </template>
            </div>
        </component>
    </AdminShell>
</template>

<script setup lang="ts">
import UiBottomSheet from '~/components/ui/UiBottomSheet.vue';
import UiModal from '~/components/ui/UiModal.vue';
import { useAdminDateQuery } from '~/composables/useAdminDateQuery';
import type {
    AdminCouplingScanDetailResponse,
    AdminCouplingScanTaskListItem,
    AdminCouplingScanTaskListResponse,
    AdminTrainDataRequestHourBucket,
    AdminTrainDataRequestStatsResponse,
    AdminTrainDataRequestType,
    AdminTrainDataRequestTypeSummary,
    AdminTrainProvenanceConflictCurrentGroup,
    AdminTrainProvenanceConflictState,
    AdminTrainProvenanceDeparture,
    AdminTrainProvenanceEvent,
    AdminTrainProvenanceLatestStatus,
    AdminTrainProvenanceResponse,
    AdminTrainRouteSnapshot,
    AdminTrainProvenanceTaskRunStatus
} from '~/types/admin';
import type { TrackerApiResponse } from '~/types/homepage';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import formatShanghaiTime from '~/utils/time/formatShanghaiTime';
import formatTrackerTimestamp from '~/utils/time/formatTrackerTimestamp';

definePageMeta({
    middleware: 'admin-required'
});

const MOBILE_QUERY = '(max-width: 767px)';
const requestFetch = import.meta.server ? useRequestFetch() : $fetch;
const route = useRoute();
const router = useRouter();
const { session } = useAuthState();
const { selectedDateInput, selectedDateYmd, todayDateInputValue } =
    await useAdminDateQuery();
const EMPTY_REQUEST_METRICS = {
    total: 0,
    success: 0,
    failure: 0,
    successRate: null,
    compareTotal: 0,
    compareSuccess: 0,
    compareFailure: 0,
    totalDelta: 0,
    successDelta: 0,
    failureDelta: 0,
    totalChangeRatio: null,
    successChangeRatio: null,
    failureChangeRatio: null
} satisfies Omit<AdminTrainDataRequestTypeSummary, 'type'>;

const trainCodeInput = ref(readQueryString(route.query.trainCode));
const isSubmittingSearch = ref(false);
const isCouplingDetailDialogOpen = ref(false);
const selectedCouplingTaskBureau = ref('');
const selectedCouplingTaskModel = ref('');
const couplingDetailStatus = ref<'idle' | 'pending' | 'success' | 'error'>(
    'idle'
);
const couplingDetailData = ref<AdminCouplingScanDetailResponse | null>(null);
const couplingDetailErrorMessage = ref('');
const isMobileActionSheet = ref(false);
const dialogMediaQuery = ref<MediaQueryList | null>(null);

const normalizedTrainCodeInput = computed(() =>
    trainCodeInput.value.trim().toUpperCase()
);
const normalizedTrainCodeQuery = computed(() =>
    readQueryString(route.query.trainCode).trim().toUpperCase()
);
const requestedStartAt = computed<number | null>(() => {
    const rawValue = readQueryString(route.query.startAt);
    if (!/^\d+$/.test(rawValue)) {
        return null;
    }

    const parsed = Number.parseInt(rawValue, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
});

watch(
    () => route.query.trainCode,
    (value) => {
        trainCodeInput.value = readQueryString(value);
    },
    {
        immediate: true
    }
);

watch(selectedDateYmd, (nextValue, previousValue) => {
    if (
        !previousValue ||
        nextValue === previousValue ||
        requestedStartAt.value === null
    ) {
        return;
    }

    void router.replace({
        path: route.path,
        query: {
            ...route.query,
            date: selectedDateInput.value,
            startAt: undefined
        }
    });
});

async function fetchTrainProvenance() {
    if (!normalizedTrainCodeQuery.value) {
        return null;
    }

    const response = await requestFetch<
        TrackerApiResponse<AdminTrainProvenanceResponse>
    >('/api/v1/admin/train-provenance', {
        retry: 0,
        query: {
            date: selectedDateYmd.value,
            trainCode: normalizedTrainCodeQuery.value,
            startAt: requestedStartAt.value ?? undefined
        }
    });

    if (!response.ok) {
        throw {
            data: response
        };
    }

    return response.data;
}

async function fetchTrainRequestStats() {
    const response = await requestFetch<
        TrackerApiResponse<AdminTrainDataRequestStatsResponse>
    >('/api/v1/admin/train-provenance/request-stats', {
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

    return response.data;
}

async function fetchCouplingScanTaskList() {
    const response = await requestFetch<
        TrackerApiResponse<AdminCouplingScanTaskListResponse>
    >('/api/v1/admin/train-provenance/coupling-scan-tasks', {
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

    return response.data;
}

const {
    data: requestStatsData,
    status: requestStatsStatus,
    error: requestStatsError,
    refresh: refreshRequestStats
} = await useAsyncData(
    'admin-train-provenance-request-stats',
    fetchTrainRequestStats,
    {
        watch: [selectedDateYmd]
    }
);

const {
    data: provenanceData,
    status: provenanceStatus,
    error: provenanceError,
    refresh: refreshProvenance
} = await useAsyncData('admin-train-provenance', fetchTrainProvenance, {
    watch: [selectedDateYmd, normalizedTrainCodeQuery, requestedStartAt]
});

const {
    data: couplingScanTaskListData,
    status: couplingScanTaskListStatus,
    error: couplingScanTaskListError,
    refresh: refreshCouplingScanTaskList
} = await useAsyncData(
    'admin-train-provenance-coupling-scan-tasks',
    fetchCouplingScanTaskList,
    {
        watch: [selectedDateYmd]
    }
);

const requestStatsErrorMessage = computed(() =>
    requestStatsError.value
        ? getApiErrorMessage(
              requestStatsError.value,
              '12306 请求统计加载失败。'
          )
        : ''
);
const requestHourBuckets = computed<AdminTrainDataRequestHourBucket[]>(
    () => requestStatsData.value?.hours ?? []
);
const requestTypeSummaries = computed<AdminTrainDataRequestTypeSummary[]>(
    () => requestStatsData.value?.types ?? []
);
const requestPeakTotal = computed(() =>
    requestHourBuckets.value.reduce(
        (currentMax, bucket) =>
            bucket.total > currentMax ? bucket.total : currentMax,
        0
    )
);
const requestChartAxisLabels = computed(() =>
    requestHourBuckets.value
        .filter((bucket) => bucket.hour % 4 === 0 || bucket.hour === 23)
        .map((bucket) => ({
            value: bucket.hour,
            label: `${String(bucket.hour).padStart(2, '0')}:00`
        }))
);
const isRefreshingPage = computed(
    () =>
        requestStatsStatus.value === 'pending' ||
        provenanceStatus.value === 'pending' ||
        couplingScanTaskListStatus.value === 'pending'
);
const provenanceErrorMessage = computed(() =>
    provenanceError.value
        ? getApiErrorMessage(provenanceError.value, '来源追踪加载失败。')
        : ''
);
const couplingScanTaskListErrorMessage = computed(() =>
    couplingScanTaskListError.value
        ? getApiErrorMessage(
              couplingScanTaskListError.value,
              '重联扫描任务加载失败。'
          )
        : ''
);
const departureItems = computed<AdminTrainProvenanceDeparture[]>(
    () => provenanceData.value?.departures ?? []
);
const activeStartAt = computed(
    () => provenanceData.value?.selectedStartAt ?? null
);
const timelineItems = computed<AdminTrainProvenanceEvent[]>(
    () => provenanceData.value?.timeline ?? []
);
const couplingScanTaskItems = computed<AdminCouplingScanTaskListItem[]>(
    () => couplingScanTaskListData.value?.items ?? []
);
const couplingTaskBureauOptions = computed(() =>
    Array.from(
        new Set(
            couplingScanTaskItems.value
                .map((item) => item.bureau.trim())
                .filter((bureau) => bureau.length > 0)
        )
    )
        .sort((left, right) => left.localeCompare(right, 'zh-CN'))
        .map((bureau) => ({
            value: bureau,
            label: bureau
        }))
);
const couplingTaskModelOptions = computed(() => {
    if (!selectedCouplingTaskBureau.value) {
        return [];
    }

    return Array.from(
        new Set(
            couplingScanTaskItems.value
                .filter(
                    (item) => item.bureau === selectedCouplingTaskBureau.value
                )
                .map((item) => item.model.trim())
                .filter((model) => model.length > 0)
        )
    )
        .sort((left, right) => left.localeCompare(right, 'zh-CN'))
        .map((model) => ({
            value: model,
            label: model
        }));
});
const isCouplingTaskFilterReady = computed(
    () =>
        selectedCouplingTaskBureau.value.length > 0 &&
        selectedCouplingTaskModel.value.length > 0
);
const filteredCouplingScanTaskItems = computed<AdminCouplingScanTaskListItem[]>(
    () => {
        if (!isCouplingTaskFilterReady.value) {
            return [];
        }

        return couplingScanTaskItems.value.filter(
            (item) =>
                item.bureau === selectedCouplingTaskBureau.value &&
                item.model === selectedCouplingTaskModel.value
        );
    }
);

watch(couplingTaskBureauOptions, (options) => {
    const hasSelectedBureau = options.some(
        (option) => option.value === selectedCouplingTaskBureau.value
    );
    if (!hasSelectedBureau) {
        selectedCouplingTaskBureau.value = '';
    }
});

watch(selectedCouplingTaskBureau, () => {
    const hasSelectedModel = couplingTaskModelOptions.value.some(
        (option) => option.value === selectedCouplingTaskModel.value
    );
    if (!hasSelectedModel) {
        selectedCouplingTaskModel.value = '';
    }
});

useSiteSeo({
    title: '12306 数据 | Open CRH Tracker',
    description: '查看 12306 请求统计，并按车次追踪探测来源与重联扫描结果。',
    path: '/admin/train-provenance',
    noindex: true
});

function readQueryString(value: unknown): string {
    if (Array.isArray(value)) {
        return typeof value[0] === 'string' ? value[0] : '';
    }

    return typeof value === 'string' ? value : '';
}

function applyViewportState(mediaQueryList: MediaQueryList) {
    isMobileActionSheet.value = mediaQueryList.matches;
}

function handleViewportChange(event: MediaQueryListEvent) {
    applyViewportState(event.currentTarget as MediaQueryList);
}

onMounted(() => {
    const nextMediaQueryList = window.matchMedia(MOBILE_QUERY);
    dialogMediaQuery.value = nextMediaQueryList;
    applyViewportState(nextMediaQueryList);
    nextMediaQueryList.addEventListener('change', handleViewportChange);
});

onBeforeUnmount(() => {
    dialogMediaQuery.value?.removeEventListener('change', handleViewportChange);
});

async function refreshAll() {
    await Promise.all([
        refreshRequestStats(),
        refreshProvenance(),
        refreshCouplingScanTaskList()
    ]);
}

async function submitSearch() {
    isSubmittingSearch.value = true;
    try {
        await router.replace({
            path: route.path,
            query: {
                ...route.query,
                date: selectedDateInput.value,
                trainCode: normalizedTrainCodeInput.value || undefined,
                startAt: undefined
            }
        });
    } finally {
        isSubmittingSearch.value = false;
    }
}

async function clearSearch() {
    trainCodeInput.value = '';
    await router.replace({
        path: route.path,
        query: {
            ...route.query,
            date: selectedDateInput.value,
            trainCode: undefined,
            startAt: undefined
        }
    });
}

async function selectDeparture(startAt: number) {
    await router.replace({
        path: route.path,
        query: {
            ...route.query,
            date: selectedDateInput.value,
            trainCode: normalizedTrainCodeQuery.value || undefined,
            startAt: String(startAt)
        }
    });
}

function closeCouplingDetailDialog() {
    if (couplingDetailStatus.value === 'pending') {
        return;
    }

    isCouplingDetailDialogOpen.value = false;
    couplingDetailErrorMessage.value = '';
}

function handleCouplingDetailDialogVisibilityChange(nextValue: boolean) {
    if (nextValue) {
        isCouplingDetailDialogOpen.value = true;
        return;
    }

    closeCouplingDetailDialog();
}

async function openCouplingScanDetail(taskRunId: number) {
    isCouplingDetailDialogOpen.value = true;
    couplingDetailStatus.value = 'pending';
    couplingDetailErrorMessage.value = '';
    couplingDetailData.value = null;

    try {
        const response = await requestFetch<
            TrackerApiResponse<AdminCouplingScanDetailResponse>
        >('/api/v1/admin/train-provenance/coupling-scan', {
            retry: 0,
            query: {
                taskRunId
            }
        });

        if (!response.ok) {
            throw {
                data: response
            };
        }

        couplingDetailData.value = response.data;
        couplingDetailStatus.value = 'success';
    } catch (error) {
        couplingDetailErrorMessage.value = getApiErrorMessage(
            error,
            '重联扫描结果加载失败。'
        );
        couplingDetailStatus.value = 'error';
    }
}

function getCouplingScanActionTaskRunId(item: AdminTrainProvenanceEvent) {
    const couplingScan = item.couplingScan;
    if (
        !couplingScan ||
        !couplingScan.canOpenDetail ||
        couplingScan.resultTaskRunId === null ||
        couplingScan.resultTaskRunId <= 0
    ) {
        return null;
    }

    return couplingScan.resultTaskRunId;
}

function getCouplingScanActionLabel(item: AdminTrainProvenanceEvent) {
    const couplingScan = item.couplingScan;
    if (!couplingScan) {
        return '扫描结果';
    }

    if (
        couplingScan.state === 'queued' &&
        couplingScan.queuedSchedulerTaskId !== null &&
        couplingScan.resultSchedulerTaskId !== null &&
        couplingScan.queuedSchedulerTaskId !==
            couplingScan.resultSchedulerTaskId
    ) {
        return '实际结果';
    }

    return '扫描结果';
}

function getRequestTypeLabel(type: AdminTrainDataRequestType) {
    switch (type) {
        case 'search_train_code':
            return '车次检索';
        case 'fetch_route_info':
            return '时刻表查询';
        case 'fetch_emu_by_route':
            return '按车次取车组';
        case 'fetch_emu_by_seat_code':
            return '畅行码查车组';
        default:
            return type;
    }
}

function getRequestTypeEyebrow(type: AdminTrainDataRequestType) {
    switch (type) {
        case 'search_train_code':
            return 'Search';
        case 'fetch_route_info':
            return 'Route';
        case 'fetch_emu_by_route':
            return 'Route EMU';
        case 'fetch_emu_by_seat_code':
            return 'Seat Code';
        default:
            return 'Type';
    }
}

function getRequestTypeAccentClass(type: AdminTrainDataRequestType) {
    switch (type) {
        case 'search_train_code':
            return 'text-sky-700';
        case 'fetch_route_info':
            return 'text-blue-700';
        case 'fetch_emu_by_route':
            return 'text-amber-700';
        case 'fetch_emu_by_seat_code':
            return 'text-emerald-700';
        default:
            return 'text-slate-700';
    }
}

function getRequestHourBarHeight(total: number, peakTotal: number) {
    if (peakTotal <= 0 || total <= 0) {
        return 0;
    }

    return Math.max(6, (total / peakTotal) * 100);
}

function getRequestStackSegmentHeight(value: number, total: number) {
    if (total <= 0 || value <= 0) {
        return 0;
    }

    return (value / total) * 100;
}

function getRequestTypeBucket(
    bucket: AdminTrainDataRequestHourBucket,
    type: AdminTrainDataRequestType
) {
    return (
        bucket.types.find((item) => item.type === type) ?? {
            type,
            ...EMPTY_REQUEST_METRICS
        }
    );
}

function getRequestTypePeakTotal(type: AdminTrainDataRequestType) {
    return requestHourBuckets.value.reduce((currentMax, bucket) => {
        const typeBucket = getRequestTypeBucket(bucket, type);
        return typeBucket.total > currentMax ? typeBucket.total : currentMax;
    }, 0);
}

function getRequestBucketTitle(bucket: AdminTrainDataRequestHourBucket) {
    return [
        `${String(bucket.hour).padStart(2, '0')}:00 - ${String((bucket.hour + 1) % 24).padStart(2, '0')}:00`,
        `总请求 ${formatNumber(bucket.total)}`,
        `成功 ${formatNumber(bucket.success)}`,
        `失败 ${formatNumber(bucket.failure)}`,
        `前一日同小时 ${formatNumber(bucket.compareTotal)}`,
        `同比 ${formatSignedNumber(bucket.totalDelta)} / ${formatSignedPercent(bucket.totalChangeRatio)}`
    ].join('\n');
}

function getRequestTypeBucketTitle(
    bucket: AdminTrainDataRequestHourBucket,
    type: AdminTrainDataRequestType
) {
    const typeBucket = getRequestTypeBucket(bucket, type);

    return [
        `${getRequestTypeLabel(type)} · ${String(bucket.hour).padStart(2, '0')}:00 - ${String((bucket.hour + 1) % 24).padStart(2, '0')}:00`,
        `总请求 ${formatNumber(typeBucket.total)}`,
        `成功 ${formatNumber(typeBucket.success)}`,
        `失败 ${formatNumber(typeBucket.failure)}`,
        `前一日同小时 ${formatNumber(typeBucket.compareTotal)}`,
        `同比 ${formatSignedNumber(typeBucket.totalDelta)} / ${formatSignedPercent(typeBucket.totalChangeRatio)}`
    ].join('\n');
}

function getLinkedTaskHintText(item: AdminTrainProvenanceEvent) {
    const couplingScan = item.couplingScan;
    if (couplingScan) {
        if (couplingScan.state !== 'queued') {
            return '';
        }

        if (couplingScan.queuedSchedulerTaskId === null) {
            return '';
        }

        if (
            couplingScan.resultSchedulerTaskId !== null &&
            couplingScan.resultSchedulerTaskId ===
                couplingScan.queuedSchedulerTaskId &&
            couplingScan.canOpenDetail
        ) {
            return '';
        }

        return `已排队：#${couplingScan.queuedSchedulerTaskId}`;
    }

    if (item.linkedSchedulerTaskId === null) {
        return '';
    }

    return `已排队：#${item.linkedSchedulerTaskId}`;
}

function openCouplingScanDetailForEvent(item: AdminTrainProvenanceEvent) {
    const taskRunId = getCouplingScanActionTaskRunId(item);
    if (taskRunId === null) {
        return;
    }

    void openCouplingScanDetail(taskRunId);
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

function formatPercent(value: number | null) {
    if (value === null) {
        return '--';
    }

    return `${(value * 100).toFixed(1)}%`;
}

function formatSignedNumber(value: number) {
    const formatted = formatNumber(Math.abs(value));
    if (value === 0) {
        return formatted;
    }

    return `${value > 0 ? '+' : '-'}${formatted}`;
}

function formatSignedPercent(value: number | null) {
    if (value === null) {
        return '--';
    }

    const percent = `${(Math.abs(value) * 100).toFixed(1)}%`;
    if (value === 0) {
        return percent;
    }

    return `${value > 0 ? '+' : '-'}${percent}`;
}

function formatServiceDate(serviceDate: string) {
    if (!/^\d{8}$/.test(serviceDate)) {
        return '--';
    }

    return `${serviceDate.slice(0, 4)}-${serviceDate.slice(4, 6)}-${serviceDate.slice(6, 8)}`;
}

function formatEmuCodeList(emuCodes: string[]) {
    return emuCodes.length > 0 ? emuCodes.join(' / ') : '--';
}

function formatRouteSnapshotTrainCodes(route: AdminTrainRouteSnapshot | null) {
    return route && route.trainCodes.length > 0
        ? route.trainCodes.join(' / ')
        : '--';
}

function formatRouteSnapshotTimeRange(route: AdminTrainRouteSnapshot | null) {
    if (!route) {
        return '--';
    }

    const startText =
        route.startAt !== null && route.startAt > 0
            ? formatShanghaiTime(route.startAt)
            : '--';
    const endText =
        route.endAt !== null && route.endAt > 0
            ? formatShanghaiTime(route.endAt)
            : '--';

    if (startText === '--' && endText === '--') {
        return '--';
    }

    return `${startText}-${endText}`;
}

function formatRouteSnapshotSchedule(route: AdminTrainRouteSnapshot | null) {
    if (!route) {
        return '--';
    }

    const parts = [];
    if (route.serviceDate) {
        parts.push(formatServiceDate(route.serviceDate));
    }

    const timeRange = formatRouteSnapshotTimeRange(route);
    if (timeRange !== '--') {
        parts.push(timeRange);
    }

    return parts.length > 0 ? parts.join(' / ') : '--';
}

function formatRouteSnapshotStations(route: AdminTrainRouteSnapshot | null) {
    if (!route) {
        return '--';
    }

    if (!route.startStation && !route.endStation) {
        return '--';
    }

    return `${route.startStation || '--'} 至 ${route.endStation || '--'}`;
}

function getRouteSnapshotNoteClass(route: AdminTrainRouteSnapshot | null) {
    if (!route) {
        return 'text-slate-500';
    }

    switch (route.cacheStatus) {
        case 'hit':
            return 'text-emerald-700';
        case 'miss':
            return 'text-amber-700';
        default:
            return 'text-slate-500';
    }
}

function getHistoricalReuseResultLabel(resultStatus: 'single' | 'coupled') {
    return resultStatus === 'coupled' ? '重联' : '单组';
}

function formatConflictTrainCodes(trainCodes: string[]) {
    return trainCodes.length > 0 ? trainCodes.join(' / ') : '--';
}

function formatConflictStations(startStation: string, endStation: string) {
    if (!startStation && !endStation) {
        return '--';
    }

    return `${startStation || '--'} 至 ${endStation || '--'}`;
}

function formatConflictTimeRange(startAt: number | null, endAt: number | null) {
    if (
        !Number.isFinite(startAt ?? NaN) ||
        !Number.isFinite(endAt ?? NaN) ||
        startAt === null ||
        endAt === null ||
        startAt <= 0 ||
        endAt <= 0
    ) {
        return '--';
    }

    return `${formatShanghaiTime(startAt)}-${formatShanghaiTime(endAt)}`;
}

function formatConflictCurrentGroup(
    currentGroup: AdminTrainProvenanceConflictCurrentGroup
) {
    const trainCodes = formatConflictTrainCodes(currentGroup.trainCodes);
    const timeRange = formatConflictTimeRange(
        currentGroup.startAt,
        currentGroup.endAt
    );
    const stationText = formatConflictStations(
        currentGroup.startStation,
        currentGroup.endStation
    );

    return `${trainCodes} / ${timeRange} / ${stationText}`;
}

function getConflictStateLabel(state: AdminTrainProvenanceConflictState) {
    switch (state) {
        case 'running':
            return '运行中';
        case 'not_running':
            return '不开行';
        case 'request_failed':
            return '请求失败';
        default:
            return '未知';
    }
}

function getConflictStateBadgeClass(state: AdminTrainProvenanceConflictState) {
    switch (state) {
        case 'running':
            return 'inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-blue-800';
        case 'not_running':
            return 'inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-700';
        case 'request_failed':
            return 'inline-flex items-center rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-rose-800';
        default:
            return 'inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-700';
    }
}

function getEventResultLabel(result: string) {
    switch (result) {
        case 'running':
            return '运行中';
        case 'queued':
            return '已排队';
        case 'done':
            return '已完成';
        case 'matched':
            return '已匹配';
        case 'requeued':
            return '已重排';
        case 'request_failed':
            return '请求失败';
        case 'not_running':
            return '不开行';
        case 'finalized_single':
            return '最终单组';
        case 'upgraded_from_single':
            return '由单组升级为重联';
        case 'changed':
            return '已变化';
        case 'asset_missing':
            return '资产缺失';
        case 'seat_code_request_failed_network_error':
            return '畅行码查询失败：网络错误';
        case 'seat_code_request_failed_not_enabled':
            return '畅行码未启用';
        case 'seat_code_request_failed_other':
            return '畅行码查询失败：其他错误';
        case 'unmatched':
            return '未匹配';
        default:
            return result || '--';
    }
}

function getCandidateStatusLabel(status: string) {
    switch (status) {
        case 'matched':
            return '已匹配';
        case 'skipped':
            return '已跳过';
        case 'request_failed':
            return '请求失败';
        case 'unmatched':
            return '未匹配';
        default:
            return status || '--';
    }
}

function getDepartureStatusLabel(status: AdminTrainProvenanceLatestStatus) {
    switch (status) {
        case 'pending':
            return '待重联';
        case 'single':
            return '单组';
        case 'coupled':
            return '重联';
        default:
            return '未知';
    }
}

function getDepartureStatusBadgeClass(
    status: AdminTrainProvenanceLatestStatus
) {
    switch (status) {
        case 'pending':
            return 'inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-amber-800';
        case 'single':
            return 'inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-emerald-800';
        case 'coupled':
            return 'inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-blue-800';
        default:
            return 'inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-700';
    }
}

function getTaskStatusBadgeClass(status: AdminTrainProvenanceTaskRunStatus) {
    switch (status) {
        case 'success':
            return 'inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-emerald-800';
        case 'failed':
            return 'inline-flex items-center rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-rose-800';
        case 'skipped':
            return 'inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-amber-800';
        default:
            return 'inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-700';
    }
}

function getTaskStatusLabel(status: AdminTrainProvenanceTaskRunStatus) {
    switch (status) {
        case 'running':
            return '运行中';
        case 'success':
            return '成功';
        case 'failed':
            return '失败';
        case 'skipped':
            return '跳过';
        default:
            return status;
    }
}

function getCandidateStatusBadgeClass(status: string) {
    switch (status) {
        case 'matched':
            return 'inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-emerald-800';
        case 'skipped':
            return 'inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-700';
        case 'request_failed':
            return 'inline-flex items-center rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-rose-800';
        case 'unmatched':
            return 'inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-amber-800';
        default:
            return 'inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-blue-800';
    }
}
</script>
