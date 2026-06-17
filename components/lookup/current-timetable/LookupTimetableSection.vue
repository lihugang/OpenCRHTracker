<template>
    <LookupExpandableSection
        :model-value="modelValue"
        title="时刻表"
        :section-id="sectionId"
        :summary="summary"
        collapse-label="折叠时刻表"
        expand-label="展开时刻表"
        show-toggle
        @update:model-value="emit('update:modelValue', $event)">
        <template #notice>
            <p
                v-if="isCurrentView && notice && modelValue"
                class="text-sm leading-6 text-slate-700">
                {{ notice }}
            </p>
        </template>

        <div
            v-if="showHistorySelector"
            class="flex justify-end">
            <UiSelect
                :model-value="selectedSourceKey"
                class="min-w-[12rem]"
                :options="historyOptions"
                placeholder="选择时段"
                mobile-presentation="sheet"
                mobile-sheet-title="选择时段"
                mobile-sheet-eyebrow="TIMETABLE"
                @update:model-value="handleSourceKeyUpdate" />
        </div>

        <div
            ref="tableShell"
            class="lookup-timetable-table-shell hidden overflow-hidden rounded-[1.25rem] border border-slate-200 md:block">
            <table
                class="w-full table-fixed border-separate border-spacing-0 bg-white/90">
                <colgroup>
                    <col
                        v-for="column in tableColumnLayouts"
                        :key="'col:' + column.key"
                        :style="{ width: column.width }" />
                </colgroup>
                <thead>
                    <tr class="bg-slate-50/80 text-left">
                        <th
                            v-for="column in tableColumnLayouts"
                            :key="'head:' + column.key"
                            :class="getTableHeaderCellClass(column.key)">
                            {{ column.label }}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr
                        v-for="(stop, stopIndex) in timetable.stops"
                        :key="'desktop:' + stop.stationNo"
                        class="align-top">
                        <td
                            :class="getTableBodyCellClass('stationNo')">
                            {{ stop.stationNo }}
                        </td>
                        <td
                            :class="getTableBodyCellClass('trainCode')">
                            {{ stop.stationTrainCode || '--' }}
                        </td>
                        <td
                            :class="getTableBodyCellClass('stationName')">
                            <LookupStationLink
                                :station-name="stop.stationName"
                                :focus-train-codes="
                                    resolveStopFocusTrainCodes(stop)
                                "
                                class="lookup-timetable-text-wrap"
                                fallback-text="--" />
                        </td>
                        <td
                            :class="getTableBodyCellClass('arriveAt')">
                            {{ formatStopTime(stop.arriveAt) }}
                        </td>
                        <td
                            :class="getTableBodyCellClass('departAt')">
                            {{ formatStopTime(stop.departAt) }}
                        </td>
                        <td
                            v-if="isCurrentView"
                            :class="getTableBodyCellClass('wicket')">
                            {{ formatStopWicket(stop) }}
                        </td>
                        <td
                            v-if="showDistanceColumns"
                            :class="getTableBodyCellClass('distance')">
                            <span class="lookup-timetable-measurement">
                                <span>{{
                                    getStopDistanceParts(stop, stopIndex).value
                                }}</span>
                                <span
                                    v-if="
                                        showMeasurementUnits &&
                                        getStopDistanceParts(stop, stopIndex)
                                            .unit
                                    "
                                    class="lookup-timetable-measurement-unit">
                                    {{
                                        getStopDistanceParts(stop, stopIndex)
                                            .unit
                                    }}
                                </span>
                            </span>
                        </td>
                        <td
                            v-if="showDistanceColumns"
                            :class="getTableBodyCellClass('sectionSpeed')">
                            <span class="lookup-timetable-measurement">
                                <span>{{
                                    getStopSectionSpeedParts(stop, stopIndex)
                                        .value
                                }}</span>
                                <span
                                    v-if="
                                        showMeasurementUnits &&
                                        getStopSectionSpeedParts(
                                            stop,
                                            stopIndex
                                        ).unit
                                    "
                                    class="lookup-timetable-measurement-unit">
                                    {{
                                        getStopSectionSpeedParts(
                                            stop,
                                            stopIndex
                                        ).unit
                                    }}
                                </span>
                            </span>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div class="space-y-2.5 md:hidden">
            <UiCard
                v-for="(stop, stopIndex) in timetable.stops"
                :key="'mobile:' + stop.stationNo"
                :show-accent-bar="false"
                variant="subtle">
                <div class="space-y-3">
                    <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0 flex-1">
                            <p
                                class="text-xs uppercase tracking-[0.16em] text-slate-400">
                                第 {{ stop.stationNo }} 站
                            </p>
                            <p
                                class="mt-1 text-sm font-semibold text-crh-grey-dark">
                                <LookupStationLink
                                    :station-name="stop.stationName"
                                    :focus-train-codes="
                                        resolveStopFocusTrainCodes(stop)
                                    "
                                    class="lookup-timetable-text-wrap"
                                    fallback-text="--" />
                            </p>
                        </div>
                        <span
                            class="max-w-[45%] break-all text-right font-mono text-xs text-slate-400">
                            {{ stop.stationTrainCode || '--' }}
                        </span>
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                        <div class="min-w-0">
                            <p
                                class="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                到点
                            </p>
                            <p
                                class="lookup-timetable-text-wrap mt-1 font-mono text-sm text-slate-500">
                                {{ formatStopTime(stop.arriveAt) }}
                            </p>
                        </div>
                        <div class="min-w-0">
                            <p
                                class="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                开点
                            </p>
                            <p
                                class="lookup-timetable-text-wrap mt-1 font-mono text-sm text-slate-500">
                                {{ formatStopTime(stop.departAt) }}
                            </p>
                        </div>
                        <div class="min-w-0">
                            <p
                                class="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                车次
                            </p>
                            <p
                                class="lookup-timetable-text-wrap mt-1 font-mono text-sm text-slate-500">
                                {{ stop.stationTrainCode || '--' }}
                            </p>
                        </div>
                        <div
                            v-if="isCurrentView"
                            class="min-w-0">
                            <p
                                class="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                检票口
                            </p>
                            <p
                                class="lookup-timetable-text-wrap mt-1 text-sm text-slate-500">
                                {{ formatStopWicket(stop) }}
                            </p>
                        </div>
                        <div
                            v-if="showDistanceColumns"
                            class="min-w-0">
                            <p
                                class="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                里程
                            </p>
                            <p
                                class="lookup-timetable-text-wrap mt-1 font-mono text-sm text-slate-500">
                                {{ formatStopDistance(stop, stopIndex) }}
                            </p>
                        </div>
                        <div
                            v-if="showDistanceColumns"
                            class="min-w-0">
                            <p
                                class="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                区间均速
                            </p>
                            <p
                                class="lookup-timetable-text-wrap mt-1 font-mono text-sm text-slate-500">
                                {{ formatStopSectionSpeed(stop, stopIndex) }}
                            </p>
                        </div>
                    </div>
                </div>
            </UiCard>
        </div>
    </LookupExpandableSection>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import LookupExpandableSection from './LookupExpandableSection.vue';
