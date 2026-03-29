<template>
    <UiCard
        :show-accent-bar="false"
        class="hidden min-[960px]:landscape:block">
        <div class="space-y-3">
            <p class="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                ACTIONS
            </p>
            <div class="space-y-2">
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <p class="truncate text-sm font-normal text-crh-grey-dark">
                            {{ code }}
                        </p>
                    </div>

                    <UiFavoriteButton
                        :active="active"
                        :loading="loading"
                        size="sm"
                        @click="emit('click')" />
                </div>

                <p
                    v-if="errorMessage"
                    class="flex items-center gap-1.5 text-xs leading-5 text-[#E53E3E]">
                    <span
                        aria-hidden="true"
                        class="font-semibold">
                        [!]
                    </span>
                    <span>{{ errorMessage }}</span>
                </p>
            </div>
        </div>
    </UiCard>
</template>

<script setup lang="ts">

const props = defineProps<{
    code: string;
    active: boolean;
    loading?: boolean;
    errorMessage?: string;
}>();

const emit = defineEmits<{
    click: [];
}>();
</script>
