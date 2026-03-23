<template>
    <main class="flex min-h-screen flex-col bg-crh-slate text-crh-grey-dark">
        <div
            class="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,_rgba(0,82,155,0.1),_transparent_58%)]" />

        <div
            class="relative mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-10"
            :class="isMobileLayout ? 'pb-32' : ''">
            <UiEmptyState
                v-if="isTopicPending"
                eyebrow="Loading"
                title="正在加载反馈详情"
                description="请稍候。" />

            <UiEmptyState
                v-else-if="topicErrorMessage"
                eyebrow="Load Failed"
                title="反馈详情加载失败"
                :description="topicErrorMessage"
                tone="danger" />

            <template v-else-if="topic">
                <div
                    class="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
                    <aside
                        class="order-2 space-y-6 lg:order-1 lg:sticky lg:top-8">
                        <UiCard
                            v-if="!isMobileLayout"
                            variant="accent">
                            <div class="space-y-4">
                                <div class="space-y-2">
                                    <p
                                        class="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                                        OVERVIEW
                                    </p>
                                    <h2
                                        class="text-xl font-semibold text-slate-900">
                                        基础信息
                                    </h2>
                                </div>

                                <dl class="space-y-3 text-sm">
                                    <div
                                        class="flex items-start justify-between gap-4">
                                        <dt class="text-slate-500">反馈作者</dt>
                                        <dd
                                            class="text-right font-medium text-slate-800">
                                            {{ topic.authorName }}
                                        </dd>
                                    </div>
                                    <div
                                        class="flex items-start justify-between gap-4">
                                        <dt class="text-slate-500">创建时间</dt>
                                        <dd
                                            class="text-right font-medium text-slate-800">
                                            {{
                                                formatTimestamp(topic.createdAt)
                                            }}
                                        </dd>
                                    </div>
                                    <div
                                        class="flex items-start justify-between gap-4">
                                        <dt class="text-slate-500">最后活动</dt>
                                        <dd
                                            class="text-right font-medium text-slate-800">
                                            {{
                                                formatTimestamp(
                                                    topic.lastRepliedAt
                                                )
                                            }}
                                        </dd>
                                    </div>
                                    <div
                                        class="flex items-start justify-between gap-4">
                                        <dt class="text-slate-500">回复数</dt>
                                        <dd
                                            class="text-right font-medium text-slate-800">
                                            {{ topic.messages.length }}
                                        </dd>
                                    </div>
                                    <div
                                        class="flex items-start justify-between gap-4">
                                        <dt class="text-slate-500">当前筛选</dt>
                                        <dd
                                            class="text-right font-medium text-slate-800">
                                            {{
                                                replyFilterMode === 'all'
                                                    ? '全部回复'
                                                    : '关键回复'
                                            }}
                                        </dd>
                                    </div>
                                </dl>
                            </div>
                        </UiCard>

                        <UiCard
                            v-if="!isMobileLayout"
                            class="overflow-visible">
                            <div class="space-y-4">
                                <div class="space-y-2">
                                    <p
                                        class="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                                        ACTIONS
                                    </p>
                                    <h2
                                        class="text-lg font-semibold text-slate-900">
                                        基础操作
                                    </h2>
                                </div>

                                <NuxtLink
                                    to="/feedback"
                                    class="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-crh-blue shadow-sm transition-[box-shadow,background-color,border-color,color] duration-200 ease-out hover:border-crh-blue/25 hover:bg-blue-50 hover:shadow-[0_10px_22px_-18px_rgba(15,23,42,0.35)]">
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
                                    返回反馈列表
                                </NuxtLink>

                                <div class="space-y-2">
                                    <p
                                        class="text-sm font-medium text-slate-700">
                                        回复筛选
                                    </p>
                                    <div class="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            class="rounded-xl border px-3 py-2 text-sm font-medium transition"
                                            :class="
                                                replyFilterMode === 'all'
                                                    ? 'border-crh-blue bg-blue-50 text-crh-blue'
                                                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                                            "
                                            @click="replyFilterMode = 'all'">
                                            全部回复
                                        </button>
                                        <button
                                            type="button"
                                            class="rounded-xl border px-3 py-2 text-sm font-medium transition"
                                            :class="
                                                replyFilterMode === 'key'
                                                    ? 'border-crh-blue bg-blue-50 text-crh-blue'
                                                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                                            "
                                            @click="replyFilterMode = 'key'">
                                            关键回复
                                        </button>
                                    </div>
                                </div>

                                <UiButton
                                    variant="secondary"
                                    size="sm"
                                    class="w-full justify-center"
                                    @click="scrollToBottom">
                                    滚动到底部
                                </UiButton>

                                <UiButton
                                    v-if="
                                        topic.permissions.canManage &&
                                        topic.visibility === 'public'
                                    "
                                    variant="secondary"
                                    size="sm"
                                    class="w-full justify-center"
                                    :loading="isDeleting"
                                    @click="hideTopic">
                                    设为不公开
                                </UiButton>
                            </div>
                        </UiCard>

                        <div
                            v-if="topic.permissions.canManage"
                            ref="manageSectionRef">
                            <UiCard class="overflow-visible">
                                <div class="space-y-4">
                                    <div class="space-y-2">
                                        <p
                                            class="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                                            MODERATION
                                        </p>
                                        <h2
                                            class="text-xl font-semibold text-slate-900">
                                            管理操作
                                        </h2>
                                    </div>

                                    <UiField
                                        label="标题"
                                        help="管理员手动修改标题后，后续调整分类不会再自动覆盖。">
                                        <input
                                            v-model.trim="manageForm.title"
                                            type="text"
                                            maxlength="80"
                                            class="harmony-input w-full px-4 py-3 text-base"
                                            placeholder="请输入反馈标题" />
                                    </UiField>

                                    <div class="grid gap-4">
                                        <UiField label="分类">
                                            <UiSelect
                                                v-model="manageForm.categoryKey"
                                                :options="
                                                    feedbackCategorySelectOptions
                                                "
                                                mobile-sheet-title="选择分类"
                                                mobile-sheet-eyebrow="MODERATION" />
                                        </UiField>

                                        <UiField label="状态">
                                            <UiSelect
                                                v-model="manageForm.status"
                                                :options="manageStatusOptions"
                                                mobile-sheet-title="选择状态"
                                                mobile-sheet-eyebrow="MODERATION" />
                                        </UiField>
                                    </div>

                                    <p
                                        v-if="manageErrorMessage"
                                        class="text-sm text-status-delayed">
                                        {{ manageErrorMessage }}
                                    </p>

                                    <div class="flex justify-end">
                                        <UiButton
                                            :loading="isSavingManage"
                                            @click="saveManageChanges">
                                            保存管理修改
                                        </UiButton>
                                    </div>
                                </div>
                            </UiCard>
                        </div>
                    </aside>

                    <div class="order-1 space-y-6 lg:order-2">
                        <UiCard variant="accent">
                            <div class="space-y-5">
                                <div class="space-y-3">
                                    <div
                                        class="flex flex-wrap items-center gap-2">
                                        <UiStatusBadge
                                            :label="
                                                getFeedbackStatusLabel(
                                                    topic.status
                                                )
                                            "
                                            :tone="
                                                getFeedbackStatusTone(
                                                    topic.status
                                                )
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
                                            :label="
                                                getFeedbackVisibilityLabel(
                                                    topic.visibility
                                                )
                                            "
                                            tone="neutral" />
                                        <UiStatusBadge
                                            v-if="topic.titleMode === 'custom'"
                                            label="管理员自定义标题"
                                            tone="warning" />
                                    </div>

                                    <div class="space-y-2">
                                        <h1
                                            class="text-3xl font-semibold tracking-tight text-slate-900">
                                            {{ topic.title }}
                                        </h1>
                                        <p
                                            class="text-sm leading-6 text-slate-500">
                                            {{ topic.authorName }} · 创建于
                                            {{
                                                formatTimestamp(topic.createdAt)
                                            }}
                                            · 最后活动
                                            {{
                                                formatTimestamp(
                                                    topic.lastRepliedAt
                                                )
                                            }}
                                        </p>
                                    </div>
                                </div>

                                <div
                                    class="rounded-[1.2rem] border border-slate-200 bg-white/90 px-5 py-5">
                                    <p
                                        class="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                                        TOPIC
                                    </p>
                                    <p
                                        class="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                                        {{ topic.body }}
                                    </p>
                                </div>
                            </div>
                        </UiCard>

                        <div ref="discussionSectionRef">
                            <UiCard>
                                <div class="space-y-5">
                                    <div class="space-y-2">
                                        <p
                                            class="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                                            DISCUSSION
                                        </p>
                                        <div
                                            class="flex flex-wrap items-center justify-between gap-3">
                                            <h2
                                                class="text-xl font-semibold text-slate-900">
                                                话题交流
                                            </h2>
                                            <p class="text-sm text-slate-500">
                                                {{
                                                    replyFilterMode === 'all'
                                                        ? '显示全部回复'
                                                        : '仅显示反馈提出者与管理员回复'
                                                }}
                                            </p>
                                        </div>
                                    </div>

                                    <UiEmptyState
                                        v-if="topic.messages.length === 0"
                                        eyebrow="No Replies"
                                        title="无回复"
                                        description="" />

                                    <UiEmptyState
                                        v-else-if="visibleMessages.length === 0"
                                        eyebrow="Filtered"
                                        title="当前筛选下暂无回复"
                                        description="" />

                                    <div
                                        v-else
                                        class="space-y-3">
                                        <div
                                            v-for="message in visibleMessages"
                                            :key="message.id"
                                            :class="
                                                message.authorType === 'system'
                                                    ? 'rounded-[1.2rem] border border-slate-200 bg-slate-50/90 px-5 py-4'
                                                    : 'rounded-[1.2rem] border border-slate-200 bg-white/90 px-5 py-5'
                                            ">
                                            <div
                                                class="flex flex-wrap items-center gap-2">
                                                <UiStatusBadge
                                                    v-if="
                                                        message.authorType ===
                                                        'system'
                                                    "
                                                    label="系统记录"
                                                    tone="neutral" />
                                                <UiStatusBadge
                                                    v-else-if="
                                                        message.authorType ===
                                                        'admin'
                                                    "
                                                    label="管理员"
                                                    tone="warning" />
                                                <UiStatusBadge
                                                    v-else-if="
                                                        message.authorType ===
                                                        'topicCreator'
                                                    "
                                                    label="反馈提出者"
                                                    tone="info" />
                                                <span
                                                    class="text-sm font-semibold text-slate-900">
                                                    {{ message.authorName }}
                                                </span>
                                                <span
                                                    class="text-xs text-slate-500">
                                                    {{
                                                        formatTimestamp(
                                                            message.createdAt
                                                        )
                                                    }}
                                                </span>
                                            </div>

                                            <p
                                                class="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                                                {{ message.body }}
                                            </p>
                                        </div>
                                    </div>

                                    <div
                                        v-if="topic.permissions.canReply"
                                        class="space-y-4 rounded-[1.2rem] border border-slate-200 bg-slate-50/80 px-5 py-5">
                                        <UiField label="添加回复">
                                            <textarea
                                                v-model="replyBody"
                                                rows="5"
                                                maxlength="2000"
                                                class="harmony-input min-h-[9rem] w-full resize-y px-4 py-3 text-base"
                                                placeholder="补充更多信息、确认处理结果，或继续和管理员交流。"
                                                @keydown.ctrl.enter.prevent="
                                                    submitReply
                                                "></textarea>
                                        </UiField>

                                        <p
                                            v-if="replyErrorMessage"
                                            class="text-sm text-status-delayed">
                                            {{ replyErrorMessage }}
                                        </p>

                                        <div class="flex justify-end">
                                            <UiButton
                                                :loading="isReplying"
                                                @click="submitReply">
                                                发送回复
                                            </UiButton>
                                        </div>
                                    </div>

                                    <div
                                        v-else
                                        class="rounded-[1.2rem] border border-slate-200 bg-slate-50/80 px-5 py-4 text-sm leading-6 text-slate-600">
                                        请登录你的账号以回复
                                    </div>
                                </div>
                            </UiCard>
                        </div>
                    </div>
                </div>

                <div
                    v-if="isMobileLayout"
                    class="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-20 flex justify-center px-4 lg:hidden">
                    <div
                        class="pointer-events-auto harmony-scrollbar flex w-fit max-w-full items-center gap-2 overflow-x-auto rounded-[1.35rem] border border-slate-200/90 bg-white/95 px-3 py-3 shadow-[0_20px_48px_-24px_rgba(15,23,42,0.42)] backdrop-blur">
                        <NuxtLink
                            to="/feedback"
                            class="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-crh-blue shadow-sm transition-[box-shadow,background-color,border-color,color] duration-200 ease-out hover:border-crh-blue/25 hover:bg-blue-50 hover:shadow-[0_10px_22px_-18px_rgba(15,23,42,0.35)]">
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
                            返回列表
                        </NuxtLink>
                        <button
                            type="button"
                            class="shrink-0 rounded-xl border px-3 py-2 text-sm font-medium transition"
                            :class="
                                replyFilterMode === 'all'
                                    ? 'border-crh-blue bg-blue-50 text-crh-blue'
                                    : 'border-slate-200 bg-white text-slate-600'
                            "
                            @click="replyFilterMode = 'all'">
                            全部回复
                        </button>
                        <button
                            type="button"
                            class="shrink-0 rounded-xl border px-3 py-2 text-sm font-medium transition"
                            :class="
                                replyFilterMode === 'key'
                                    ? 'border-crh-blue bg-blue-50 text-crh-blue'
                                    : 'border-slate-200 bg-white text-slate-600'
                            "
                            @click="replyFilterMode = 'key'">
                            关键回复
                        </button>
                        <button
                            type="button"
                            class="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                            @click="scrollToBottom">
                            滚动到底部
                        </button>
                        <button
                            v-if="topic.permissions.canManage"
                            type="button"
                            class="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                            @click="scrollToManageSection">
                            管理区
                        </button>
                        <button
                            v-if="
                                topic.permissions.canManage &&
                                topic.visibility === 'public'
                            "
                            type="button"
                            class="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                            @click="hideTopic">
                            设为不公开
                        </button>
                    </div>
                </div>
            </template>
        </div>

        <AppFooter />
    </main>
