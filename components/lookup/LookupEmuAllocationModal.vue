<template>
    <UiModal
        :model-value="props.modelValue"
        eyebrow="ALLOCATION"
        :title="modalTitle"
        size="lg"
        height="tall"
        @update:model-value="emit('update:modelValue', $event)">
        <div
            v-if="state === 'loading'"
            class="space-y-4">
            <div
                class="h-24 animate-pulse rounded-[1rem] border border-slate-200 bg-slate-100/80" />
            <div class="grid gap-3 sm:grid-cols-2">
                <div
                    v-for="index in 4"
                    :key="`allocation-loading:${index}`"
                    class="h-20 animate-pulse rounded-[0.9rem] border border-slate-200 bg-slate-100/70" />
            </div>
        </div>

        <UiEmptyState
            v-else-if="state === 'error'"
            eyebrow="Load Failed"
            title="配属信息暂时不可用"
            :description="errorMessage || '请稍后重试。'"
            tone="danger" />

        <UiEmptyState
            v-else-if="state === 'empty'"
            eyebrow="No Data"
            title="暂无配属信息"
            description="当前配属清单中没有找到这个车组号。" />

        <div
            v-else-if="profile"
            class="space-y-5">
            <div
                data-guide="allocation-summary"
                class="overflow-hidden rounded-[1rem] border border-slate-200 bg-slate-50/80">
                <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="min-w-0 px-4 py-4">
                        <p
                            class="break-all font-mono text-xl font-semibold text-crh-blue">
                            {{ profile.emuCode }}
                        </p>
                        <p class="mt-1 text-sm leading-6 text-slate-500">
                            {{ profile.bureau }} ·
                            {{ profile.trainDepot || profile.depot }} ·
                            {{ profile.depot }}
                        </p>
                    </div>
                </div>

                <div
                    class="grid border-t border-slate-200 bg-white/70 sm:grid-cols-3">
                    <div
                        class="border-b border-slate-100 px-4 py-3 sm:border-b-0 sm:border-r">
                        <p
                            class="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                            车型
                        </p>
                        <p
                            class="mt-1 break-all font-mono text-sm font-semibold text-crh-grey-dark">
                            {{ profile.model || '--' }}
                        </p>
                    </div>

                    <div
                        class="border-b border-slate-100 px-4 py-3 sm:border-b-0 sm:border-r">
                        <p
                            class="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                            车组号
                        </p>
                        <p
                            class="mt-1 break-all font-mono text-sm font-semibold text-crh-grey-dark">
                            {{ profile.trainSetNo || '--' }}
                        </p>
                    </div>

                    <div class="px-4 py-3">
                        <p
                            class="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                            子车型
                        </p>
                        <p
                            class="mt-1 break-all text-sm font-semibold text-crh-grey-dark">
                            {{ formatSubtypeAndCustomType(profile) }}
                        </p>
                    </div>
                </div>
            </div>

            <section class="space-y-3">
                <h3 class="text-sm font-semibold text-crh-grey-dark">
                    车组信息
                </h3>

                <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div
                        v-for="item in detailItems"
                        :key="item.label"
                        class="rounded-[0.9rem] border border-slate-200/80 bg-white/90 px-4 py-3">
                        <p
                            class="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                            {{ item.label }}
                        </p>
                        <p
                            class="mt-1 break-all text-sm font-medium leading-6 text-crh-grey-dark">
                            {{ item.value }}
                        </p>
                    </div>
                </div>
            </section>

            <section
                v-if="profile.tags.length > 0 || profile.alias.length > 0"
                class="space-y-3">
                <h3 class="text-sm font-semibold text-crh-grey-dark">
                    标记
                </h3>

                <div class="grid gap-3 sm:grid-cols-2">
                    <div
                        v-if="profile.tags.length > 0"
                        class="rounded-[0.9rem] border border-slate-200/80 bg-white/90 px-4 py-3">
                        <p
                            class="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                            标签
                        </p>
                        <div class="mt-2 flex flex-wrap gap-2">
                            <span
                                v-for="tag in profile.tags"
                                :key="tag"
                                class="inline-flex items-center rounded-full border border-crh-blue/15 bg-blue-50 px-2.5 py-1 text-xs font-medium text-crh-blue">
                                {{ tag }}
                            </span>
                        </div>
                    </div>

                    <div
                        v-if="profile.alias.length > 0"
                        class="rounded-[0.9rem] border border-slate-200/80 bg-white/90 px-4 py-3">
                        <p
                            class="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                            别名
                        </p>
                        <div class="mt-2 flex flex-wrap gap-2">
                            <span
                                v-for="alias in profile.alias"
                                :key="alias"
                                class="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs font-medium text-slate-600">
                                {{ alias }}
                            </span>
                        </div>
                    </div>
                </div>
            </section>

            <section class="space-y-3">
                <h3 class="text-sm font-semibold text-crh-grey-dark">
                    编组布局
                </h3>

                <div
                    v-if="profile.coachLayouts.length > 0"
                    class="harmony-scrollbar overflow-x-auto rounded-[0.9rem] border border-slate-200/80 bg-white/90">
                    <table
                        class="min-w-[30rem] border-separate border-spacing-0 text-left text-sm">
                        <thead>
                            <tr class="bg-slate-50/90 text-slate-400">
                                <th class="border-b border-slate-200 px-3 py-2">
                                    车厢
                                </th>
                                <th class="border-b border-slate-200 px-3 py-2">
                                    类型
                                </th>
                                <th class="border-b border-slate-200 px-3 py-2">
                                    定员
                                </th>
                                <th class="border-b border-slate-200 px-3 py-2">
                                    设备
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="layout in profile.coachLayouts"
                                :key="layout.coachNo">
                                <td
                                    class="border-b border-slate-100 px-3 py-2 font-mono text-crh-grey-dark last:border-b-0">
                                    {{ layout.coachNo }}
                                </td>
                                <td
                                    class="border-b border-slate-100 px-3 py-2 last:border-b-0">
                                    <span class="font-medium text-crh-grey-dark">
                                        {{ formatCoachType(layout) }}
                                    </span>
                                </td>
                                <td
                                    class="border-b border-slate-100 px-3 py-2 font-mono text-slate-600 last:border-b-0">
                                    {{ layout.capacity || '--' }}
                                </td>
                                <td
                                    class="border-b border-slate-100 px-3 py-2 last:border-b-0">
                                    {{ formatCoachFacilities(layout) }}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <p
                    v-else
                    class="rounded-[0.9rem] border border-slate-200/80 bg-white/90 px-4 py-3 text-sm text-slate-500">
                    --
                </p>
            </section>
        </div>
    </UiModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { EmuAllocationProfileResponse } from '~/types/lookup';
