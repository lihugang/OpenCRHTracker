<template>
    <DocsShell
        eyebrow="FLOW"
        title="数据抓取流程"
        description="说明 OpenCRHTracker 当前的数据抓取链路，便于开发者部署、联调和排障。">
        <UiCard :show-accent-bar="false">
            <div class="space-y-4">
                <div class="space-y-2">
                    <p
                        class="text-xs font-semibold uppercase tracking-[0.24em] text-crh-blue/80">
                        FLOW
                    </p>
                    <h2 class="text-2xl font-semibold text-slate-900">
                        链路概览
                    </h2>
                    <p class="text-sm leading-6 text-slate-600">
                        这条链路的核心目标是先构建当天可用的车次列表，再把出发时间、出发站点、终到时间、终到站点等时刻表数据逐步补全和刷新，设置定时任务，在发车窗口内识别担当并写入数据库。
                    </p>
                </div>

                <div class="grid gap-3 xl:grid-cols-5 md:grid-cols-2">
                    <div
                        v-for="item in crawlFlowOverview"
                        :key="item.title"
                        class="rounded-[1rem] border border-slate-200 bg-slate-50/90 px-4 py-4">
                        <p class="text-sm font-semibold text-slate-900">
                            {{ item.title }}
                        </p>
                        <p class="mt-2 text-sm leading-6 text-slate-600">
                            {{ item.text }}
                        </p>
                    </div>
                </div>
            </div>
        </UiCard>

        <UiCard :show-accent-bar="false">
            <div class="space-y-4">
                <div class="space-y-2">
                    <p
                        class="text-xs font-semibold uppercase tracking-[0.24em] text-crh-blue/80">
                        FLOW
                    </p>
                    <h2 class="text-2xl font-semibold text-slate-900">
                        关键任务顺序
                    </h2>
                </div>

                <DocsCodeBlock
                    :code="taskFlowCode"
                    text-class="text-xs leading-6" />
            </div>
        </UiCard>

        <UiCard
            v-for="section in crawlDocsSections"
            :key="section.id"
            :show-accent-bar="false">
            <div class="space-y-5">
                <div class="space-y-2">
                    <p
                        class="text-xs font-semibold uppercase tracking-[0.24em] text-crh-blue/80">
                        {{ section.id }}
                    </p>
                    <h2 class="text-2xl font-semibold text-slate-900">
                        {{ section.title }}
                    </h2>
                    <p class="text-sm leading-6 text-slate-600">
                        {{ section.summary }}
                    </p>
                </div>

                <div class="space-y-4">
                    <template
                        v-for="(block, index) in section.blocks"
                        :key="section.id + ':' + index">
                        <p
                            v-if="block.type === 'paragraph'"
                            class="text-sm leading-7 text-slate-600">
                            {{ block.text }}
                        </p>

                        <div
                            v-else-if="block.type === 'list'"
                            class="space-y-3">
                            <p
                                v-if="block.title"
                                class="text-sm font-semibold text-slate-900">
                                {{ block.title }}
                            </p>
                            <ul
                                class="space-y-2 text-sm leading-6 text-slate-600">
                                <li
                                    v-for="item in block.items"
                                    :key="item"
                                    class="rounded-[1rem] border border-slate-200 bg-white/80 px-4 py-3">
                                    {{ item }}
                                </li>
                            </ul>
                        </div>

                        <div
                            v-else-if="block.type === 'code'"
                            class="space-y-3">
                            <p
                                v-if="block.title"
                                class="text-sm font-semibold text-slate-900">
                                {{ block.title }}
                            </p>
                            <DocsCodeBlock
                                :code="block.code ?? ''"
                                :text-class="
                                    block.language === 'json'
                                        ? 'text-xs leading-6'
                                        : 'text-sm leading-7'
                                " />
                        </div>

                        <div
                            v-else-if="block.type === 'field-cards'"
                            class="space-y-3">
                            <p
                                v-if="block.title"
                                class="text-sm font-semibold text-slate-900">
                                {{ block.title }}
                            </p>
                            <p
                                v-if="block.text"
                                class="text-sm leading-7 text-slate-600">
                                {{ block.text }}
                            </p>

                            <div class="grid gap-4 xl:grid-cols-2">
                                <div
                                    v-for="card in block.cards ?? []"
                                    :key="card.path"
                                    class="rounded-[1rem] border border-slate-200 bg-white/90 px-4 py-4">
                                    <div
                                        class="flex flex-wrap items-center gap-2">
                                        <code
                                            class="rounded-full bg-slate-100 px-3 py-1 font-mono text-xs text-slate-700">
                                            {{ card.path }}
                                        </code>
                                        <span
                                            class="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                                            {{ card.valueType }}
                                        </span>
                                        <span
                                            v-if="card.required"
                                            class="rounded-full border border-crh-blue/20 bg-blue-50 px-3 py-1 text-xs font-semibold text-crh-blue">
                                            必填
                                        </span>
                                    </div>

                                    <p
                                        class="mt-3 text-sm leading-6 text-slate-600">
                                        {{ card.description }}
                                    </p>

                                    <ul
                                        v-if="(card.notes ?? []).length > 0"
                                        class="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                                        <li
                                            v-for="note in card.notes ?? []"
                                            :key="card.path + ':' + note"
                                            class="rounded-[0.9rem] border border-slate-200 bg-slate-50/80 px-3 py-2">
                                            {{ note }}
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </template>
                </div>
            </div>
        </UiCard>
    </DocsShell>
</template>

<script setup lang="ts">
import { crawlDocsSections, crawlFlowOverview } from '~/utils/docs/crawlDocs';

const taskFlowCode = [
    'Nitro startup',
    '  -> taskScheduleBootstrap',
    '  -> build_today_schedule',
    '      -> buildTodaySchedule',
    '      -> runScheduleProbe(discover -> enrich)',
    '      -> promoteBuildingScheduleState',
    '      -> dispatch_daily_probe_tasks',
    '          -> probe_train_departure x N',
    '              -> ensure PendingCouplingDetection when needed',
    '              -> insertDailyEmuRoute / updateProbeStatus',
    '              -> queue detect_coupled_emu_group',
    '                  -> scan pending groups by bureau/model',
    '                  -> upgrade to CoupledFormationResolved or finalize single',
    '                  -> persistBackfilledCoupledRoutes when coupled',
    '  -> generate_route_refresh_tasks',
    '      -> refresh_route_batch x N'
].join('\n');

definePageMeta({
    pageTransition: {
        name: 'docs-page',
        mode: 'out-in'
    }
});

useHead({
    title: '数据抓取流程 | Open CRH Tracker',
    meta: [
        {
            name: 'description',
            content:
                'OpenCRHTracker 数据抓取流程文档，覆盖启动引导、时刻表构建、线路补刷、发车探测、担当落盘与排障方向。'
        }
    ]
});
</script>
