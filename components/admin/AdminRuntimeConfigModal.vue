<template>
    <UiModal
        :model-value="modelValue"
        eyebrow="APP CONFIG"
        title="运行配置原始 JSON"
        description="查看并编辑当前环境实际加载的配置文件。"
        size="screen"
        height="screen"
        :close-on-backdrop="!isSaving"
        @update:model-value="handleVisibilityChange">
        <div class="space-y-5">
            <div
                class="border-y border-amber-200 bg-amber-50/80 px-4 py-3 text-sm leading-6 text-amber-950 sm:px-5">
                <p class="font-semibold">该文件可能包含私钥和 API Key</p>
                <p class="mt-1 text-amber-900/80">
                    环境变量提供的值不会显示在原文中，并会继续覆盖文件中的对应配置；数据库连接、固定缓存容量等启动时状态仍可能需要重启进程。
                </p>
            </div>

            <div
                v-if="loadStatus === 'pending' && !hasDocument"
                class="space-y-4"
                aria-live="polite">
                <div class="h-16 animate-pulse bg-slate-100" />
                <div class="h-[min(58vh,38rem)] animate-pulse bg-slate-100" />
            </div>

            <div
                v-else-if="loadStatus === 'error' && !hasDocument"
                class="border-y border-rose-200 bg-rose-50/80 px-5 py-6">
                <p class="text-base font-semibold text-rose-900">
                    原始配置加载失败
                </p>
                <p class="mt-2 text-sm leading-6 text-rose-700">
                    {{ loadErrorMessage }}
                </p>
                <UiButton
                    type="button"
                    variant="secondary"
                    class="mt-4"
                    @click="loadRuntimeConfig">
                    重试
                </UiButton>
            </div>

            <template v-else-if="hasDocument">
                <div
                    class="grid border-y border-slate-200 bg-slate-50/80 text-sm sm:grid-cols-2 xl:grid-cols-[1.1fr_0.8fr_0.8fr_1.3fr]">
                    <div
                        class="border-b border-slate-200 px-4 py-3 sm:border-r xl:border-b-0">
                        <p class="text-xs font-semibold text-slate-500">语法</p>
                        <p
                            class="mt-1 font-semibold"
                            :class="
                                syntaxErrorMessage
                                    ? 'text-rose-700'
                                    : 'text-emerald-700'
                            ">
                            {{ syntaxErrorMessage ? 'JSON 无效' : 'JSON 有效' }}
                        </p>
                    </div>
                    <div
                        class="border-b border-slate-200 px-4 py-3 xl:border-r xl:border-b-0">
                        <p class="text-xs font-semibold text-slate-500">状态</p>
                        <p
                            class="mt-1 font-semibold"
                            :class="
                                isDirty ? 'text-amber-700' : 'text-slate-700'
                            ">
                            {{ isDirty ? '有未保存修改' : '与磁盘一致' }}
                        </p>
                    </div>
                    <div
                        class="border-b border-slate-200 px-4 py-3 sm:border-r xl:border-b-0">
                        <p class="text-xs font-semibold text-slate-500">
                            最后修改
                        </p>
                        <p class="mt-1 font-semibold text-slate-700">
                            {{ formatTimestamp(modifiedAt) }}
                        </p>
                    </div>
                    <div class="min-w-0 px-4 py-3">
                        <p class="text-xs font-semibold text-slate-500">文件</p>
                        <p
                            class="mt-1 truncate font-mono text-xs leading-5 text-slate-700"
                            :title="filePath">
                            {{ filePath }}
                        </p>
                    </div>
                </div>

                <div class="space-y-2">
                    <label
                        for="runtime-config-json"
                        class="block text-sm font-semibold text-slate-900">
                        原始 JSON
                    </label>
                    <textarea
                        id="runtime-config-json"
                        v-model="draftContent"
                        class="harmony-input harmony-scrollbar block min-h-[min(58vh,38rem)] w-full resize-y overflow-auto whitespace-pre px-4 py-4 font-mono text-[13px] leading-6 text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-70"
                        wrap="off"
                        :disabled="isSaving"
                        :aria-invalid="syntaxErrorMessage.length > 0"
                        :aria-describedby="
                            syntaxErrorMessage
                                ? 'runtime-config-syntax-error'
                                : undefined
                        "
                        autocomplete="off"
                        autocapitalize="off"
                        spellcheck="false" />
                    <p
                        v-if="syntaxErrorMessage"
                        id="runtime-config-syntax-error"
                        class="text-sm leading-6 text-rose-700"
                        role="alert">
                        {{ syntaxErrorMessage }}
                    </p>
                    <p
                        v-else
                        class="text-sm leading-6 text-slate-500">
                        服务端会在写入前继续执行完整运行配置校验。
                    </p>
                </div>

                <div
                    v-if="feedbackMessage"
                    class="border-y px-4 py-3 text-sm leading-6 sm:px-5"
                    :class="feedbackClass"
                    aria-live="polite">
                    <p class="font-semibold">
                        {{ feedbackTitle }}
                    </p>
                    <p class="mt-1">{{ feedbackMessage }}</p>
                </div>
            </template>
        </div>

        <template #footer>
            <div
                class="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <UiButton
                    v-if="hasDocument"
                    type="button"
                    variant="ghost"
                    :loading="isReloading"
                    :disabled="isSaving"
                    @click="requestReloadFromDisk">
                    重新读取磁盘版本
                </UiButton>
                <span v-else />

                <div class="flex flex-col-reverse gap-3 sm:flex-row">
                    <UiButton
                        type="button"
                        variant="secondary"
                        :disabled="isSaving"
                        @click="requestClose">
                        取消
                    </UiButton>
                    <UiButton
                        v-if="hasDocument"
                        type="button"
                        :loading="isSaving"
                        :disabled="!canSubmit"
                        @click="saveAndReload">
                        保存并尝试重载
                    </UiButton>
                </div>
            </div>
        </template>
    </UiModal>

    <UiModal
        :model-value="isDiscardConfirmOpen"
        eyebrow="未保存修改"
        title="放弃当前修改？"
        description="当前 JSON 尚未保存，继续操作会丢失这些修改。"
        layer="raised"
        :close-on-backdrop="true"
        @update:model-value="isDiscardConfirmOpen = $event">
        <div
            class="border-y border-amber-200 bg-amber-50/80 px-5 py-4 text-sm leading-6 text-amber-950">
            磁盘文件和当前运行配置不会受到这些未保存内容的影响。
        </div>

        <template #footer>
            <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <UiButton
                    type="button"
                    variant="secondary"
                    @click="cancelDiscard">
                    继续编辑
                </UiButton>
                <UiButton
                    type="button"
                    class="bg-rose-700 text-white hover:bg-rose-800"
                    @click="confirmDiscard">
                    放弃修改
                </UiButton>
            </div>
        </template>
    </UiModal>
