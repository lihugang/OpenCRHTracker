<template>
    <UiCard :variant="compact ? 'subtle' : 'accent'">
        <div class="absolute inset-0 overflow-hidden rounded-[inherit]">
            <img
                src="/images/background.png"
                alt=""
                aria-hidden="true"
                class="h-full w-full object-cover object-[68%_center] opacity-20 md:opacity-28" />
            <div
                class="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.95)_0%,rgba(248,250,252,0.86)_42%,rgba(248,250,252,0.72)_72%,rgba(248,250,252,0.84)_100%)]" />
        </div>

        <div :class="['relative', compact ? 'space-y-5' : 'space-y-6']">
            <div class="space-y-3">
                <div class="flex flex-wrap gap-2">
                    <UiStatusBadge
                        :label="compact ? '快速跳转' : '单输入查询'"
                        tone="warning" />
                    <UiStatusBadge
                        label="自动识别"
                        tone="info" />
                </div>

                <div class="space-y-2">
                    <p
                        class="text-xs font-semibold uppercase tracking-[0.3em] text-crh-blue/70">
                        {{ eyebrow }}
                    </p>
                    <h1
                        :class="[
                            'font-semibold tracking-tight text-crh-grey-dark',
                            compact ? 'text-2xl' : 'text-4xl md:text-5xl'
                        ]">
                        {{ title }}
                    </h1>
                    <p
                        :class="[
                            'leading-7 text-slate-600',
                            compact
                                ? 'text-sm'
                                : 'max-w-2xl text-sm md:text-base'
                        ]">
                        {{ description }}
                    </p>
                </div>
            </div>

            <form
                class="space-y-4"
                @submit.prevent="$emit('submit')">
                <div class="space-y-2">
                    <label
                        for="lookup-input"
                        class="text-sm font-medium text-crh-grey-dark">
                        车次号 / 车组号
                    </label>
                    <input
                        id="lookup-input"
                        :value="modelValue"
                        type="text"
                        inputmode="text"
                        autocomplete="off"
                        :placeholder="placeholder"
                        class="harmony-input w-full px-5 py-4 text-base placeholder:text-slate-400"
                        @input="
                            $emit(
                                'update:modelValue',
                                ($event.target as HTMLInputElement).value
                            )
                        " />
                </div>

                <div class="flex flex-wrap items-center gap-3">
                    <UiButton
                        type="submit"
                        :loading="loading">
                        {{ submitLabel }}
                    </UiButton>
                    <p class="text-sm text-slate-500">
                        {{ helperText }}
                    </p>
                </div>

                <p
                    v-if="errorMessage"
                    class="rounded-[1rem] border border-status-delayed/15 bg-status-delayed/5 px-4 py-3 text-sm text-status-delayed">
                    {{ errorMessage }}
                </p>
            </form>
        </div>
    </UiCard>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { LookupTargetType } from '~/types/lookup';

const props = withDefaults(
    defineProps<{
        modelValue: string;
        title: string;
        description: string;
        eyebrow?: string;
        loading?: boolean;
        compact?: boolean;
        errorMessage?: string;
        detectedType?: LookupTargetType | null;
        submitLabel?: string;
        placeholder?: string;
    }>(),
    {
        eyebrow: 'OpenCRHTracker',
        loading: false,
        compact: false,
        errorMessage: '',
        detectedType: null,
        submitLabel: '回车或点击查询',
        placeholder: '例如 G1234 或 CR400AF-2016'
    }
);

defineEmits<{
    submit: [];
    'update:modelValue': [value: string];
}>();

const helperText = computed(() => {
    if (props.detectedType === 'emu') {
        return '检测到 CR / CRH 前缀，将按车组号跳转';
    }

    if (props.detectedType === 'train') {
        return '未检测到 CR / CRH 前缀，将按车次号跳转';
    }

    return '按 Enter 后自动识别并跳转到对应详情页';
});
</script>
