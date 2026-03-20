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
                                Feedback
                            </p>
                            <h1
                                class="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                                反馈
                            </h1>
                        </div>

                        <AppUnofficialInstanceNotice page="feedback" />

                        <p class="text-base leading-7 text-slate-600">
                            如果你在查询过程中遇到问题，或希望补充功能与页面内容，可以通过项目仓库提交
                            issue 或反馈建议。
                        </p>

                        <a
                            href="https://github.com/lihugang/OpenCRHTracker/issues"
                            class="inline-flex items-center text-sm font-medium text-crh-blue underline underline-offset-4 transition hover:text-slate-900"
                            rel="noreferrer"
                            target="_blank">
                            前往 GitHub Issues
                        </a>
                    </div>
                </UiCard>
            </section>
        </div>

        <AppFooter />
    </main>
</template>

<script setup lang="ts">
useHead({
    title: '反馈 | OpenCRHTracker',
    meta: [
        {
            name: 'description',
            content: '向 OpenCRHTracker 提交建议或问题反馈。'
        }
    ]
});
</script>
