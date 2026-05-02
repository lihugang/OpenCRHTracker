<template>
    <AdminShell
        v-model:date-input="selectedDateInput"
        :today-date-input-value="todayDateInputValue"
        :session="session"
        title="12306 来源追踪"
        description="按日期和车次查看探测来源、判定路径，以及关联的重联扫描结果。">
        <template #toolbar>
            <UiButton
                type="button"
                variant="secondary"
                :loading="provenanceStatus === 'pending'"
                @click="refreshProvenance()">
                刷新
            </UiButton>
        </template>

        <div class="space-y-6">
            <UiCard :show-accent-bar="false">
                <div class="space-y-6">
                    <div class="space-y-2">
                        <p
                            class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                            Query
                        </p>
                        <h2 class="text-2xl font-semibold text-slate-900">
                            查询某日某车次
                        </h2>
                        <p class="text-sm leading-6 text-slate-600">
                            默认保留 {{ provenanceData?.retentionDays ?? 7 }} 天。
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
                                :disabled="normalizedTrainCodeInput.length === 0"
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
                        v-else-if="provenanceStatus === 'pending' && !provenanceData"
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
                                <h3 class="text-xl font-semibold text-slate-900">
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
                                                    {{ formatTimestamp(item.startAt) }}
                                                </p>
                                                <p class="text-sm text-slate-600">
                                                    {{
                                                        item.startStation || '--'
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

                                        <p class="text-sm leading-6 text-slate-600">
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
                                <h3 class="text-xl font-semibold text-slate-900">
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
                                                        / {{
                                                            getEventResultLabel(
                                                                item.result
                                                            )
                                                        }}
                                                    </span>
                                                </p>
                                            </div>

                                            <div
                                                class="text-sm leading-6 text-slate-500">
                                                <p>{{ formatTimestamp(item.createdAt) }}</p>
                                                <p>任务 #{{ item.schedulerTaskId }}</p>
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
                                                    :key="
                                                        `${item.id}:conflict:${index}`
                                                    "
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
                            扫描任务 #{{ couplingDetailData.taskRun?.schedulerTaskId ?? '--' }}
                        </p>
                        <p>
                            状态：{{ couplingDetailData.taskRun?.status ?? '--' }}
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
                                        <p>{{ formatTimestamp(item.createdAt) }}</p>
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
                                            :key="
                                                `${item.id}:occupied:${occupiedIndex}`
                                            "
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

const trainCodeInput = ref(readQueryString(route.query.trainCode));
const isSubmittingSearch = ref(false);
const isCouplingDetailDialogOpen = ref(false);
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

const {
    data: provenanceData,
    status: provenanceStatus,
    error: provenanceError,
    refresh: refreshProvenance
} = await useAsyncData('admin-train-provenance', fetchTrainProvenance, {
    watch: [selectedDateYmd, normalizedTrainCodeQuery, requestedStartAt]
});

const provenanceErrorMessage = computed(() =>
    provenanceError.value
        ? getApiErrorMessage(provenanceError.value, '来源追踪加载失败。')
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

useSiteSeo({
    title: '12306 来源追踪 | Open CRH Tracker',
    description: '查看某日某车次的 12306 探测来源与重联扫描结果。',
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
        couplingScan.queuedSchedulerTaskId !== couplingScan.resultSchedulerTaskId
    ) {
        return '实际结果';
    }

    return '扫描结果';
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

function formatConflictTimeRange(
    startAt: number | null,
    endAt: number | null
) {
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

function getDepartureStatusBadgeClass(status: AdminTrainProvenanceLatestStatus) {
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