import type {
    DisplayTimetableData,
    DisplayTimetableStop,
    TimetableSourceKey,
    TimetableSourceOption
} from '~/types/lookupCurrentTimetable';

type TimetableColumnKey =
    | 'stationNo'
    | 'trainCode'
    | 'stationName'
    | 'arriveAt'
    | 'departAt'
    | 'wicket'
    | 'distance'
    | 'sectionSpeed';

type MeasurementParts = {
    value: string;
    unit: string;
};

type TimetableColumnConfig = {
    key: TimetableColumnKey;
    label: string;
    min: number;
    ideal: number;
    max: number;
};

type TimetableColumnLayout = TimetableColumnConfig & {
    width: string;
};

const props = defineProps<{
    modelValue: boolean;
    sectionId: string;
    summary: string;
    timetable: DisplayTimetableData;
    isCurrentView: boolean;
    notice: string;
    showHistorySelector: boolean;
    selectedSourceKey: TimetableSourceKey;
    historyOptions: TimetableSourceOption[];
    visibleColumns: string[];
    showDistanceColumns: boolean;
    resolveStopFocusTrainCodes: (stop: DisplayTimetableStop) => string[];
    formatStopTime: (value: number | null) => string;
    formatStopWicket: (stop: DisplayTimetableStop) => string;
    formatStopDistance: (stop: DisplayTimetableStop, index: number) => string;
    formatStopSectionSpeed: (
        stop: DisplayTimetableStop,
        index: number
    ) => string;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    'update:selectedSourceKey': [value: TimetableSourceKey];
}>();

const tableShell = ref<HTMLElement | null>(null);
const tableWidth = ref(0);
let tableResizeObserver: ResizeObserver | null = null;

const columnKeyByLabel: Record<string, TimetableColumnKey> = {
    站序: 'stationNo',
    车次: 'trainCode',
    站名: 'stationName',
    到点: 'arriveAt',
    开点: 'departAt',
    检票口: 'wicket',
    里程: 'distance',
    区间均速: 'sectionSpeed'
};

