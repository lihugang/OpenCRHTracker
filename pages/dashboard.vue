<template>
    <main class="flex min-h-screen flex-col bg-crh-slate text-crh-grey-dark">
        <div
            class="pointer-events-none absolute inset-x-0 top-0 h-[24rem] bg-[radial-gradient(circle_at_top,_rgba(0,82,155,0.14),_transparent_58%)]" />
        <div
            class="pointer-events-none absolute inset-x-0 top-20 h-40 bg-[linear-gradient(90deg,_rgba(90,132,162,0.12),_rgba(90,132,162,0))] blur-3xl" />

        <div
            class="relative mx-auto flex w-full max-w-7xl flex-1 items-center px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
            <section class="w-full">
                <UiCard
                    variant="accent"
                    class="rounded-[1.5rem]">
                    <div
                        class="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
                        <div class="max-w-3xl space-y-4">
                            <div class="space-y-2">
                                <p
                                    class="text-xs font-semibold uppercase tracking-[0.28em] text-crh-blue/80">
                                    Dashboard
                                </p>
                                <h1
                                    class="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                                    用户面板正在建设中
                                </h1>
                                <p
                                    class="text-base leading-7 text-slate-600 sm:text-[1.05rem]">
                                    这里将作为已登录用户的统一入口，后续可承载账号信息、API
                                    Key 管理和更多个性化能力。
                                </p>
                            </div>

                            <div class="grid gap-3 sm:grid-cols-2">
                                <div
                                    v-for="item in previewItems"
                                    :key="item.title"
                                    class="rounded-[1.1rem] border border-white/70 bg-white/80 px-4 py-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)] backdrop-blur">
                                    <p
                                        class="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-crh-blue/80">
                                        {{ item.eyebrow }}
                                    </p>
                                    <p
                                        class="mt-2 text-sm font-semibold text-slate-900">
                                        {{ item.title }}
                                    </p>
                                    <p
                                        class="mt-1 text-sm leading-6 text-slate-600">
                                        {{ item.description }}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div class="flex flex-wrap gap-3">
                            <NuxtLink
                                to="/"
                                class="inline-flex items-center justify-center rounded-full bg-crh-blue px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-900">
                                返回首页
                            </NuxtLink>
                            <NuxtLink
                                to="/feedback"
                                class="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-900 hover:text-slate-900">
                                反馈建议
                            </NuxtLink>
                        </div>
                    </div>
                </UiCard>
            </section>
        </div>

        <AppFooter />
    </main>
</template>

<script setup lang="ts">
const previewItems = [
    {
        eyebrow: 'Planned',
        title: '账号概览',
        description: '展示当前登录状态、基础资料和后续与账号相关的常用入口。'
    },
    {
        eyebrow: 'Planned',
        title: 'API Key 管理',
        description: '统一承载密钥列表、创建和撤销等已存在的认证能力。'
    }
];

useHead({
    title: 'Dashboard | OpenCRHTracker',
    meta: [
        {
            name: 'description',
            content:
                'OpenCRHTracker 用户面板占位页，后续将承载账号信息与 API Key 管理等功能。'
        }
    ]
});
</script>
