<template>
    <UiCard variant="accent">
        <div class="absolute inset-0">
            <img
                src="/images/background.png"
                alt=""
                aria-hidden="true"
                class="h-full w-full object-cover object-[68%_center] opacity-35 md:opacity-45" />
            <div
                class="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.88)_0%,rgba(248,250,252,0.72)_38%,rgba(248,250,252,0.38)_65%,rgba(248,250,252,0.58)_100%)]" />
            <div
                class="absolute inset-0 bg-[linear-gradient(135deg,rgba(0,82,155,0.12),rgba(0,82,155,0.02)_42%,transparent_72%)]" />
        </div>

        <div
            class="relative grid gap-8 xl:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
            <div class="space-y-5">
                <div class="flex flex-wrap gap-2">
                    <UiStatusBadge
                        label="查询工作台"
                        tone="warning" />
                    <UiStatusBadge
                        label="横屏 / 竖屏适配"
                        tone="info" />
                    <UiStatusBadge
                        label="匿名查询可用"
                        tone="neutral" />
                </div>

                <div class="space-y-4">
                    <p
                        class="text-xs font-semibold uppercase tracking-[0.35em] text-crh-blue/70">
                        OpenCRHTracker
                    </p>
                    <h1
                        class="max-w-3xl text-3xl font-semibold tracking-tight text-crh-grey-dark md:text-5xl">
                        面向中国动车组追踪的首页工作台
                    </h1>
                    <p
                        class="max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
                        用同一套入口完成车次历史、车组历史和当日记录查询。首屏保持轻量，真正需要的数据请求只在你提交查询时发生。
                    </p>
                </div>

                <div class="flex flex-wrap gap-3">
                    <a
                        href="#workbench"
                        class="inline-flex items-center justify-center rounded-full bg-crh-blue px-5 py-3 text-sm font-medium text-white shadow-[0_8px_20px_-10px_rgba(0,82,155,0.7)] transition hover:bg-[#00457f]">
                        进入查询工作区
                    </a>
                    <a
                        href="#quota"
                        class="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white/90 px-5 py-3 text-sm font-medium text-crh-blue transition hover:border-crh-blue/30 hover:bg-blue-50">
                        查看配额说明
                    </a>
                </div>

                <div class="motion-divider" />
            </div>

            <div class="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
                <UiCard variant="subtle">
                    <p class="text-sm text-slate-500">工作台能力</p>
                    <p class="mt-3 text-3xl font-semibold text-crh-blue">
                        3 类
                    </p>
                    <p class="mt-2 text-sm leading-6 text-slate-600">
                        覆盖车次历史、车组历史与当日记录。
                    </p>
                </UiCard>
                <UiCard variant="subtle">
                    <p class="text-sm text-slate-500">结果节奏</p>
                    <p class="mt-3 text-3xl font-semibold text-crh-blue">
                        分页
                    </p>
                    <p class="mt-2 text-sm leading-6 text-slate-600">
                        统一采用继续加载，移动端和桌面端都更稳定。
                    </p>
                </UiCard>
                <UiCard variant="subtle">
                    <p class="text-sm text-slate-500">首屏策略</p>
                    <p class="mt-3 text-3xl font-semibold text-crh-blue">
                        静态
                    </p>
                    <p class="mt-2 text-sm leading-6 text-slate-600">
                        不抢接口额度，把配额留给真正的查询动作。
                    </p>
                </UiCard>
            </div>
        </div>
    </UiCard>
</template>