</template>

<script setup lang="ts">
definePageMeta({
    middleware: 'feedback-page-transition'
});

import {
    computed,
    nextTick,
    onBeforeUnmount,
    onMounted,
    reactive,
    ref,
    watch
} from 'vue';
import type {
    DeleteFeedbackTopicResponse,
    FeedbackCategoryKey,
    FeedbackMessage,
    FeedbackStatus,
    FeedbackTopicDetail,
    ReplyFeedbackMessageResponse,
    UpdateFeedbackTopicResponse
} from '~/types/feedback';
import { FEEDBACK_CATEGORY_OPTIONS } from '~/types/feedback';
import UiButton from '~/components/ui/UiButton.vue';
import UiCard from '~/components/ui/UiCard.vue';
import UiEmptyState from '~/components/ui/UiEmptyState.vue';
import UiField from '~/components/ui/UiField.vue';
import UiSelect from '~/components/ui/UiSelect.vue';
import UiStatusBadge from '~/components/ui/UiStatusBadge.vue';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import {
    feedbackCategorySelectOptions,
    getFeedbackCategoryKey,
    getFeedbackCategoryLabel,
    getFeedbackStatusLabel,
    getFeedbackStatusTone,
    getFeedbackVisibilityLabel
} from '~/utils/feedback/catalog';
import formatTrackerTimestamp from '~/utils/time/formatTrackerTimestamp';
import type { TrackerApiResponse } from '~/types/homepage';

