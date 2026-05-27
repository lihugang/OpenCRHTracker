import fs from 'fs';
import getLogger from '~/server/libs/log4js';
import { ensureAssetFile, getAssetFilePath } from '~/server/utils/dataAssets/store';
import parseJsonlToJson from '~/server/utils/json/parseJsonlToJson';

interface RawStationCoordRecord extends Record<string, unknown> {
    stationName?: unknown;
    latitude?: unknown;
    longtitude?: unknown;
}

export interface StationCoordRecord {
    stationName: string;
    lat: number;
    lon: number;
}

export interface StationCoordAssets {
    records: StationCoordRecord[];
    byStationName: Map<string, StationCoordRecord>;
}

const logger = getLogger('station-coord-store');

let cached: StationCoordAssets | null = null;

function normalizeStationName(value: unknown, rowNumber: number): string {
    if (typeof value !== 'string') {
        throw new Error(
            `stationCoord row ${rowNumber} field stationName must be a string`
        );
    }

    const stationName = value.trim();
    if (stationName.length === 0) {
        throw new Error(
            `stationCoord row ${rowNumber} field stationName must be non-empty`
        );
    }

    return stationName;
}

function normalizeCoordinate(
    value: unknown,
    fieldName: 'latitude' | 'longtitude',
    rowNumber: number
): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(
            `stationCoord row ${rowNumber} field ${fieldName} must be a finite number`
        );
    }

    return value;
}

export function parseStationCoordAssetText(text: string): StationCoordRecord[] {
    const rows = parseJsonlToJson<RawStationCoordRecord>(text);
    const records: StationCoordRecord[] = [];

    for (const [index, row] of rows.entries()) {
        const rowNumber = index + 1;
        const stationName = normalizeStationName(row.stationName, rowNumber);
        const lat = normalizeCoordinate(row.latitude, 'latitude', rowNumber);
        const lon = normalizeCoordinate(
            row.longtitude,
            'longtitude',
            rowNumber
        );

        records.push({
            stationName,
            lat,
            lon
        });
    }

    return records;
}

export function validateDownloadedStationCoordAssetText(text: string): void {
    if (text.trim().length === 0) {
        throw new Error('stationCoord asset content must not be empty');
    }

    parseStationCoordAssetText(text);
}

function buildStationCoordAssets(
    records: StationCoordRecord[]
): StationCoordAssets {
    const byStationName = new Map<string, StationCoordRecord>();
    const duplicateCounts = new Map<string, number>();

    for (const record of records) {
        const existing = byStationName.get(record.stationName);
        if (!existing) {
            byStationName.set(record.stationName, record);
            continue;
        }

        duplicateCounts.set(
            record.stationName,
            (duplicateCounts.get(record.stationName) ?? 1) + 1
        );
    }

    for (const [stationName, count] of duplicateCounts) {
        logger.warn(
            `duplicate_station_coord stationName=${stationName} count=${count} strategy=first_record`
        );
    }

    return {
        records,
        byStationName
    };
}

export async function loadStationCoordAssets(): Promise<StationCoordAssets> {
    if (cached) {
        return cached;
    }

    const asset = await ensureAssetFile('stationCoord', {
        defaultContent: '',
        allowProvider: true,
        validateContent: validateDownloadedStationCoordAssetText
    });
    const text = fs.readFileSync(asset.filePath, 'utf8');
    const records = parseStationCoordAssetText(text);
    cached = buildStationCoordAssets(records);
    return cached;
}

export function preloadStationCoordAssetsFromLocalFile(): StationCoordAssets {
    const filePath = getAssetFilePath('stationCoord');
    const text = fs.readFileSync(filePath, 'utf8');

    validateDownloadedStationCoordAssetText(text);

    const records = parseStationCoordAssetText(text);
    cached = buildStationCoordAssets(records);
    return cached;
}

export function invalidateStationCoordAssetsCache(): void {
    cached = null;
}

