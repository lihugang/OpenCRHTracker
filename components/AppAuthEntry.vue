<template>
    <div
        v-if="!hiddenPaths.has(route.path)"
        class="pointer-events-none fixed right-4 top-4 z-40 sm:right-6 sm:top-5">
        <div
            class="pointer-events-auto flex items-center gap-1 rounded-full border border-white/55 bg-white/30 p-1.5 shadow-[0_20px_48px_-28px_rgba(15,23,42,0.45)] ring-1 ring-slate-200/35 backdrop-blur-md">
            <NuxtLink
                v-if="isAuthenticated && route.path !== '/exports/daily'"
                to="/exports/daily"
                class="inline-flex items-center gap-2 rounded-full border border-crh-blue/12 bg-blue-50/80 px-4 py-2 text-sm font-semibold text-crh-blue transition hover:border-crh-blue/20 hover:bg-blue-100/80 hover:text-slate-950">
                导出每日数据
            </NuxtLink>
            <NuxtLink
                v-if="isAuthenticated && session"
                to="/dashboard"
                class="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-slate-700 transition hover:text-slate-950 hover:underline hover:underline-offset-4">
                {{ session.userId }}
            </NuxtLink>
            <NuxtLink
                v-else
                to="/login"
                class="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-white/55 hover:text-slate-950">
                登录
            </NuxtLink>
            <NuxtLink
                v-if="!isAuthenticated"
                to="/register"
                class="inline-flex items-center gap-2 rounded-full border border-[#0b3a73]/20 bg-[linear-gradient(180deg,#0b3a73_0%,#082b57_100%)] px-4 py-2 text-sm font-semibold text-white shadow-[0_18px_38px_-22px_rgba(8,43,87,0.72)] transition hover:brightness-110">
                注册
            </NuxtLink>
        </div>
    </div>
</template>

<script setup lang="ts">
const route = useRoute();
const hiddenPaths = new Set(['/auth', '/login', '/register', '/dashboard']);
const { session, isAuthenticated } = useAuthState();
</script>