const coreColumnKeys = new Set<TimetableColumnKey>([
    'trainCode',
    'arriveAt',
    'departAt',
    'distance',
    'sectionSpeed'
]);

const showMeasurementUnits = computed(() => {
    if (!props.showDistanceColumns) {
        return false;
    }

    const width = tableWidth.value;
    if (width <= 0) {
        return true;
    }

    return width >= getComfortWidthForUnits(getColumnConfigs(true));
});

const shouldAllowCoreColumnWrap = computed(() => {
    const width = tableWidth.value;
    if (width <= 0) {
        return false;
    }

    const requiredWidth = getColumnConfigs(false).reduce(
        (total, column) => total + column.min,
        0
    );
    return width < requiredWidth;
});

const tableColumnLayouts = computed<TimetableColumnLayout[]>(() => {
    const columns = getColumnConfigs(showMeasurementUnits.value);
    return allocateColumnLayouts(columns, tableWidth.value);
});

function getColumnConfigs(
    shouldShowUnits: boolean
): TimetableColumnConfig[] {
    return props.visibleColumns
        .map((label) => {
            const key = columnKeyByLabel[label];
            return key
                ? buildColumnConfig(key, label, shouldShowUnits)
                : undefined;
        })
        .filter((column): column is TimetableColumnConfig => Boolean(column));
}

function buildColumnConfig(
    key: TimetableColumnKey,
    label: string,
    shouldShowUnits: boolean
): TimetableColumnConfig {
    const contentWidth = getMaxColumnContentWidth(key, shouldShowUnits);
    const labelWidth = estimateColumnTextWidth(label, false);
    const singleLineWidth = Math.ceil(
        Math.max(contentWidth, labelWidth) + getColumnHorizontalPadding()
    );

    if (coreColumnKeys.has(key) || key === 'stationNo') {
        return {
            key,
            label,
            min: singleLineWidth,
            ideal: singleLineWidth,
            max: singleLineWidth
        };
    }

    const minimumVisibleWidth = Math.ceil(
        Math.max(labelWidth + getColumnHorizontalPadding(), 48)
    );

    return {
        key,
        label,
        min: Math.min(singleLineWidth, minimumVisibleWidth),
        ideal: singleLineWidth,
        max: Number.POSITIVE_INFINITY
    };
}

function getMaxColumnContentWidth(
    key: TimetableColumnKey,
    shouldShowUnits: boolean
) {
    return props.timetable.stops.reduce((maxWidth, stop, stopIndex) => {
        const text = getColumnDisplayText(key, stop, stopIndex, shouldShowUnits);
        return Math.max(
            maxWidth,
            estimateColumnTextWidth(
                text,
                key !== 'wicket' && key !== 'stationName'
            )
        );
    }, 0);
}

function getColumnDisplayText(
    key: TimetableColumnKey,
    stop: DisplayTimetableStop,
    stopIndex: number,
    shouldShowUnits: boolean
) {
    switch (key) {
        case 'stationNo':
            return String(stop.stationNo);
        case 'trainCode':
            return stop.stationTrainCode || '--';
        case 'stationName':
            return stop.stationName || '--';
        case 'arriveAt':
            return props.formatStopTime(stop.arriveAt);
        case 'departAt':
            return props.formatStopTime(stop.departAt);
        case 'wicket':
            return props.formatStopWicket(stop);
        case 'distance':
            return getMeasurementDisplayText(
                props.formatStopDistance(stop, stopIndex),
                shouldShowUnits
            );
        case 'sectionSpeed':
            return getMeasurementDisplayText(
                props.formatStopSectionSpeed(stop, stopIndex),
                shouldShowUnits
            );
    }
}

function getMeasurementDisplayText(value: string, shouldShowUnits: boolean) {
    if (shouldShowUnits) {
        return value;
    }

    return splitMeasurementText(value).value;
}

function estimateColumnTextWidth(value: string, isMonospace: boolean) {
    return Array.from(value).reduce((width, character) => {
        if (/[\u3400-\u9fff]/u.test(character)) {
            return width + 14;
        }

        if (character === ' ') {
            return width + (isMonospace ? 7 : 4);
        }

        if (/[ilI.,:]/u.test(character)) {
            return width + (isMonospace ? 8 : 4);
        }

        if (/[mwMW]/u.test(character)) {
            return width + (isMonospace ? 8 : 11);
        }

        return width + (isMonospace ? 8 : 7);
    }, 0);
}

