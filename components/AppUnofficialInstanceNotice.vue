<template>
    <div
        v-if="shouldShowUnofficialWarning"
        class="space-y-2">
        <p class="text-sm leading-6 text-[#E53E3E]">
            <span class="font-semibold">[!]</span>
            {{ description }}
        </p>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const { shouldShowUnofficialWarning } = useOfficialInstance();

const description = computed(
    () => '当前网站非 Open CRH Tracker 官方站点，请注意安全。'
);
</script>
