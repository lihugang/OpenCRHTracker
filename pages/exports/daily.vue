<template>
    <main class="flex min-h-screen flex-col bg-crh-slate text-crh-grey-dark">
        <div
            class="pointer-events-none absolute inset-x-0 top-0 h-[26rem] bg-[radial-gradient(circle_at_top,_rgba(0,82,155,0.14),_transparent_58%)]" />
        <div
            class="pointer-events-none absolute inset-x-0 top-20 h-40 bg-[linear-gradient(90deg,_rgba(90,132,162,0.12),_rgba(90,132,162,0))] blur-3xl" />

        <div
            class="relative mx-auto flex w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
            <section class="mx-auto flex w-full max-w-5xl flex-col gap-6">
                <UiCard
                    variant="accent"
                    allow-overflow
                    class="export-hero-card">
                    <div class="space-y-6">
                        <div
                            class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div class="space-y-3">
                                <p
                                    class="text-xs font-medium uppercase tracking-[0.26em] text-crh-blue/80">
                                    EXPORTS
                                </p>
                                <div class="space-y-2">
                                    <h1
                                        class="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                                        导出每日数据
                                    </h1>
                                </div>
                            </div>

                            <NuxtLink
                                to="/"
                                class="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 text-sm font-semibold text-crh-blue transition hover:border-crh-blue/20 hover:bg-blue-50">
                                返回主页
                            </NuxtLink>
                        </div>

                        <div class="motion-divider" />

                        <div class="grid gap-4 md:grid-cols-2">
                            <UiField label="年份">
                                <UiSelect
                                    v-model="selectedYearValue"
                                    :disabled="yearOptions.length === 0"
                                    mobile-sheet-eyebrow="SWITCH"
                                    mobile-sheet-title="选择年份"
                                    :options="yearOptions" />
                            </UiField>

                            <UiField label="月份">
                                <UiSelect
                                    v-model="selectedMonthValue"
                                    :disabled="monthOptions.length === 0"
                                    mobile-sheet-eyebrow="SWITCH"
                                    mobile-sheet-title="选择月份"
                                    :options="monthOptions" />
                            </UiField>
                        </div>
                    </div>
                </UiCard>

                <UiCard class="overflow-hidden">
                    <div class="space-y-5">
                        <div
                            class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div class="space-y-1">
                                <p
                                    class="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                                    Daily Files
                                </p>
                                <h2
                                    class="text-2xl font-semibold tracking-tight text-slate-900">
                                    {{ selectedMonthHeading }}
                                </h2>
                            </div>
                            <p class="text-sm text-slate-500">
                                共 {{ items.length }} 个可下载日期
                            </p>
                        </div>

                        <div class="motion-divider" />

                        <div
                            v-if="isPending"
                            class="space-y-3">
                            <div
                                v-for="placeholder in 5"
                                :key="placeholder"
                                class="animate-pulse rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                                <div
                                    class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div
                                        class="h-5 w-32 rounded bg-slate-200/80" />
                                    <div class="flex gap-2">
                                        <div
                                            class="h-9 w-20 rounded-2xl bg-slate-200/80" />
                                        <div
                                            class="h-9 w-24 rounded-2xl bg-slate-200/80" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <UiEmptyState
                            v-else-if="errorMessage"
                            eyebrow="REQUEST FAILED"
                            title="导出目录加载失败"
                            :description="errorMessage"
                            tone="danger">
                            <UiButton
                                type="button"
                                variant="secondary"
                                @click="refresh()">
                                重试
                            </UiButton>
                        </UiEmptyState>

                        <UiEmptyState
                            v-else-if="items.length === 0"
                            eyebrow="NO EXPORTS"
                            title="这个月暂无已生成导出"
                            description="请切换年份或月份，查看其他时间范围内已生成的文件。" />

                        <div
                            v-else
                            ref="exportListRef"
                            class="space-y-3">
                            <div
                                v-for="item in items"
                                :key="item.date"
                                :data-export-date="item.date"
                                :class="[
                                    'rounded-[1rem] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-4 py-4 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.3)]',
                                    isTargetDate(item.date)
                                        ? 'export-item--target'
                                        : ''
                                ]">
                                <div
                                    class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                    <div class="min-w-0 space-y-2">
                                        <p
                                            class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                                            Export Date
                                        </p>
                                        <p
                                            class="font-mono text-base font-semibold text-slate-900 sm:text-lg">
                                            {{ formatDateLabel(item.date) }}
                                        </p>
                                    </div>

                                    <div
                                        class="flex flex-wrap items-center gap-2">
                                        <a
                                            v-if="item.formats.includes('csv')"
                                            :href="
                                                getDownloadHref(
                                                    item.date,
                                                    'csv'
                                                )
                                            "
                                            class="inline-flex items-center justify-center rounded-2xl bg-[linear-gradient(180deg,#00529b_0%,#004c92_100%)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_-12px_rgba(0,82,155,0.7)] transition hover:brightness-105">
                                            下载 CSV
                                        </a>
                                        <a
                                            v-if="
                                                item.formats.includes('jsonl')
                                            "
                                            :href="
                                                getDownloadHref(
                                                    item.date,
                                                    'jsonl'
                                                )
                                            "
                                            class="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-crh-blue transition hover:border-crh-blue/20 hover:bg-blue-50">
                                            下载 JSONL
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </UiCard>
            </section>
        </div>

        <AppFooter />
    </main>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type {
    DailyExportFormat,
    DailyExportIndexResponse
} from '~/types/exports';
import type { TrackerApiResponse } from '~/types/homepage';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';