import type { TrackerApiResponse } from '~/types/homepage';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';

type AllocationState = 'idle' | 'loading' | 'success' | 'empty' | 'error';

const props = defineProps<{
    modelValue: boolean;
    emuCode: string;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
}>();

const state = ref<AllocationState>('idle');
const profile = ref<EmuAllocationProfileResponse | null>(null);
const errorMessage = ref('');
const requestVersion = ref(0);

const modalTitle = computed(() =>
    props.emuCode.trim().length > 0
        ? `${props.emuCode} 配属信息`
        : '动车组配属信息'
);

const detailItems = computed(() => {
    const item = profile.value;
    if (!item) {
        return [];
    }

    return [
        {
            label: '制造商',
            value: formatManufacturer(item)
        },
        {
            label: '制造年月',
            value: formatValue(item.manufactureMonth)
        },
        {
            label: '一等座电动腿托',
            value: item.firstClassPowerLegrest ? '有' : '无'
        },
        {
            label: '卫生间',
            value: formatValue(item.toiletStatus)
        },
        {
            label: '电源位置',
            value: formatValue(item.socketLocation)
        }
    ].concat(
        [
            {
                label: '商务座情况',
                value: item.businessSeatType.trim()
            },
            {
                label: '车型备注',
                value: item.modelRemark.trim()
            },
            {
                label: '备注',
                value: item.note.trim()
            }
        ].filter((detailItem) => hasDisplayValue(detailItem.value))
    );
});

