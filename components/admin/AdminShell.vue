<template>
    <main
        class="flex min-h-screen flex-col bg-[linear-gradient(180deg,#f8fafc_0%,#eef5fb_100%)] text-crh-grey-dark">
        <div
            class="pointer-events-none absolute inset-x-0 top-0 h-[24rem] bg-[radial-gradient(circle_at_top,_rgba(0,82,155,0.14),_transparent_58%)]" />
        <div
            class="pointer-events-none absolute inset-x-0 top-20 h-40 bg-[linear-gradient(90deg,_rgba(90,132,162,0.12),_rgba(90,132,162,0))] blur-3xl" />

        <div
            class="relative mx-auto flex w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
            <div
                class="grid w-full gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
                <aside class="hidden lg:block">
                    <UiCard
                        :show-accent-bar="false"
                        class="sticky top-24">
                        <div class="space-y-5">
                            <div
                                class="flex items-center justify-between gap-3">
                                <UiButton
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    @click="goHome">
                                    <svg
                                        aria-hidden="true"
                                        viewBox="0 0 20 20"
                                        fill="none"
                                        class="h-4 w-4">
                                        <path
                                            d="M11.5 5.5L7 10L11.5 14.5"
                                            stroke="currentColor"
                                            stroke-width="1.8"
                                            stroke-linecap="round"
                                            stroke-linejoin="round" />
                                    </svg>
                                    返回首页
                                </UiButton>
                            </div>

                            <div class="space-y-2">
                                <p
                                    class="text-xs font-medium uppercase tracking-[0.26em] text-crh-blue/80">
                                    {{ eyebrow }}
                                </p>
                                <h2
                                    class="text-2xl font-semibold text-slate-900">
                                    管理后台
                                </h2>
                            </div>

                            <div class="motion-divider" />

                            <nav class="space-y-1.5">
                                <NuxtLink
                                    v-for="item in navItems"
                                    :key="item.path"
                                    :to="buildLink(item.path)"
                                    :class="getNavClass(item.path)">
                                    <span class="flex items-center gap-3">
                                        <span
                                            aria-hidden="true"
                                            class="h-5 w-1 rounded-full transition"
                                            :class="
                                                isActive(item.path)
                                                    ? 'bg-crh-blue'
                                                    : 'bg-slate-300/80 group-hover:bg-slate-400/90'
                                            " />
                                        <span
                                            class="text-left text-sm font-medium">
                                            {{ item.label }}
                                        </span>
                                    </span>
                                </NuxtLink>
                            </nav>
                        </div>
                    </UiCard>
                </aside>

                <section class="min-w-0 space-y-6">
                    <UiCard
                        variant="accent"
                        class="admin-hero-card">
                        <div class="space-y-6">
                            <div
                                class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                <div class="space-y-3">
                                    <p
                                        class="text-xs font-semibold uppercase tracking-[0.28em] text-crh-blue/80">
                                        {{ eyebrow }}
                                    </p>
                                    <div class="space-y-2">
                                        <h1
                                            class="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                                            {{ title }}
                                        </h1>
                                        <p
                                            class="max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
                                            {{ description }}
                                        </p>
                                    </div>
                                </div>

                                <div
                                    class="min-w-0 rounded-[1.15rem] border border-white/75 bg-white/90 px-5 py-5 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.24)] md:w-[21rem]">
                                    <div class="space-y-4">
                                        <div class="space-y-1">
                                            <p
                                                class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                                                当前会话
                                            </p>
                                            <div
                                                class="flex flex-wrap items-center gap-3">
                                                <span
                                                    class="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                                                    管理员已登录
                                                </span>
                                                <span
                                                    class="inline-flex items-center rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white">
                                                    {{
                                                        session?.issuer ??
                                                        'webapp'
                                                    }}
                                                </span>
                                            </div>
                                        </div>

                                        <dl
                                            class="grid gap-4"
                                            :class="
                                                props.showDateInput !== false
                                                    ? 'sm:grid-cols-2'
                                                    : 'sm:grid-cols-1'
                                            ">
                                            <div class="space-y-1">
                                                <dt
                                                    class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                                    用户
                                                </dt>
                                                <dd
                                                    class="text-lg font-semibold text-slate-900">
                                                    {{
                                                        session?.userId ?? '--'
                                                    }}
                                                </dd>
                                            </div>
                                            <div
                                                v-if="
                                                    props.showDateInput !==
                                                    false
                                                "
                                                class="space-y-1">
                                                <dt
                                                    class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                                    日期
                                                </dt>
                                                <dd
                                                    class="text-lg font-semibold text-crh-blue">
                                                    {{ selectedDateYmd }}
                                                </dd>
                                            </div>
                                        </dl>

                                        <UiField
                                            v-if="props.showDateInput !== false"
                                            label="当前日期"
                                            help="所有管理员页面共享这个日期筛选。">
                                            <input
                                                v-model="dateInputModel"
                                                type="date"
                                                class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark"
                                                :max="todayDateInputValue" />
                                        </UiField>

                                        <div
                                            v-if="$slots.toolbar"
                                            class="flex flex-wrap gap-3">
                                            <slot name="toolbar" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </UiCard>

                    <div class="grid gap-3 lg:hidden">
                        <div class="flex items-center justify-start">
                            <UiButton
                                type="button"
                                variant="secondary"
                                size="sm"
                                @click="goHome">
                                <svg
                                    aria-hidden="true"
                                    viewBox="0 0 20 20"
                                    fill="none"
                                    class="h-4 w-4">
                                    <path
                                        d="M11.5 5.5L7 10L11.5 14.5"
                                        stroke="currentColor"
                                        stroke-width="1.8"
                                        stroke-linecap="round"
                                        stroke-linejoin="round" />
                                </svg>
                                返回首页
                            </UiButton>
                        </div>
                        <NuxtLink
                            v-for="item in navItems"
                            :key="`mobile:${item.path}`"
                            :to="buildLink(item.path)"
                            :class="getMobileNavClass(item.path)">
                            {{ item.label }}
                        </NuxtLink>
                    </div>

                    <slot />
                </section>
            </div>
        </div>

        <AppFooter />
    </main>
