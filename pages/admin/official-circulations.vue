<template>
    <AdminShell
        v-model:date-input="selectedDateInput"
        :today-date-input-value="todayDateInputValue"
        :session="session"
        :show-date-input="false"
        title="官方交路表"
        description="搜索、预览并删除 schedule.json 中的官方交路表定义。">
        <UiCard :show-accent-bar="false">
            <div class="space-y-6">
                <div class="space-y-2">
                    <p
                        class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                        Official Circulation
                    </p>
                    <h2 class="text-2xl font-semibold text-slate-900">
                        搜索并删除官方交路表
                    </h2>
                    <p class="text-sm leading-6 text-slate-600">
                        输入任意车次号或 internalCode，系统会在
                        `schedule.json` 的 `circulation` 中做精确归一化匹配。
                    </p>
                </div>

                <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                    <UiField
                        label="车次号或 internalCode"
                        help="只搜索官方交路表；删除后如果仍存在推测交路，用户侧仍可能看到推测结果。">
                        <input
                            v-model="keywordInput"
                            type="text"
                            inputmode="text"
                            autocomplete="off"
                            class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark"
                            placeholder="例如 G1 或 54000G710991"
                            @keydown.enter.prevent="submitSearch" />
                    </UiField>

                    <div class="flex items-end justify-end gap-3">
                        <UiButton
                            type="button"
                            variant="secondary"
                            :disabled="
                                normalizedKeywordInput.length === 0 ||
                                searchStatus === 'pending'
                            "
                            @click="clearSearch">
                            清空
                        </UiButton>
                        <UiButton
                            type="button"
                            :loading="searchStatus === 'pending'"
                            :disabled="normalizedKeywordInput.length === 0"
                            @click="submitSearch">
                            搜索
                        </UiButton>
                    </div>
                </div>

                <div
                    class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                    <p class="text-xs uppercase tracking-[0.18em] text-slate-400">
                        当前输入
                    </p>
                    <p class="mt-2 text-sm leading-6 text-slate-700">
                        {{
                            normalizedKeywordInput.length > 0
                                ? `归一化关键字：${normalizedKeywordInput}`
                                : '请输入有效关键字后再搜索。'
                        }}
                    </p>
                </div>
            </div>
        </UiCard>

        <UiCard
            :show-accent-bar="false"
            class="mt-6">
            <div class="space-y-6">
                <div
                    v-if="actionSuccessMessage"
                    class="rounded-[1rem] border border-emerald-200 bg-emerald-50/80 px-4 py-4 text-sm leading-6 text-emerald-800">
                    {{ actionSuccessMessage }}
                </div>

                <UiEmptyState
                    v-if="searchStatus === 'idle'"
                    eyebrow="待搜索"
                    title="请输入关键字"
                    description="输入任意车次号或 internalCode 后，可以预览并删除对应官方交路表。" />

                <div
                    v-else-if="searchStatus === 'pending'"
                    class="space-y-3">
                    <div
                        v-for="index in 4"
                        :key="`official-circulation-loading:${index}`"
                        class="h-24 animate-pulse rounded-[1rem] bg-slate-100/90" />
                </div>

                <UiEmptyState
                    v-else-if="searchErrorMessage"
                    eyebrow="加载失败"
                    title="官方交路表搜索失败"
                    :description="searchErrorMessage"
                    tone="danger">
                    <UiButton
                        type="button"
                        variant="secondary"
                        @click="repeatLastSearch">
                        重试
                    </UiButton>
                </UiEmptyState>

                <template v-else-if="searchData">
                    <div class="grid gap-3 md:grid-cols-3">
                        <div
                            class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                            <p
                                class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                命中数量
                            </p>
                            <p class="mt-2 text-3xl font-semibold text-slate-900">
                                {{ formatNumber(searchData.total) }}
                            </p>
                        </div>

                        <div
                            class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                            <p
                                class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                文件修改时间
                            </p>
                            <p class="mt-2 text-sm font-semibold text-slate-900">
                                {{ formatTimestamp(searchData.modifiedAt) }}
                            </p>
                        </div>

                        <div
                            class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                            <p
                                class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                文件路径
                            </p>
                            <p
                                class="mt-2 break-all font-mono text-xs leading-6 text-slate-700">
                                {{ searchData.filePath }}
                            </p>
                        </div>
                    </div>

                    <UiEmptyState
                        v-if="searchData.items.length === 0"
                        eyebrow="无结果"
                        title="没有匹配的官方交路表"
                        description="当前关键字没有命中 schedule.json 中的官方交路表 entry。" />

                    <div
                        v-else
                        class="space-y-4">
                        <article
                            v-for="item in searchData.items"
                            :key="item.entryKey"
                            class="rounded-[1rem] border border-slate-200 bg-white/90 px-4 py-4 shadow-sm">
                            <div class="space-y-4">
                                <div
                                    class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div class="space-y-2">
                                        <div class="flex flex-wrap gap-2">
                                            <span
                                                v-for="matchType in item.matchedBy"
                                                :key="`${item.entryKey}:${matchType}`"
                                                class="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-crh-blue">
                                                {{ getMatchTypeLabel(matchType) }}
                                            </span>
                                        </div>
                                        <h3
                                            class="break-all font-mono text-sm font-semibold text-slate-900">
                                            {{ item.entryKey }}
                                        </h3>
                                        <p class="text-sm leading-6 text-slate-600">
                                            命中代码：{{
                                                item.matchedCodes.join(' / ')
                                            }}
                                        </p>
                                        <p class="text-sm leading-6 text-slate-600">
                                            {{
                                                getEntrySummary(item)
                                            }}
                                        </p>
                                    </div>

                                    <div
                                        class="text-sm leading-6 text-slate-500">
                                        <p>
                                            刷新时间：{{
                                                formatTimestamp(item.refreshedAt)
                                            }}
                                        </p>
                                        <p>节点数：{{ formatNumber(item.nodeCount) }}</p>
                                    </div>
                                </div>

                                <div
                                    class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                                    <p
                                        class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                        交路节点预览
                                    </p>
                                    <div class="mt-3 space-y-2">
                                        <div
                                            v-for="(node, index) in item.nodes"
                                            :key="`${item.entryKey}:${node.internalCode}:${index}`"
                                            class="rounded-[0.9rem] border border-slate-200 bg-white px-3.5 py-3">
                                            <div
                                                class="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                                                <div class="space-y-1">
                                                    <p
                                                        class="font-mono text-xs font-semibold text-slate-900">
                                                        {{ index + 1 }}.
                                                        {{ node.internalCode }}
                                                    </p>
                                                    <p
                                                        class="text-sm text-slate-600">
                                                        {{ node.startStation }}
                                                        到
                                                        {{ node.endStation }}
                                                    </p>
                                                    <p
                                                        class="text-xs leading-5 text-slate-500">
                                                        车次：{{
                                                            node.allCodes.join(
                                                                ' / '
                                                            )
                                                        }}
                                                    </p>
                                                </div>
                                                <div
                                                    class="font-mono text-xs leading-5 text-slate-500">
                                                    <p>
                                                        startAt:
                                                        {{ node.startAt }}
                                                    </p>
                                                    <p>
                                                        endAt: {{ node.endAt }}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div class="flex justify-end">
                                    <UiButton
                                        type="button"
                                        variant="secondary"
                                        :loading="deletingEntryKey === item.entryKey"
                                        :disabled="deletingEntryKey.length > 0"
                                        class="border-rose-200 text-rose-700 hover:border-rose-300 hover:bg-rose-50/80 hover:text-rose-800"
                                        @click="openDeleteDialog(item)">
                                        删除此交路表
                                    </UiButton>
                                </div>
                            </div>
                        </article>
                    </div>
                </template>
            </div>
        </UiCard>

        <component
            :is="isMobileActionSheet ? UiBottomSheet : UiModal"
            :model-value="isDeleteDialogOpen"
            eyebrow="危险操作"
            title="确认删除官方交路表"
            :description="deleteDialogDescription"
            size="lg"
            :close-on-backdrop="!isDeletingEntry"
            @update:model-value="handleDeleteDialogVisibilityChange">
            <div
                v-if="pendingDeleteItem"
                class="space-y-4">
                <div
                    class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4">
                    <p
                        class="text-xs font-medium uppercase tracking-[0.18em] text-rose-700">
                        将删除的官方交路表
                    </p>
                    <div class="mt-3 space-y-2 text-sm leading-6 text-rose-900">
                        <p>主键：{{ pendingDeleteItem.entryKey }}</p>
                        <p>
                            命中代码：{{
                                pendingDeleteItem.matchedCodes.join(' / ')
                            }}
                        </p>
                        <p>节点数：{{ pendingDeleteItem.nodeCount }}</p>
                        <p>
                            刷新时间：{{
                                formatTimestamp(pendingDeleteItem.refreshedAt)
                            }}
                        </p>
                        <p>{{ getEntrySummary(pendingDeleteItem) }}</p>
                    </div>
                </div>

                <div
                    class="rounded-[1rem] border border-amber-200 bg-amber-50/80 px-4 py-4 text-sm leading-6 text-amber-900">
                    该操作只会删除 `schedule.json` 中这张官方交路表，不会删除
                    `daily_emu_routes`、probe status 或其他运行数据。
                </div>

                <p
                    v-if="deleteErrorMessage"
                    class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700">
                    {{ deleteErrorMessage }}
                </p>
            </div>

            <template #footer>
                <div
                    class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <UiButton
                        type="button"
                        variant="secondary"
                        :disabled="isDeletingEntry"
                        @click="closeDeleteDialog">
                        取消
                    </UiButton>
                    <UiButton
                        type="button"
                        :loading="isDeletingEntry"
                        class="bg-[linear-gradient(180deg,#c53030_0%,#b91c1c_100%)] text-white hover:bg-[linear-gradient(180deg,#b91c1c_0%,#991b1b_100%)]"
                        @click="confirmDelete">
                        确认删除
                    </UiButton>
                </div>
            </template>
        </component>
    </AdminShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import UiBottomSheet from '~/components/ui/UiBottomSheet.vue';
