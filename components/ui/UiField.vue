<template>
    <label class="block space-y-2">
        <span
            class="flex items-center gap-2 text-sm font-medium text-crh-grey-dark">
            {{ label }}
            <span
                v-if="required"
                class="text-crh-blue">
                *
            </span>
        </span>
        <slot />
        <p
            v-if="help"
            class="text-xs leading-5 text-slate-500">
            {{ help }}
        </p>
    </label>
</template>

<script setup lang="ts">
defineProps<{
    label: string;
    help?: string;
    required?: boolean;
}>();
</script>
