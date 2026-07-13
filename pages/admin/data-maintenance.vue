<template>
    <AdminShell
        v-model:date-input="selectedDateInput"
        :today-date-input-value="todayDateInputValue"
        :session="session"
        title="数据维护"
        description="按日期手动检索、删除或补录动车组担当最终日记录。">
        <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <UiCard
                :show-accent-bar="false"
                allow-overflow>
                <div class="space-y-6">
                    <div class="space-y-2">
                        <p
                            class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                            Delete
                        </p>
                        <h2 class="text-2xl font-semibold text-slate-900">
                            检索并删除记录
                        </h2>
                        <p class="text-sm leading-6 text-slate-600">
                            可单独选择检索日期。车次与车组可单独填写，也可组合检索。
                        </p>
                    </div>

                    <div class="grid gap-4 md:grid-cols-2">
                        <AdminLookupCodeInput
                            v-model="trainCodeInput"
                            type-filter="train"
                            label="车次"
                            placeholder="例如 G1" />
                        <AdminLookupCodeInput
                            v-model="emuCodeInput"
                            type-filter="emu"
                            label="车组"
                            placeholder="例如 CR400AF-2010" />
                    </div>

                    <UiField
                        label="日期"
                        help="与页面顶部管理员日期同步。">
                        <input
                            v-model="selectedDateInput"
                            type="date"
                            class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark"
                            :max="todayDateInputValue" />
                    </UiField>

                    <div
                        class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p class="text-sm leading-6 text-slate-500">
                            检索日期：{{ deleteDateYmd }}
                        </p>
                        <div class="flex flex-wrap gap-3">
                            <UiButton
                                type="button"
                                variant="secondary"
                                :disabled="
                                    !canSearchDelete ||
                                    deleteSearchStatus === 'pending'
                                "
                                @click="clearDeleteSearch">
                                清空
                            </UiButton>
                            <UiButton
                                type="button"
                                :loading="deleteSearchStatus === 'pending'"
                                :disabled="!canSearchDelete"
                                @click="searchDeleteRoutes">
                                检索
                            </UiButton>
                        </div>
                    </div>

                    <div
                        v-if="deleteSuccessMessage"
                        class="rounded-[1rem] border border-emerald-200 bg-emerald-50/80 px-4 py-4 text-sm leading-6 text-emerald-800">
                        {{ deleteSuccessMessage }}
                    </div>

                    <UiEmptyState
                        v-if="deleteSearchStatus === 'idle'"
                        eyebrow="待检索"
                        title="输入条件后检索"
                        description="至少填写车次或车组中的一项。" />

                    <div
                        v-else-if="deleteSearchStatus === 'pending'"
                        class="space-y-3">
                        <div
                            v-for="index in 4"
                            :key="`delete-loading:${index}`"
                            class="h-24 animate-pulse rounded-[1rem] bg-slate-100/90" />
                    </div>

                    <UiEmptyState
                        v-else-if="deleteErrorMessage"
                        eyebrow="检索失败"
                        title="记录检索失败"
                        :description="deleteErrorMessage"
                        tone="danger">
                        <UiButton
                            type="button"
                            variant="secondary"
                            @click="searchDeleteRoutes">
                            重试
                        </UiButton>
                    </UiEmptyState>

                    <template v-else>
                        <div
                            class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                            <p
                                class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                匹配数量
                            </p>
                            <p
                                class="mt-2 text-3xl font-semibold text-slate-900">
                                {{ deleteSearchData?.total ?? 0 }}
                            </p>
                        </div>

                        <UiEmptyState
                            v-if="deleteRouteItems.length === 0"
                            eyebrow="无结果"
                            title="没有匹配记录"
                            description="当前日期和输入条件下没有最终日记录。" />

                        <div
                            v-else
                            class="space-y-3">
                            <article
                                v-for="item in deleteRouteItems"
                                :key="item.id"
                                class="rounded-[1rem] border border-slate-200 bg-white/90 px-4 py-4 shadow-sm">
                                <div class="space-y-4">
                                    <div
                                        class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                        <div class="space-y-2">
                                            <div
                                                class="flex flex-wrap items-center gap-2">
                                                <span
                                                    class="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-crh-blue">
                                                    #{{ item.id }}
                                                </span>
                                                <span
                                                    class="font-mono text-sm font-semibold text-slate-900">
                                                    {{ item.trainCode }} /
                                                    {{ item.emuCode }}
                                                </span>
                                            </div>
                                            <p
                                                class="text-sm leading-6 text-slate-600">
                                                {{ formatRouteStations(item) }}
                                            </p>
                                            <p
                                                class="font-mono text-xs leading-5 text-slate-500">
                                                timetable_id:
                                                {{ item.timetableId ?? 'NULL' }}
                                            </p>
                                        </div>
                                        <div
                                            class="text-sm leading-6 text-slate-500">
                                            <p>
                                                {{
                                                    formatTimestamp(
                                                        item.startAt
                                                    )
                                                }}
                                            </p>
                                            <p>
                                                {{
                                                    formatTimestamp(item.endAt)
                                                }}
                                            </p>
                                        </div>
                                    </div>

                                    <div class="flex justify-end">
                                        <UiButton
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            class="border-rose-200 text-rose-700 hover:border-rose-300 hover:bg-rose-50/80 hover:text-rose-800"
                                            :loading="
                                                deletingRouteId === item.id
                                            "
                                            :disabled="
                                                deletingRouteId.length > 0
                                            "
                                            @click="openDeleteDialog(item)">
                                            删除
                                        </UiButton>
                                    </div>
                                </div>
                            </article>
                        </div>
                    </template>
                </div>
            </UiCard>

            <UiCard
                :show-accent-bar="false"
                allow-overflow>
                <div class="space-y-6">
                    <div class="space-y-2">
                        <p
                            class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                            Insert
                        </p>
                        <h2 class="text-2xl font-semibold text-slate-900">
                            添加或覆盖记录
                        </h2>
                        <p class="text-sm leading-6 text-slate-600">
                            先匹配车次历史时刻表，再按选中的 timetable_id
                            写入最终日记录。
                        </p>
                    </div>

                    <div class="grid gap-4 md:grid-cols-2">
                        <AdminLookupCodeInput
                            v-model="trainCodeInput"
                            type-filter="train"
                            label="车次"
                            placeholder="例如 G1"
                            required />
                        <AdminLookupCodeInput
                            v-model="emuCodeInput"
                            type-filter="emu"
                            label="车组"
                            placeholder="例如 CR400AF-2010"
                            required />
                    </div>

                    <UiField
                        label="日期"
                        help="与页面顶部管理员日期同步。">
                        <input
                            v-model="selectedDateInput"
                            type="date"
                            class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark"
                            :max="todayDateInputValue" />
                    </UiField>

                    <div
                        class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p class="text-sm leading-6 text-slate-500">
                            写入日期：{{ createDateYmd }}
                        </p>
                        <UiButton
                            type="button"
                            :loading="candidateStatus === 'pending'"
                            :disabled="!canLoadCandidates"
                            @click="loadTimetableCandidates">
                            匹配时刻表
                        </UiButton>
                    </div>

                    <div
                        v-if="createSuccessMessage"
                        class="rounded-[1rem] border border-emerald-200 bg-emerald-50/80 px-4 py-4 text-sm leading-6 text-emerald-800">
                        {{ createSuccessMessage }}
                    </div>

                    <div
                        v-if="createErrorMessage"
                        class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700">
                        {{ createErrorMessage }}
                    </div>

                    <UiEmptyState
                        v-if="candidateStatus === 'idle'"
                        eyebrow="待匹配"
                        title="先匹配时刻表"
                        description="输入车次、车组和日期后，匹配可用历史时刻表。" />

                    <div
                        v-else-if="candidateStatus === 'pending'"
                        class="space-y-3">
                        <div
                            v-for="index in 3"
                            :key="`candidate-loading:${index}`"
                            class="h-24 animate-pulse rounded-[1rem] bg-slate-100/90" />
                    </div>

                    <UiEmptyState
                        v-else-if="candidateErrorMessage"
                        eyebrow="匹配失败"
                        title="时刻表匹配失败"
                        :description="candidateErrorMessage"
                        tone="danger">
                        <UiButton
                            type="button"
                            variant="secondary"
                            @click="loadTimetableCandidates">
                            重试
                        </UiButton>
                    </UiEmptyState>

                    <template v-else>
                        <div
                            v-if="candidateItems.length > 0"
                            class="space-y-3">
                            <label
                                v-for="item in candidateItems"
                                :key="getCandidateKey(item)"
                                class="block cursor-pointer rounded-[1rem] border px-4 py-4 transition"
                                :class="
                                    selectedTimetableId === item.timetableId
                                        ? 'border-crh-blue bg-blue-50/70'
                                        : 'border-slate-200 bg-white/90 hover:border-slate-300'
                                ">
                                <div class="flex gap-3">
                                    <input
                                        v-model="selectedTimetableId"
                                        type="radio"
                                        class="mt-1"
                                        :value="item.timetableId" />
                                    <div class="min-w-0 flex-1 space-y-2">
                                        <div
                                            class="flex flex-wrap items-center gap-2">
                                            <span
                                                class="font-mono text-sm font-semibold text-slate-900">
                                                timetable_id:
                                                {{ item.timetableId ?? 'NULL' }}
                                            </span>
                                            <span
                                                :class="
                                                    getResolutionBadgeClass(
                                                        item.resolution
                                                    )
                                                ">
                                                {{
                                                    getResolutionLabel(
                                                        item.resolution
                                                    )
                                                }}
                                            </span>
                                            <span
                                                v-if="item.isDefault"
                                                class="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                                                默认
                                            </span>
                                        </div>
                                        <p
                                            class="text-sm leading-6 text-slate-600">
                                            {{ formatCandidateStations(item) }}
                                        </p>
                                        <p
                                            class="text-xs leading-5 text-slate-500">
                                            覆盖：{{ item.serviceDateStart }}
                                            至
                                            {{ item.serviceDateEndExclusive }}
                                        </p>
                                        <p
                                            class="text-xs leading-5 text-slate-500">
                                            {{ formatTimestamp(item.startAt) }}
                                            /
                                            {{ formatTimestamp(item.endAt) }}
                                        </p>
                                    </div>
                                </div>
                            </label>
                        </div>

                        <UiButton
                            type="button"
                            block
                            :loading="createStatus === 'pending'"
                            :disabled="!canCreateRoute"
                            @click="createDailyRoute">
                            添加记录
                        </UiButton>
                    </template>
                </div>
            </UiCard>
        </div>

        <UiCard
            :show-accent-bar="false"
            allow-overflow
            class="mt-6">
            <div class="space-y-6">
                <div class="space-y-2">
                    <p
                        class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                        Timetable History
                    </p>
                    <h2 class="text-2xl font-semibold text-slate-900">
                        历史时刻表维护
                    </h2>
                    <p class="text-sm leading-6 text-slate-600">
                        扫描同一车次连续三段历史时刻表覆盖。当前后两段
                        timetable_id
                        相同且中间段不同时，可删除中间段并合并前后覆盖。
                    </p>
                </div>

                <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                    <AdminLookupCodeInput
                        v-model="trainCodeInput"
                        type-filter="train"
                        label="车次"
                        placeholder="例如 G1"
                        required />
                    <div class="flex items-end">
                        <UiButton
                            type="button"
                            class="w-full lg:w-auto"
                            :loading="timetableMergeStatus === 'pending'"
                            :disabled="!canScanTimetableMerge"
                            @click="scanTimetableMergeCandidates">
                            扫描可合并片段
                        </UiButton>
                    </div>
                </div>

                <div
                    v-if="timetableMergeSuccessMessage"
                    class="rounded-[1rem] border border-emerald-200 bg-emerald-50/80 px-4 py-4 text-sm leading-6 text-emerald-800">
                    {{ timetableMergeSuccessMessage }}
                </div>

                <UiEmptyState
                    v-if="timetableMergeStatus === 'idle'"
                    eyebrow="待扫描"
                    title="输入车次后扫描"
                    description="系统会找出前后相同、中间不同的连续历史时刻表覆盖段。" />

                <div
                    v-else-if="timetableMergeStatus === 'pending'"
                    class="grid gap-3 lg:grid-cols-2">
                    <div
                        v-for="index in 2"
                        :key="`timetable-merge-loading:${index}`"
                        class="h-48 animate-pulse rounded-[1rem] bg-slate-100/90" />
                </div>

                <UiEmptyState
                    v-else-if="timetableMergeErrorMessage"
                    eyebrow="扫描失败"
                    title="可合并片段扫描失败"
                    :description="timetableMergeErrorMessage"
                    tone="danger">
                    <UiButton
                        type="button"
                        variant="secondary"
                        @click="scanTimetableMergeCandidates">
                        重试
                    </UiButton>
                </UiEmptyState>

                <template v-else>
                    <div
                        class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                        <p
                            class="text-xs uppercase tracking-[0.18em] text-slate-400">
                            可合并片段
                        </p>
                        <p class="mt-2 text-3xl font-semibold text-slate-900">
                            {{ timetableMergeData?.total ?? 0 }}
                        </p>
                    </div>

                    <UiEmptyState
                        v-if="timetableMergeItems.length === 0"
                        eyebrow="无结果"
                        title="没有可合并片段"
                        description="该车次当前没有前后相同且中间不同的连续历史时刻表覆盖段。" />

                    <div
                        v-else
                        class="grid gap-4 xl:grid-cols-2">
                        <article
                            v-for="item in timetableMergeItems"
                            :key="getTimetableMergeCandidateKey(item)"
                            class="rounded-[1rem] border border-slate-200 bg-white/90 px-4 py-4 shadow-sm">
                            <div class="space-y-4">
                                <div
                                    class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                    <div class="space-y-2">
                                        <div
                                            class="flex flex-wrap items-center gap-2">
                                            <span
                                                class="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                                                coverage #{{ item.coverageId }}
                                            </span>
                                            <span
                                                class="font-mono text-sm font-semibold text-slate-900">
                                                {{
                                                    item.mergedServiceDateStart
                                                }}
                                                -
                                                {{
                                                    item.mergedServiceDateEndExclusive
                                                }}
                                            </span>
                                        </div>
                                        <p
                                            class="text-sm leading-6 text-slate-600">
                                            删除中间覆盖段后，前段将延长到后段结束日期。
                                        </p>
                                    </div>
                                    <UiButton
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        class="border-rose-200 text-rose-700 hover:border-rose-300 hover:bg-rose-50/80 hover:text-rose-800"
                                        :loading="
                                            mergingCoverageId ===
                                            item.coverageId
                                        "
                                        :disabled="mergingCoverageId !== null"
                                        @click="openTimetableMergeDialog(item)">
                                        删除并合并
                                    </UiButton>
                                </div>

                                <div class="grid gap-3 lg:grid-cols-3">
                                    <div
                                        class="rounded-[1rem] border border-emerald-200 bg-emerald-50/70 px-3 py-3">
                                        <p
                                            class="text-xs font-semibold text-emerald-700">
                                            前段保留
                                        </p>
                                        <p
                                            class="mt-2 font-mono text-xs leading-5 text-slate-700">
                                            {{
                                                formatCoverageRange(
                                                    item.previous
                                                )
                                            }}
                                        </p>
                                        <p
                                            class="mt-2 font-mono text-xs leading-5 text-slate-600">
                                            timetable_id:
                                            {{ item.previous.timetableId }}
                                        </p>
                                        <p
                                            class="mt-1 text-xs leading-5 text-slate-600">
                                            {{
                                                formatCoverageStations(
                                                    item.previous
                                                )
                                            }}
                                        </p>
                                    </div>
                                    <div
                                        class="rounded-[1rem] border border-rose-200 bg-rose-50/70 px-3 py-3">
                                        <p
                                            class="text-xs font-semibold text-rose-700">
                                            中段删除
                                        </p>
                                        <p
                                            class="mt-2 font-mono text-xs leading-5 text-slate-700">
                                            {{
                                                formatCoverageRange(item.middle)
                                            }}
                                        </p>
                                        <p
                                            class="mt-2 font-mono text-xs leading-5 text-slate-600">
                                            timetable_id:
                                            {{ item.middle.timetableId }}
                                        </p>
                                        <p
                                            class="mt-1 text-xs leading-5 text-slate-600">
                                            {{
                                                formatCoverageStations(
                                                    item.middle
                                                )
                                            }}
                                        </p>
                                    </div>
                                    <div
                                        class="rounded-[1rem] border border-emerald-200 bg-emerald-50/70 px-3 py-3">
                                        <p
                                            class="text-xs font-semibold text-emerald-700">
                                            后段并入
                                        </p>
                                        <p
                                            class="mt-2 font-mono text-xs leading-5 text-slate-700">
                                            {{ formatCoverageRange(item.next) }}
                                        </p>
                                        <p
                                            class="mt-2 font-mono text-xs leading-5 text-slate-600">
                                            timetable_id:
                                            {{ item.next.timetableId }}
                                        </p>
                                        <p
                                            class="mt-1 text-xs leading-5 text-slate-600">
                                            {{
                                                formatCoverageStations(
                                                    item.next
                                                )
                                            }}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </article>
                    </div>
                </template>
            </div>
        </UiCard>

        <UiModal
            :model-value="isDeleteDialogOpen"
            eyebrow="危险操作"
            title="确认删除日记录"
            :description="deleteDialogDescription"
            size="lg"
            :close-on-backdrop="deletingRouteId.length === 0"
            @update:model-value="handleDeleteDialogVisibilityChange">
            <div
                v-if="pendingDeleteRoute"
                class="space-y-4">
                <div
                    class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4">
                    <p
                        class="text-xs font-medium uppercase tracking-[0.18em] text-rose-700">
                        将删除的记录
                    </p>
                    <p
                        class="mt-2 font-mono text-sm font-semibold text-slate-900">
                        #{{ pendingDeleteRoute.id }}
                        {{ pendingDeleteRoute.trainCode }} /
                        {{ pendingDeleteRoute.emuCode }}
                    </p>
                    <p class="mt-2 text-sm leading-6 text-slate-700">
                        {{ formatRouteStations(pendingDeleteRoute) }}
                    </p>
                </div>

                <div
                    v-if="deleteActionErrorMessage"
                    class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700">
                    {{ deleteActionErrorMessage }}
                </div>
            </div>

            <template #footer>
                <div class="flex flex-wrap justify-end gap-3">
                    <UiButton
                        type="button"
                        variant="secondary"
                        :disabled="deletingRouteId.length > 0"
                        @click="closeDeleteDialog">
                        取消
                    </UiButton>
                    <UiButton
                        type="button"
                        :loading="deletingRouteId.length > 0"
                        @click="confirmDeleteRoute">
                        确认删除
                    </UiButton>
                </div>
            </template>
        </UiModal>

        <UiModal
            :model-value="isTimetableMergeDialogOpen"
            eyebrow="危险操作"
            title="确认删除并合并时刻表覆盖"
            :description="timetableMergeDialogDescription"
            size="lg"
            :close-on-backdrop="mergingCoverageId === null"
            @update:model-value="handleTimetableMergeDialogVisibilityChange">
            <div
                v-if="pendingTimetableMergeCandidate"
                class="space-y-4">
                <div
                    class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4">
                    <p
                        class="text-xs font-medium uppercase tracking-[0.18em] text-rose-700">
                        将删除的覆盖段
                    </p>
                    <p
                        class="mt-2 font-mono text-sm font-semibold text-slate-900">
                        coverage #{{
                            pendingTimetableMergeCandidate.coverageId
                        }}
                        / timetable_id:
                        {{ pendingTimetableMergeCandidate.middle.timetableId }}
                    </p>
                    <p class="mt-2 text-sm leading-6 text-slate-700">
                        {{
                            formatCoverageRange(
                                pendingTimetableMergeCandidate.middle
                            )
                        }}
                        ，{{
                            formatCoverageStations(
                                pendingTimetableMergeCandidate.middle
                            )
                        }}
                    </p>
                </div>

                <div
                    class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                    <p class="text-sm leading-6 text-slate-700">
                        合并后覆盖范围：
                        <span class="font-mono font-semibold">
                            {{
                                pendingTimetableMergeCandidate.mergedServiceDateStart
                            }}
                            -
                            {{
                                pendingTimetableMergeCandidate.mergedServiceDateEndExclusive
                            }}
                        </span>
                    </p>
                    <p class="mt-2 text-sm leading-6 text-slate-500">
                        此操作不会删除时刻表内容记录，也不会修改已有最终日记录。
                    </p>
                </div>

                <div
                    v-if="timetableMergeActionErrorMessage"
                    class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700">
                    {{ timetableMergeActionErrorMessage }}
                </div>
            </div>

            <template #footer>
                <div class="flex flex-wrap justify-end gap-3">
                    <UiButton
                        type="button"
                        variant="secondary"
                        :disabled="mergingCoverageId !== null"
                        @click="closeTimetableMergeDialog">
                        取消
                    </UiButton>
                    <UiButton
                        type="button"
                        :loading="mergingCoverageId !== null"
                        @click="confirmTimetableMerge">
                        确认删除并合并
                    </UiButton>
                </div>
            </template>
        </UiModal>
    </AdminShell>