const route = useRoute();
const requestFetch = import.meta.server ? useRequestFetch() : $fetch;

const MOBILE_QUERY = '(max-width: 767px)';

const manageStatusOptions = [
    {
        value: 'pending',
        label: '待受理'
    },
    {
        value: 'processing',
        label: '受理中'
    },
    {
        value: 'submitted_change',
        label: '已提交更改'
    },
    {
        value: 'resolved',
        label: '受理完毕'
    },
    {
        value: 'invalid',
        label: '无效'
    }
];

const topic = ref<FeedbackTopicDetail | null>(null);
const isTopicPending = ref(true);
const topicErrorMessage = ref('');
const replyBody = ref('');
const replyErrorMessage = ref('');
const isReplying = ref(false);
const isSavingManage = ref(false);
const manageErrorMessage = ref('');
const isDeleting = ref(false);
const isMobileLayout = ref(false);
const mediaQueryList = ref<MediaQueryList | null>(null);
const replyFilterMode = ref<'all' | 'key'>('all');
const discussionSectionRef = ref<HTMLElement | null>(null);
const bottomAnchorRef = ref<HTMLElement | null>(null);
const manageSectionRef = ref<HTMLElement | null>(null);

const manageForm = reactive<{
    title: string;
    categoryKey: FeedbackCategoryKey;
    status: FeedbackStatus;
}>({
    title: '',
    categoryKey: 'website.bug',
    status: 'pending'
});

