<template>
    <main class="flex min-h-screen flex-col bg-crh-slate text-crh-grey-dark">
        <div
            class="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,_rgba(0,82,155,0.1),_transparent_58%)]" />

        <div
            class="relative mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
            <UiCard
                variant="accent"
                class="overflow-visible">
                <div class="space-y-5">
                    <div class="flex items-start justify-between gap-3">
                        <div class="space-y-3">
                            <p
                                class="text-xs font-medium uppercase tracking-[0.26em] text-crh-blue/80">
                                FEEDBACK
                            </p>
                            <div class="space-y-2">
                                <h1
                                    class="text-3xl font-semibold tracking-tight text-slate-900">
                                    站内反馈
                                </h1>
                            </div>
                        </div>

                        <UiButton
                            type="button"
                            variant="secondary"
                            size="sm"
                            @click="goHome">
                            <svg
                                aria-hidden="true"
                                viewBox="0 0 20 20"
                                fill="none"
                                class="h-4 w-4">
                                <path
                                    d="M11.5 5.5L7 10L11.5 14.5"
                                    stroke="currentColor"
                                    stroke-width="1.8"
                                    stroke-linecap="round"
                                    stroke-linejoin="round" />
                            </svg>
                            返回主页
                        </UiButton>
                    </div>

                    <div
                        class="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                        <div class="flex flex-1 flex-wrap items-end gap-3">
                            <div
                                class="flex min-w-[10rem] flex-1 flex-col gap-2 xl:max-w-[12rem]">
                                <span
                                    class="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                                    类型
                                </span>
                                <UiSelect
                                    v-model="filterPrimaryType"
                                    :options="feedbackPrimaryTypeSelectOptions"
                                    mobile-sheet-title="选择类型"
                                    mobile-sheet-eyebrow="FILTER" />
                            </div>

                            <div
                                class="flex min-w-[10rem] flex-1 flex-col gap-2 xl:max-w-[13rem]">
                                <span
                                    class="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                                    细分
                                </span>
                                <UiSelect
                                    v-model="filterSecondaryType"
                                    :options="inlineFilterSecondaryOptions"
                                    :disabled="!filterPrimaryType"
                                    mobile-sheet-title="选择细分"
                                    mobile-sheet-eyebrow="FILTER" />
                            </div>

                            <div
                                class="flex min-w-[10rem] flex-1 flex-col gap-2 xl:max-w-[12rem]">
                                <span
                                    class="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                                    状态
                                </span>
                                <UiSelect
                                    v-model="filterStatus"
                                    :options="feedbackStatusSelectOptions"
                                    mobile-sheet-title="选择状态"
                                    mobile-sheet-eyebrow="FILTER" />
                            </div>

                            <UiButton
                                v-if="hasActiveFilters"
                                variant="secondary"
                                size="sm"
                                @click="resetFilters">
                                重置筛选
                            </UiButton>
                        </div>

                        <UiButton @click="openComposer"> + 反馈</UiButton>
                    </div>
                </div>
            </UiCard>

            <UiCard :show-accent-bar="false">
                <div class="space-y-5">
                    <div
                        class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div class="space-y-2">
                            <p
                                class="text-xs font-medium uppercase tracking-[0.26em] text-slate-400">
                                TOPICS
                            </p>
                            <h2 class="text-2xl font-semibold text-slate-900">
                                反馈列表
                            </h2>
                        </div>

                        <UiTabs
                            v-if="viewTabOptions.length > 1"
                            v-model="currentView"
                            :options="viewTabOptions" />
                    </div>

                    <div
                        v-if="isTopicsPending"
                        class="grid gap-3">
                        <UiCard
                            v-for="index in 3"
                            :key="'loading:' + index"
                            variant="subtle"
                            :show-accent-bar="false">
                            <div class="animate-pulse space-y-3">
                                <div class="h-5 w-40 rounded bg-slate-200" />
                                <div class="h-4 w-full rounded bg-slate-100" />
                                <div class="h-4 w-2/3 rounded bg-slate-100" />
                            </div>
                        </UiCard>
                    </div>

                    <UiEmptyState
                        v-else-if="topicsErrorMessage"
                        eyebrow="Load Failed"
                        title="反馈列表加载失败"
                        :description="topicsErrorMessage"
                        tone="danger" />

                    <UiEmptyState
                        v-else-if="topics.length === 0"
                        eyebrow="No Topics"
                        title="当前没有匹配的反馈"
                        description="" />

                    <div
                        v-else
                        class="space-y-3">
                        <NuxtLink
                            v-for="topic in topics"
                            :key="topic.id"
                            :to="'/feedback/' + topic.id"
                            class="block rounded-[1.25rem] border border-slate-200 bg-white/90 px-5 py-5 transition hover:border-crh-blue/20 hover:bg-blue-50/40">
                            <div class="space-y-3">
                                <div class="flex flex-wrap items-center gap-2">
                                    <h3
                                        class="text-lg font-semibold text-slate-900">
                                        {{ topic.title }}
                                    </h3>
                                    <UiStatusBadge
                                        :label="
                                            getFeedbackStatusLabel(topic.status)
                                        "
                                        :tone="
                                            getFeedbackStatusTone(topic.status)
                                        " />
                                    <UiStatusBadge
                                        :label="
                                            getFeedbackCategoryLabel(
                                                topic.primaryType,
                                                topic.secondaryType
                                            )
                                        "
                                        tone="neutral" />
                                    <UiStatusBadge
                                        v-if="topic.visibility === 'private'"
                                        :label="
                                            getFeedbackVisibilityLabel(
                                                topic.visibility
                                            )
                                        "
                                        tone="neutral" />
                                </div>

                                <p class="text-sm leading-6 text-slate-600">
                                    {{ formatTopicPreview(topic.body) }}
                                </p>

                                <p class="text-xs leading-5 text-slate-500">
                                    {{ topic.authorName }} · 创建于
                                    {{ formatTimestamp(topic.createdAt) }} ·
                                    最后活动
                                    {{ formatTimestamp(topic.lastRepliedAt) }} ·
                                    {{ topic.replyCount }} 条回复
                                </p>
                            </div>
                        </NuxtLink>

                        <div class="flex justify-center pt-2">
                            <UiButton
                                v-if="nextCursor"
                                variant="secondary"
                                :loading="isLoadingMore"
                                @click="loadMoreTopics">
                                加载更多
                            </UiButton>
                        </div>
                    </div>
                </div>
            </UiCard>
        </div>

        <component
            :is="isMobileLayout ? UiBottomSheet : UiModal"
            :model-value="isComposerOpen"
            eyebrow="NEW FEEDBACK"
            title="新反馈"
            :size="isMobileLayout ? 'lg' : 'lg'"
            :height="isMobileLayout ? 'default' : 'tall'"
            :close-on-backdrop="!isSubmitting"
            @update:model-value="handleComposerVisibilityChange">
            <div
                ref="composerContentRef"
                class="space-y-4"
                @keydown.capture="handleComposerFieldKeydown">
                <template v-if="isMobileLayout">
                    <div class="space-y-3">
                        <p
                            class="text-xs uppercase tracking-[0.18em] text-slate-400">
                            请选择反馈类型
                        </p>
                        <div class="grid gap-3">
                            <button
                                v-for="option in desktopPrimaryOptions"
                                :key="'composer-primary:' + option.value"
                                type="button"
                                data-composer-nav="true"
                                :class="
                                    getSheetOptionClass(
                                        composerForm.primaryType,
                                        option.value
                                    )
                                "
                                @click="
                                    selectComposerPrimaryType(option.value)
                                ">
                                {{ option.label }}
                            </button>
                        </div>
                    </div>

                    <div
                        v-if="mobileSecondaryOptions.length > 0"
                        ref="composerSecondarySectionRef"
                        class="space-y-3">
                        <p
                            class="text-xs uppercase tracking-[0.18em] text-slate-400">
                            请选择细分领域
                        </p>
                        <div class="grid gap-3">
                            <button
                                v-for="option in mobileSecondaryOptions"
                                :key="'composer-secondary:' + option.value"
                                type="button"
                                data-composer-nav="true"
                                :class="
                                    getSheetOptionClass(
                                        composerForm.secondaryType,
                                        option.value
                                    )
                                "
                                @click="
                                    selectComposerSecondaryType(option.value)
                                ">
                                {{ option.label }}
                            </button>
                        </div>
                    </div>
                </template>

                <template v-else>
                    <UiField label="反馈类型">
                        <UiSelect
                            v-model="composerForm.primaryType"
                            :options="desktopPrimaryOptions"
                            placeholder="请选择反馈类型"
                            mobile-sheet-title="选择反馈类型"
                            mobile-sheet-eyebrow="NEW FEEDBACK" />
                    </UiField>

                    <UiField
                        v-if="desktopSecondaryOptions.length > 0"
                        label="细分类型">
                        <UiSelect
                            v-model="composerForm.secondaryType"
                            :options="desktopSecondaryOptions"
                            placeholder="请选择细分类型"
                            mobile-sheet-title="选择细分类型"
                            mobile-sheet-eyebrow="NEW FEEDBACK" />
                    </UiField>
                </template>

                <div
                    v-if="canShowComposerFields"
                    ref="composerFieldsSectionRef">
                    <div
                        v-if="isTrainDataCategory"
                        class="grid gap-4 md:grid-cols-2">
                        <UiField
                            label="车次"
                            required
                            help="例如 G1234。">
                            <input
                                v-model.trim="composerForm.details.trainCode"
                                type="text"
                                maxlength="32"
                                class="harmony-input w-full px-4 py-3 text-sm"
                                @keydown.enter.prevent="
                                    focusNextComposerField($event)
                                "
                                @keydown.backspace="
                                    focusPreviousComposerFieldOnBackspace(
                                        $event
                                    )
                                "
                                placeholder="请输入车次" />
                        </UiField>

                        <UiField
                            label="车组号"
                            help="选填；若是重联车请用 / 分隔多个车组号。">
                            <input
                                v-model.trim="composerForm.details.emuCodesRaw"
                                type="text"
                                maxlength="120"
                                class="harmony-input w-full px-4 py-3 text-sm"
                                @keydown.enter.prevent="
                                    focusNextComposerField($event)
                                "
                                @keydown.backspace="
                                    focusPreviousComposerFieldOnBackspace(
                                        $event
                                    )
                                "
                                placeholder="例如 CRH380A-2501 / CRH380A-2502" />
                        </UiField>
                    </div>

                    <div
                        v-if="isCouplingCategory"
                        class="space-y-4">
                        <div class="grid gap-4 md:grid-cols-2">
                            <UiField
                                label="车次"
                                required
                                help="例如 G1234。">
                                <input
                                    v-model.trim="
                                        composerForm.details.trainCode
                                    "
                                    type="text"
                                    maxlength="32"
                                    class="harmony-input w-full px-4 py-3 text-sm"
                                    @keydown.enter.prevent="
                                        focusNextComposerField($event)
                                    "
                                    @keydown.backspace="
                                        focusPreviousComposerFieldOnBackspace(
                                            $event
                                        )
                                    "
                                    placeholder="请输入车次" />
                            </UiField>

                            <UiField
                                label="未追踪到的车组号"
                                help="选填；若你知道漏掉的是哪一组，可以填在这里。">
                                <input
                                    v-model.trim="
                                        composerForm.details.missingEmuCode
                                    "
                                    type="text"
                                    maxlength="120"
                                    class="harmony-input w-full px-4 py-3 text-sm"
                                    @keydown.enter.prevent="
                                        focusNextComposerField($event)
                                    "
                                    @keydown.backspace="
                                        focusPreviousComposerFieldOnBackspace(
                                            $event
                                        )
                                    "
                                    placeholder="例如 CR400BF-5033" />
                            </UiField>
                        </div>

                        <button
                            v-if="showTravelCodeQuestion"
                            type="button"
                            role="checkbox"
                            :aria-checked="
                                composerForm.details.hasTravelCodeImage
                            "
                            class="flex w-full cursor-pointer items-start gap-3 rounded-[1rem] border px-4 py-4 text-sm leading-6 transition"
                            :class="
                                composerForm.details.hasTravelCodeImage
                                    ? 'border-crh-blue/20 bg-blue-50/60 text-slate-800'
                                    : 'border-slate-200 bg-white/80 text-slate-700 hover:border-slate-300 hover:bg-slate-50/80'
                            "
                            @click="
                                composerForm.details.hasTravelCodeImage =
                                    !composerForm.details.hasTravelCodeImage
                            ">
                            <span
                                aria-hidden="true"
                                class="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition"
                                :class="
                                    composerForm.details.hasTravelCodeImage
                                        ? 'border-crh-blue bg-crh-blue text-white shadow-[0_6px_16px_-10px_rgba(0,82,155,0.85)]'
                                        : 'border-slate-300 bg-white text-transparent'
                                ">
                                <svg
                                    viewBox="0 0 20 20"
                                    fill="none"
                                    class="h-3.5 w-3.5">
                                    <path
                                        d="M5 10.5L8.5 14L15 7.5"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round" />
                                </svg>
                            </span>
                            <span class="min-w-0"> 是否有畅行码照片 </span>
                        </button>

                        <div
                            v-if="
                                showTravelCodeQuestion &&
                                composerForm.details.hasTravelCodeImage
                            "
                            class="space-y-3 rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                            <UiField
                                label="上传畅行码照片"
                                help="仅在浏览器本地识别，不会上传或保存原图。">
                                <input
                                    ref="travelCodeFileInput"
                                    :key="fileInputKey"
                                    type="file"
                                    accept="image/*"
                                    class="sr-only"
                                    @change="handleTravelCodeImageChange" />
                                <div class="flex flex-wrap items-center gap-3">
                                    <UiButton
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        @click="openTravelCodeFilePicker">
                                        选择照片
                                    </UiButton>
                                    <span
                                        v-if="selectedTravelCodeImageName"
                                        class="text-sm text-slate-600">
                                        {{ selectedTravelCodeImageName }}
                                    </span>
                                </div>
                            </UiField>

                            <p
                                v-if="travelCodeMessage"
                                :class="
                                    travelCodeState === 'success'
                                        ? 'text-sm text-emerald-700'
                                        : travelCodeState === 'scanning'
                                          ? 'text-sm text-slate-600'
                                          : 'text-sm text-status-delayed'
                                ">
                                {{ travelCodeMessage }}
                            </p>

                            <div
                                v-if="composerForm.details.travelCode"
                                class="rounded-[0.9rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                                已识别畅行码：{{
                                    composerForm.details.travelCode
                                }}
                            </div>
                        </div>
                    </div>

                    <UiField
                        label="补充说明"
                        help="选填，描述你看到的问题、预期结果或建议内容。">
                        <textarea
                            v-model="composerForm.details.customText"
                            rows="6"
                            maxlength="4000"
                            class="harmony-input min-h-[10rem] w-full resize-y px-4 py-3 text-sm"
                            placeholder="补充你希望管理员看到的具体信息。"
                            @keydown.ctrl.enter.prevent="submitTopic"
                            @keydown.enter.prevent="
                                focusNextComposerField($event)
                            "
                            @keydown.backspace="
                                focusPreviousComposerFieldOnBackspace($event)
                            " />
                    </UiField>

                    <div
                        v-if="isSecurityCategory"
                        class="rounded-[1rem] border border-amber-200 bg-amber-50/80 px-4 py-4 text-sm leading-6 text-amber-900">
                        安全性问题反馈会被强制设为不公开，仅作者与管理员可见并可回复。
                    </div>

                    <button
                        v-else-if="isAuthenticated"
                        type="button"
                        role="checkbox"
                        :aria-checked="isPublicVisibility"
                        class="flex w-full cursor-pointer items-start gap-3 rounded-[1rem] border px-4 py-4 text-sm leading-6 transition"
                        :class="
                            isPublicVisibility
                                ? 'border-crh-blue/20 bg-blue-50/60 text-slate-800'
                                : 'border-slate-200 bg-white/80 text-slate-700 hover:border-slate-300 hover:bg-slate-50/80'
                        "
                        @click="isPublicVisibility = !isPublicVisibility">
                        <span
                            aria-hidden="true"
                            class="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition"
                            :class="
                                isPublicVisibility
                                    ? 'border-crh-blue bg-crh-blue text-white shadow-[0_6px_16px_-10px_rgba(0,82,155,0.85)]'
                                    : 'border-slate-300 bg-white text-transparent'
                            ">
                            <svg
                                viewBox="0 0 20 20"
                                fill="none"
                                class="h-3.5 w-3.5">
                                <path
                                    d="M5 10.5L8.5 14L15 7.5"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round" />
                            </svg>
                        </span>
                        <span class="min-w-0"> 公开展示 </span>
                    </button>

                    <div
                        v-else
                        class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-600">
                        当前未登录，只能提交公开反馈；安全性问题需登录后提交。
                    </div>

                    <button
                        type="button"
                        class="flex w-full cursor-pointer items-start gap-3 rounded-[1rem] border px-4 py-4 text-sm leading-6 transition"
                        :class="
                            hasReadSmartQuestions
                                ? 'border-crh-blue/20 bg-blue-50/60 text-slate-800'
                                : 'border-slate-200 bg-white/80 text-slate-700 hover:border-slate-300 hover:bg-slate-50/80'
                        "
                        role="checkbox"
                        :aria-checked="hasReadSmartQuestions"
                        @click="hasReadSmartQuestions = !hasReadSmartQuestions">
                        <span
                            aria-hidden="true"
                            class="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition"
                            :class="
                                hasReadSmartQuestions
                                    ? 'border-crh-blue bg-crh-blue text-white shadow-[0_6px_16px_-10px_rgba(0,82,155,0.85)]'
                                    : 'border-slate-300 bg-white text-transparent'
                            ">
                            <svg
                                viewBox="0 0 20 20"
                                fill="none"
                                class="h-3.5 w-3.5">
                                <path
                                    d="M5 10.5L8.5 14L15 7.5"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round" />
                            </svg>
                        </span>
                        <div
                            class="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
                            <span class="min-w-0 text-left"> 我已经阅读 </span>
                            <span
                                role="button"
                                tabindex="0"
                                class="cursor-pointer text-left font-semibold text-crh-blue underline decoration-crh-blue/35 underline-offset-4 transition hover:text-crh-blue-dark"
                                @click.stop.prevent="
                                    isSmartQuestionsModalOpen = true
                                "
                                @keydown.enter.stop.prevent="
                                    isSmartQuestionsModalOpen = true
                                "
                                @keydown.space.stop.prevent="
                                    isSmartQuestionsModalOpen = true
                                ">
                                《提问的智慧》
                            </span>
                        </div>
                    </button>

                    <p
                        v-if="createErrorMessage"
                        class="text-sm text-status-delayed">
                        {{ createErrorMessage }}
                    </p>
                </div>
            </div>

            <template #footer>
                <div
                    class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <UiButton
                        type="button"
                        variant="secondary"
                        :disabled="isSubmitting"
                        @click="handleComposerVisibilityChange(false)">
                        取消
                    </UiButton>
                    <UiButton
                        type="button"
                        :loading="isSubmitting"
                        :disabled="!canSubmitComposer"
                        @click="submitTopic">
                        提交反馈
                    </UiButton>
                </div>
            </template>
        </component>

        <FeedbackSmartQuestionsModal
            :model-value="isSmartQuestionsModalOpen"
            :is-mobile="isMobileLayout"
            @update:model-value="isSmartQuestionsModalOpen = $event" />

        <AppFooter />
    </main>
