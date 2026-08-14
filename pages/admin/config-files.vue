<template>
    <AdminShell
        v-model:date-input="selectedDateInput"
        :today-date-input-value="todayDateInputValue"
        :session="session"
        :show-date-input="false"
        title="配置文件"
        description="从本地重载运行配置和各类映射资产，或从远程服务器刷新支持更新的资源文件。">
        <template #toolbar>
            <UiButton
                type="button"
                variant="secondary"
                :loading="configFilesStatus === 'pending'"
                @click="refreshConfigFiles()">
                刷新
            </UiButton>
        </template>

        <div class="space-y-6">
            <UiCard :show-accent-bar="false">
                <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div
                        class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-5 py-4">
                        <p
                            class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                            文件
                        </p>
                        <p class="mt-2 text-3xl font-semibold text-slate-900">
                            {{ formatNumber(configFileItems.length) }}
                        </p>
                        <p class="mt-2 text-sm leading-6 text-slate-500">
                            当前可管理的配置资源数量
                        </p>
                    </div>

                    <div
                        class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-5 py-4">
                        <p
                            class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                            本地
                        </p>
                        <p class="mt-2 text-3xl font-semibold text-slate-900">
                            {{ formatNumber(existingFileCount) }}
                        </p>
                        <p class="mt-2 text-sm leading-6 text-slate-500">
                            本地已存在的文件数量
                        </p>
                    </div>

                    <div
                        class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-5 py-4">
                        <p
                            class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                            远程
                        </p>
                        <p class="mt-2 text-3xl font-semibold text-slate-900">
                            {{ formatNumber(remoteCapableCount) }}
                        </p>
                        <p class="mt-2 text-sm leading-6 text-slate-500">
                            支持远程刷新的资源数量
                        </p>
                    </div>

                    <div
                        class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-5 py-4">
                        <p
                            class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                            统计时间
                        </p>
                        <p class="mt-2 text-2xl font-semibold text-slate-900">
                            {{ formatTimestamp(configFilesData?.asOf ?? 0) }}
                        </p>
                        <p class="mt-2 text-sm leading-6 text-slate-500">
                            当前页面状态时间
                        </p>
                    </div>
                </div>
            </UiCard>

            <UiEmptyState
                v-if="configFilesErrorMessage"
                eyebrow="加载失败"
                title="配置文件状态加载失败"
                :description="configFilesErrorMessage"
                tone="danger">
                <UiButton
                    type="button"
                    variant="secondary"
                    @click="refreshConfigFiles()">
                    重试
                </UiButton>
            </UiEmptyState>

            <div
                v-else-if="configFilesStatus === 'pending' && !configFilesData"
                class="grid gap-6 xl:grid-cols-3">
                <div
                    v-for="index in 4"
                    :key="`admin-config-files-skeleton:${index}`"
                    class="h-80 animate-pulse rounded-[1.25rem] bg-slate-100/90" />
            </div>

            <div
                v-else
                class="grid gap-6 xl:grid-cols-3">
                <UiCard
                    v-for="item in configFileItems"
                    :key="item.target"
                    :show-accent-bar="false">
                    <div class="space-y-6">
                        <div class="space-y-2">
                            <p
                                class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                                {{ getItemEyebrow(item.target) }}
                            </p>
                            <h2 class="text-2xl font-semibold text-slate-900">
                                {{ item.title }}
                            </h2>
                            <p class="text-sm leading-6 text-slate-600">
                                {{ item.description }}
                            </p>
                        </div>

                        <div class="flex flex-wrap gap-2">
                            <span
                                class="inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold"
                                :class="
                                    item.exists
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : 'bg-rose-50 text-rose-700'
                                ">
                                {{
                                    item.exists
                                        ? '本地文件已存在'
                                        : '本地文件不存在'
                                }}
                            </span>
                            <span
                                class="inline-flex items-center rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
                                {{
                                    item.supportedActions.includes(
                                        'refresh_remote'
                                    )
                                        ? '支持远程刷新'
                                        : '仅支持本地重载'
                                }}
                            </span>
                        </div>

                        <div class="space-y-3">
                            <div
                                class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                                <p
                                    class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                    文件路径
                                </p>
                                <p
                                    class="mt-2 break-all font-mono text-xs leading-6 text-slate-700">
                                    {{ item.filePath }}
                                </p>
                            </div>

                            <div
                                class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                                <p
                                    class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                    数据源
                                </p>
                                <p
                                    class="mt-2 break-all font-mono text-xs leading-6 text-slate-700">
                                    {{ item.provider ?? '未配置远程地址' }}
                                </p>
                            </div>

                            <div
                                class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                                <p
                                    class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                    最后修改
                                </p>
                                <p
                                    class="mt-2 text-sm font-semibold text-slate-900">
                                    {{ formatTimestamp(item.modifiedAt) }}
                                </p>
                            </div>
                        </div>

                        <div
                            v-if="actionMessages[item.target]"
                            class="rounded-[1rem] border px-4 py-4 text-sm leading-6"
                            :class="
                                actionMessages[item.target]?.tone === 'success'
                                    ? 'border-emerald-200 bg-emerald-50/80 text-emerald-800'
                                    : 'border-rose-200 bg-rose-50/80 text-rose-700'
                            ">
                            {{ actionMessages[item.target]?.text }}
                        </div>

                        <div class="flex flex-wrap gap-3">
                            <UiButton
                                v-if="item.editable"
                                type="button"
                                variant="secondary"
                                @click="openEditor(item.target)">
                                查看并编辑 JSON
                            </UiButton>

                            <UiButton
                                type="button"
                                variant="secondary"
                                :loading="
                                    activeActionKey ===
                                    buildActionKey(item.target, 'reload_local')
                                "
                                @click="runAction(item.target, 'reload_local')">
                                从本地重载
                            </UiButton>

                            <UiButton
                                v-if="
                                    item.supportedActions.includes(
                                        'refresh_remote'
                                    )
                                "
                                type="button"
                                :loading="
                                    activeActionKey ===
                                    buildActionKey(
                                        item.target,
                                        'refresh_remote'
                                    )
                                "
                                @click="
                                    runAction(item.target, 'refresh_remote')
                                ">
                                从远程刷新
                            </UiButton>
                        </div>
                    </div>
                </UiCard>
            </div>
        </div>

        <AdminConfigFileEditorModal
            v-model="isConfigFileEditorOpen"
            :target="configFileEditorTarget ?? 'config'"
            @updated="handleConfigFileUpdated" />
    </AdminShell>
