import fs from 'fs';
import path from 'path';
import type { DailyEmuRouteRow } from '~/server/services/emuRoutesStore';
import { writeTextFileAtomically } from '~/server/utils/dataAssets/store';

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