</template>

<script setup lang="ts">
definePageMeta({
    middleware: 'feedback-page-transition'
});

import {
    computed,
    defineAsyncComponent,
    nextTick,
    onBeforeUnmount,
    onMounted,
    reactive,
    ref,
    watch
} from 'vue';
import type {
    CreateFeedbackTopicResponse,
    FeedbackPrimaryType,
    FeedbackSecondaryType,
    FeedbackStatus,
    FeedbackTopicListItem,
    FeedbackTopicListResponse,
    FeedbackVisibility
} from '~/types/feedback';
import type { TrackerApiResponse } from '~/types/homepage';
import UiBottomSheet from '~/components/ui/UiBottomSheet.vue';
import UiButton from '~/components/ui/UiButton.vue';
import UiCard from '~/components/ui/UiCard.vue';
import UiEmptyState from '~/components/ui/UiEmptyState.vue';
import UiField from '~/components/ui/UiField.vue';
import UiModal from '~/components/ui/UiModal.vue';
import UiSelect from '~/components/ui/UiSelect.vue';
import UiStatusBadge from '~/components/ui/UiStatusBadge.vue';
import UiTabs from '~/components/ui/UiTabs.vue';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import {
    feedbackPrimaryTypeSelectOptions,
    feedbackStatusSelectOptions,
    getFeedbackCategoryLabel,
    getFeedbackSecondaryTypeOptions,
    getFeedbackStatusLabel,
    getFeedbackStatusTone,
    getFeedbackVisibilityLabel,
    isSecurityFeedbackCategory
} from '~/utils/feedback/catalog';
import {
    buildFeedbackTopicBody,
    createEmptyFeedbackComposerFields,
    type FeedbackComposerFields
} from '~/utils/feedback/topic';
import formatTrackerTimestamp from '~/utils/time/formatTrackerTimestamp';