</template>

<script setup lang="ts">
import useTrackedRequestFetch, {
    type TrackedRequestFetch
} from '~/composables/useTrackedRequestFetch';
import {
    fromAdminDateInputValue,
    useAdminDateQuery
} from '~/composables/useAdminDateQuery';
import type {
    AdminDailyRouteCreateResponse,
    AdminDailyRouteDeleteResponse,
    AdminDailyRouteRecord,
    AdminDailyRouteSearchResponse,
    AdminDailyRouteTimetableCandidate,
    AdminDailyRouteTimetableCandidatesResponse,
    AdminDailyRouteTimetableResolution,
    AdminTimetableHistoryCoverageMergeCandidate,
    AdminTimetableHistoryCoverageMergeResponse,
    AdminTimetableHistoryCoverageSummary,
    AdminTimetableHistoryMergeCandidatesResponse
} from '~/types/admin';
import type { TrackerApiResponse } from '~/types/homepage';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import { normalizeLookupCode } from '~/utils/lookup/lookupTarget';
import formatTrackerTimestamp from '~/utils/time/formatTrackerTimestamp';

definePageMeta({
    middleware: 'admin-required'
});

const requestFetch: TrackedRequestFetch = import.meta.server
    ? useTrackedRequestFetch()
    : ($fetch as TrackedRequestFetch);