definePageMeta({
    middleware: 'auth-required'
});

const route = useRoute();
const router = useRouter();
const requestFetch = import.meta.server ? useRequestFetch() : $fetch;
const exportListRef = ref<HTMLElement | null>(null);
const lastScrolledTargetDate = ref('');

function readSingleQueryValue(value: unknown): string {
    if (Array.isArray(value)) {
        return typeof value[0] === 'string' ? value[0] : '';
    }

    return typeof value === 'string' ? value : '';
}

function parsePositiveInteger(value: unknown): number | null {
    const rawValue = readSingleQueryValue(value);
    if (!/^\d+$/.test(rawValue)) {
        return null;
    }

    const parsed = Number.parseInt(rawValue, 10);
    return parsed > 0 ? parsed : null;
}

function parseDateQuery(value: unknown): string {
    const rawValue = readSingleQueryValue(value);
    return /^\d{8}$/.test(rawValue) ? rawValue : '';
}

const queryYear = computed(() => parsePositiveInteger(route.query.year));
const queryMonth = computed(() => parsePositiveInteger(route.query.month));
const targetDateQuery = computed(() => parseDateQuery(route.query.date));

const {
    data: exportIndexResponse,
    status,
    error,
    refresh
} = await useAsyncData(
    'daily-export-index',
    () =>
        requestFetch<TrackerApiResponse<DailyExportIndexResponse>>(
            '/api/v1/exports/daily',
            {
                query: {
                    year: queryYear.value ?? undefined,
                    month: queryMonth.value ?? undefined
                },
                retry: 0
            }
        ),
    {
        default: () => null,
        watch: [queryYear, queryMonth]
    }
);

const exportIndexData = computed(() => {
    const response = exportIndexResponse.value;
    if (!response || !response.ok) {
        return null;
    }

    return response.data;
});

const isPending = computed(() => status.value === 'pending');
const availableYears = computed(
    () => exportIndexData.value?.availableYears ?? []
);
const availableMonths = computed(
    () => exportIndexData.value?.availableMonths ?? []
);
const items = computed(() => exportIndexData.value?.items ?? []);
const scrollTargetDate = computed(() => {
    const targetDate = targetDateQuery.value;
    if (!targetDate) {
        return '';
    }

    return items.value.some((item) => item.date === targetDate)
        ? targetDate
        : '';
});
const yearOptions = computed(() =>
    availableYears.value.map((year) => ({
        value: String(year),
        label: `${year} 年`
    }))
);
const monthOptions = computed(() =>
    availableMonths.value.map((month) => ({
        value: String(month),
        label: formatMonthLabel(month)
    }))
);

const errorMessage = computed(() => {
    const response = exportIndexResponse.value;

    if (response && !response.ok) {
        return response.data;
    }

    if (error.value) {
        return getApiErrorMessage(
            error.value,
            '导出目录加载失败，请稍后重试。'
        );
    }

    return '';
});

const selectedMonthHeading = computed(() => {
    const data = exportIndexData.value;
    if (!data) {
        return '导出列表';
    }

    return `${data.selectedYear} 年 ${String(data.selectedMonth).padStart(2, '0')} 月`;
});