</template>

<script setup lang="ts">
import type {
    AdminRuntimeConfigDocumentResponse,
    AdminRuntimeConfigUpdateResponse
} from '~/types/admin';
import type { TrackerApiResponse } from '~/types/homepage';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import formatTrackerTimestamp from '~/utils/time/formatTrackerTimestamp';

type LoadStatus = 'idle' | 'pending' | 'success' | 'error';
type FeedbackTone = 'success' | 'error' | 'conflict';
type PendingDiscardAction = 'close' | 'reload';

const props = defineProps<{
    modelValue: boolean;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    updated: [response: AdminRuntimeConfigUpdateResponse];
}>();

const loadStatus = ref<LoadStatus>('idle');
const loadErrorMessage = ref('');
const isReloading = ref(false);
const isSaving = ref(false);
const originalContent = ref('');
const draftContent = ref('');
const revision = ref('');
const filePath = ref('');
const modifiedAt = ref(0);
const feedbackTone = ref<FeedbackTone | null>(null);
const feedbackMessage = ref('');
const isDiscardConfirmOpen = ref(false);
const pendingDiscardAction = ref<PendingDiscardAction | null>(null);

const hasDocument = computed(() => revision.value.length > 0);
const isDirty = computed(
    () => hasDocument.value && draftContent.value !== originalContent.value
);
const syntaxErrorMessage = computed(() => {
    if (draftContent.value.length === 0) {
        return 'JSON 内容不能为空。';
    }

    try {
        const parsed = JSON.parse(draftContent.value) as unknown;
        if (
            typeof parsed !== 'object' ||
            parsed === null ||
            Array.isArray(parsed)
        ) {
            return 'JSON 根节点必须是对象。';
        }
        return '';
    } catch (error) {
        return error instanceof Error
            ? `JSON 语法错误：${error.message}`
            : 'JSON 语法错误。';
    }
});
const canSubmit = computed(
    () =>
        isDirty.value &&
        syntaxErrorMessage.value.length === 0 &&
        !isSaving.value &&
        !isReloading.value
);
const feedbackTitle = computed(() => {
    switch (feedbackTone.value) {
        case 'success':
            return '配置已更新';
        case 'conflict':
            return '磁盘版本已变化';
        default:
            return '操作失败';
    }
});
const feedbackClass = computed(() => {
    switch (feedbackTone.value) {
        case 'success':
            return 'border-emerald-200 bg-emerald-50/80 text-emerald-800';
        case 'conflict':
            return 'border-amber-200 bg-amber-50/80 text-amber-900';
        default:
            return 'border-rose-200 bg-rose-50/80 text-rose-700';
    }
});

