import fs from 'fs';
import path from 'path';
import useConfig from '~/server/config';
import type { DailyEmuRouteRow } from '~/server/services/emuRoutesStore';
import {
    assertDailyExportZstdRoundTrip,
    compressDailyExportCsv,
    decompressDailyExportCsv,
    writeDailyExportZstdAtomically
} from '~/server/utils/compression/dailyExportZstd.js';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import {
    formatExternalEmuCode,
    formatExternalTrainCode
} from '~/server/utils/internal/boundaries';
import {
    getShanghaiDayBucket,
    getShanghaiDayOffsetSeconds
} from '~/server/utils/date/shanghaiDateTime';
import {
    dayToServiceDate,
    serviceDateToDay,
    type ServiceDay
} from '~/server/utils/date/serviceDay';

const UTF8_BOM = '\uFEFF';

interface DailyExportFileSignature {
    ino: number;
    size: number;
    mtimeMs: number;
}

interface DailyExportCacheEntry {
    signature: DailyExportFileSignature;
    result: DailyExportReadResult;
}

const dailyExportMemoryCache = new Map<string, DailyExportCacheEntry>();

export interface DailyExportRecord {
    id: number;
    trainCode: string;
    emuCode: string;
    startStation: string;
    endStation: string;
    startAt: number;
    endAt: number;
}

export interface DailyExportFileResult {
    filePath: string;
    total: number;
}

export interface DailyExportReadResult {
    content: string;
    total: number;
}

export interface DailyExportIndexItem {
    serviceDay: ServiceDay;
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
        id: row.id,
        trainCode: formatExternalTrainCode(row.train_code),
        emuCode: formatExternalEmuCode(row.emu_id),
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

function toHhMm(offsetSeconds: number): string {
    const totalMinutes = Math.floor(offsetSeconds / 60);
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function isPositiveInteger(value: number) {
    return Number.isInteger(value) && value > 0;
}

function warnInvalidEndAt(row: DailyExportRecord) {
    console.warn(
        `v2 export invalid endAt recordId=${row.id} trainCode=${row.trainCode} emuCode=${row.emuCode} recordStartAt=${row.startAt} recordEndAt=${row.endAt}`
    );
}

function formatExportTime(
    timestampSeconds: number,
    departureDayBucket: number
) {
    const dayBucket = getShanghaiDayBucket(timestampSeconds);
    const dayOffset = dayBucket - departureDayBucket;
    const timeText = toHhMm(getShanghaiDayOffsetSeconds(timestampSeconds));
    return dayOffset === 0 ? timeText : `${timeText}+${dayOffset}`;
}

function serializeCsv(records: readonly DailyExportRecord[]): string {
    const sorted = [...records].sort(compareExportRecords);
    const rows = sorted.map((row) => {
        const departureDayBucket = isPositiveInteger(row.startAt)
            ? getShanghaiDayBucket(row.startAt)
            : null;
        const startTime =
            departureDayBucket === null
                ? ''
                : formatExportTime(row.startAt, departureDayBucket);
        let endTime = '';
        if (
            departureDayBucket !== null &&
            isPositiveInteger(row.endAt) &&
            row.endAt >= row.startAt
        ) {
            endTime = formatExportTime(row.endAt, departureDayBucket);
        } else if (departureDayBucket !== null) {
            warnInvalidEndAt(row);
        }

        return [
            toCsvCell(row.trainCode),
            toCsvCell(row.emuCode),
            toCsvCell(row.startStation),
            toCsvCell(row.endStation),
            toCsvCell(startTime),
            toCsvCell(endTime)
        ].join(',');
    });

    return (
        UTF8_BOM +
        [
            'trainCode,emuCode,startStation,endStation,startTime,endTime',
            ...rows
        ].join('\n')
    );
}

function compareExportRecords(
    left: DailyExportRecord,
    right: DailyExportRecord
) {
    const leftStartAt =
        left.startAt > 0 ? left.startAt : Number.MAX_SAFE_INTEGER;
    const rightStartAt =
        right.startAt > 0 ? right.startAt : Number.MAX_SAFE_INTEGER;

    if (leftStartAt !== rightStartAt) {
        return leftStartAt - rightStartAt;
    }

    const trainCodeCompare = left.trainCode.localeCompare(right.trainCode);
    if (trainCodeCompare !== 0) {
        return trainCodeCompare;
    }

    const emuCodeCompare = left.emuCode.localeCompare(right.emuCode);
    if (emuCodeCompare !== 0) {
        return emuCodeCompare;
    }

    return left.id - right.id;
}

export function getDailyExportFilePath(date: string): string {
    return path.resolve('data/exports', getDailyExportCompressedFileName(date));
}

export function getDailyExportFileName(date: string): string {
    return `${date}.csv`;
}

export function getDailyExportCompressedFileName(date: string): string {
    return `${getDailyExportFileName(date)}.zst`;
}

function getLegacyDailyExportFilePath(date: string): string {
    return path.resolve('data/exports', getDailyExportFileName(date));
}

export function writeDailyExportFile(
    date: string,
    rows: readonly DailyEmuRouteRow[]
): DailyExportFileResult {
    const records = rows.map(toDailyExportRecord);
    const filePath = getDailyExportFilePath(date);
    const source = Buffer.from(serializeCsv(records), 'utf8');
    const compressed = compressDailyExportCsv(source);

    assertDailyExportZstdRoundTrip(source, compressed);
    writeDailyExportZstdAtomically(filePath, compressed);

    const legacyFilePath = getLegacyDailyExportFilePath(date);
    if (fs.existsSync(legacyFilePath)) {
        fs.unlinkSync(legacyFilePath);
    }
    dailyExportMemoryCache.delete(date);

    return {
        filePath,
        total: records.length
    };
}

function getDailyExportFileSignature(
    filePath: string
): DailyExportFileSignature | null {
    try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) {
            return null;
        }

        return {
            ino: stat.ino,
            size: stat.size,
            mtimeMs: stat.mtimeMs
        };
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}

function signaturesMatch(
    left: DailyExportFileSignature,
    right: DailyExportFileSignature
) {
    return (
        left.ino === right.ino &&
        left.size === right.size &&
        left.mtimeMs === right.mtimeMs
    );
}

function isMemoryCacheEligible(date: string, cacheDays: number): boolean {
    if (cacheDays === 0) {
        return false;
    }

    const currentDay = Number(serviceDateToDay(getCurrentDateString()));
    const requestedDay = Number(serviceDateToDay(date));
    return requestedDay >= currentDay - cacheDays && requestedDay < currentDay;
}

function pruneDailyExportMemoryCache(cacheDays: number): void {
    for (const date of dailyExportMemoryCache.keys()) {
        if (!isMemoryCacheEligible(date, cacheDays)) {
            dailyExportMemoryCache.delete(date);
        }
    }
}

export function readDailyExport(date: string): DailyExportReadResult | null {
    const filePath = getDailyExportFilePath(date);
    const cacheDays = useConfig().task.dailyExport.memoryCacheDays;
    pruneDailyExportMemoryCache(cacheDays);

    const signature = getDailyExportFileSignature(filePath);
    if (signature === null) {
        dailyExportMemoryCache.delete(date);
        return null;
    }

    const cacheable = isMemoryCacheEligible(date, cacheDays);
    const cached = cacheable ? dailyExportMemoryCache.get(date) : undefined;
    if (cached && signaturesMatch(cached.signature, signature)) {
        return cached.result;
    }

    let compressed: Buffer;
    try {
        compressed = fs.readFileSync(filePath);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            dailyExportMemoryCache.delete(date);
            return null;
        }
        throw error;
    }

