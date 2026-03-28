<template>
    <AdminShell
        v-model:date-input="selectedDateInput"
        :today-date-input-value="todayDateInputValue"
        :session="session"
        title="主动检测"
        description="对所选日期手动执行异常扫描，并查看命中的记录。">
        <template #toolbar>
            <UiButton
                type="button"
                :loading="anomalyScanStatus === 'pending'"
                @click="runAnomalyScan">
                开始检测
            </UiButton>
        </template>

        <UiCard
            :show-accent-bar="false"
            class="min-h-[38rem]">
            <div class="space-y-6">
                <div
                    class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div class="space-y-2">
                        <p
                            class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                            主动检测
                        </p>
                        <h2 class="text-2xl font-semibold text-slate-900">
                            手动异常检测
                        </h2>
                        <p class="text-sm leading-6 text-slate-600">
                            扫描
                            {{ selectedDateYmd }} 的日记录，并匹配当前异常规则。
                        </p>
                    </div>

                    <UiButton
                        type="button"
                        :loading="anomalyScanStatus === 'pending'"
                        @click="runAnomalyScan">
                        开始检测
                    </UiButton>
                </div>

                <div
                    v-if="anomalyActionSuccessMessage"
                    class="rounded-[1rem] border border-emerald-200 bg-emerald-50/80 px-4 py-4 text-sm leading-6 text-emerald-800">
                    {{ anomalyActionSuccessMessage }}
                </div>

                <div
                    v-if="anomalyScanErrorMessage"
                    class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700">
                    {{ anomalyScanErrorMessage }}
                </div>

                <UiEmptyState
                    v-else-if="anomalyScanStatus === 'idle'"
                    eyebrow="待执行"
                    title="等待管理员触发检测"
                    description="选择日期后点击“开始检测”，服务端会基于当日记录实时计算结果。" />

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
                            anomalyScanData && anomalyScanData.items.length > 0
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
                                                {{ item.subjectCode }}
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
                                            车次：
                                            {{
                                                item.trainCodes.join(' / ') ||
                                                '--'
                                            }}
                                        </p>
                                        <p>
                                            车组：
                                            {{
                                                item.emuCodes.join(' / ') ||
                                                '--'
                                            }}
                                        </p>
                                    </div>
                                </div>

                                <div class="grid gap-3">
                                    <div
                                        v-for="route in item.routes"
                                        :key="route.id"
                                        class="rounded-[0.9rem] border border-slate-200 bg-slate-50/80 px-3.5 py-3">
                                        <div class="space-y-3">
                                            <div
                                                class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                                <div class="space-y-1">
                                                    <p
                                                        class="text-sm font-semibold text-slate-900">
                                                        {{ route.trainCode }} /
                                                        {{ route.emuCode }}
                                                    </p>
                                                    <p
                                                        class="text-sm text-slate-600">
                                                        {{ route.startStation }}
                                                        到
                                                        {{ route.endStation }}
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
                                                        运行时长：
                                                        {{
                                                            formatDuration(
                                                                route.durationSeconds
                                                            )
                                                        }}
                                                    </p>
                                                </div>
                                            </div>

                                            <div class="flex justify-end">
                                                <UiButton
                                                    type="button"
                                                    variant="secondary"
                                                    size="sm"
                                                    :loading="
                                                        deletingRouteId ===
                                                        route.id
                                                    "
                                                    :disabled="
                                                        deletingRouteId.length >
                                                        0
                                                    "
                                                    class="border-rose-200 text-rose-700 hover:border-rose-300 hover:bg-rose-50/80 hover:text-rose-800"
                                                    @click="
                                                        openDeleteRouteDialog(
                                                            item.type,
                                                            item.title,
                                                            route
                                                        )
                                                    ">
                                                    删除此条
                                                </UiButton>
                                            </div>
                                        </div>
                                    </div>

                                    <p
                                        v-if="item.routes.length === 0"
                                        class="rounded-[0.9rem] border border-dashed border-slate-300 bg-slate-50/70 px-3.5 py-3 text-sm leading-6 text-slate-500">
                                        当前扫描项下的交路已在本页删除。如需按最新数据重新判断是否仍属异常，请手动再次点击“开始检测”。
                                    </p>
                                </div>
                            </div>
                        </article>
                    </div>

                    <UiEmptyState
                        v-else
                        eyebrow="无命中"
                        title="当前规则没有命中异常"
                        description="所选日期在当前异常规则下没有检测到结果。" />
                </template>
            </div>
        </UiCard>

        <component
            :is="isMobileActionSheet ? UiBottomSheet : UiModal"
            :model-value="isDeleteRouteDialogOpen"
            eyebrow="危险操作"
            title="确认删除异常数据"
            :description="deleteRouteDialogDescription"
            size="lg"
            :close-on-backdrop="!isDeletingRoute"
            @update:model-value="handleDeleteRouteDialogVisibilityChange">
            <div
                v-if="pendingDeleteRouteContext"
                class="space-y-4">
                <div
                    class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4">
                    <p
                        class="text-xs font-medium uppercase tracking-[0.18em] text-rose-700">
                        将删除的异常交路
                    </p>
                    <div class="mt-3 space-y-2 text-sm leading-6 text-rose-900">
                        <p>
                            异常类型：{{
                                getAnomalyTypeLabel(
                                    pendingDeleteRouteContext.anomalyType
                                )
                            }}
                        </p>
                        <p>
                            异常标题：{{
                                pendingDeleteRouteContext.anomalyTitle
                            }}
                        </p>
                        <p>
                            车次 / 车组：{{
                                pendingDeleteRouteContext.route.trainCode
                            }}
                            /
                            {{ pendingDeleteRouteContext.route.emuCode }}
                        </p>
                        <p>
                            交路区间：{{
                                pendingDeleteRouteContext.route.startStation
                            }}
                            到
                            {{ pendingDeleteRouteContext.route.endStation }}
                        </p>
                        <p>
                            开始时间：{{
                                formatTimestamp(
                                    pendingDeleteRouteContext.route.startAt
                                )
                            }}
                        </p>
                    </div>
                </div>

                <div
                    v-if="isTodaySelected"
                    class="rounded-[1rem] border border-amber-200 bg-amber-50/80 px-4 py-4 text-sm leading-6 text-amber-900">
                    因为当前处理日期是今天，确认后还会同步删除这条数据精确匹配的
                    probe status，并清理对应的 probe 运行态；不会清理 today
                    schedule 和 lookup。
                </div>

                <p
                    v-if="deleteRouteErrorMessage"
                    class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700">
                    {{ deleteRouteErrorMessage }}
                </p>
            </div>

            <template #footer>
                <div
                    class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <UiButton
                        type="button"
                        variant="secondary"
                        :disabled="isDeletingRoute"
                        @click="closeDeleteRouteDialog">
                        取消
                    </UiButton>
                    <UiButton
                        type="button"
                        :loading="isDeletingRoute"
                        class="bg-[linear-gradient(180deg,#c53030_0%,#b91c1c_100%)] text-white hover:bg-[linear-gradient(180deg,#b91c1c_0%,#991b1b_100%)]"
                        @click="confirmDeleteRoute">
                        确认删除
                    </UiButton>
                </div>
            </template>
        </component>
    </AdminShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import UiBottomSheet from '~/components/ui/UiBottomSheet.vue';
