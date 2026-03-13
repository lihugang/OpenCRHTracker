<template>
    <main class="flex min-h-screen flex-col bg-crh-slate text-crh-grey-dark">
        <div
            class="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,_rgba(0,82,155,0.1),_transparent_58%)]" />

        <div
            class="relative mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
            <section class="mx-auto flex w-full max-w-3xl flex-1 items-center">
                <UiCard
                    variant="accent"
                    class="w-full rounded-[1.5rem]">
                    <div class="space-y-5">
                        <div class="space-y-3">
                            <p
                                class="text-xs font-semibold uppercase tracking-[0.28em] text-crh-blue">
                                About
                            </p>
                            <h1
                                class="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                                关于 Open CRH Tracker
                            </h1>
                        </div>

                        <p class="text-base leading-7 text-slate-600">
                            Open CRH Tracker
                            用于查询动车组与车次在最近一段时间内的担当关系，方便快速查看列车与车组的对应情况。
                        </p>

                        <p class="text-base leading-7 text-slate-600">
                            当前页面先提供基础说明，后续如果需要补充项目背景、数据来源或使用说明，可以在这里继续扩展。
                        </p>
                    </div>
                </UiCard>
            </section>
        </div>

        <AppFooter />
    </main>
</template>

<script setup lang="ts">
useHead({
    title: '关于 | OpenCRHTracker',
    meta: [
        {
            name: 'description',
            content: '了解 OpenCRHTracker 的用途与基础说明。'
        }
    ]
});
</script>
