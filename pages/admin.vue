<template>
    <main
        class="flex min-h-screen flex-col bg-[linear-gradient(180deg,#f8fafc_0%,#eef5fb_100%)] text-crh-grey-dark">
        <div
            class="pointer-events-none absolute inset-x-0 top-0 h-[24rem] bg-[radial-gradient(circle_at_top,_rgba(0,82,155,0.14),_transparent_58%)]" />
        <div
            class="pointer-events-none absolute inset-x-0 top-20 h-40 bg-[linear-gradient(90deg,_rgba(90,132,162,0.12),_rgba(90,132,162,0))] blur-3xl" />

        <div
            class="relative mx-auto flex w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
            <section class="mx-auto flex w-full max-w-5xl flex-col gap-6">
                <UiCard
                    variant="accent"
                    class="admin-hero-card">
                    <div class="space-y-6">
                        <div
                            class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div class="space-y-3">
                                <p
                                    class="text-xs font-semibold uppercase tracking-[0.28em] text-crh-blue/80">
                                    Admin
                                </p>
                                <div class="space-y-2">
                                    <h1
                                        class="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                                        管理员后台入口
                                    </h1>
                                    <p class="max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                                        管理员身份已经在当前会话中生效。这个页面先作为后台壳层，后续会逐步补齐系统状态、任务积压和 warning 汇总。
                                    </p>
                                </div>
                            </div>

                            <UiButton
                                type="button"
                                variant="secondary"
                                @click="goHome">
                                返回首页
                            </UiButton>
                        </div>

                        <div class="motion-divider" />

                        <div class="grid gap-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
                            <div
                                class="rounded-[1.15rem] border border-white/75 bg-white/90 px-5 py-5 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.24)]">
                                <p
                                    class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                                    Current Session
                                </p>
                                <div class="mt-4 flex flex-wrap items-center gap-3">
                                    <span
                                        class="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                                        Admin Active
                                    </span>
                                    <span
                                        class="inline-flex items-center rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white">
                                        {{ session?.issuer ?? 'webapp' }}
                                    </span>
                                </div>
                                <dl class="mt-5 grid gap-4 sm:grid-cols-2">
                                    <div class="space-y-1">
                                        <dt class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                            用户名
                                        </dt>
                                        <dd class="text-lg font-semibold text-slate-900">
                                            {{ session?.userId ?? '--' }}
                                        </dd>
                                    </div>
                                    <div class="space-y-1">
                                        <dt class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                            权限状态
                                        </dt>
                                        <dd class="text-lg font-semibold text-crh-blue">
                                            已授予管理员权限
                                        </dd>
                                    </div>
                                </dl>
                            </div>

                            <div
                                class="rounded-[1.15rem] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-5 py-5 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.22)]">
                                <p
                                    class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                                    Next Steps
                                </p>
                                <ul class="mt-4 space-y-3 text-sm leading-6 text-slate-600">
                                    <li>补系统状态总览卡片</li>
                                    <li>补任务积压与调度可见性</li>
                                    <li>补 warning 信息汇总</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </UiCard>

                <div class="grid gap-4 md:grid-cols-3">
                    <UiCard
                        v-for="item in placeholders"
                        :key="item.title"
                        :show-accent-bar="false"
                        variant="subtle">
                        <div class="space-y-3">
                            <p
                                class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                                {{ item.eyebrow }}
                            </p>
                            <h2 class="text-xl font-semibold text-slate-900">
                                {{ item.title }}
                            </h2>
                            <p class="text-sm leading-6 text-slate-600">
                                {{ item.description }}
                            </p>
                        </div>
                    </UiCard>
                </div>
            </section>
        </div>

        <AppFooter />
    </main>
</template>

<script setup lang="ts">
definePageMeta({
    middleware: 'admin-required'
});

const { session } = useAuthState();

const placeholders = [
    {
        eyebrow: 'System',
        title: '系统状态',
        description: '后续这里会展示健康检查、最近刷新时间和关键后台任务状态。'
    },
    {
        eyebrow: 'Tasks',
        title: '任务积压',
        description: '后续这里会展示待执行任务数量、调度节奏和执行压力。'
    },
    {
        eyebrow: 'Warnings',
        title: 'Warning 汇总',
        description: '后续这里会展示采集链路和后台流程中的重点告警与异常摘要。'
    }
] as const;

useSiteSeo({
    title: '管理员后台 | Open CRH Tracker',
    description: 'Open CRH Tracker 管理员后台入口。',
    path: '/admin',
    noindex: true
});

async function goHome() {
    await navigateTo('/');
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