const FeedbackSmartQuestionsModal = defineAsyncComponent(
    () => import('~/components/feedback/FeedbackSmartQuestionsModal.vue')
);

interface BarcodeDetectionResult {
    rawValue?: string;
}

interface BarcodeDetectorLike {
    detect(
        source:
            | ImageBitmap
            | HTMLCanvasElement
            | HTMLImageElement
            | ImageData
            | Blob
    ): Promise<BarcodeDetectionResult[]>;
}

type BarcodeDetectorConstructor = new (options?: {
    formats?: string[];
}) => BarcodeDetectorLike;

interface TravelCodeQrWorkerRequestMessage {
    id: number;
    buffer: ArrayBuffer;
    width: number;
    height: number;
}

interface TravelCodeQrWorkerResponseMessage {
    id: number;
    rawValue: string;
    error?: string;
}

const requestFetch = import.meta.server ? useRequestFetch() : $fetch;
const route = useRoute();
const { isAuthenticated } = useAuthState();

const MOBILE_QUERY = '(max-width: 767px)';

const desktopPrimaryOptions = feedbackPrimaryTypeSelectOptions.filter(
    (option): option is { value: FeedbackPrimaryType; label: string } =>
        option.value !== ''
);

const viewTabOptions = computed(() => {
    const options = [
        {
            value: 'public',
            label: '公开反馈'
        }
    ];

    if (isAuthenticated.value) {
        options.push({
            value: 'mine',
            label: '我的反馈'
        });
    }

    return options;
});

