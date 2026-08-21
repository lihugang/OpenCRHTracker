import { ref } from 'vue';
import {
    fetchEmuHistoryPage,
    fetchStationTimetablePage,
    fetchTrainHistoryPage
} from '~/utils/api/v2/domain/lookup';
import type {
    LookupHistoryListItem,
    StationTimetableRecord
} from '~/types/lookup';
import { LOOKUP_PAGE_LIMIT } from '~/utils/lookup/pagination';
import getShanghaiDayStartUnixSeconds from '~/utils/time/getShanghaiDayStartUnixSeconds';
import formatShanghaiDateString from '~/utils/time/formatShanghaiDateString';
import { getEmuRouteFormationPosition } from '~/utils/emuRouteStatus';
import { exportBlobFile } from '~/utils/clientFileExport';

export type LookupDataExportType = 'train' | 'emu' | 'station';

export interface LookupDataExportProgress {
    percent: number;
    label: string;
    completed: number;
    total: number;
}

const DAY_SECONDS = 24 * 60 * 60;
const UTF8_BOM = '\uFEFF';

function csvCell(value: unknown) {
    const text = value === null || value === undefined ? '' : String(value);
    return /[,"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function formatTime(timestamp: number | null, serviceDate: string) {
    if (timestamp === null || !Number.isFinite(timestamp)) {
        return '';
    }
    const dayStart = getShanghaiDayStartUnixSeconds(serviceDate);
    if (dayStart === null) {
        return '';
    }
    const offset = Math.floor((timestamp - dayStart) / DAY_SECONDS);
    const date = new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(new Date(timestamp * 1000));
    return offset > 0 ? `${date}+${offset}` : date;
}

function nextDay(value: string) {
    const start = getShanghaiDayStartUnixSeconds(value);
    return start === null
        ? value
        : formatShanghaiDateString(start + DAY_SECONDS);
}

function dateList(start: string, end: string) {
    const values: string[] = [];
    let current = start;
    while (current <= end && values.length <= 300) {
        values.push(current);
        const next = nextDay(current);
        if (next === current) break;
        current = next;
    }
    if (current <= end || values.length > 300) {
        throw new Error('一次最多导出 300 天数据');
    }
    return values;
}

function dedupeHistory(items: LookupHistoryListItem[]) {
    const seen = new Set<string>();
    return items.filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
    });
}

function sortCodes(codes: Array<{ code: string; status: number }>) {
    return codes
        .filter((item) => item.code.trim().length > 0)
        .sort((left, right) => {
            const leftPosition = getEmuRouteFormationPosition(left.status);
            const rightPosition = getEmuRouteFormationPosition(right.status);
            if (leftPosition !== rightPosition) {
                if (leftPosition === 'I') return -1;
                if (rightPosition === 'I') return 1;
            }
            return left.code.localeCompare(right.code);
        });
}

function serializeHistory(
    type: 'train' | 'emu',
    items: LookupHistoryListItem[]
) {
    const groups = new Map<
        string,
        {
            serviceDate: string;
            startAt: number | null;
            endAt: number | null;
            startStation: string;
            endStation: string;
            codes: Array<{ code: string; status: number }>;
        }
    >();

    for (const item of dedupeHistory(items)) {
        const key = [
            item.serviceDate,
            item.timetableId ?? 'null',
            item.startAt ?? 'null',
            item.endAt ?? 'null'
        ].join(':');
        const existing = groups.get(key);
        if (existing) {
            if (
                item.code.trim() &&
                !existing.codes.some((code) => code.code === item.code)
            ) {
                existing.codes.push({ code: item.code, status: item.status });
            }
            if (!existing.startStation && item.startStation)
                existing.startStation = item.startStation;
            if (!existing.endStation && item.endStation)
                existing.endStation = item.endStation;
        } else {
            groups.set(key, {
                serviceDate: item.serviceDate,
                startAt: item.startAt,
                endAt: item.endAt,
                startStation: item.startStation ?? '',
                endStation: item.endStation ?? '',
                codes: item.code.trim()
                    ? [{ code: item.code, status: item.status }]
                    : []
            });
        }
    }

    const rows = Array.from(groups.values()).sort(
        (a, b) =>
            (a.startAt ?? Number.MAX_SAFE_INTEGER) -
            (b.startAt ?? Number.MAX_SAFE_INTEGER)
    );
    const header =
        type === 'train'
            ? 'serviceDate,emuCode1,emuCode2,startStation,startTime,endStation,endTime'
            : 'serviceDate,trainCode1,trainCode2,startStation,startTime,endStation,endTime';
    const lines = rows.map((row) => {
        const codes = sortCodes(row.codes).map((entry) =>
            entry.code.trim().toUpperCase()
        );
        return [
            row.serviceDate,
            codes[0] ?? '',
            codes[1] ?? '',
            row.startStation,
            formatTime(row.startAt, row.serviceDate),
            row.endStation,
            formatTime(row.endAt, row.serviceDate)
        ]
            .map(csvCell)
            .join(',');
    });
    return UTF8_BOM + [header, ...lines].join('\n');
}

