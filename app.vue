<template>
    <NuxtPwaManifest />
    <AppAuthEntry />
    <NuxtLoadingIndicator
        color="#ffc107"
        :height="4" />
    <NuxtLayout>
        <NuxtPage />
    </NuxtLayout>
</template>
<script setup lang="ts">
import AppAuthEntry from '~/components/AppAuthEntry.vue';

const { ensureSession } = useAuthState();

await ensureSession();
</script>
