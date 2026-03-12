<template>
    <UiCard>
        <div class="space-y-6">
            <div class="space-y-2">
                <p
                    class="text-xs font-semibold uppercase tracking-[0.3em] text-crh-blue/70">
                    Recent Assignments
                </p>
                <div
                    class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                    <div>
                        <h2 class="text-2xl font-semibold text-crh-grey-dark">
                            {{ title }}
                        </h2>
                        <p class="mt-1 text-sm leading-6 text-slate-500">
                            {{ summary }}
                        </p>
                    </div>
                    <UiStatusBadge
                        :label="badgeLabel"
                        tone="neutral" />
                </div>
            </div>

            <div class="motion-divider" />

            <div
                v-if="state === 'loading'"
                class="space-y-4">
                <UiCard
                    v-for="index in 4"
                    :key="index"
                    variant="subtle">
                    <div class="animate-pulse space-y-4">
                        <div class="h-5 w-1/4 rounded bg-slate-200" />
                        <div class="h-4 w-2/3 rounded bg-slate-200" />
                        <div class="flex gap-2">
                            <div class="h-8 w-28 rounded-full bg-slate-100" />
                            <div class="h-8 w-24 rounded-full bg-slate-100" />
                        </div>
                    </div>
                </UiCard>
            </div>

            <UiEmptyState
                v-else-if="state === 'empty'"
                eyebrow="暂无结果"
                title="最近 30 天没有整理出担当结果"
                description="可以尝试换一个车次号或车组号，或确认输入是否正确。" />

            <UiEmptyState
                v-else-if="state === 'error'"
                eyebrow="加载失败"
                title="近日担当列表暂时不可用"
                :description="errorMessage || '请稍后重试。'"
                tone="danger" />

            <div
                v-else
                class="space-y-4">
                <UiCard
                    v-for="group in groups"
                    :key="group.id"
                    variant="subtle">
                    <div class="space-y-4">
                        <div
                            class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div>
                                <p class="text-sm font-medium text-slate-500">
                                    {{ group.dayLabel }}
                                </p>
                                <h3
                                    class="mt-1 text-lg font-semibold text-crh-grey-dark">
                                    {{ group.routeLabel }}
                                </h3>
                            </div>
                            <p
                                class="font-mono text-xs font-medium text-slate-500">
                                {{ group.timeLabel }}
                            </p>
                        </div>

                        <div class="flex flex-wrap gap-2">
                            <span
                                v-for="code in group.primaryCodes"
                                :key="`${group.id}-${code}`"
                                class="rounded-full border border-crh-blue/15 bg-blue-50 px-3 py-1.5 font-mono text-xs font-semibold text-crh-blue">
                                {{ code }}
                            </span>
                        </div>

                        <dl class="grid gap-3 md:grid-cols-3">
                            <div
                                class="rounded-[1rem] border border-slate-200 bg-white/90 px-4 py-3">
                                <dt
                                    class="text-xs uppercase tracking-[0.2em] text-slate-400">
                                    {{ primaryLabel }}
                                </dt>
                                <dd
                                    class="mt-2 text-sm font-medium text-crh-grey-dark">
                                    {{ group.primaryCodes.length }} 组
                                </dd>
                            </div>
                            <div
                                class="rounded-[1rem] border border-slate-200 bg-white/90 px-4 py-3">
                                <dt
                                    class="text-xs uppercase tracking-[0.2em] text-slate-400">
                                    始发站
                                </dt>
                                <dd
                                    class="mt-2 text-sm font-medium text-crh-grey-dark">
                                    {{ group.startStation }}
                                </dd>
                            </div>
                            <div
                                class="rounded-[1rem] border border-slate-200 bg-white/90 px-4 py-3">
                                <dt
                                    class="text-xs uppercase tracking-[0.2em] text-slate-400">
                                    终到站
                                </dt>
                                <dd
                                    class="mt-2 text-sm font-medium text-crh-grey-dark">
                                    {{ group.endStation }}
                                </dd>
                            </div>
                        </dl>
                    </div>
                </UiCard>
            </div>
        </div>
    </UiCard>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type {
    LookupTargetType,
    RecentAssignmentGroup,
    RecentAssignmentsState
} from '~/types/lookup';

const props = defineProps<{
    type: LookupTargetType;
    code: string;
    state: RecentAssignmentsState;
    groups: RecentAssignmentGroup[];
    summary: string;
    errorMessage?: string;
}>();

const title = computed(() => {
    return props.type === 'train'
        ? `${props.code} 近日由哪些车担当`
        : `${props.code} 近日担当哪些车次`;
});

const badgeLabel = computed(() => {
    return props.type === 'train' ? '仅显示担当车组' : '仅显示担当车次';
});

const primaryLabel = computed(() => {
    return props.type === 'train' ? '担当车组' : '担当车次';
});
</script>