</template>

<script setup lang="ts">
import { useAdminDateQuery } from '~/composables/useAdminDateQuery';
import type {
    AdminConfigFileAction,
    AdminConfigFileActionResponse,
    AdminConfigFileItem,
    AdminConfigFilesResponse,
    AdminConfigFileTarget,
    AdminRuntimeConfigUpdateResponse
} from '~/types/admin';
import {
    createAdminConfigFile,
    fetchAdminConfigFiles
} from '~/utils/api/v2/domain/admin';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import formatTrackerTimestamp from '~/utils/time/formatTrackerTimestamp';

definePageMeta({
    middleware: 'admin-required'
});

type ActionMessageTone = 'success' | 'error';

const { session } = useAuthState();
const { selectedDateInput, todayDateInputValue } = await useAdminDateQuery();

const activeActionKey = ref('');
const isConfigFileEditorOpen = ref(false);
const configFileEditorTarget = ref<AdminConfigFileTarget | null>(null);
const actionMessages = ref<
    Partial<
        Record<
            AdminConfigFileTarget,
            {
                tone: ActionMessageTone;
                text: string;
            }
        >
    >
>({});

async function fetchConfigFiles() {
    return fetchAdminConfigFiles();
}

const {
    data: configFilesData,
    status: configFilesStatus,
    error: configFilesError,
    refresh: refreshConfigFiles
} = await useAsyncData('admin-config-files', fetchConfigFiles);

const configFilesErrorMessage = computed(() =>
    configFilesError.value
        ? getApiErrorMessage(configFilesError.value, '加载配置文件状态失败。')
        : ''
);
const configFileItems = computed(() => configFilesData.value?.items ?? []);
const existingFileCount = computed(
    () => configFileItems.value.filter((item) => item.exists).length
);
const remoteCapableCount = computed(
    () =>
        configFileItems.value.filter((item) =>
            item.supportedActions.includes('refresh_remote')
        ).length
);

function buildActionKey(
    target: AdminConfigFileTarget,
    action: AdminConfigFileAction
) {
    return `${target}:${action}`;
}

function getItemEyebrow(target: AdminConfigFileTarget) {
    switch (target) {
        case 'config':
            return '配置';
        case 'EMUList':
            return '配属';
        case 'QRCode':
            return '畅行码';
        case 'qrcodeDetection':
            return '畅行码检测';
        case 'supplementTrains':
            return '补充车次';
        default:
            return '文件';
    }
}

function openEditor(target: AdminConfigFileTarget) {
    configFileEditorTarget.value = target;
    isConfigFileEditorOpen.value = true;
}

async function postConfigFileAction(body: {
    target: AdminConfigFileTarget;
    action: AdminConfigFileAction;
}) {
    return createAdminConfigFile(body.target, body.action);
}

function patchConfigFileItem(nextItem: AdminConfigFileItem) {
    if (!configFilesData.value) {
        return;
    }

    configFilesData.value = {
        ...configFilesData.value,
        items: configFilesData.value.items.map((item) =>
            item.target === nextItem.target ? nextItem : item
        )
    };
}

async function handleConfigFileUpdated(
    response: AdminRuntimeConfigUpdateResponse
) {
    patchConfigFileItem(response.item);
    actionMessages.value.config = {
        tone: 'success',
        text: response.summary
    };

    try {
        await refreshConfigFiles();
    } catch {
        // Preserve the confirmed update state when the follow-up refresh fails.
    }
}

async function runAction(
    target: AdminConfigFileTarget,
    action: AdminConfigFileAction
) {
    const actionKey = buildActionKey(target, action);
    activeActionKey.value = actionKey;
    actionMessages.value[target] = undefined;

    try {
        const response = await postConfigFileAction({
            target,
            action
        });
        patchConfigFileItem(response.item);
        actionMessages.value[target] = {
            tone: 'success',
            text: response.summary
        };

        try {
            await refreshConfigFiles();
        } catch {
            // Preserve local success state when the follow-up refresh fails.
        }
    } catch (error) {
        actionMessages.value[target] = {
            tone: 'error',
            text: getApiErrorMessage(error, '执行配置文件操作失败。')
        };
    } finally {
        activeActionKey.value = '';
    }
}

useSiteSeo({
    title: '配置文件 | Open CRH Tracker',
    description:
        '管理员配置文件页面，用于从本地重载运行配置和各类映射资产，或从远程服务器刷新支持更新的资源文件。',
    path: '/admin/config-files',
    noindex: true
});

function formatTimestamp(timestamp: number | null | undefined) {
    if (!Number.isFinite(timestamp) || !timestamp || timestamp <= 0) {
        return '--';
    }

    return formatTrackerTimestamp(timestamp);
}

function formatNumber(value: number) {
    return value.toLocaleString('zh-CN');
}
</script>