import UiModal from '~/components/ui/UiModal.vue';
import {
    fromAdminDateInputValue,
    useAdminDateQuery
} from '~/composables/useAdminDateQuery';
import type {
    AdminAnomalyDeleteRouteResponse,
    AdminAnomalyRouteRecord,
    AdminAnomalyScanResponse,
    AdminAnomalyType
} from '~/types/admin';
import type { TrackerApiResponse } from '~/types/homepage';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import formatTrackerTimestamp from '~/utils/time/formatTrackerTimestamp';

definePageMeta({
    middleware: 'admin-required'
});

const MOBILE_QUERY = '(max-width: 767px)';

interface PendingDeleteRouteContext {
    anomalyType: AdminAnomalyType;
    anomalyTitle: string;
    route: AdminAnomalyRouteRecord;
}

const requestFetch = import.meta.server ? useRequestFetch() : $fetch;
const { session } = useAuthState();
const { selectedDateInput, selectedDateYmd, todayDateInputValue } =
    await useAdminDateQuery();

const anomalyScanStatus = ref<'idle' | 'pending' | 'success' | 'error'>('idle');
const anomalyScanData = ref<AdminAnomalyScanResponse | null>(null);
const anomalyScanErrorMessage = ref('');
const anomalyActionSuccessMessage = ref('');
const deletingRouteId = ref('');
const isDeleteRouteDialogOpen = ref(false);
const pendingDeleteRouteContext = ref<PendingDeleteRouteContext | null>(null);
const deleteRouteErrorMessage = ref('');
const isMobileActionSheet = ref(false);
const dialogMediaQuery = ref<MediaQueryList | null>(null);

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
const isDeletingRoute = computed(() => deletingRouteId.value.length > 0);
const isTodaySelected = computed(
    () => selectedDateYmd.value === fromAdminDateInputValue(todayDateInputValue)
);
const deleteRouteDialogDescription = computed(() =>
    isTodaySelected.value
        ? '这会删除选中的异常交路，并同步清理该条数据对应的 probe status 与 probe 运行态。'
        : '这会永久删除选中的异常交路，请确认后再继续。'
);