const visibleMessages = computed(() => {
    if (!topic.value) {
        return [];
    }

    if (replyFilterMode.value === 'all') {
        return topic.value.messages;
    }

    return topic.value.messages.filter(isKeyReplyMessage);
});

function isKeyReplyMessage(message: FeedbackMessage) {
    return (
        message.authorType === 'admin' || message.authorType === 'topicCreator'
    );
}

function formatTimestamp(value: number) {
    return formatTrackerTimestamp(value);
}

function applyViewportState(queryList: MediaQueryList | null) {
    isMobileLayout.value = queryList?.matches ?? false;
}

function handleViewportChange(event: MediaQueryListEvent) {
    isMobileLayout.value = event.matches;
}

async function scrollToElement(target: HTMLElement | null) {
    await nextTick();
    target?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
    });
}

async function scrollToBottom() {
    await scrollToElement(bottomAnchorRef.value ?? discussionSectionRef.value);
}

async function scrollToManageSection() {
    await scrollToElement(manageSectionRef.value);
}

watch(
    topic,
    (nextTopic) => {
        if (!nextTopic) {
            return;
        }

        manageForm.title = nextTopic.title;
        manageForm.categoryKey = getFeedbackCategoryKey(
            nextTopic.primaryType,
            nextTopic.secondaryType
        );
        manageForm.status = nextTopic.status;
    },
    {
        immediate: true
    }
);

