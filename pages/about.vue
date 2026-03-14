<template>
    <main class="flex min-h-screen flex-col bg-crh-slate text-crh-grey-dark">
        <div
            class="pointer-events-none absolute inset-x-0 top-0 h-[26rem] bg-[radial-gradient(circle_at_top,_rgba(0,82,155,0.14),_transparent_60%)]" />
        <div
            class="pointer-events-none absolute inset-x-0 top-24 h-40 bg-[linear-gradient(90deg,_rgba(0,82,155,0.12),_rgba(0,82,155,0))] blur-3xl" />

        <div
            class="relative mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
            <section
                class="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.9fr)]">
                <UiCard
                    variant="accent"
                    class="rounded-[1.5rem]">
                    <div class="space-y-6">
                        <div class="space-y-3">
                            <p
                                class="text-xs font-semibold uppercase tracking-[0.28em] text-crh-blue">
                                About
                            </p>
                            <h1
                                class="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                                关于 OpenCRHTracker
                            </h1>
                            <p
                                class="max-w-3xl text-base leading-7 text-slate-600 sm:text-[1.05rem]">
                                这里放这项服务的核心介绍。建议用两到三句话说明它是什么、解决什么问题，以及适合什么用户使用。
                            </p>
                        </div>

                        <div class="grid gap-3 sm:grid-cols-3">
                            <div
                                v-for="fact in heroFacts"
                                :key="fact.label"
                                class="rounded-[1.1rem] border border-white/70 bg-white/80 px-4 py-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)] backdrop-blur">
                                <p
                                    class="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-crh-blue/80">
                                    {{ fact.label }}
                                </p>
                                <p
                                    class="mt-2 text-sm leading-6 text-slate-700">
                                    {{ fact.value }}
                                </p>
                            </div>
                        </div>
                    </div>
                </UiCard>

                <UiCard
                    variant="subtle"
                    class="rounded-[1.5rem]">
                    <div class="space-y-5">
                        <div class="space-y-2">
                            <p
                                class="text-xs font-semibold uppercase tracking-[0.24em] text-crh-blue">
                                Writing Notes
                            </p>
                            <h2
                                class="text-xl font-semibold tracking-tight text-slate-900">
                                建议优先写清楚的内容
                            </h2>
                        </div>

                        <div class="space-y-4">
                            <div
                                v-for="item in writingNotes"
                                :key="item.title"
                                class="rounded-[1rem] border border-slate-200/80 bg-white/70 px-4 py-4">
                                <p class="text-sm font-semibold text-slate-900">
                                    {{ item.title }}
                                </p>
                                <p
                                    class="mt-1 text-sm leading-6 text-slate-600">
                                    {{ item.description }}
                                </p>
                            </div>
                        </div>
                    </div>
                </UiCard>
            </section>

            <section class="grid gap-5 lg:grid-cols-2">
                <UiCard
                    v-for="section in contentSections"
                    :key="section.title"
                    variant="default"
                    class="rounded-[1.4rem]">
                    <div class="space-y-5">
                        <div class="space-y-2">
                            <p
                                class="text-xs font-semibold uppercase tracking-[0.22em] text-crh-blue">
                                {{ section.eyebrow }}
                            </p>
                            <h2
                                class="text-2xl font-semibold tracking-tight text-slate-900">
                                {{ section.title }}
                            </h2>
                            <p class="text-base leading-7 text-slate-600">
                                {{ section.description }}
                            </p>
                        </div>

                        <ul class="space-y-3">
                            <li
                                v-for="point in section.points"
                                :key="point"
                                class="flex gap-3 rounded-[1rem] border border-slate-200/80 bg-slate-50/80 px-4 py-3">
                                <span
                                    class="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-crh-blue" />
                                <span class="text-sm leading-6 text-slate-700">
                                    {{ point }}
                                </span>
                            </li>
                        </ul>
                    </div>
                </UiCard>
            </section>

            <section>
                <UiCard
                    variant="accent"
                    class="rounded-[1.5rem]">
                    <div
                        class="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                        <div class="max-w-3xl space-y-3">
                            <p
                                class="text-xs font-semibold uppercase tracking-[0.24em] text-crh-blue">
                                Final Block
                            </p>
                            <h2
                                class="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                                结尾区可以放声明、反馈入口或项目链接
                            </h2>
                            <p class="text-base leading-7 text-slate-600">
                                如果你不想把 About
                                页写得太长，这里可以作为收尾区域，放非官方说明、反馈方式，或者链接到更详细的文档页面。
                            </p>
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
                                反馈页面
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
const heroFacts = [
    {
        label: '项目定位',
        value: '在这里写一句最短的定位描述，例如“近期动车组担当关系查询工具”。'
    },
    {
        label: '数据说明',
        value: '在这里简要说明数据来源、时效性，或提醒结果并非官方实时最终信息。'
    },
    {
        label: '适用范围',
        value: '在这里写清楚主要支持什么查询，以及用户不该如何误用这些结果。'
    }
];

const writingNotes = [
    {
        title: '先讲用途',
        description: '用户首先想知道这是做什么的，不是你用了什么技术。'
    },
    {
        title: '再讲边界',
        description:
            '把“能查什么”和“可能不准的原因”提早说明，会比堆背景故事更有效。'
    },
    {
        title: '技术点少而准',
        description:
            '只保留对用户理解结果有帮助的技术信息，比如来源、刷新、延迟。'
    }
];

const contentSections = [
    {
        eyebrow: 'Section 01',
        title: '项目介绍',
        description:
            '这里适合写项目的来历、用途和目标用户。你可以把它当成整页最重要的一段内容。',
        points: [
            '说明这是一个什么站点，核心提供什么查询能力。',
            '解释它解决了什么问题，例如把零散信息整理成可直接检索的入口。',
            '如果有明确受众，也可以点明适合铁路爱好者、信息整理者或普通查询用户。'
        ]
    },
    {
        eyebrow: 'Section 02',
        title: '数据来源与时效',
        description:
            '这里建议用比较克制的写法，告诉用户结果是怎么来的，以及为什么可能存在延迟或偏差。',
        points: [
            '写清楚数据来自哪里，至少写到“公开可访问信息整理”这一层。',
            '说明更新机制或时间窗口，例如近期记录、定时刷新、缓存整理。',
            '明确提醒这不是官方实时结果，临时换组、接口波动或缺失都可能影响准确性。'
        ]
    },
    {
        eyebrow: 'Section 03',
        title: '查询范围与限制',
        description:
            '这一块主要用来降低误解。把支持能力和限制条件写在一起，用户会更容易判断是否适合自己的需求。',
        points: [
            '列出支持的查询入口，例如按车次号、车组号查看近期担当关系。',
            '说明哪些情况可能查不到，或哪些类型的数据不保证完整覆盖。',
            '补一句“结果仅供参考”，避免用户把页面内容当作正式依据。'
        ]
    },
    {
        eyebrow: 'Section 04',
        title: '使用方式与反馈',
        description:
            '如果页面还需要一个偏操作性的收尾，可以在这里告诉用户怎么用，以及遇到问题应该去哪里反馈。',
        points: [
            '用两三步写清楚典型使用流程，不要写成冗长教程。',
            '给出反馈入口、Issue 地址，或者后续文档页面链接。',
            '如果你愿意，也可以在这里放一句简短的非官方声明。'
        ]
    }
];

useHead({
    title: '关于 | OpenCRHTracker',
    meta: [
        {
            name: 'description',
            content:
                '了解 OpenCRHTracker 的定位、数据说明、使用范围与反馈方式。'
        }
    ]
});
</script>
