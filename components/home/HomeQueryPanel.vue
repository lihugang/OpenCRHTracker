<template>
    <UiCard>
        <div class="space-y-6">
            <div class="space-y-2">
                <p
                    class="text-xs font-semibold uppercase tracking-[0.3em] text-crh-blue/70">
                    查询面板
                </p>
                <h2 class="text-2xl font-semibold text-crh-grey-dark">
                    {{ title }}
                </h2>
                <p class="text-sm leading-6 text-slate-500">
                    {{ description }}
                </p>
            </div>

            <div class="motion-divider" />

            <form
                class="space-y-4"
                @submit.prevent="$emit('submit')">
                <UiField
                    v-for="field in fields"
                    :key="field.key"
                    :label="field.label"
                    :help="field.help"
                    required>
                    <input
                        v-model="form[field.key]"
                        :type="field.type ?? 'text'"
                        :placeholder="field.placeholder"
                        :inputmode="field.inputMode"
                        :autocomplete="field.autocomplete ?? 'off'"
                        class="harmony-input w-full px-4 py-3 text-sm placeholder:text-slate-400" />
                </UiField>

                <div class="grid gap-3 sm:grid-cols-2">
                    <UiButton
                        type="submit"
                        block
                        :loading="isSubmitting">
                        {{ submitLabel }}
                    </UiButton>
                    <UiButton
                        type="button"
                        block
                        variant="secondary"
                        @click="$emit('reset')">
                        重置条件
                    </UiButton>
                </div>
            </form>

            <div
                class="rounded-[1rem] border border-slate-200 bg-slate-50/80 p-4">
                <p class="text-sm font-medium text-crh-grey-dark">
                    当前以匿名模式请求
                </p>
                <p class="mt-2 text-xs leading-6 text-slate-500">
                    首页不保存 API
                    Key。查询、分页和配额检查均按匿名额度运行，适合轻量排查与日常浏览。
                </p>
            </div>
        </div>
    </UiCard>
</template>

<script setup lang="ts">
import type { QueryFieldDefinition } from '~/types/homepage';

defineProps<{
    title: string;
    description: string;
    submitLabel: string;
    fields: QueryFieldDefinition[];
    form: Record<string, string>;
    isSubmitting: boolean;
}>();

defineEmits<{
    submit: [];
    reset: [];
}>();
</script>