function formatValue(value: string) {
    const normalizedValue = value.trim();
    return normalizedValue.length > 0 && normalizedValue !== '--'
        ? normalizedValue
        : '--';
}

function hasDisplayValue(value: string) {
    return formatValue(value) !== '--';
}

function formatManufacturer(item: EmuAllocationProfileResponse) {
    const trainsetManufacturer = item.trainsetManufacturer.trim();
    const trailerManufacturer = item.trailerManufacturer.trim();

    if (!trainsetManufacturer && !trailerManufacturer) {
        return '--';
    }

    if (
        trainsetManufacturer &&
        trailerManufacturer &&
        trainsetManufacturer !== trailerManufacturer
    ) {
        return `动车：${trainsetManufacturer} / 拖车：${trailerManufacturer}`;
    }

    return trainsetManufacturer || trailerManufacturer;
}

function formatSubtypeAndCustomType(item: EmuAllocationProfileResponse) {
    const values = [item.subModel, item.customType]
        .map((value) => value.trim())
        .filter((value) => value.length > 0 && value !== '--');

    return values.length > 0 ? values.join(', ') : '--';
}

function formatCoachType(
    layout: EmuAllocationProfileResponse['coachLayouts'][number]
) {
    const code = layout.coachTypeCode.trim();
    const name = layout.coachTypeName.trim();

    if (code && name) {
        return `${name} (${code})`;
    }

    return name || code || '--';
}

function formatCoachFacilities(
    layout: EmuAllocationProfileResponse['coachLayouts'][number]
) {
    const facilities = [
        layout.hasPower ? '动车' : '',
        layout.hasPantograph ? '受电弓' : '',
        layout.hasLargeLuggageArea ? '大件行李处' : '',
        layout.hasAccessibleFacility ? '无障碍区域' : ''
    ].filter((item) => item.length > 0);

    return facilities.length > 0 ? facilities.join('、') : '--';
}

async function loadProfile() {
    const emuCode = props.emuCode.trim();
    if (!emuCode) {
        state.value = 'empty';
        profile.value = null;
        errorMessage.value = '';
        return;
    }

    const currentVersion = requestVersion.value + 1;
    requestVersion.value = currentVersion;
    state.value = 'loading';
    profile.value = null;
    errorMessage.value = '';

    try {
        const response = await $fetch<
            TrackerApiResponse<EmuAllocationProfileResponse>
        >(`/api/v1/allocation/emu/${encodeURIComponent(emuCode)}`);

        if (currentVersion !== requestVersion.value) {
            return;
        }

        if (!response.ok) {
            if (response.error === 'allocation_not_found') {
                state.value = 'empty';
                return;
            }

            throw {
                data: response
            };
        }

        profile.value = response.data;
        state.value = 'success';
    } catch (error) {
        if (currentVersion !== requestVersion.value) {
            return;
        }

        const message = getApiErrorMessage(error, '配属信息加载失败。');
        if (
            typeof error === 'object' &&
            error !== null &&
            'data' in error &&
            (error as { data?: { error?: unknown } }).data?.error ===
                'allocation_not_found'
        ) {
            state.value = 'empty';
            return;
        }

        errorMessage.value = message;
        state.value = 'error';
    }
}

watch(
    () => [props.modelValue, props.emuCode],
    ([isOpen]) => {
        if (!isOpen) {
            return;
        }

        void loadProfile();
    },
    {
        immediate: true
    }
);
</script>