const currentView = ref<'public' | 'mine'>(
    isAuthenticated.value && route.query.view === 'mine' ? 'mine' : 'public'
);
const filterPrimaryType = ref<FeedbackPrimaryType | ''>('');
const filterSecondaryType = ref<FeedbackSecondaryType | ''>('');
const filterStatus = ref<FeedbackStatus | ''>('');
const isComposerOpen = ref(false);
const isSmartQuestionsModalOpen = ref(false);
const hasReadSmartQuestions = ref(false);
const isMobileLayout = ref(false);
const topics = ref<FeedbackTopicListItem[]>([]);
const nextCursor = ref('');
const isTopicsPending = ref(true);
const isLoadingMore = ref(false);
const topicsErrorMessage = ref('');
const isSubmitting = ref(false);
const createErrorMessage = ref('');
const travelCodeState = ref<
    'idle' | 'scanning' | 'success' | 'failed' | 'unsupported'
>('idle');
const travelCodeMessage = ref('');
const selectedTravelCodeImageName = ref('');
const fileInputKey = ref(0);
const travelCodeFileInput = ref<HTMLInputElement | null>(null);
const composerContentRef = ref<HTMLElement | null>(null);
const composerSecondarySectionRef = ref<HTMLElement | null>(null);
const composerFieldsSectionRef = ref<HTMLElement | null>(null);
const mediaQueryList = ref<MediaQueryList | null>(null);
let travelCodeQrWorker: Worker | null = null;
let travelCodeQrWorkerTaskId = 0;