async function fetchTopicDetail() {
    const response = await requestFetch<
        TrackerApiResponse<FeedbackTopicDetail>
    >('/api/v1/feedback/topics/' + String(route.params.id), {
        retry: 0
    });

    if (!response.ok) {
        throw {
            data: response
        };
    }

    return response.data;
}

async function loadTopic() {
    isTopicPending.value = true;
    topicErrorMessage.value = '';

    try {
        topic.value = await fetchTopicDetail();
    } catch (error) {
        topic.value = null;
        topicErrorMessage.value = getApiErrorMessage(
            error,
            '加载反馈详情失败，请稍后重试。'
        );
    } finally {
        isTopicPending.value = false;
    }
}

await loadTopic();

async function submitReply() {
    if (isReplying.value || !topic.value) {
        return;
    }

    isReplying.value = true;
    replyErrorMessage.value = '';

    try {
        const { data, error } = await useCsrfFetch<
            TrackerApiResponse<ReplyFeedbackMessageResponse>
        >('/api/v1/feedback/topics/' + topic.value.id + '/messages', {
            method: 'POST',
            body: {
                body: replyBody.value
            },
            key: 'feedback:reply:' + topic.value.id + ':' + Date.now(),
            watch: false,
            server: false
        });

        if (error.value) {
            throw error.value;
        }

        const response = data.value;
        if (!response) {
            throw new Error('Missing reply response');
        }

        if (!response.ok) {
            throw {
                data: response
            };
        }

        replyBody.value = '';
        await loadTopic();
    } catch (error) {
        replyErrorMessage.value = getApiErrorMessage(
            error,
            '发送回复失败，请稍后重试。'
        );
    } finally {
        isReplying.value = false;
    }
}