    const content = decompressDailyExportCsv(compressed).toString('utf8');
    const result = {
        content,
        total: countDailyExportItems(content)
    };

    if (cacheable) {
        dailyExportMemoryCache.set(date, {
            signature,
            result
        });
    } else {
        dailyExportMemoryCache.delete(date);
    }

    return result;
}

export function countDailyExportItems(content: string): number {
    const lines = content
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0);

    if (lines.length === 0) {
        return 0;
    }

    return Math.max(0, lines.length - 1);
}

function parseDailyExportFileName(fileName: string): string | null {
    const match = /^(\d{8})\.csv\.zst$/.exec(fileName);
    return match ? match[1]! : null;
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

    const dates = new Set<string>();
    const monthsByYear = new Map<number, Set<number>>();

    for (const entry of fs.readdirSync(exportsDirectory, {
        withFileTypes: true
    })) {
        if (!entry.isFile()) {
            continue;
        }

        const date = parseDailyExportFileName(entry.name);
        if (!date) {
            continue;
        }

        dates.add(date);
        const year = Number.parseInt(date.slice(0, 4), 10);
        const month = Number.parseInt(date.slice(4, 6), 10);
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

    const items = [...dates]
        .filter((date) => {
            return (
                Number.parseInt(date.slice(0, 4), 10) === selectedYear &&
                Number.parseInt(date.slice(4, 6), 10) === selectedMonth
            );
        })
        .sort((left, right) => right.localeCompare(left))
        .map((date) => ({
            serviceDay: serviceDateToDay(date)
        }));

    return {
        selectedYear,
        selectedMonth,
        availableYears,
        availableMonths: monthsForYear,
        items
    };
}

export function dayToExportDate(serviceDay: ServiceDay): string {
    return dayToServiceDate(serviceDay);
}