const composerForm = reactive<{
    primaryType: FeedbackPrimaryType | '';
    secondaryType: FeedbackSecondaryType | '';
    visibility: FeedbackVisibility;
    details: FeedbackComposerFields;
}>({
    primaryType: '',
    secondaryType: '',
    visibility: 'public',
    details: createEmptyFeedbackComposerFields()
});

const inlineFilterSecondaryOptions = computed(() => {
    if (!filterPrimaryType.value) {
        return [
            {
                value: '',
                label: '全部细分'
            }
        ];
    }

    return [
        {
            value: '',
            label: '全部细分'
        },
        ...getFeedbackSecondaryTypeOptions(filterPrimaryType.value)
    ];
});

const desktopSecondaryOptions = computed(() => {
    if (!composerForm.primaryType) {
        return [];
    }

    return getFeedbackSecondaryTypeOptions(composerForm.primaryType);
});

const mobileSecondaryOptions = computed(() => desktopSecondaryOptions.value);

const isSecurityCategory = computed(() => {
    if (!composerForm.primaryType) {
        return false;
    }

    return isSecurityFeedbackCategory(
        composerForm.primaryType,
        composerForm.secondaryType
    );
});

const isTrainDataCategory = computed(() => {
    return (
        composerForm.primaryType === 'data' &&
        (composerForm.secondaryType === 'train_missing' ||
            composerForm.secondaryType === 'train_wrong')
    );
});

const isCouplingCategory = computed(() => {
    return (
        composerForm.primaryType === 'data' &&
        composerForm.secondaryType === 'coupling_missing'
    );
});

const showTravelCodeQuestion = computed(() => {
    return (
        isCouplingCategory.value &&
        composerForm.details.missingEmuCode.trim().length > 0
    );
});

const canShowComposerFields = computed(() => {
    if (!composerForm.primaryType) {
        return false;
    }

    if (composerForm.primaryType === 'other') {
        return true;
    }

    return composerForm.secondaryType !== '';
});

const canSubmitComposer = computed(() => {
    if (!canShowComposerFields.value) {
        return false;
    }

    if (!hasReadSmartQuestions.value) {
        return false;
    }

    if (isSecurityCategory.value && !isAuthenticated.value) {
        return false;
    }

    if (isTrainDataCategory.value || isCouplingCategory.value) {
        return composerForm.details.trainCode.trim().length > 0;
    }

    return true;
});

const isPublicVisibility = computed({
    get() {
        return composerForm.visibility === 'public';
    },
    set(value: boolean) {
        composerForm.visibility = value ? 'public' : 'private';
    }
});

