<template>
    <ul
        :class="
            depth > 0
                ? 'mt-3 space-y-3 border-l border-slate-200/80 pl-4'
                : 'space-y-3'
        ">
        <li
            v-for="node in nodes"
            :key="node.event.id"
            class="space-y-3">
            <article
                class="rounded-[1rem] border px-4 py-4"
                :class="
                    getEventCardClass(node.event.kind, node.event.level, depth)
                ">
                <div
                    class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div class="space-y-2">
                        <div class="flex flex-wrap items-center gap-2">
                            <span
                                class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em]"
                                :class="
                                    getEventBadgeClass(
                                        node.event.kind,
                                        node.event.level
                                    )
                                ">
                                {{ node.event.kind }}
                            </span>
                            <span class="text-sm font-semibold text-slate-900">
                                {{ node.event.title }}
                            </span>
                        </div>
                        <p
                            v-if="node.event.message"
                            class="text-sm leading-6 text-slate-700">
                            {{ node.event.message }}
                        </p>
                    </div>
                    <div class="text-xs leading-5 text-slate-500">
                        <p>{{ formatTimestamp(node.event.timestamp) }}</p>
                        <p v-if="node.event.durationMs !== null">
                            {{ node.event.durationMs }} ms
                        </p>
                    </div>
                </div>

                <div
                    v-if="node.event.kind === 'request'"
                    class="mt-3 rounded-[0.9rem] bg-white/70 px-3 py-3 text-sm leading-6 text-slate-600">
                    <p>{{ node.event.method }} {{ node.event.url }}</p>
                    <p>
                        operation={{ node.event.operation }}
                        <template v-if="node.event.responseStatus !== null">
                            | status={{ node.event.responseStatus }}
                        </template>
                        <template v-if="node.event.errorCode">
                            | error={{ node.event.errorCode }}
                        </template>
                    </p>
                </div>

                <div
                    v-if="node.event.kind === 'function'"
                    class="mt-3 text-sm leading-6 text-slate-600">
                    函数：{{ node.event.functionName }} | 状态：{{
                        node.event.status
                    }}
                </div>

                <div
                    v-if="node.event.kind === 'database'"
                    class="mt-3 rounded-[0.9rem] bg-white/70 px-3 py-3 text-sm leading-6 text-slate-600">
                    <p>
                        database={{ node.event.database }} | table={{
                            node.event.table
                        }}
                    </p>
                    <p>
                        operation={{ node.event.operation }}
                        <template v-if="node.event.changes !== null">
                            | changes={{ node.event.changes }}
                        </template>
                    </p>
                </div>

                <div
                    v-if="node.event.kind === 'summary'"
                    class="mt-3 text-sm leading-6 text-slate-600">
                    最终状态：{{ node.event.status }}
                </div>

                <div
                    v-if="Object.keys(node.event.context).length > 0"
                    class="mt-3 grid gap-2 rounded-[0.9rem] bg-white/70 px-3 py-3 text-sm leading-6 text-slate-600 md:grid-cols-2">
                    <div
                        v-for="entry in toEventContextEntries(
                            node.event.context
                        )"
                        :key="`${node.event.id}:${entry.key}`"
                        class="min-w-0">
                        <span class="font-medium text-slate-900">
                            {{ entry.key }}
                        </span>
                        ：{{ entry.value }}
                    </div>
                </div>
            </article>

            <Admin12306TraceTimelineTree
                v-if="node.children.length > 0"
                :nodes="node.children"
                :depth="depth + 1" />
        </li>
    </ul>
</template>

<script setup lang="ts">
import type { Admin12306TraceEvent } from '~/types/admin';

defineOptions({
    name: 'Admin12306TraceTimelineTree'
});

interface Admin12306TraceTimelineNode {
    event: Admin12306TraceEvent;
    children: Admin12306TraceTimelineNode[];
}

const props = withDefaults(
    defineProps<{
        nodes: Admin12306TraceTimelineNode[];
        depth?: number;
    }>(),
    {
        depth: 0
    }
);

const traceTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
});
const traceContextTimeKeys = new Set([
    'startAt',
    'endAt',
    'historicalStartAt',
    'seatStartAt'
]);

const depth = computed(() => props.depth);

function formatTimestamp(timestamp: number) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return '--';
    }

    return traceTimeFormatter.format(new Date(timestamp * 1000));
}

function formatContextValue(key: string, value: string) {
    if (!traceContextTimeKeys.has(key)) {
        return value;
    }

    const parsedValue = Number.parseInt(value, 10);
    if (!Number.isInteger(parsedValue) || parsedValue < 0) {
        return value;
    }

    return formatTimestamp(parsedValue);
}

function getEventBadgeClass(
    kind: Admin12306TraceEvent['kind'],
    level: Admin12306TraceEvent['level']
) {
    if (level === 'ERROR') {
        return 'bg-rose-100 text-rose-800';
    }
    if (level === 'WARN') {
        return 'bg-amber-100 text-amber-800';
    }
    if (kind === 'summary') {
        return 'bg-emerald-100 text-emerald-800';
    }
    if (kind === 'database') {
        return 'bg-sky-100 text-sky-800';
    }
    return 'bg-slate-200 text-slate-700';
}

function getEventCardClass(
    kind: Admin12306TraceEvent['kind'],
    level: Admin12306TraceEvent['level'],
    currentDepth: number
) {
    const depthToneIndex = Math.min(Math.max(currentDepth, 0), 3);

    if (level === 'ERROR') {
        return [
            'border-rose-200',
            [
                'bg-rose-50/60',
                'bg-rose-50/90',
                'bg-rose-100/75',
                'bg-rose-100/90'
            ][depthToneIndex]
        ];
    }
    if (level === 'WARN') {
        return [
            'border-amber-200',
            [
                'bg-amber-50/60',
                'bg-amber-50/90',
                'bg-amber-100/70',
                'bg-amber-100/85'
            ][depthToneIndex]
        ];
    }
    if (kind === 'summary') {
        return [
            'border-emerald-200',
            [
                'bg-emerald-50/60',
                'bg-emerald-50/90',
                'bg-emerald-100/70',
                'bg-emerald-100/85'
            ][depthToneIndex]
        ];
    }
    return [
        depthToneIndex >= 2 ? 'border-slate-300' : 'border-slate-200',
        ['bg-white/90', 'bg-slate-50/95', 'bg-slate-100/85', 'bg-slate-100/95'][
            depthToneIndex
        ]
    ];
}

function toEventContextEntries(context: Record<string, string>) {
    return Object.entries(context)
        .filter(([, value]) => value.trim().length > 0)
        .slice(0, 12)
        .map(([key, value]) => ({
            key,
            value: formatContextValue(key, value)
        }));
}
</script>