const { session } = useAuthState();
const { selectedDateInput, todayDateInputValue } = await useAdminDateQuery();

const trainCodeInput = ref('');
const emuCodeInput = ref('');
const deleteSearchStatus = ref<'idle' | 'pending' | 'success' | 'error'>(
    'idle'
);
const deleteSearchData = ref<AdminDailyRouteSearchResponse | null>(null);
const deleteErrorMessage = ref('');
const deleteSuccessMessage = ref('');
const deletingRouteId = ref('');
const isDeleteDialogOpen = ref(false);
const pendingDeleteRoute = ref<AdminDailyRouteRecord | null>(null);
const deleteActionErrorMessage = ref('');

const candidateStatus = ref<'idle' | 'pending' | 'success' | 'error'>('idle');
const candidateData = ref<AdminDailyRouteTimetableCandidatesResponse | null>(
    null
);
const candidateErrorMessage = ref('');
const selectedTimetableId = ref<number | null>(null);
const createStatus = ref<'idle' | 'pending' | 'success' | 'error'>('idle');
const createSuccessMessage = ref('');
const createErrorMessage = ref('');
const timetableMergeStatus = ref<'idle' | 'pending' | 'success' | 'error'>(
    'idle'
);
const timetableMergeData =
    ref<AdminTimetableHistoryMergeCandidatesResponse | null>(null);