const hasActiveFilters = computed(() => {
    return (
        filterPrimaryType.value !== '' ||
        filterSecondaryType.value !== '' ||
        filterStatus.value !== ''
    );
});

function formatTimestamp(value: number) {
    return formatTrackerTimestamp(value);
}

function formatTopicPreview(value: string) {
    const normalizedValue = value.replace(/\s+/g, ' ').trim();
    return normalizedValue.length > 140
        ? normalizedValue.slice(0, 140) + '...'
        : normalizedValue;
}

function getSheetOptionClass(currentValue: string, optionValue: string) {
    return currentValue === optionValue
        ? 'flex w-full items-center justify-between gap-4 rounded-[1rem] border border-crh-blue/20 bg-blue-50/80 px-4 py-4 text-left text-sm font-semibold text-crh-blue transition'
        : 'flex w-full items-center justify-between gap-4 rounded-[1rem] border border-slate-200 bg-white/90 px-4 py-4 text-left text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50/80';
}

function isComposerFocusableElement(element: Element) {
    return element.matches(
        'button[id^="ui-select-button-"]:not([disabled]), input[type="text"]:not([disabled]), textarea:not([disabled]), button[data-composer-nav="true"]:not([disabled])'
    );
}

function getComposerFocusableElements() {
    if (!composerContentRef.value) {
        return [];
    }

    return Array.from(
        composerContentRef.value.querySelectorAll<HTMLElement>(
            'button[id^="ui-select-button-"]:not([disabled]), input[type="text"]:not([disabled]), textarea:not([disabled]), button[data-composer-nav="true"]:not([disabled])'
        )
    ).filter((element) => element.getClientRects().length > 0);
}

function focusComposerFieldByOffset(
    currentElement: HTMLElement,
    offset: 1 | -1
) {
    const elements = getComposerFocusableElements();
    const currentIndex = elements.findIndex(
        (element) => element === currentElement
    );

    if (currentIndex < 0) {
        return;
    }

    const nextElement = elements[currentIndex + offset];
    nextElement?.focus();
}

async function focusFirstComposerField() {
    await nextTick();
    getComposerFocusableElements()[0]?.focus();
}

async function scrollComposerSectionIntoView(section: 'secondary' | 'fields') {
    if (!isMobileLayout.value) {
        return;
    }

    await nextTick();

    const targetElement =
        section === 'secondary'
            ? composerSecondarySectionRef.value
            : composerFieldsSectionRef.value;

    if (!targetElement || !composerContentRef.value) {
        return;
    }

    const scrollContainer = composerContentRef.value.parentElement;
    if (!scrollContainer) {
        return;
    }

    const containerRect = scrollContainer.getBoundingClientRect();
    const targetRect = targetElement.getBoundingClientRect();
    const nextTop =
        scrollContainer.scrollTop + (targetRect.top - containerRect.top) - 16;

    scrollContainer.scrollTo({
        top: Math.max(nextTop, 0),
        behavior: 'smooth'
    });
}

function focusNextComposerField(event: KeyboardEvent) {
    if (event.isComposing) {
        return;
    }

    const currentElement = event.currentTarget as HTMLElement | null;
    if (!currentElement) {
        return;
    }

    focusComposerFieldByOffset(currentElement, 1);
}

function focusPreviousComposerFieldOnBackspace(event: KeyboardEvent) {
    if (event.isComposing) {
        return;
    }

    const currentElement = event.currentTarget as
        | HTMLInputElement
        | HTMLTextAreaElement
        | null;
    if (
        !currentElement ||
        currentElement.value.length > 0 ||
        currentElement.selectionStart !== 0 ||
        currentElement.selectionEnd !== 0
    ) {
        return;
    }

    event.preventDefault();
    focusComposerFieldByOffset(currentElement, -1);
}

function handleComposerFieldKeydown(event: KeyboardEvent) {
    if (event.key !== 'Backspace' || event.isComposing) {
        return;
    }

    const target = event.target;
    if (
        !(target instanceof HTMLElement) ||
        !isComposerFocusableElement(target)
    ) {
        return;
    }

    if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
    ) {
        return;
    }

    event.preventDefault();
    focusComposerFieldByOffset(target, -1);
}

function resetComposerForm() {
    composerForm.primaryType = '';
    composerForm.secondaryType = '';
    composerForm.visibility = 'public';
    composerForm.details = createEmptyFeedbackComposerFields();
    createErrorMessage.value = '';
    hasReadSmartQuestions.value = false;
    travelCodeState.value = 'idle';
    travelCodeMessage.value = '';
    selectedTravelCodeImageName.value = '';
    fileInputKey.value += 1;
}

function selectComposerPrimaryType(value: FeedbackPrimaryType) {
    composerForm.primaryType = value;
    composerForm.secondaryType = '';
    composerForm.visibility = 'public';
    composerForm.details = createEmptyFeedbackComposerFields();
    hasReadSmartQuestions.value = false;
    travelCodeState.value = 'idle';
    travelCodeMessage.value = '';
    selectedTravelCodeImageName.value = '';
    fileInputKey.value += 1;
    void scrollComposerSectionIntoView(
        mobileSecondaryOptions.value.length > 0 ? 'secondary' : 'fields'
    );
}

function selectComposerSecondaryType(value: FeedbackSecondaryType) {
    composerForm.secondaryType = value;
    void scrollComposerSectionIntoView('fields');
}

function applyViewportState(queryList: MediaQueryList | null) {
    isMobileLayout.value = queryList?.matches ?? false;
}