function getColumnHorizontalPadding() {
    return tableWidth.value >= 1024 ? 32 : 20;
}

function getComfortWidthForUnits(columns: TimetableColumnConfig[]) {
    return columns.reduce((total, column) => {
        if (coreColumnKeys.has(column.key) || column.key === 'stationNo') {
            return total + column.ideal;
        }

        if (column.key === 'stationName') {
            return total + Math.min(column.ideal, 180);
        }

        return total + column.min;
    }, 0);
}

function allocateColumnLayouts(
    columns: TimetableColumnConfig[],
    availableWidth: number
) {
    const fallbackWidth = columns.reduce(
        (total, column) => total + column.ideal,
        0
    );
    const targetWidth =
        availableWidth > 0 ? Math.max(availableWidth, 1) : fallbackWidth;
    const minWidth = columns.reduce((total, column) => total + column.min, 0);
    const widths = new Map<TimetableColumnKey, number>();

    if (targetWidth <= minWidth) {
        const scale = targetWidth / Math.max(minWidth, 1);
        for (const column of columns) {
            widths.set(column.key, column.min * scale);
        }

        return buildColumnLayouts(columns, widths, targetWidth);
    }

    for (const column of columns) {
        widths.set(column.key, column.min);
    }

    let remainingWidth = targetWidth - minWidth;
    remainingWidth = distributeColumnWidth(
        columns,
        widths,
        remainingWidth,
        [
            'stationNo',
            'trainCode',
            'arriveAt',
            'departAt',
            'distance',
            'sectionSpeed'
        ]
    );
    remainingWidth = distributeColumnWidth(columns, widths, remainingWidth, [
        'stationName'
    ]);
    remainingWidth = distributeColumnWidth(columns, widths, remainingWidth, [
        'wicket'
    ]);
    remainingWidth = distributeWeightedExtraWidth(
        columns,
        widths,
        remainingWidth
    );

    return buildColumnLayouts(columns, widths, targetWidth);
}

function distributeColumnWidth(
    columns: TimetableColumnConfig[],
    widths: Map<TimetableColumnKey, number>,
    remainingWidth: number,
    targetKeys: TimetableColumnKey[]
) {
    if (remainingWidth <= 0) {
        return 0;
    }

    const targetKeySet = new Set(targetKeys);
    const targets = columns.filter((column) => targetKeySet.has(column.key));
    if (targets.length === 0) {
        return remainingWidth;
    }

    let availableTargets = targets;
    let widthToDistribute = remainingWidth;

    while (widthToDistribute > 0.1 && availableTargets.length > 0) {
        const perColumnWidth = widthToDistribute / availableTargets.length;
        const nextTargets: TimetableColumnConfig[] = [];

        for (const column of availableTargets) {
            const currentWidth = widths.get(column.key) ?? column.min;
            const capacity = Math.max(column.ideal - currentWidth, 0);
            const assignedWidth = Math.min(perColumnWidth, capacity);
            widths.set(column.key, currentWidth + assignedWidth);
            widthToDistribute -= assignedWidth;

            if (capacity > assignedWidth + 0.1) {
                nextTargets.push(column);
            }
        }

        if (nextTargets.length === availableTargets.length) {
            break;
        }

        availableTargets = nextTargets;
    }

    return Math.max(widthToDistribute, 0);
}

function distributeWeightedExtraWidth(
    columns: TimetableColumnConfig[],
    widths: Map<TimetableColumnKey, number>,
    remainingWidth: number
) {
    if (remainingWidth <= 0) {
        return 0;
    }

    const weights: Partial<Record<TimetableColumnKey, number>> = {
        stationName: 3,
        wicket: 1,
        trainCode: 0.5
    };
    const targets = columns.filter((column) => weights[column.key]);
    if (targets.length === 0) {
        return remainingWidth;
    }

    let widthToDistribute = remainingWidth;
    let availableTargets = targets;

    while (widthToDistribute > 0.1 && availableTargets.length > 0) {
        const totalWeight = availableTargets.reduce(
            (total, column) => total + (weights[column.key] ?? 0),
            0
        );
        const nextTargets: TimetableColumnConfig[] = [];

        for (const column of availableTargets) {
            const currentWidth = widths.get(column.key) ?? column.min;
            const capacity = Math.max(column.max - currentWidth, 0);
            const weightedShare =
                (widthToDistribute * (weights[column.key] ?? 0)) /
                Math.max(totalWeight, 1);
            const assignedWidth = Math.min(weightedShare, capacity);
            widths.set(column.key, currentWidth + assignedWidth);
            widthToDistribute -= assignedWidth;

            if (capacity > assignedWidth + 0.1) {
                nextTargets.push(column);
            }
        }

        if (nextTargets.length === availableTargets.length) {
            break;
        }

        availableTargets = nextTargets;
    }

    return Math.max(widthToDistribute, 0);
}