import UiModal from '~/components/ui/UiModal.vue';
import useTrackedRequestFetch, {
    type TrackedRequestFetch
} from '~/composables/useTrackedRequestFetch';
import { useAdminDateQuery } from '~/composables/useAdminDateQuery';
import type {
    AdminOfficialCirculationDeleteResponse,
    AdminOfficialCirculationMatchType,
    AdminOfficialCirculationSearchItem,
    AdminOfficialCirculationSearchResponse
} from '~/types/admin';
import type { TrackerApiResponse } from '~/types/homepage';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import formatTrackerTimestamp from '~/utils/time/formatTrackerTimestamp';

definePageMeta({
    middleware: 'admin-required'
});

const MOBILE_QUERY = '(max-width: 767px)';

const requestFetch: TrackedRequestFetch = import.meta.server
    ? useTrackedRequestFetch()
    : ($fetch as TrackedRequestFetch);
const { session } = useAuthState();
const { selectedDateInput, todayDateInputValue } = await useAdminDateQuery();

const keywordInput = ref('');
const searchStatus = ref<'idle' | 'pending' | 'success' | 'error'>('idle');
const searchData = ref<AdminOfficialCirculationSearchResponse | null>(null);
const searchErrorMessage = ref('');
const lastSubmittedKeyword = ref('');
const actionSuccessMessage = ref('');
const deletingEntryKey = ref('');
const pendingDeleteItem = ref<AdminOfficialCirculationSearchItem | null>(null);
const isDeleteDialogOpen = ref(false);
const deleteErrorMessage = ref('');
const isMobileActionSheet = ref(false);
const dialogMediaQuery = ref<MediaQueryList | null>(null);

