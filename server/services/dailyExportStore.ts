import fs from 'fs';
import path from 'path';
import type { DailyEmuRouteRow } from '~/server/services/emuRoutesStore';
import { writeTextFileAtomically } from '~/server/utils/dataAssets/store';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';

export const DAILY_EXPORT_FORMATS = ['csv', 'jsonl'] as const;
const UTF8_BOM = '\uFEFF';

export type DailyExportFormat = (typeof DAILY_EXPORT_FORMATS)[number];

export interface DailyExportRecord {
    trainCode: string;
    emuCode: string;
    startStation: string;
    endStation: string;
    startAt: number;
    endAt: number;
}

export interface DailyExportFiles {
    csvFilePath: string;
    jsonlFilePath: string;
    total: number;
}

export interface DailyExportIndexItem {
    date: string;
    formats: DailyExportFormat[];
}

export interface DailyExportIndex {
    selectedYear: number;
    selectedMonth: number;
    availableYears: number[];
    availableMonths: number[];
    items: DailyExportIndexItem[];
}

function toDailyExportRecord(row: DailyEmuRouteRow): DailyExportRecord {
    return {
        trainCode: row.train_code,
        emuCode: row.emu_code,
        startStation: row.start_station_name,
        endStation: row.end_station_name,
        startAt: row.start_at,
        endAt: row.end_at
    };
}

function toCsvCell(value: string | number): string {
    const text = String(value);
    if (!text.includes(',') && !text.includes('"') && !text.includes('\n')) {
        return text;
    }

    return `"${text.replace(/"/g, '""')}"`;
}

function serializeCsv(records: readonly DailyExportRecord[]): string {
    return (
        UTF8_BOM +
        [
            'trainCode,emuCode,startStation,endStation,startAt,endAt',
            ...records.map((row) =>
                [
                    toCsvCell(row.trainCode),
                    toCsvCell(row.emuCode),
                    toCsvCell(row.startStation),
                    toCsvCell(row.endStation),
                    toCsvCell(row.startAt),
                    toCsvCell(row.endAt)
                ].join(',')
            )
        ].join('\n')
    );
}

function serializeJsonl(records: readonly DailyExportRecord[]): string {
    return records.map((row) => JSON.stringify(row)).join('\n');
}

export function getDailyExportFilePath(
    date: string,
    format: DailyExportFormat
): string {
    return path.resolve('data/exports', `${date}.${format}`);
}

export function getDailyExportFileName(
    date: string,
    format: DailyExportFormat
): string {
    return `${date}.${format}`;
}

export function getDailyExportContentType(format: DailyExportFormat): string {
    return format === 'csv'
        ? 'text/csv; charset=utf-8'
        : 'application/x-ndjson; charset=utf-8';
}

export function writeDailyExportFiles(
    date: string,
    rows: readonly DailyEmuRouteRow[]
): DailyExportFiles {
    const records = rows.map(toDailyExportRecord);
    const csvFilePath = getDailyExportFilePath(date, 'csv');
    const jsonlFilePath = getDailyExportFilePath(date, 'jsonl');

    writeTextFileAtomically(csvFilePath, serializeCsv(records));
    writeTextFileAtomically(jsonlFilePath, serializeJsonl(records));

    return {
        csvFilePath,
        jsonlFilePath,
        total: records.length
    };
}

export function readDailyExportText(
    date: string,
    format: DailyExportFormat
): string | null {
    const filePath = getDailyExportFilePath(date, format);
    if (!fs.existsSync(filePath)) {
        return null;
    }

    return fs.readFileSync(filePath, 'utf8');
}

export function countDailyExportItems(
    format: DailyExportFormat,
    content: string
): number {
    if (format === 'jsonl') {
        return content
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0).length;
    }

    const lines = content
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0);

    if (lines.length === 0) {
        return 0;
    }

    return Math.max(0, lines.length - 1);
}

function parseDailyExportFileName(fileName: string): {
    date: string;
    format: DailyExportFormat;
} | null {
    const match = /^(\d{8})\.(csv|jsonl)$/.exec(fileName);
    if (!match) {
        return null;
    }

    return {
        date: match[1]!,
        format: match[2]! as DailyExportFormat
    };
}

function getCurrentShanghaiYearMonth() {
    const currentDate = getCurrentDateString();

    return {
        year: Number.parseInt(currentDate.slice(0, 4), 10),
        month: Number.parseInt(currentDate.slice(4, 6), 10)
    };
}

function pickNearestValue(
    target: number | undefined,
    candidates: readonly number[]
): number {
    if (candidates.length === 0) {
        throw new Error('pickNearestValue requires at least one candidate');
    }

    if (target === undefined) {
        return candidates[0]!;
    }

    return candidates.reduce((best, candidate) => {
        const bestDistance = Math.abs(best - target);
        const candidateDistance = Math.abs(candidate - target);

        if (candidateDistance < bestDistance) {
            return candidate;
        }

        if (candidateDistance === bestDistance && candidate > best) {
            return candidate;
        }

        return best;
    });
}

export function listDailyExportIndex(
    requestedYear?: number,
    requestedMonth?: number
): DailyExportIndex {
    const exportsDirectory = path.resolve('data/exports');

    if (!fs.existsSync(exportsDirectory)) {
        const current = getCurrentShanghaiYearMonth();

        return {
            selectedYear: current.year,
            selectedMonth: current.month,
            availableYears: [],
            availableMonths: [],
            items: []
        };
    }

    const formatsByDate = new Map<string, Set<DailyExportFormat>>();
    const monthsByYear = new Map<number, Set<number>>();

    for (const entry of fs.readdirSync(exportsDirectory, {
        withFileTypes: true
    })) {
        if (!entry.isFile()) {
            continue;
        }

        const parsed = parseDailyExportFileName(entry.name);
        if (!parsed) {
            continue;
        }

        const year = Number.parseInt(parsed.date.slice(0, 4), 10);
        const month = Number.parseInt(parsed.date.slice(4, 6), 10);
        const formats = formatsByDate.get(parsed.date) ?? new Set();

        formats.add(parsed.format);
        formatsByDate.set(parsed.date, formats);

        const months = monthsByYear.get(year) ?? new Set<number>();
        months.add(month);
        monthsByYear.set(year, months);
    }

    const availableYears = [...monthsByYear.keys()].sort((left, right) => {
        return right - left;
    });

    if (availableYears.length === 0) {
        const current = getCurrentShanghaiYearMonth();

        return {
            selectedYear: current.year,
            selectedMonth: current.month,
            availableYears: [],
            availableMonths: [],
            items: []
        };
    }

    const selectedYear = pickNearestValue(requestedYear, availableYears);
    const monthsForYear = [...(monthsByYear.get(selectedYear) ?? [])].sort(
        (left, right) => right - left
    );
    const selectedMonth = pickNearestValue(requestedMonth, monthsForYear);

    const items = [...formatsByDate.entries()]
        .filter(([date]) => {
            return (
                Number.parseInt(date.slice(0, 4), 10) === selectedYear &&
                Number.parseInt(date.slice(4, 6), 10) === selectedMonth
            );
        })
        .sort(([leftDate], [rightDate]) => rightDate.localeCompare(leftDate))
        .map(([date, formats]) => ({
            date,
            formats: DAILY_EXPORT_FORMATS.filter((format) =>
                formats.has(format)
            )
        }));

    return {
        selectedYear,
        selectedMonth,
        availableYears,
        availableMonths: monthsForYear,
        items
    };
}