function serializeStation(items: StationTimetableRecord[]) {
    const seen = new Set<string>();
    const rows = items
        .filter((item) => {
            const key = `${item.trainCode}:${item.arriveAt ?? ''}:${item.departAt ?? ''}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort(
            (a, b) =>
                (a.arriveAt ?? a.departAt ?? Number.MAX_SAFE_INTEGER) -
                (b.arriveAt ?? b.departAt ?? Number.MAX_SAFE_INTEGER)
        );
    const today = formatShanghaiDateString(Math.floor(Date.now() / 1000));
    const lines = rows.map((item) => {
        const styles = Array.from(
            new Set(
                item.referenceModels
                    .map((model) => model.model.trim())
                    .filter(Boolean)
            )
        ).join(', ');
        return [
            item.trainCode,
            formatTime(item.arriveAt, today),
            formatTime(item.departAt, today),
            item.startStation,
            item.endStation,
            item.platformNo ?? '',
            styles
        ]
            .map(csvCell)
            .join(',');
    });
    return (
        UTF8_BOM +
        [
            'trainCode,arriveTime,departureTime,startStation,endStation,platform,trainStyle',
            ...lines
        ].join('\n')
    );
}

export function useLookupDataExport() {
    const isExporting = ref(false);
    const errorMessage = ref('');
    const progress = ref<LookupDataExportProgress>({
        percent: 0,
        label: '',
        completed: 0,
        total: 0
    });
    let controller: AbortController | null = null;

    async function run(
        type: LookupDataExportType,
        code: string,
        startDate?: string,
        endDate?: string
    ) {
        if (isExporting.value) return false;
        isExporting.value = true;
        errorMessage.value = '';
        controller = new AbortController();
        try {
            if (type === 'station') {
                const items: StationTimetableRecord[] = [];
                let cursor: string | undefined;
                let latest = 0;
                for (;;) {
                    const page = await fetchStationTimetablePage(code, {
                        cursor,
                        limit: LOOKUP_PAGE_LIMIT,
                        signal: controller.signal
                    });
                    items.push(...page.items);
                    latest = Math.max(
                        latest,
                        ...page.items.flatMap((item) => [
                            item.arriveAt ?? 0,
                            item.departAt ?? 0
                        ])
                    );
                    const dayStart =
                        getShanghaiDayStartUnixSeconds(
                            formatShanghaiDateString(
                                Math.floor(Date.now() / 1000)
                            )
                        ) ?? 0;
                    progress.value = {
                        percent: Math.min(
                            99,
                            Math.max(
                                0,
                                ((latest - dayStart) / DAY_SECONDS) * 100
                            )
                        ),
                        label: `已读取 ${items.length} 条记录`,
                        completed: items.length,
                        total: 0
                    };
                    if (!page.nextCursor) break;
                    cursor = page.nextCursor;
                }
                progress.value = {
                    percent: 100,
                    label: `已读取 ${items.length} 条记录`,
                    completed: items.length,
                    total: items.length
                };
                await exportBlobFile({
                    blob: new Blob([serializeStation(items)], {
                        type: 'text/csv;charset=utf-8'
                    }),
                    fileName: `station-${code}-${formatShanghaiDateString(Math.floor(Date.now() / 1000))}.csv`,
                    mimeType: 'text/csv'
                });
                return true;
            }

            if (!startDate || !endDate) throw new Error('请选择导出日期范围');
            const dates = dateList(startDate, endDate);
            const items: LookupHistoryListItem[] = [];
            progress.value = {
                percent: 0,
                label: '',
                completed: 0,
                total: dates.length
            };
            for (let index = 0; index < dates.length; index += 1) {
                const serviceDate = dates[index]!;
                const dayStart = getShanghaiDayStartUnixSeconds(serviceDate);
                if (dayStart === null) continue;
                let cursor: string | undefined;
                for (;;) {
                    const page =
                        type === 'train'
                            ? await fetchTrainHistoryPage(code, {
                                  cursor,
                                  limit: LOOKUP_PAGE_LIMIT,
                                  start: dayStart,
                                  end: dayStart + DAY_SECONDS - 1,
                                  signal: controller.signal
                              })
                            : await fetchEmuHistoryPage(code, {
                                  cursor,
                                  limit: LOOKUP_PAGE_LIMIT,
                                  start: dayStart,
                                  end: dayStart + DAY_SECONDS - 1,
                                  signal: controller.signal
                              });
                    items.push(...page.items);
                    if (!page.nextCursor) break;
                    cursor = page.nextCursor;
                }
                progress.value = {
                    percent: ((index + 1) / dates.length) * 100,
                    label: `已完成 ${index + 1}/${dates.length} 天`,
                    completed: index + 1,
                    total: dates.length
                };
            }
            await exportBlobFile({
                blob: new Blob([serializeHistory(type, items)], {
                    type: 'text/csv;charset=utf-8'
                }),
                fileName: `${type}-${code}-${startDate}-${endDate}.csv`,
                mimeType: 'text/csv'
            });
            return true;
        } catch (error) {
            if ((error as DOMException)?.name !== 'AbortError')
                errorMessage.value =
                    error instanceof Error
                        ? error.message
                        : '导出失败，请稍后重试。';
            return false;
        } finally {
            isExporting.value = false;
            controller = null;
        }
    }

    function cancel() {
        controller?.abort();
    }
    function reset() {
        errorMessage.value = '';
        progress.value = { percent: 0, label: '', completed: 0, total: 0 };
    }
    return { isExporting, errorMessage, progress, run, cancel, reset };
}