function handleViewportChange(event: MediaQueryListEvent) {
    isMobileLayout.value = event.matches;
}

function openComposer() {
    resetComposerForm();
    isComposerOpen.value = true;
    void focusFirstComposerField();
}

function handleComposerVisibilityChange(value: boolean) {
    isComposerOpen.value = value;

    if (value) {
        void focusFirstComposerField();
    }

    if (!value && !isSubmitting.value) {
        resetComposerForm();
    }
}

function resetFilters() {
    filterPrimaryType.value = '';
    filterSecondaryType.value = '';
    filterStatus.value = '';
}

function clearTravelCodeState() {
    composerForm.details.travelCode = '';
    travelCodeState.value = 'idle';
    travelCodeMessage.value = '';
    selectedTravelCodeImageName.value = '';
    fileInputKey.value += 1;
}

function openTravelCodeFilePicker() {
    travelCodeFileInput.value?.click();
}

function ensureTravelCodeQrWorker() {
    if (travelCodeQrWorker) {
        return travelCodeQrWorker;
    }

    travelCodeQrWorker = new Worker(
        new URL('~/utils/feedback/travelCodeQr.worker.ts', import.meta.url),
        {
            type: 'module'
        }
    );

    return travelCodeQrWorker;
}

function decodeTravelCodeWithWorker(imageData: ImageData): Promise<string> {
    const worker = ensureTravelCodeQrWorker();
    const id = ++travelCodeQrWorkerTaskId;

    return new Promise((resolve, reject) => {
        const handleMessage = (
            event: MessageEvent<TravelCodeQrWorkerResponseMessage>
        ) => {
            if (event.data.id !== id) {
                return;
            }

            worker.removeEventListener('message', handleMessage);
            worker.removeEventListener('error', handleError);

            if (event.data.error) {
                reject(new Error(event.data.error));
                return;
            }

            resolve(event.data.rawValue);
        };

        const handleError = (event: ErrorEvent) => {
            worker.removeEventListener('message', handleMessage);
            worker.removeEventListener('error', handleError);
            reject(event.error ?? new Error(event.message));
        };

        worker.addEventListener('message', handleMessage);
        worker.addEventListener('error', handleError, { once: true });
        worker.postMessage(
            {
                id,
                buffer: imageData.data.buffer,
                width: imageData.width,
                height: imageData.height
            } satisfies TravelCodeQrWorkerRequestMessage,
            [imageData.data.buffer]
        );
    });
}