const normalizedKeywordInput = computed(() =>
    keywordInput.value.trim().toUpperCase()
);
const isDeletingEntry = computed(() => deletingEntryKey.value.length > 0);
const deleteDialogDescription = computed(
    () =>
        '删除后会立即写回 schedule.json，并使官方交路表缓存失效。之后同车次若存在推测交路，仍可能显示推测结果。'
);

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

async function fetchOfficialCirculations(keyword: string) {
    const response = await requestFetch<
        TrackerApiResponse<AdminOfficialCirculationSearchResponse>
    >('/api/v1/admin/official-circulations', {
        retry: 0,
        query: {
            keyword
        }
    });

    if (!response.ok) {
        throw {
            data: response
        };
    }

    return response.data;
}

async function performSearch(keyword: string, clearSuccessMessage = true) {
    searchStatus.value = 'pending';
    searchErrorMessage.value = '';
    if (clearSuccessMessage) {
        actionSuccessMessage.value = '';
    }

    try {
        searchData.value = await fetchOfficialCirculations(keyword);
        lastSubmittedKeyword.value = keyword;
        searchStatus.value = 'success';
    } catch (error) {
        searchErrorMessage.value = getApiErrorMessage(
            error,
            '搜索官方交路表失败。'
        );
        searchStatus.value = 'error';
    }
}

