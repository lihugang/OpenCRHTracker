<template>
    <UiModal
        :model-value="modelValue"
        title="导出数据"
        eyebrow="CSV EXPORT"
        size="md"
        height="tall"
        :close-on-backdrop="!isExporting"
        @update:model-value="handleModelValue">
        <div class="space-y-5">
            <p class="text-sm text-slate-600">{{ code }} · {{ scopeLabel }}</p>
            <LookupDateRangeCalendar
                v-if="type !== 'station'"
                v-model:start-date="startDate"
                v-model:end-date="endDate"
                :min-date="minDate"
                :max-date="today" />
            <div
                v-if="isExporting || progress.percent > 0"
                class="space-y-2">
                <div
                    class="flex items-center justify-between text-xs text-slate-500">
                    <span>{{ progress.label || '准备导出' }}</span
                    ><span>{{ Math.round(progress.percent) }}%</span>
                </div>
                <div
                    class="h-2 overflow-hidden rounded-full bg-slate-200"
                    role="progressbar"
                    :aria-valuenow="progress.percent"
                    aria-valuemin="0"
                    aria-valuemax="100">
                    <div
                        class="h-full rounded-full bg-crh-blue transition-[width] duration-200"
                        :style="{ width: `${progress.percent}%` }" />
                </div>
            </div>
            <p
                v-if="errorMessage"
                class="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                {{ errorMessage }}
            </p>
        </div>
        <template #footer>
            <div class="flex justify-end gap-2">
                <UiButton
                    variant="ghost"
                    size="sm"
                    :disabled="isExporting"
                    @click="handleModelValue(false)"
                    >关闭</UiButton
                >
                <UiButton
                    size="sm"
                    :loading="isExporting"
                    :disabled="!canSubmit"
                    @click="startExport"
                    >开始导出</UiButton
                >
            </div>
        </template>
    </UiModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import UiButton from '~/components/ui/UiButton.vue';
import type { LookupDataExportType } from '~/composables/useLookupDataExport';
import { useLookupDataExport } from '~/composables/useLookupDataExport';
import formatShanghaiDateString from '~/utils/time/formatShanghaiDateString';
import getShanghaiDayStartUnixSeconds from '~/utils/time/getShanghaiDayStartUnixSeconds';
import LookupDateRangeCalendar from '~/components/lookup/LookupDateRangeCalendar.vue';

const props = defineProps<{
    modelValue: boolean;
    type: LookupDataExportType;
    code: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
const today = formatShanghaiDateString(Math.floor(Date.now() / 1000));
const minDate = computed(() =>
    formatShanghaiDateString(
        (getShanghaiDayStartUnixSeconds(today) ?? 0) - 299 * 86400
    )
);
const startDate = ref('');
const endDate = ref('');
const { isExporting, errorMessage, progress, run, cancel, reset } =
    useLookupDataExport();
const canSubmit = computed(() => {
    if (props.type === 'station') {
        return true;
    }
    return Boolean(
        startDate.value &&
        endDate.value &&
        startDate.value >= minDate.value &&
        endDate.value <= today &&
        endDate.value >= startDate.value
    );
});
const scopeLabel = computed(() => {
    if (props.type === 'station') {
        return today;
    }
    if (startDate.value && endDate.value) {
        return `${startDate.value} 至 ${endDate.value}`;
    }
    return startDate.value ? `${startDate.value} 至` : '';
});
watch(
    () => props.modelValue,
    (open) => {
        if (!open) {
            return;
        }
        reset();
        if (props.type !== 'station') {
            startDate.value = formatShanghaiDateString(
                (getShanghaiDayStartUnixSeconds(today) ?? 0) - 29 * 86400
            );
            endDate.value = today;
        }
    }
);
async function startExport() {
    await run(props.type, props.code, startDate.value, endDate.value);
}
function handleModelValue(value: boolean) {
    if (!value && isExporting.value) {
        cancel();
    }
    emit('update:modelValue', value);
}
</script>
