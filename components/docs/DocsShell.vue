<template>
    <main class="flex min-h-screen flex-col bg-crh-slate text-crh-grey-dark">
        <div
            class="pointer-events-none absolute inset-x-0 top-0 h-[24rem] bg-[radial-gradient(circle_at_top,_rgba(0,82,155,0.16),_transparent_58%)]" />
        <div
            class="pointer-events-none absolute inset-x-0 top-20 h-40 bg-[linear-gradient(90deg,_rgba(0,82,155,0.12),_rgba(0,82,155,0))] blur-3xl" />

        <div
            class="relative mx-auto flex w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
            <div class="grid w-full gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
                <aside class="space-y-4">
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
                                    返回主页
                                </UiButton>
                            </div>

                            <div class="space-y-2">
                                <p
                                    class="text-xs font-semibold uppercase tracking-[0.28em] text-crh-blue/80">
                                    DOCS
                                </p>
                                <h2
                                    class="text-2xl font-semibold text-slate-900">
                                    文档
                                </h2>
                            </div>

                            <div class="motion-divider" />

                            <nav class="space-y-1.5">
                                <NuxtLink
                                    v-for="item in navItems"
                                    :key="item.to"
                                    :to="item.to"
                                    :class="getNavClass(item.to)">
                                    <span class="flex items-center gap-3">
                                        <span
                                            aria-hidden="true"
                                            class="h-5 w-1 rounded-full transition"
                                            :class="
                                                isActive(item.to)
                                                    ? 'bg-crh-blue'
                                                    : 'bg-slate-300/80 group-hover:bg-slate-400/90'
                                            " />
                                        <span
                                            class="text-left text-sm font-semibold">
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
                        class="rounded-[1.5rem]">
                        <div class="space-y-4">
                            <p
                                class="text-xs font-semibold uppercase tracking-[0.28em] text-crh-blue/80">
                                {{ eyebrow }}
                            </p>
                            <div class="space-y-3">
                                <h1
                                    class="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                                    {{ title }}
                                </h1>
                                <p
                                    class="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
                                    {{ description }}
                                </p>
                            </div>
                        </div>
                    </UiCard>

                    <div class="grid min-w-0 gap-3 lg:hidden">
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
                                返回主页
                            </UiButton>
                        </div>
                        <NuxtLink
                            v-for="item in navItems"
                            :key="'mobile:' + item.to"
                            :to="item.to"
                            :class="getMobileNavClass(item.to)">
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
const props = defineProps<{
    eyebrow: string;
    title: string;
    description: string;
}>();

const route = useRoute();

const navItems = [
    {
        label: '总览',
        to: '/docs'
    },
    {
        label: '私有部署',
        to: '/docs/deploy'
    },
    {
        label: '数据抓取流程',
        to: '/docs/crawl'
    },
    {
        label: 'API 文档',
        to: '/docs/api'
    }
];

function isActive(target: string) {
    if (target === '/docs') {
        return route.path === '/docs';
    }

    return route.path === target || route.path.startsWith(target + '/');
}

function getNavClass(target: string) {
    return [
        'group flex rounded-[1rem] px-4 py-3 text-left transition',
        isActive(target)
            ? 'bg-blue-50/90 text-crh-blue'
            : 'text-slate-600 hover:bg-white hover:text-slate-900'
    ];
}

function getMobileNavClass(target: string) {
    return [
        'rounded-[1rem] border px-4 py-3 text-sm font-semibold transition',
        isActive(target)
            ? 'border-crh-blue/20 bg-blue-50/90 text-crh-blue'
            : 'border-slate-200 bg-white/90 text-slate-700 hover:border-slate-300 hover:text-slate-900'
    ];
}

function goHome() {
    return navigateTo('/');
}

const eyebrow = computed(() => props.eyebrow);
const title = computed(() => props.title);
const description = computed(() => props.description);
</script>
