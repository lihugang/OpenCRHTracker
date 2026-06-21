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
                            日期使用当前管理员日期。车次与车组可单独填写，也可组合检索。
                        </p>
                    </div>

                    <div class="grid gap-4 md:grid-cols-2">
                        <AdminLookupCodeInput
                            v-model="deleteTrainCodeInput"
                            type-filter="train"
                            label="车次"
                            placeholder="例如 G1" />
                        <AdminLookupCodeInput
                            v-model="deleteEmuCodeInput"
                            type-filter="emu"
                            label="车组"
                            placeholder="例如 CR400AF-2010" />
                    </div>

                    <div
                        class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p class="text-sm leading-6 text-slate-500">
                            当前日期：{{ selectedDateYmd }}
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
                            v-model="createTrainCodeInput"
                            type-filter="train"
                            label="车次"
                            placeholder="例如 G1"
                            required />
                        <AdminLookupCodeInput
                            v-model="createEmuCodeInput"
                            type-filter="emu"
                            label="车组"
                            placeholder="例如 CR400AF-2010"
                            required />
                    </div>

                    <UiField
                        label="日期"
                        help="默认同步当前管理员日期；修改此处不会影响左侧删除检索日期。">
                        <input
                            v-model="createDateInput"
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
import { useLookupSuggestions } from '~/composables/useLookupSuggestions';
import type {
    AdminDailyRouteCreateResponse,
    AdminDailyRouteDeleteResponse,
    AdminDailyRouteRecord,
    AdminDailyRouteSearchResponse,
    AdminDailyRouteTimetableCandidate,
    AdminDailyRouteTimetableCandidatesResponse,
    AdminDailyRouteTimetableResolution
} from '~/types/admin';
import type { TrackerApiResponse } from '~/types/homepage';
import type { LookupSuggestItem } from '~/types/lookup';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import { normalizeLookupCode } from '~/utils/lookup/lookupTarget';
import formatTrackerTimestamp from '~/utils/time/formatTrackerTimestamp';

definePageMeta({
    middleware: 'admin-required'
});

const AdminLookupCodeInput = defineComponent({
    props: {
        modelValue: {
            type: String,
            required: true
        },
        typeFilter: {
            type: String as PropType<LookupSuggestItem['type']>,
            required: true
        },
        label: {
            type: String,
            required: true
        },
        placeholder: {
            type: String,
            default: ''
        },
        required: {
            type: Boolean,
            default: false
        }
    },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
        const rootRef = ref<HTMLElement | null>(null);
        const isFocused = ref(false);
        const activeIndex = ref(-1);
        const inputValue = computed({
            get() {
                return props.modelValue;
            },
            set(value: string) {
                emit('update:modelValue', value);
            }
        });
        const { state, items, errorMessage } = useLookupSuggestions(
            () => inputValue.value,
            12
        );
        const filteredItems = computed(() =>
            items.value.filter((item) => item.type === props.typeFilter)
        );
        const shouldShowMenu = computed(
            () =>
                isFocused.value &&
                (state.value === 'loading' ||
                    state.value === 'error' ||
                    filteredItems.value.length > 0)
        );

        watch(filteredItems, () => {
            activeIndex.value = filteredItems.value.length > 0 ? 0 : -1;
        });

        function choose(item: LookupSuggestItem) {
            inputValue.value = item.code;
            isFocused.value = false;
        }

        function moveActive(step: number) {
            const count = filteredItems.value.length;
            if (count === 0) {
                return;
            }

            activeIndex.value = (activeIndex.value + step + count) % count;
        }

        function submitActive() {
            const item = filteredItems.value[activeIndex.value];
            if (item) {
                choose(item);
            }
        }

        function handleDocumentPointerDown(event: PointerEvent) {
            const target = event.target;
            if (
                target instanceof Node &&
                rootRef.value &&
                !rootRef.value.contains(target)
            ) {
                isFocused.value = false;
            }
        }

        onMounted(() => {
            document.addEventListener('pointerdown', handleDocumentPointerDown);
        });

        onBeforeUnmount(() => {
            document.removeEventListener(
                'pointerdown',
                handleDocumentPointerDown
            );
        });

        return {
            rootRef,
            inputValue,
            isFocused,
            activeIndex,
            state,
            errorMessage,
            filteredItems,
            shouldShowMenu,
            choose,
            moveActive,
            submitActive
        };
    },
    template: `
        <UiField :label="label" :required="required">
            <div ref="rootRef" class="relative">
                <input
                    v-model="inputValue"
                    type="text"
                    inputmode="text"
                    autocomplete="off"
                    class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark"
                    :placeholder="placeholder"
                    @focus="isFocused = true"
                    @keydown.down.prevent="moveActive(1)"
                    @keydown.up.prevent="moveActive(-1)"
                    @keydown.enter.prevent="submitActive"
                    @keydown.esc.prevent="isFocused = false" />

                <div
                    v-if="shouldShowMenu"
                    class="absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-2xl border border-slate-200/90 bg-white/96 shadow-[0_18px_40px_-18px_rgba(15,23,42,0.35)] backdrop-blur">
                    <div
                        v-if="state === 'loading'"
                        class="px-4 py-3 text-sm text-slate-500">
                        正在加载补全...
                    </div>
                    <div
                        v-else-if="state === 'error'"
                        class="px-4 py-3 text-sm text-status-delayed">
                        {{ errorMessage || '补全加载失败' }}
                    </div>
                    <div
                        v-else
                        class="harmony-scrollbar max-h-64 overflow-y-auto py-2">
                        <button
                            v-for="(item, index) in filteredItems"
                            :key="item.type + ':' + item.code"
                            type="button"
                            class="grid w-full grid-cols-[max-content_minmax(0,1fr)] gap-3 px-4 py-2 text-left transition hover:bg-slate-50"
                            :class="index === activeIndex ? 'bg-blue-50 text-crh-blue' : 'text-slate-700'"
                            @mousedown.prevent
                            @mouseenter="activeIndex = index"
                            @click="choose(item)">
                            <span class="font-mono text-sm font-semibold">
                                {{ item.code }}
                            </span>
                            <span class="min-w-0 truncate text-xs text-slate-500">
                                {{ item.subtitle }}
                            </span>
                        </button>
                    </div>
                </div>
            </div>
        </UiField>
    `
});