const timetableMergeErrorMessage = ref('');
const timetableMergeSuccessMessage = ref('');
const pendingTimetableMergeCandidate =
    ref<AdminTimetableHistoryCoverageMergeCandidate | null>(null);
const isTimetableMergeDialogOpen = ref(false);
const mergingCoverageId = ref<number | null>(null);
const timetableMergeActionErrorMessage = ref('');

const normalizedTrainCode = computed(() =>
    normalizeLookupCode(trainCodeInput.value)
);
const normalizedEmuCode = computed(() =>
    normalizeLookupCode(emuCodeInput.value)
);
const deleteDateYmd = computed(() =>
    fromAdminDateInputValue(selectedDateInput.value)
);
const createDateYmd = deleteDateYmd;
const deleteRouteItems = computed(() => deleteSearchData.value?.items ?? []);
const candidateItems = computed(() => candidateData.value?.items ?? []);
const timetableMergeItems = computed(
    () => timetableMergeData.value?.items ?? []
);
const canSearchDelete = computed(
    () =>
        /^\d{8}$/.test(deleteDateYmd.value) &&
        (normalizedTrainCode.value.length > 0 ||
            normalizedEmuCode.value.length > 0)
);
const canLoadCandidates = computed(
    () =>
        normalizedTrainCode.value.length > 0 &&
        normalizedEmuCode.value.length > 0 &&
        /^\d{8}$/.test(createDateYmd.value) &&
        candidateStatus.value !== 'pending'
);
const canCreateRoute = computed(
    () =>
        canLoadCandidates.value &&
        candidateStatus.value === 'success' &&
        candidateItems.value.some(
            (item) => item.timetableId === selectedTimetableId.value
        ) &&
        createStatus.value !== 'pending'
);
const canScanTimetableMerge = computed(
    () =>
        normalizedTrainCode.value.length > 0 &&
        timetableMergeStatus.value !== 'pending'
);
const deleteDialogDescription = computed(() => {
    if (!pendingDeleteRoute.value) {
        return '';
    }

    return pendingDeleteRoute.value.serviceDate ===
        fromAdminDateInputValue(todayDateInputValue)
        ? '这会删除最终日记录，并同步清理今天同条 probe status 与内存运行态。'
        : '这会删除历史最终日记录，不会清理 probe status 或内存运行态。';
});
const timetableMergeDialogDescription = computed(() => {
    const candidate = pendingTimetableMergeCandidate.value;
    if (!candidate) {
        return '';
    }

    return `这会删除 ${candidate.middle.serviceDateStart} 至 ${candidate.middle.serviceDateEndExclusive} 的历史时刻表覆盖段，并把前后相同的覆盖段合并。`;
});