function buildColumnLayouts(
    columns: TimetableColumnConfig[],
    widths: Map<TimetableColumnKey, number>,
    targetWidth: number
): TimetableColumnLayout[] {
    const totalWidth = Array.from(widths.values()).reduce(
        (total, width) => total + width,
        0
    );
    const widthBasis = totalWidth > 0 ? totalWidth : targetWidth;

    return columns.map((column) => {
        const width = widths.get(column.key) ?? column.ideal;
        return {
            ...column,
            width: `${(width / widthBasis) * 100}%`
        };
    });
}

function getTableHeaderCellClass(columnKey: TimetableColumnKey) {
    return [
        'lookup-timetable-cell border-b border-slate-200 px-2.5 py-3 text-xs font-medium uppercase tracking-[0.16em] text-slate-400 lg:px-4',
        getColumnWrapClass(columnKey)
    ];
}

function getTableBodyCellClass(columnKey: TimetableColumnKey) {
    return [
        'lookup-timetable-cell border-b border-slate-100 px-2.5 py-3 text-sm text-slate-500 last:border-b-0 lg:px-4',
        columnKey === 'stationName' ? 'font-medium text-crh-grey-dark' : '',
        columnKey === 'wicket' || columnKey === 'stationName'
            ? ''
            : 'font-mono',
        getColumnWrapClass(columnKey)
    ];
}

function getColumnWrapClass(columnKey: TimetableColumnKey) {
    if (coreColumnKeys.has(columnKey) && !shouldAllowCoreColumnWrap.value) {
        return 'lookup-timetable-cell--nowrap';
    }

    return 'lookup-timetable-cell--wrap';
}

function splitMeasurementText(value: string): MeasurementParts {
    const normalizedValue = value.trim();
    const match = /^(.+?)\s+(千米|km\/h)$/.exec(normalizedValue);
    if (!match) {
        return {
            value,
            unit: ''
        };
    }

    return {
        value: match[1] ?? value,
        unit: match[2] ?? ''
    };
}

function getStopDistanceParts(
    stop: DisplayTimetableStop,
    index: number
): MeasurementParts {
    return splitMeasurementText(props.formatStopDistance(stop, index));
}

function getStopSectionSpeedParts(
    stop: DisplayTimetableStop,
    index: number
): MeasurementParts {
    return splitMeasurementText(props.formatStopSectionSpeed(stop, index));
}

function updateTableWidth() {
    tableWidth.value = tableShell.value?.clientWidth ?? 0;
}

function bindTableResizeObserver() {
    if (!import.meta.client) {
        return;
    }

    tableResizeObserver?.disconnect();
    tableResizeObserver = null;

    const element = tableShell.value;
    if (!element) {
        tableWidth.value = 0;
        return;
    }

    updateTableWidth();
    tableResizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        tableWidth.value = Math.floor(
            entry?.contentRect.width ?? element.clientWidth
        );
    });
    tableResizeObserver.observe(element);
}

function isTimetableSourceKey(value: string): value is TimetableSourceKey {
    return value === 'current' || /^history:\d+$/.test(value);
}

function handleSourceKeyUpdate(value: string) {
    if (isTimetableSourceKey(value)) {
        emit('update:selectedSourceKey', value);
    }
}

onMounted(() => {
    void nextTick(bindTableResizeObserver);
});

watch(
    () => props.modelValue,
    () => {
        void nextTick(bindTableResizeObserver);
    }
);

watch(
    () => [props.isCurrentView, props.showDistanceColumns, props.visibleColumns],
    () => {
        void nextTick(updateTableWidth);
    }
);

onBeforeUnmount(() => {
    tableResizeObserver?.disconnect();
});
</script>

<style scoped>
.lookup-timetable-cell,
.lookup-timetable-text-wrap {
    min-width: 0;
    overflow-wrap: anywhere;
    word-break: normal;
}

.lookup-timetable-cell--wrap {
    white-space: normal;
}

.lookup-timetable-cell--nowrap {
    white-space: nowrap;
}

.lookup-timetable-measurement {
    display: inline;
}

.lookup-timetable-measurement-unit {
    margin-left: 0.25em;
}
</style>
