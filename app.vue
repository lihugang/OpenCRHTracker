<template>
    <NuxtPwaManifest />
    <NuxtLoadingIndicator
        color="#ffc107"
        :height="4" />
    <NuxtLayout>
        <NuxtPage />
    </NuxtLayout>
</template>
<script setup lang="ts">
const { ensureSession } = useAuthState();

await ensureSession();
</script>