watch(selectedDateYmd, () => {
    anomalyScanStatus.value = 'idle';
    anomalyScanData.value = null;
    anomalyScanErrorMessage.value = '';
    anomalyActionSuccessMessage.value = '';
    closeDeleteRouteDialog();
});

useSiteSeo({
    title: '主动检测 | Open CRH Tracker',
    description: '按日期执行管理员异常检测。',
    path: '/admin/anomaly-scan',
    noindex: true
});

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

async function runAnomalyScan() {
    if (anomalyScanStatus.value === 'pending') {
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

function openDeleteRouteDialog(
    anomalyType: AdminAnomalyType,
    anomalyTitle: string,
    route: AdminAnomalyRouteRecord
) {
    pendingDeleteRouteContext.value = {
        anomalyType,
        anomalyTitle,
        route
    };
    deleteRouteErrorMessage.value = '';
    isDeleteRouteDialogOpen.value = true;
}

function closeDeleteRouteDialog() {
    if (isDeletingRoute.value) {
        return;
    }

    isDeleteRouteDialogOpen.value = false;
    pendingDeleteRouteContext.value = null;
    deleteRouteErrorMessage.value = '';
}

function handleDeleteRouteDialogVisibilityChange(nextValue: boolean) {
    if (nextValue) {
        isDeleteRouteDialogOpen.value = true;
        return;
    }

    closeDeleteRouteDialog();
}

function removeDeletedRouteFromCurrentScan(routeId: string) {
    const currentScanData = anomalyScanData.value;
    if (!currentScanData) {
        return;
    }

    let didRemoveRoute = false;
    const nextItems = currentScanData.items.map((item) => {
        const nextRoutes = item.routes.filter((route) => route.id !== routeId);
        if (nextRoutes.length !== item.routes.length) {
            didRemoveRoute = true;
        }

        return {
            ...item,
            routes: nextRoutes
        };
    });

    if (!didRemoveRoute) {
        return;
    }

    anomalyScanData.value = {
        ...currentScanData,
        items: nextItems
    };
}

async function confirmDeleteRoute() {
    if (!pendingDeleteRouteContext.value || isDeletingRoute.value) {
        return;
    }

    const targetRoute = pendingDeleteRouteContext.value.route;
    deletingRouteId.value = targetRoute.id;
    deleteRouteErrorMessage.value = '';
    anomalyActionSuccessMessage.value = '';

    try {
        const { data, error } = await useCsrfFetch<
            TrackerApiResponse<AdminAnomalyDeleteRouteResponse>
        >('/api/v1/admin/anomaly-actions/delete-route', {
            method: 'POST',
            body: {
                date: selectedDateYmd.value,
                routeId: targetRoute.id
            },
            key: `admin:anomaly-delete:${targetRoute.id}:${Date.now()}`,
            watch: false,
            server: false
        });

        if (error.value) {
            throw error.value;
        }

        const response = data.value;
        if (!response) {
            throw new Error('Missing anomaly delete response');
        }

        if (!response.ok) {
            throw {
                data: response
            };
        }

        anomalyActionSuccessMessage.value = response.data.wasToday
            ? `已删除异常交路，并清理 ${response.data.deletedProbeStatusRows} 条匹配的 probe status 与相关 probe 运行态。`
            : `已删除异常交路，并清理 ${response.data.deletedProbeStatusRows} 条匹配的 probe status。`;

        isDeleteRouteDialogOpen.value = false;
        pendingDeleteRouteContext.value = null;
        removeDeletedRouteFromCurrentScan(targetRoute.id);
    } catch (error) {
        deleteRouteErrorMessage.value = getApiErrorMessage(
            error,
            '删除异常交路失败。'
        );
    } finally {
        deletingRouteId.value = '';
    }
}

function formatTimestamp(timestamp: number) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return '--';
    }

    return formatTrackerTimestamp(timestamp);
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

function getAnomalyTypeLabel(type: AdminAnomalyType) {
    return type === 'train_multi_emu' ? '车次重联异常' : '车组短交路异常';
}

function getAnomalyTypeBadgeClass(type: AdminAnomalyType) {
    return type === 'train_multi_emu'
        ? 'inline-flex items-center rounded-full bg-crh-blue/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-crh-blue'
        : 'inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-emerald-800';
}
</script>