function drawImageBitmapToCanvas(imageBitmap: ImageBitmap, maxEdge = 1600) {
    const longestEdge = Math.max(imageBitmap.width, imageBitmap.height);
    const scale =
        longestEdge > maxEdge && longestEdge > 0 ? maxEdge / longestEdge : 1;
    const width = Math.max(1, Math.round(imageBitmap.width * scale));
    const height = Math.max(1, Math.round(imageBitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
        return null;
    }

    context.drawImage(imageBitmap, 0, 0, width, height);

    return {
        canvas,
        context,
        width,
        height
    };
}

function extractTravelCodeFromUrl(rawValue: string) {
    try {
        const url = new URL(rawValue.trim());
        if (
            url.origin !== 'https://p.12306.cn' ||
            url.pathname !== '/tservice/qr/travel/v1'
        ) {
            return '';
        }

        return url.searchParams.get('c')?.trim() ?? '';
    } catch {
        return '';
    }
}

async function readTravelCodeFromImage(file: File) {
    if (!import.meta.client) {
        return '';
    }

    const globalWindow = window as typeof window & {
        BarcodeDetector?: BarcodeDetectorConstructor;
    };
    const BarcodeDetector = globalWindow.BarcodeDetector;
    const imageBitmap = await createImageBitmap(file);

    try {
        if (BarcodeDetector) {
            const detector = new BarcodeDetector({
                formats: ['qr_code']
            });
            const results = await detector.detect(imageBitmap);
            for (const result of results) {
                const travelCode = extractTravelCodeFromUrl(
                    result.rawValue ?? ''
                );
                if (travelCode) {
                    return travelCode;
                }
            }
        }

        const canvasContext = drawImageBitmapToCanvas(imageBitmap);
        if (!canvasContext) {
            return '';
        }

        const imageData = canvasContext.context.getImageData(
            0,
            0,
            canvasContext.width,
            canvasContext.height
        );
        try {
            const rawValue = await decodeTravelCodeWithWorker(imageData);
            return extractTravelCodeFromUrl(rawValue);
        } catch {
            const { default: jsQR } = await import('jsqr');
            const fallbackResult = jsQR(
                imageData.data,
                imageData.width,
                imageData.height
            );

            return extractTravelCodeFromUrl(fallbackResult?.data ?? '');
        }
    } catch {
        return '';
    } finally {
        imageBitmap.close();
    }
}

async function handleTravelCodeImageChange(event: Event) {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;

    composerForm.details.travelCode = '';
    selectedTravelCodeImageName.value = file?.name ?? '';

    if (!file) {
        travelCodeState.value = 'idle';
        travelCodeMessage.value = '';
        return;
    }

    travelCodeState.value = 'scanning';
    travelCodeMessage.value = '正在本地识别畅行码，请稍候。';

    try {
        const travelCode = await readTravelCodeFromImage(file);
        if (travelCode === null) {
            return;
        }
        if (travelCode) {
            composerForm.details.travelCode = travelCode;
            travelCodeState.value = 'success';
            travelCodeMessage.value = '已识别出畅行码。';
            return;
        }

        travelCodeState.value = 'failed';
        travelCodeMessage.value = '未能从照片中识别出有效的畅行码。';
    } catch {
        travelCodeState.value = 'failed';
        travelCodeMessage.value = '识图失败，请更换图片或直接提交说明。';
    }
}

async function fetchTopicList(cursor = '') {
    const response = await requestFetch<
        TrackerApiResponse<FeedbackTopicListResponse>
    >('/api/v1/feedback/topics', {
        retry: 0,
        query: {
            view: currentView.value,
            primaryType: filterPrimaryType.value || undefined,
            secondaryType: filterSecondaryType.value || undefined,
            status: filterStatus.value || undefined,
            cursor: cursor || undefined,
            limit: 20
        }
    });

    if (!response.ok) {
        throw {
            data: response
        };
    }

    return response.data;
}

async function loadTopics(reset = true) {
    const cursor = reset ? '' : nextCursor.value;
    if (!reset && !cursor) {
        return;
    }

    if (reset) {
        isTopicsPending.value = true;
        topicsErrorMessage.value = '';
    } else {
        isLoadingMore.value = true;
    }

    try {
        const payload = await fetchTopicList(cursor);
        nextCursor.value = payload.nextCursor;
        topics.value = reset
            ? payload.items
            : [...topics.value, ...payload.items];
    } catch (error) {
        topicsErrorMessage.value = getApiErrorMessage(
            error,
            '加载反馈列表失败，请稍后重试。'
        );
        if (reset) {
            topics.value = [];
            nextCursor.value = '';
        }
    } finally {
        isTopicsPending.value = false;
        isLoadingMore.value = false;
    }
}

watch(isAuthenticated, (nextValue) => {
    if (!nextValue && currentView.value === 'mine') {
        currentView.value = 'public';
    }
});

watch(filterPrimaryType, (nextValue) => {
    if (!nextValue) {
        filterSecondaryType.value = '';
        return;
    }

    const options = getFeedbackSecondaryTypeOptions(nextValue);
    if (!options.some((option) => option.value === filterSecondaryType.value)) {
        filterSecondaryType.value = '';
    }
});

watch(
    () => composerForm.primaryType,
    (nextValue) => {
        if (!nextValue) {
            composerForm.secondaryType = '';
            return;
        }

        if (nextValue === 'other') {
            composerForm.secondaryType = '';
            return;
        }

        const options = getFeedbackSecondaryTypeOptions(nextValue);
        if (
            !options.some(
                (option) => option.value === composerForm.secondaryType
            )
        ) {
            composerForm.secondaryType = '';
        }
    }
);

watch(showTravelCodeQuestion, (nextValue) => {
    if (!nextValue) {
        composerForm.details.hasTravelCodeImage = false;
        clearTravelCodeState();
    }
});

watch(isSecurityCategory, (nextValue) => {
    if (nextValue) {
        composerForm.visibility = 'private';
    }
});

watch(
    [currentView, filterPrimaryType, filterSecondaryType, filterStatus],
    () => {
        void loadTopics(true);
    }
);

onMounted(() => {
    const nextMediaQueryList = window.matchMedia(MOBILE_QUERY);
    mediaQueryList.value = nextMediaQueryList;
    applyViewportState(nextMediaQueryList);
    nextMediaQueryList.addEventListener('change', handleViewportChange);
});

onBeforeUnmount(() => {
    mediaQueryList.value?.removeEventListener('change', handleViewportChange);
    travelCodeQrWorker?.terminate();
    travelCodeQrWorker = null;
});

await loadTopics(true);

async function loadMoreTopics() {
    await loadTopics(false);
}

async function goHome() {
    await navigateTo('/');
}

async function submitTopic() {
    if (
        isSubmitting.value ||
        !composerForm.primaryType ||
        !canSubmitComposer.value
    ) {
        return;
    }

    const secondaryType =
        composerForm.primaryType === 'other' ? '' : composerForm.secondaryType;

    isSubmitting.value = true;
    createErrorMessage.value = '';

    try {
        const requestBody = buildFeedbackTopicBody(
            composerForm.primaryType,
            secondaryType,
            composerForm.details
        );
        const { data, error } = await useCsrfFetch<
            TrackerApiResponse<CreateFeedbackTopicResponse>
        >('/api/v1/feedback/topics', {
            method: 'POST',
            body: {
                primaryType: composerForm.primaryType,
                secondaryType,
                visibility: isSecurityCategory.value
                    ? 'private'
                    : isAuthenticated.value
                      ? composerForm.visibility
                      : 'public',
                body: requestBody
            },
            key: 'feedback:create:' + Date.now(),
            watch: false,
            server: false
        });

        if (error.value) {
            throw error.value;
        }

        const response = data.value;
        if (!response) {
            throw new Error('Missing feedback response');
        }

        if (!response.ok) {
            throw {
                data: response
            };
        }

        isComposerOpen.value = false;
        await navigateTo('/feedback/' + response.data.id);
    } catch (error) {
        createErrorMessage.value = getApiErrorMessage(
            error,
            '提交反馈失败，请稍后重试。'
        );
    } finally {
        isSubmitting.value = false;
    }
}

useSiteSeo({
    title: '反馈 | Open CRH Tracker',
    description:
        '站内反馈入口，可查看公开反馈，并按类型向导提交网站、数据、API、文档和其他反馈。',
    path: '/feedback'
});
</script>
