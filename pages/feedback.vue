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

                        <template v-if="shouldShowUnofficialWarning">
                            <p class="text-base leading-7 text-[#E53E3E]">
                                <span class="font-semibold">[!]</span>
                                当前网站非 Open CRH Tracker 官方站点，如需反馈问题或提出建议，请前往
                                <a
                                    href="https://crh.lihugang.top/feedback"
                                    class="font-semibold underline underline-offset-4 transition hover:text-[#C53030]"
                                    rel="noreferrer"
                                    target="_blank">
                                    官方站点
                                </a>
                                或
                                <a
                                    href="https://github.com/lihugang/OpenCRHTracker"
                                    class="font-semibold underline underline-offset-4 transition hover:text-[#C53030]"
                                    rel="noreferrer"
                                    target="_blank">
                                    GitHub 项目
                                </a>
                                。
                            </p>
                        </template>

                        <template v-else>
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
                        </template>

                        <NuxtLink
                            to="/"
                            class="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-900 hover:text-slate-900">
                            返回主页
                        </NuxtLink>
                    </div>
                </UiCard>
            </section>
        </div>

        <AppFooter />
    </main>
</template>

<script setup lang="ts">
const { shouldShowUnofficialWarning } = useOfficialInstance();

useHead({
    title: '反馈 | Open CRH Tracker',
    meta: [
        {
            name: 'description',
            content: '向 Open CRH Tracker 提交建议或问题反馈。'
        }
    ]
});
</script>