async function saveManageChanges() {
    if (isSavingManage.value || !topic.value) {
        return;
    }

    const category = FEEDBACK_CATEGORY_OPTIONS.find(
        (option) => option.key === manageForm.categoryKey
    );
    if (!category) {
        manageErrorMessage.value = '反馈分类无效。';
        return;
    }

    isSavingManage.value = true;
    manageErrorMessage.value = '';

    try {
        const { data, error } = await useCsrfFetch<
            TrackerApiResponse<UpdateFeedbackTopicResponse>
        >('/api/v1/feedback/topics/' + topic.value.id, {
            method: 'PATCH',
            body: {
                title: manageForm.title,
                primaryType: category.primaryType,
                secondaryType: category.secondaryType,
                status: manageForm.status
            },
            key: 'feedback:manage:' + topic.value.id + ':' + Date.now(),
            watch: false,
            server: false
        });

        if (error.value) {
            throw error.value;
        }

        const response = data.value;
        if (!response) {
            throw new Error('Missing topic update response');
        }

        if (!response.ok) {
            throw {
                data: response
            };
        }

        await loadTopic();
    } catch (error) {
        manageErrorMessage.value = getApiErrorMessage(
            error,
            '保存管理修改失败，请稍后重试。'
        );
    } finally {
        isSavingManage.value = false;
    }
}

async function hideTopic() {
    if (isDeleting.value || !topic.value) {
        return;
    }

    if (import.meta.client && !window.confirm('确认将这条反馈设为不公开？')) {
        return;
    }

    isDeleting.value = true;

    try {
        const { data, error } = await useCsrfFetch<
            TrackerApiResponse<DeleteFeedbackTopicResponse>
        >('/api/v1/feedback/topics/' + topic.value.id, {
            method: 'DELETE',
            key: 'feedback:delete:' + topic.value.id + ':' + Date.now(),
            watch: false,
            server: false
        });

        if (error.value) {
            throw error.value;
        }

        const response = data.value;
        if (!response) {
            throw new Error('Missing delete response');
        }

        if (!response.ok) {
            throw {
                data: response
            };
        }

        await loadTopic();
    } catch (error) {
        topicErrorMessage.value = getApiErrorMessage(
            error,
            '设为不公开失败，请稍后重试。'
        );
    } finally {
        isDeleting.value = false;
    }
}

onMounted(() => {
    const nextMediaQueryList = window.matchMedia(MOBILE_QUERY);
    applyViewportState(nextMediaQueryList);
    nextMediaQueryList.addEventListener('change', handleViewportChange);
    mediaQueryList.value = nextMediaQueryList;
});

onBeforeUnmount(() => {
    mediaQueryList.value?.removeEventListener('change', handleViewportChange);
});

useSiteSeo({
    title: () => (topic.value?.title ?? '反馈详情') + ' | Open CRH Tracker',
    description: () =>
        topic.value?.body.slice(0, 80) || '站内反馈详情与交流记录。',
    path: () => '/feedback/' + route.params.id,
    type: 'article',
    noindex: () => topic.value?.visibility === 'private'
});
</script>