function getApiErrorCode(error: unknown) {
    if (typeof error !== 'object' || error === null) {
        return '';
    }

    const candidate = error as {
        data?: { error?: unknown };
        response?: { _data?: { error?: unknown } };
    };
    const errorCode = candidate.data?.error ?? candidate.response?._data?.error;
    return typeof errorCode === 'string' ? errorCode : '';
}

function applyDocument(document: AdminRuntimeConfigDocumentResponse) {
    originalContent.value = document.content;
    draftContent.value = document.content;
    revision.value = document.revision;
    filePath.value = document.filePath;
    modifiedAt.value = document.modifiedAt;
    feedbackTone.value = null;
    feedbackMessage.value = '';
    loadStatus.value = 'success';
}

async function fetchRuntimeConfigDocument() {
    const response = await $fetch<
        TrackerApiResponse<AdminRuntimeConfigDocumentResponse>
    >('/api/v1/admin/config-files/config', {
        retry: 0,
        cache: 'no-store'
    });

    if (!response.ok) {
        throw {
            data: response
        };
    }

    return response.data;
}

async function loadRuntimeConfig() {
    const isInitialLoad = !hasDocument.value;
    if (isInitialLoad) {
        loadStatus.value = 'pending';
        loadErrorMessage.value = '';
    } else {
        isReloading.value = true;
    }

    try {
        applyDocument(await fetchRuntimeConfigDocument());
    } catch (error) {
        const message = getApiErrorMessage(error, '加载原始运行配置失败。');
        if (isInitialLoad) {
            loadStatus.value = 'error';
            loadErrorMessage.value = message;
        } else {
            feedbackTone.value = 'error';
            feedbackMessage.value = message;
        }
    } finally {
        isReloading.value = false;
    }
}

async function saveAndReload() {
    if (!canSubmit.value) {
        return;
    }

    isSaving.value = true;
    feedbackTone.value = null;
    feedbackMessage.value = '';

    try {
        const submittedContent = draftContent.value;
        const { data, error } = await useCsrfFetch<
            TrackerApiResponse<AdminRuntimeConfigUpdateResponse>
        >('/api/v1/admin/config-files/config', {
            method: 'PUT',
            retry: 0,
            body: {
                content: submittedContent,
                expectedRevision: revision.value
            },
            key: `admin:runtime-config:update:${Date.now()}`,
            watch: false,
            server: false
        });

        if (error.value) {
            throw error.value;
        }

        const response = data.value;
        if (!response) {
            throw new Error('Missing runtime config update response');
        }
        if (!response.ok) {
            throw {
                data: response
            };
        }

        originalContent.value = submittedContent;
        revision.value = response.data.revision;
        modifiedAt.value = response.data.modifiedAt;
        feedbackTone.value = 'success';
        feedbackMessage.value = response.data.summary;
        emit('updated', response.data);
    } catch (error) {
        feedbackTone.value =
            getApiErrorCode(error) === 'config_conflict' ? 'conflict' : 'error';
        feedbackMessage.value = getApiErrorMessage(
            error,
            '保存并重载运行配置失败。'
        );
    } finally {
        isSaving.value = false;
    }
}

function requestDiscard(action: PendingDiscardAction) {
    pendingDiscardAction.value = action;
    isDiscardConfirmOpen.value = true;
}

function requestClose() {
    if (isSaving.value) {
        return;
    }
    if (isDirty.value) {
        requestDiscard('close');
        return;
    }
    emit('update:modelValue', false);
}

function requestReloadFromDisk() {
    if (isDirty.value) {
        requestDiscard('reload');
        return;
    }
    void loadRuntimeConfig();
}

function handleVisibilityChange(nextValue: boolean) {
    if (nextValue) {
        emit('update:modelValue', true);
        return;
    }
    requestClose();
}

function cancelDiscard() {
    isDiscardConfirmOpen.value = false;
    pendingDiscardAction.value = null;
}

function confirmDiscard() {
    const action = pendingDiscardAction.value;
    isDiscardConfirmOpen.value = false;
    pendingDiscardAction.value = null;

    if (action === 'reload') {
        void loadRuntimeConfig();
        return;
    }
    if (action === 'close') {
        emit('update:modelValue', false);
    }
}

function resetState() {
    loadStatus.value = 'idle';
    loadErrorMessage.value = '';
    isReloading.value = false;
    isSaving.value = false;
    originalContent.value = '';
    draftContent.value = '';
    revision.value = '';
    filePath.value = '';
    modifiedAt.value = 0;
    feedbackTone.value = null;
    feedbackMessage.value = '';
    isDiscardConfirmOpen.value = false;
    pendingDiscardAction.value = null;
}

function formatTimestamp(timestamp: number) {
    return timestamp > 0 ? formatTrackerTimestamp(timestamp) : '--';
}

watch(
    () => props.modelValue,
    (isOpen) => {
        if (isOpen) {
            void loadRuntimeConfig();
            return;
        }
        resetState();
    },
    {
        immediate: true
    }
);
</script>