const requestFetch: TrackedRequestFetch = import.meta.server
    ? useTrackedRequestFetch()
    : ($fetch as TrackedRequestFetch);
const { session } = useAuthState();
const { selectedDateInput, selectedDateYmd, todayDateInputValue } =
    await useAdminDateQuery();

const deleteTrainCodeInput = ref('');
const deleteEmuCodeInput = ref('');
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

const createTrainCodeInput = ref('');
const createEmuCodeInput = ref('');
const createDateInput = ref(selectedDateInput.value);
const candidateStatus = ref<'idle' | 'pending' | 'success' | 'error'>('idle');
const candidateData = ref<AdminDailyRouteTimetableCandidatesResponse | null>(
    null
);
const candidateErrorMessage = ref('');
const selectedTimetableId = ref<number | null>(null);
const createStatus = ref<'idle' | 'pending' | 'success' | 'error'>('idle');
const createSuccessMessage = ref('');
const createErrorMessage = ref('');

const normalizedDeleteTrainCode = computed(() =>
    normalizeLookupCode(deleteTrainCodeInput.value)
);
const normalizedDeleteEmuCode = computed(() =>
    normalizeLookupCode(deleteEmuCodeInput.value)
);
const normalizedCreateTrainCode = computed(() =>
    normalizeLookupCode(createTrainCodeInput.value)
);
const normalizedCreateEmuCode = computed(() =>
    normalizeLookupCode(createEmuCodeInput.value)
);
const createDateYmd = computed(() =>
    fromAdminDateInputValue(createDateInput.value)
);
const deleteRouteItems = computed(() => deleteSearchData.value?.items ?? []);
const candidateItems = computed(() => candidateData.value?.items ?? []);
const canSearchDelete = computed(
    () =>
        normalizedDeleteTrainCode.value.length > 0 ||
        normalizedDeleteEmuCode.value.length > 0
);
const canLoadCandidates = computed(
    () =>
        normalizedCreateTrainCode.value.length > 0 &&
        normalizedCreateEmuCode.value.length > 0 &&
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
const deleteDialogDescription = computed(() => {
    if (!pendingDeleteRoute.value) {
        return '';
    }

    return pendingDeleteRoute.value.serviceDate ===
        fromAdminDateInputValue(todayDateInputValue)
        ? '这会删除最终日记录，并同步清理今天同条 probe status 与内存运行态。'
        : '这会删除历史最终日记录，不会清理 probe status 或内存运行态。';
});

watch(selectedDateInput, (value) => {
    createDateInput.value = value;
});

watch(selectedDateYmd, () => {
    deleteSearchStatus.value = 'idle';
    deleteSearchData.value = null;
    deleteErrorMessage.value = '';
    deleteSuccessMessage.value = '';
    closeDeleteDialog();
});

watch([normalizedCreateTrainCode, createDateYmd], () => {
    candidateStatus.value = 'idle';
    candidateData.value = null;
    candidateErrorMessage.value = '';
    selectedTimetableId.value = null;
    createSuccessMessage.value = '';
    createErrorMessage.value = '';
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
                date: selectedDateYmd.value,
                trainCode: normalizedDeleteTrainCode.value,
                emuCode: normalizedDeleteEmuCode.value
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
    deleteTrainCodeInput.value = '';
    deleteEmuCodeInput.value = '';
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
                trainCode: normalizedCreateTrainCode.value
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
                trainCode: normalizedCreateTrainCode.value,
                emuCode: normalizedCreateEmuCode.value,
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

async function refreshDeleteSearchIfMatchingCreate() {
    if (
        deleteSearchStatus.value !== 'success' ||
        selectedDateYmd.value !== createDateYmd.value ||
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

function getCandidateKey(item: AdminDailyRouteTimetableCandidate) {
    return `${item.timetableId ?? 'null'}:${item.serviceDateStart}:${item.serviceDateEndExclusive}`;
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