</template>

<script setup lang="ts">
import type { AuthSession } from '~/types/auth';
import {
    buildAdminRoute,
    fromAdminDateInputValue
} from '~/composables/useAdminDateQuery';

const props = withDefaults(
    defineProps<{
        title: string;
        description: string;
        dateInput: string;
        todayDateInputValue: string;
        session: AuthSession | null;
        eyebrow?: string;
        showDateInput?: boolean;
    }>(),
    {
        eyebrow: '管理后台'
    }
);

const emit = defineEmits<{
    'update:dateInput': [value: string];
}>();

const route = useRoute();

const navItems = [
    {
        label: '概览',
        path: '/admin'
    },
    {
        label: '用户',
        path: '/admin/users'
    },
    {
        label: '被动告警',
        path: '/admin/passive-alerts'
    },
    {
        label: '流量统计',
        path: '/admin/traffic'
    },
    {
        label: '服务器监控',
        path: '/admin/server-metrics'
    },
    {
        label: '主动扫描',
        path: '/admin/anomaly-scan'
    },
    {
        label: '12306 数据',
        path: '/admin/train-provenance'
    },
    {
        label: 'WebApp Token',
        path: '/admin/webapp-tokens'
    },
    {
        label: '任务',
        path: '/admin/tasks'
    }
] as const;

const dateInputModel = computed({
    get() {
        return props.dateInput;
    },
    set(value: string) {
        emit('update:dateInput', value);
    }
});

const selectedDateYmd = computed(() =>
    fromAdminDateInputValue(props.dateInput)
);

function buildLink(path: string) {
    return buildAdminRoute(path, props.dateInput);
}

function isActive(path: string) {
    if (path === '/admin') {
        return route.path === '/admin';
    }

    return route.path === path || route.path.startsWith(path + '/');
}

function getNavClass(path: string) {
    return [
        'group flex rounded-[1rem] px-4 py-3 text-left transition',
        isActive(path)
            ? 'bg-blue-50/90 text-crh-blue'
            : 'text-slate-600 hover:bg-white hover:text-slate-900'
    ];
}

function getMobileNavClass(path: string) {
    return [
        'rounded-[1rem] border px-4 py-3 text-sm font-medium transition',
        isActive(path)
            ? 'border-crh-blue/20 bg-blue-50/90 text-crh-blue'
            : 'border-slate-200 bg-white/90 text-slate-700 hover:border-slate-300 hover:text-slate-900'
    ];
}

function goHome() {
    return navigateTo('/');
}
</script>

<style scoped>
.admin-hero-card.admin-hero-card {
    border-color: rgba(191, 204, 216, 0.82);
    box-shadow:
        0 18px 40px -30px rgba(15, 23, 42, 0.28),
        0 8px 20px rgba(148, 163, 184, 0.14);
}
</style>