watch([normalizedTrainCode, normalizedEmuCode, deleteDateYmd], () => {
    deleteSearchStatus.value = 'idle';
    deleteSearchData.value = null;
    deleteErrorMessage.value = '';
    deleteSuccessMessage.value = '';
    closeDeleteDialog();
});

watch([normalizedTrainCode, normalizedEmuCode, createDateYmd], () => {
    candidateStatus.value = 'idle';
    candidateData.value = null;
    candidateErrorMessage.value = '';
    selectedTimetableId.value = null;
    createSuccessMessage.value = '';
    createErrorMessage.value = '';
});

watch(normalizedTrainCode, () => {
    timetableMergeStatus.value = 'idle';
    timetableMergeData.value = null;
    timetableMergeErrorMessage.value = '';
    timetableMergeSuccessMessage.value = '';
    closeTimetableMergeDialog();
});

useSiteSeo({
    title: '数据维护 | Open CRH Tracker',
    description: '管理员手动维护动车组担当最终日记录。',
    path: '/admin/data-maintenance',
    noindex: true
});

async function searchDeleteRoutes() {
    if (!canSearchDelete.value || deleteSearchStatus.value === 'pending') {
        return;
    }

    deleteSearchStatus.value = 'pending';
    deleteErrorMessage.value = '';
    deleteSuccessMessage.value = '';

    try {
        const response = await requestFetch<
            TrackerApiResponse<AdminDailyRouteSearchResponse>
        >('/api/v1/admin/daily-routes', {
            retry: 0,
            query: {
                date: deleteDateYmd.value,
                trainCode: normalizedTrainCode.value,
                emuCode: normalizedEmuCode.value
            }
        });

        if (!response.ok) {
            throw {
                data: response
            };
        }

        deleteSearchData.value = response.data;
        deleteSearchStatus.value = 'success';
    } catch (error) {
        deleteErrorMessage.value = getApiErrorMessage(error, '检索记录失败。');
        deleteSearchStatus.value = 'error';
    }
}