const selectedYearValue = computed({
    get() {
        const data = exportIndexData.value;
        if (data) {
            return String(data.selectedYear);
        }

        return queryYear.value === null ? '' : String(queryYear.value);
    },
    set(value: string) {
        void syncQuery(value, readSingleQueryValue(route.query.month));
    }
});

const selectedMonthValue = computed({
    get() {
        const data = exportIndexData.value;
        if (data) {
            return String(data.selectedMonth);
        }

        return queryMonth.value === null ? '' : String(queryMonth.value);
    },
    set(value: string) {
        void syncQuery(readSingleQueryValue(route.query.year), value);
    }
});

if (import.meta.client) {
    watch(
        exportIndexData,
        async (data) => {
            if (!data) {
                return;
            }

            const nextYear = String(data.selectedYear);
            const nextMonth = String(data.selectedMonth);

            if (
                readSingleQueryValue(route.query.year) === nextYear &&
                readSingleQueryValue(route.query.month) === nextMonth
            ) {
                return;
            }

            await syncQuery(nextYear, nextMonth);
        },
        {
            immediate: true
        }
    );

    watch(targetDateQuery, (nextValue, previousValue) => {
        if (nextValue !== previousValue) {
            lastScrolledTargetDate.value = '';
        }
    });

    watch(
        scrollTargetDate,
        async (targetDate) => {
            if (!targetDate || targetDate === lastScrolledTargetDate.value) {
                return;
            }

            await nextTick();

            const targetElement =
                exportListRef.value?.querySelector<HTMLElement>(
                    `[data-export-date="${targetDate}"]`
                );

            if (!targetElement) {
                return;
            }

            const prefersReducedMotion = window.matchMedia(
                '(prefers-reduced-motion: reduce)'
            ).matches;

            targetElement.scrollIntoView({
                block: 'center',
                behavior: prefersReducedMotion ? 'auto' : 'smooth'
            });
            lastScrolledTargetDate.value = targetDate;
        },
        {
            flush: 'post',
            immediate: true
        }
    );
}

useSiteSeo({
    title: '每日数据导出 | Open CRH Tracker',
    description: '按年和月筛选 Open CRH Tracker 已生成的每日全量记录导出文件。',
    path: '/exports/daily'
});

async function syncQuery(year: string, month: string) {
    const nextQuery = {
        ...route.query,
        year,
        month
    };

    if (
        readSingleQueryValue(route.query.year) === year &&
        readSingleQueryValue(route.query.month) === month
    ) {
        return;
    }

    await router.replace({
        query: nextQuery
    });
}

function formatMonthLabel(month: number) {
    return `${String(month).padStart(2, '0')} 月`;
}

function formatDateLabel(date: string) {
    return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}

function isTargetDate(date: string) {
    return targetDateQuery.value === date;
}

function getDownloadHref(date: string, format: DailyExportFormat) {
    return `/api/v1/exports/daily/${date}?format=${format}&binary=1`;
}
</script>

<style scoped>
.export-hero-card.export-hero-card {
    border-color: rgba(191, 204, 216, 0.82);
    box-shadow:
        0 18px 40px -30px rgba(15, 23, 42, 0.28),
        0 8px 20px rgba(148, 163, 184, 0.14);
}

.export-item--target {
    border-color: rgba(0, 82, 155, 0.28);
    background:
        linear-gradient(135deg, rgba(0, 82, 155, 0.12), transparent 46%),
        linear-gradient(180deg, #f8fbff 0%, #edf6ff 100%);
    box-shadow:
        0 0 0 1px rgba(0, 82, 155, 0.12),
        0 18px 40px -28px rgba(0, 82, 155, 0.34);
}

@media (prefers-reduced-motion: no-preference) {
    .export-item--target {
        animation: export-item-target-pulse 1.4s ease-out 1;
    }
}

@keyframes export-item-target-pulse {
    0% {
        box-shadow:
            0 0 0 0 rgba(0, 82, 155, 0.24),
            0 18px 40px -28px rgba(0, 82, 155, 0.34);
    }

    100% {
        box-shadow:
            0 0 0 1px rgba(0, 82, 155, 0.12),
            0 18px 40px -28px rgba(0, 82, 155, 0.34);
    }
}
</style>
