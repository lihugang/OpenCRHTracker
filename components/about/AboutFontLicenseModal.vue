<template>
    <component
        :is="isMobile ? UiBottomSheet : UiModal"
        :model-value="modelValue"
        eyebrow="FONT LICENSE"
        :title="licenseEntry.name + ' OFL'"
        size="lg"
        @update:model-value="emit('update:modelValue', $event)">
        <div class="space-y-4">
            <div
                class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-700">
                <p class="font-semibold text-slate-900">
                    以下为 {{ licenseEntry.name }} 随站点分发时附带的 OFL 许可文本。
                </p>
            </div>

            <div class="rounded-[1.2rem] border border-slate-200 bg-white/90">
                <pre
                    class="harmony-scrollbar max-h-[min(58vh,34rem)] overflow-auto px-5 py-5 text-xs leading-6 whitespace-pre-wrap text-slate-700">{{ licenseEntry.licenseText }}</pre>
            </div>
        </div>
    </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import UiBottomSheet from '~/components/ui/UiBottomSheet.vue';
import UiModal from '~/components/ui/UiModal.vue';
import type { AboutFontLicenseName } from '~/types/about';
import { aboutFontLicenses } from '~/utils/about/fontLicenses';

const props = defineProps<{
    modelValue: boolean;
    isMobile: boolean;
    fontName: AboutFontLicenseName;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
}>();

const licenseEntry = computed(() => {
    return aboutFontLicenses[props.fontName];
});
</script>