function clearDeleteSearch() {
    trainCodeInput.value = '';
    emuCodeInput.value = '';
    deleteSearchStatus.value = 'idle';
    deleteSearchData.value = null;
    deleteErrorMessage.value = '';
    deleteSuccessMessage.value = '';
}

async function loadTimetableCandidates() {
    if (!canLoadCandidates.value) {
        return;
    }

    candidateStatus.value = 'pending';
    candidateErrorMessage.value = '';
    createSuccessMessage.value = '';
    createErrorMessage.value = '';

    try {
        const response = await requestFetch<
            TrackerApiResponse<AdminDailyRouteTimetableCandidatesResponse>
        >('/api/v1/admin/daily-routes/timetables', {
            retry: 0,
            query: {
                date: createDateYmd.value,
                trainCode: normalizedTrainCode.value
            }
        });

        if (!response.ok) {
            throw {
                data: response
            };
        }

        candidateData.value = response.data;
        selectedTimetableId.value = response.data.defaultTimetableId;
        candidateStatus.value = 'success';
    } catch (error) {
        candidateErrorMessage.value = getApiErrorMessage(
            error,
            '匹配时刻表失败。'
        );
        candidateStatus.value = 'error';
    }
}

async function createDailyRoute() {
    if (!canCreateRoute.value) {
        return;
    }

    createStatus.value = 'pending';
    createSuccessMessage.value = '';
    createErrorMessage.value = '';

    try {
        const { data, error } = await useCsrfFetch<
            TrackerApiResponse<AdminDailyRouteCreateResponse>
        >('/api/v1/admin/daily-routes', {
            method: 'POST',
            body: {
                date: createDateYmd.value,
                trainCode: normalizedTrainCode.value,
                emuCode: normalizedEmuCode.value,
                timetableId: selectedTimetableId.value
            },
            key: `admin:daily-route-create:${Date.now()}`,
            watch: false,
            server: false
        });

        if (error.value) {
            throw error.value;
        }

        const response = data.value;
        if (!response) {
            throw new Error('Missing daily route create response');
        }

        if (!response.ok) {
            throw {
                data: response
            };
        }

        createSuccessMessage.value = response.data.inserted
            ? `已添加 ${response.data.trainCode} / ${response.data.emuCode} 的记录。`
            : '记录未写入，请检查是否与现有数据冲突。';
        createStatus.value = 'success';
        await refreshDeleteSearchIfMatchingCreate();
    } catch (error) {
        createErrorMessage.value = getApiErrorMessage(error, '添加记录失败。');
        createStatus.value = 'error';
    }
}