async function submitSearch() {
    const keyword = normalizedKeywordInput.value;
    if (keyword.length === 0 || searchStatus.value === 'pending') {
        return;
    }

    await performSearch(keyword);
}

async function repeatLastSearch() {
    if (lastSubmittedKeyword.value.length === 0) {
        return;
    }

    await performSearch(lastSubmittedKeyword.value);
}

function clearSearch() {
    keywordInput.value = '';
    lastSubmittedKeyword.value = '';
    searchStatus.value = 'idle';
    searchData.value = null;
    searchErrorMessage.value = '';
    actionSuccessMessage.value = '';
    closeDeleteDialog();
}

function getEntrySummary(item: AdminOfficialCirculationSearchItem) {
    const firstNode = item.nodes[0] ?? null;
    const lastNode = item.nodes[item.nodes.length - 1] ?? null;
    if (!firstNode || !lastNode) {
        return '当前交路表没有可展示的节点。';
    }

    return `首段 ${firstNode.startStation} 到 ${firstNode.endStation}，末段 ${lastNode.startStation} 到 ${lastNode.endStation}。`;
}

function getMatchTypeLabel(type: AdminOfficialCirculationMatchType) {
    return type === 'internal_code' ? 'internalCode 命中' : '车次号命中';
}

function openDeleteDialog(item: AdminOfficialCirculationSearchItem) {
    pendingDeleteItem.value = item;
    deleteErrorMessage.value = '';
    isDeleteDialogOpen.value = true;
}

function closeDeleteDialog() {
    if (isDeletingEntry.value) {
        return;
    }

    pendingDeleteItem.value = null;
    deleteErrorMessage.value = '';
    isDeleteDialogOpen.value = false;
}

function handleDeleteDialogVisibilityChange(nextValue: boolean) {
    if (nextValue) {
        isDeleteDialogOpen.value = true;
        return;
    }

    closeDeleteDialog();
}

async function deleteOfficialCirculation(entryKey: string) {
    const encodedEntryKey = encodeURIComponent(entryKey);
    const { data, error } = await useCsrfFetch<
        TrackerApiResponse<AdminOfficialCirculationDeleteResponse>
    >(`/api/v1/admin/official-circulations/${encodedEntryKey}`, {
        method: 'DELETE',
        retry: 0,
        key: `admin:official-circulation-delete:${entryKey}:${Date.now()}`,
        watch: false,
        server: false
    });

    if (error.value) {
        throw error.value;
    }

    const response = data.value;
    if (!response) {
        throw new Error('Missing official circulation delete response');
    }

    if (!response.ok) {
        throw {
            data: response
        };
    }

    return response.data;
}

async function confirmDelete() {
    const targetItem = pendingDeleteItem.value;
    if (!targetItem || isDeletingEntry.value) {
        return;
    }

    deletingEntryKey.value = targetItem.entryKey;
    deleteErrorMessage.value = '';
    actionSuccessMessage.value = '';

    try {
        const response = await deleteOfficialCirculation(targetItem.entryKey);
        actionSuccessMessage.value = `已删除官方交路表 ${response.entryKey}，共清理 ${response.deletedKeyCount} 个 key。`;
        isDeleteDialogOpen.value = false;
        pendingDeleteItem.value = null;

        if (lastSubmittedKeyword.value.length > 0) {
            await performSearch(lastSubmittedKeyword.value, false);
        } else {
            searchStatus.value = 'idle';
            searchData.value = null;
        }
    } catch (error) {
        deleteErrorMessage.value = getApiErrorMessage(
            error,
            '删除官方交路表失败。'
        );
    } finally {
        deletingEntryKey.value = '';
    }
}

useSiteSeo({
    title: '官方交路表 | Open CRH Tracker',
    description:
        '管理员官方交路表页面，用于搜索、预览并删除 schedule.json 中的官方交路表定义。',
    path: '/admin/official-circulations',
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
