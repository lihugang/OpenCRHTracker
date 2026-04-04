<template>
    <div>
        <AppAuthEntry />
        <slot />
    </div>
</template>

<script setup lang="ts">
import AppAuthEntry from '~/components/AppAuthEntry.vue';
</script>