async function scanTimetableMergeCandidates(options?: {
    preserveSuccessMessage?: boolean;
}) {
    if (!canScanTimetableMerge.value) {
        return;
    }

    timetableMergeStatus.value = 'pending';
    timetableMergeErrorMessage.value = '';
    if (!options?.preserveSuccessMessage) {
        timetableMergeSuccessMessage.value = '';
    }

    try {
        const response = await requestFetch<
            TrackerApiResponse<AdminTimetableHistoryMergeCandidatesResponse>
        >('/api/v1/admin/timetable-history/merge-candidates', {
            retry: 0,
            query: {
                trainCode: normalizedTrainCode.value
            }
        });

        if (!response.ok) {
            throw {
                data: response
            };
        }

        timetableMergeData.value = response.data;
        timetableMergeStatus.value = 'success';
    } catch (error) {
        timetableMergeErrorMessage.value = getApiErrorMessage(
            error,
            '扫描可合并片段失败。'
        );
        timetableMergeStatus.value = 'error';
    }
}

async function refreshDeleteSearchIfMatchingCreate() {
    if (
        deleteSearchStatus.value !== 'success' ||
        deleteDateYmd.value !== createDateYmd.value ||
        !canSearchDelete.value
    ) {
        return;
    }

    await searchDeleteRoutes();
}

function openDeleteDialog(item: AdminDailyRouteRecord) {
    pendingDeleteRoute.value = item;
    deleteActionErrorMessage.value = '';
    isDeleteDialogOpen.value = true;
}

function closeDeleteDialog() {
    if (deletingRouteId.value.length > 0) {
        return;
    }

    isDeleteDialogOpen.value = false;
    pendingDeleteRoute.value = null;
    deleteActionErrorMessage.value = '';
}

function handleDeleteDialogVisibilityChange(nextValue: boolean) {
    if (nextValue) {
        isDeleteDialogOpen.value = true;
        return;
    }

    closeDeleteDialog();
}

function openTimetableMergeDialog(
    item: AdminTimetableHistoryCoverageMergeCandidate
) {
    pendingTimetableMergeCandidate.value = item;
    timetableMergeActionErrorMessage.value = '';
    isTimetableMergeDialogOpen.value = true;
}

function closeTimetableMergeDialog() {
    if (mergingCoverageId.value !== null) {
        return;
    }

    isTimetableMergeDialogOpen.value = false;
    pendingTimetableMergeCandidate.value = null;
    timetableMergeActionErrorMessage.value = '';
}

function handleTimetableMergeDialogVisibilityChange(nextValue: boolean) {
    if (nextValue) {
        isTimetableMergeDialogOpen.value = true;
        return;
    }

    closeTimetableMergeDialog();
}

function removeDeletedRoute(routeId: string) {
    const currentData = deleteSearchData.value;
    if (!currentData) {
        return;
    }

    const items = currentData.items.filter((item) => item.id !== routeId);
    deleteSearchData.value = {
        ...currentData,
        total: items.length,
        items
    };
}

async function confirmDeleteRoute() {
    if (!pendingDeleteRoute.value || deletingRouteId.value.length > 0) {
        return;
    }

    const targetRoute = pendingDeleteRoute.value;
    deletingRouteId.value = targetRoute.id;
    deleteActionErrorMessage.value = '';
    deleteSuccessMessage.value = '';

    try {
        const { data, error } = await useCsrfFetch<
            TrackerApiResponse<AdminDailyRouteDeleteResponse>
        >(`/api/v1/admin/daily-routes/${encodeURIComponent(targetRoute.id)}`, {
            method: 'DELETE',
            key: `admin:daily-route-delete:${targetRoute.id}:${Date.now()}`,
            watch: false,
            server: false
        });

        if (error.value) {
            throw error.value;
        }

        const response = data.value;
        if (!response) {
            throw new Error('Missing daily route delete response');
        }

        if (!response.ok) {
            throw {
                data: response
            };
        }

        deleteSuccessMessage.value = response.data.wasToday
            ? `已删除记录，并清理 ${response.data.deletedProbeStatusRows} 条 probe status。`
            : '已删除历史记录。';
        removeDeletedRoute(targetRoute.id);
        isDeleteDialogOpen.value = false;
        pendingDeleteRoute.value = null;
    } catch (error) {
        deleteActionErrorMessage.value = getApiErrorMessage(
            error,
            '删除记录失败。'
        );
    } finally {
        deletingRouteId.value = '';
    }
}

async function confirmTimetableMerge() {
    if (
        !pendingTimetableMergeCandidate.value ||
        mergingCoverageId.value !== null
    ) {
        return;
    }

    const targetCandidate = pendingTimetableMergeCandidate.value;
    mergingCoverageId.value = targetCandidate.coverageId;
    timetableMergeActionErrorMessage.value = '';
    timetableMergeSuccessMessage.value = '';

    try {
        const { data, error } = await useCsrfFetch<
            TrackerApiResponse<AdminTimetableHistoryCoverageMergeResponse>
        >(
            `/api/v1/admin/timetable-history/coverages/${encodeURIComponent(targetCandidate.coverageId)}`,
            {
                method: 'DELETE',
                key: `admin:timetable-history-merge:${targetCandidate.coverageId}:${Date.now()}`,
                watch: false,
                server: false
            }
        );

        if (error.value) {
            throw error.value;
        }

        const response = data.value;
        if (!response) {
            throw new Error('Missing timetable history merge response');
        }

        if (!response.ok) {
            throw {
                data: response
            };
        }

        timetableMergeSuccessMessage.value = `已删除 coverage #${targetCandidate.coverageId}，并合并为 ${response.data.merged.serviceDateStart} 至 ${response.data.merged.serviceDateEndExclusive}。`;
        isTimetableMergeDialogOpen.value = false;
        pendingTimetableMergeCandidate.value = null;
        await scanTimetableMergeCandidates({
            preserveSuccessMessage: true
        });
    } catch (error) {
        timetableMergeActionErrorMessage.value = getApiErrorMessage(
            error,
            '删除并合并时刻表覆盖失败。'
        );
    } finally {
        mergingCoverageId.value = null;
    }
}

function formatTimestamp(timestamp: number) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return '--';
    }

    return formatTrackerTimestamp(timestamp);
}

function formatRouteStations(item: AdminDailyRouteRecord) {
    const start = item.startStation || '--';
    const end = item.endStation || '--';
    return `${start} 到 ${end}`;
}

function formatCandidateStations(item: AdminDailyRouteTimetableCandidate) {
    const start = item.startStation || '--';
    const end = item.endStation || '--';
    return `${start} 到 ${end}`;
}

function formatCoverageStations(item: AdminTimetableHistoryCoverageSummary) {
    const start = item.startStation || '--';
    const end = item.endStation || '--';
    const stopCountLabel =
        item.stopCount > 0 ? `${item.stopCount} 站` : '站数未知';
    return `${start} 到 ${end}，${stopCountLabel}`;
}

function formatCoverageRange(item: AdminTimetableHistoryCoverageSummary) {
    return `${item.serviceDateStart} 至 ${item.serviceDateEndExclusive}`;
}

function getCandidateKey(item: AdminDailyRouteTimetableCandidate) {
    return `${item.timetableId ?? 'null'}:${item.serviceDateStart}:${item.serviceDateEndExclusive}`;
}

function getTimetableMergeCandidateKey(
    item: AdminTimetableHistoryCoverageMergeCandidate
) {
    return `${item.coverageId}:${item.previous.coverageId}:${item.next.coverageId}`;
}

function getResolutionLabel(resolution: AdminDailyRouteTimetableResolution) {
    switch (resolution) {
        case 'exact':
            return '覆盖当天';
        case 'latest_fallback':
            return '日期前最新';
        case 'unresolved':
            return '无时刻表';
    }
}

function getResolutionBadgeClass(
    resolution: AdminDailyRouteTimetableResolution
) {
    switch (resolution) {
        case 'exact':
            return 'inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700';
        case 'latest_fallback':
            return 'inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700';
        case 'unresolved':
            return 'inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600';
    }
}
</script>
