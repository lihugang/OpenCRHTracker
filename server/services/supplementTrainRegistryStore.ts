import fs from 'fs';
import getLogger from '~/server/libs/log4js';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import parseTimeAsTimestamp from '~/server/utils/date/parseTimeAsTimestamp';
import { toUnixSecondsFromShanghaiDayOffset } from '~/server/utils/date/shanghaiDateTime';
import {
    getAssetFilePath,
    writeTextFileAtomically
} from '~/server/utils/dataAssets/store';
import type {
    TodayScheduleStop,
    TodayScheduleTimetable
} from '~/server/services/todayScheduleCache';

const logger = getLogger('supplement-train-registry');

const HHMM_PATTERN = /^([01]\d|2[0-3])[0-5]\d$/;

const DEFAULT_SUPPLEMENT_TRAINS_CONTENT = `{
    "$schema": "../assets/json/supplementTrainsScheme.json",
    "updatedAt": "2026-01-01T00:00:00+08:00",
    "items": []
}
`;

export interface SupplementTrainStopInput {
    stationNo: number;
    stationName: string;
    arriveAt: string;
    departAt: string;
    platformNo: number | null;
    distance: number | null;
    wicket: string | null;
}

export interface SupplementTrainEntry {
    trainCode: string;
    aliases: string[];
    bureauCode: string;
    trainStyle: string;
    trainDepartment: string;
    passengerDepartment: string;
    stops: SupplementTrainStopInput[];
}

export interface SupplementTrainLookupRow {
    code: string;
    canonicalCode: string;
    startStation: string;
    endStation: string;
}

interface SupplementTrainRegistry {
    filePath: string;
    fileMtimeMs: number;
    entriesByTrainCode: Map<string, SupplementTrainEntry>;
    aliasesByCode: Map<string, string>;
    trainCodes: string[];
}

let cached: SupplementTrainRegistry | null = null;

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(`Invalid supplement trains asset: ${message}`);
    }
}

function getFileMtimeMs(filePath: string) {
    try {
        return fs.statSync(filePath).mtimeMs;
    } catch {
        return -1;
    }
}

function normalizeOptionalString(value: unknown, label: string): string {
    if (value === undefined) {
        return '';
    }

    assert(typeof value === 'string', `${label} must be a string`);
    return value.trim();
}

function parseStop(raw: unknown, trainCode: string, index: number) {
    assert(
        typeof raw === 'object' && raw !== null && !Array.isArray(raw),
        `items[${trainCode}].stops[${index}] must be an object`
    );
    const stop = raw as Record<string, unknown>;
    const label = `items[${trainCode}].stops[${index}]`;

    assert(
        Number.isInteger(stop.stationNo) && (stop.stationNo as number) >= 1,
        `${label}.stationNo must be a positive integer`
    );
    assert(
        typeof stop.stationName === 'string' &&
            stop.stationName.trim().length > 0,
        `${label}.stationName must be a non-empty string`
    );
    assert(
        typeof stop.arriveAt === 'string' && HHMM_PATTERN.test(stop.arriveAt),
        `${label}.arriveAt must match HHmm`
    );
    assert(
        typeof stop.departAt === 'string' && HHMM_PATTERN.test(stop.departAt),
        `${label}.departAt must match HHmm`
    );
    assert(
        stop.platformNo === null ||
            stop.platformNo === undefined ||
            Number.isInteger(stop.platformNo),
        `${label}.platformNo must be an integer or null`
    );
    assert(
        stop.distance === null ||
            stop.distance === undefined ||
            typeof stop.distance === 'number',
        `${label}.distance must be a number or null`
    );
    assert(
        stop.wicket === null ||
            stop.wicket === undefined ||
            typeof stop.wicket === 'string',
        `${label}.wicket must be a string or null`
    );

    return {
        stationNo: stop.stationNo as number,
        stationName: (stop.stationName as string).trim(),
        arriveAt: stop.arriveAt as string,
        departAt: stop.departAt as string,
        platformNo:
            stop.platformNo === undefined || stop.platformNo === null
                ? null
                : (stop.platformNo as number),
        distance:
            stop.distance === undefined || stop.distance === null
                ? null
                : (stop.distance as number),
        wicket:
            stop.wicket === undefined || stop.wicket === null
                ? null
                : (stop.wicket as string).trim()
    };
}

function parseSupplementTrainsText(text: string): SupplementTrainEntry[] {
    const raw = JSON.parse(text) as unknown;
    assert(
        typeof raw === 'object' && raw !== null && !Array.isArray(raw),
        'root must be an object'
    );
    const root = raw as Record<string, unknown>;
    assert(Array.isArray(root.items), 'items must be an array');

    const entries: SupplementTrainEntry[] = [];
    const seenTrainCodes = new Set<string>();

    for (const [index, rawItem] of root.items.entries()) {
        assert(
            typeof rawItem === 'object' &&
                rawItem !== null &&
                !Array.isArray(rawItem),
            `items[${index}] must be an object`
        );
        const item = rawItem as Record<string, unknown>;
        assert(
            typeof item.trainCode === 'string' &&
                item.trainCode.trim().length > 0,
            `items[${index}].trainCode must be a non-empty string`
        );

        const trainCode = normalizeCode(item.trainCode);
        if (seenTrainCodes.has(trainCode)) {
            logger.warn(
                `duplicate_supplement_train_code code=${trainCode} strategy=first_record`
            );
            continue;
        }
        seenTrainCodes.add(trainCode);

        assert(
            Array.isArray(item.stops),
            `items[${trainCode}].stops must be an array`
        );
        assert(
            item.stops.length > 0,
            `items[${trainCode}].stops must not be empty`
        );

        const aliases: string[] = [];
        if (item.aliases !== undefined) {
            assert(
                Array.isArray(item.aliases),
                `items[${trainCode}].aliases must be an array`
            );
            const seenAliases = new Set<string>();
            for (const [aliasIndex, rawAlias] of item.aliases.entries()) {
                assert(
                    typeof rawAlias === 'string' && rawAlias.trim().length > 0,
                    `items[${trainCode}].aliases[${aliasIndex}] must be a non-empty string`
                );
                const alias = normalizeCode(rawAlias);
                if (alias.length === 0 || alias === trainCode) {
                    continue;
                }
                if (!seenAliases.has(alias)) {
                    seenAliases.add(alias);
                    aliases.push(alias);
                }
            }
        }

        const stops = item.stops
            .map((rawStop, stopIndex) =>
                parseStop(rawStop, trainCode, stopIndex)
            )
            .sort((left, right) => left.stationNo - right.stationNo);

        entries.push({
            trainCode,
            aliases,
            bureauCode: normalizeOptionalString(
                item.bureauCode,
                `items[${trainCode}].bureauCode`
            ),
            trainStyle: normalizeOptionalString(
                item.trainStyle,
                `items[${trainCode}].trainStyle`
            ),
            trainDepartment: normalizeOptionalString(
                item.trainDepartment,
                `items[${trainCode}].trainDepartment`
            ),
            passengerDepartment: normalizeOptionalString(
                item.passengerDepartment,
                `items[${trainCode}].passengerDepartment`
            ),
            stops
        });
    }

    return entries;
}

function buildRegistry(filePath: string): SupplementTrainRegistry {
    const text = fs.readFileSync(filePath, 'utf8');
    const entries = parseSupplementTrainsText(text);
    const entriesByTrainCode = new Map<string, SupplementTrainEntry>();
    const aliasesByCode = new Map<string, string>();

    for (const entry of entries) {
        entriesByTrainCode.set(entry.trainCode, entry);
        for (const alias of entry.aliases) {
            if (!aliasesByCode.has(alias)) {
                aliasesByCode.set(alias, entry.trainCode);
            }
        }
    }

    return {
        filePath,
        fileMtimeMs: getFileMtimeMs(filePath),
        entriesByTrainCode,
        aliasesByCode,
        trainCodes: entries.map((entry) => entry.trainCode)
    };
}

function ensureSupplementTrainsFile(): void {
    const filePath = getAssetFilePath('supplementTrains');
    try {
        fs.accessSync(filePath);
    } catch {
        writeTextFileAtomically(filePath, DEFAULT_SUPPLEMENT_TRAINS_CONTENT);
        logger.warn(
            `supplement_trains_asset_initialized file=${filePath} source=default`
        );
    }
}

function getActiveRegistry(): SupplementTrainRegistry {
    ensureSupplementTrainsFile();
    if (cached && cached.fileMtimeMs === getFileMtimeMs(cached.filePath)) {
        return cached;
    }

    const filePath = getAssetFilePath('supplementTrains');
    try {
        cached = buildRegistry(filePath);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(
            `supplement_trains_asset_unavailable file=${filePath} error=${message}`
        );
        cached = {
            filePath,
            fileMtimeMs: -1,
            entriesByTrainCode: new Map(),
            aliasesByCode: new Map(),
            trainCodes: []
        };
    }
    return cached;
}

export function validateSupplementTrainsText(text: string): void {
    parseSupplementTrainsText(text);
}

export function preloadSupplementTrainRegistryFromLocalFile(): void {
    ensureSupplementTrainsFile();
    cached = buildRegistry(getAssetFilePath('supplementTrains'));
}

export function invalidateSupplementTrainRegistryCache(): void {
    cached = null;
}

export function listSupplementTrainLookupRows(): SupplementTrainLookupRow[] {
    const registry = getActiveRegistry();
    const rows: SupplementTrainLookupRow[] = [];

    for (const trainCode of registry.trainCodes) {
        const entry = registry.entriesByTrainCode.get(trainCode);
        if (!entry) {
            continue;
        }

        const firstStop = entry.stops[0];
        const lastStop = entry.stops[entry.stops.length - 1];
        const startStation = firstStop?.stationName ?? '';
        const endStation = lastStop?.stationName ?? '';

        rows.push({
            code: entry.trainCode,
            canonicalCode: entry.trainCode,
            startStation,
            endStation
        });
        for (const alias of entry.aliases) {
            rows.push({
                code: alias,
                canonicalCode: entry.trainCode,
                startStation,
                endStation
            });
        }
    }

    return rows;
}

export function listSupplementTrainEntries(): SupplementTrainEntry[] {
    const registry = getActiveRegistry();
    const entries: SupplementTrainEntry[] = [];

    for (const trainCode of registry.trainCodes) {
        const entry = registry.entriesByTrainCode.get(trainCode);
        if (entry) {
            entries.push(entry);
        }
    }

    return entries;
}

export function getSupplementTrainTimetableByTrainCode(
    trainCode: string
): TodayScheduleTimetable | null {
    const registry = getActiveRegistry();
    const normalizedCode = normalizeCode(trainCode);
    if (normalizedCode.length === 0) {
        return null;
    }

    const entry =
        registry.entriesByTrainCode.get(normalizedCode) ??
        (() => {
            const canonicalCode = registry.aliasesByCode.get(normalizedCode);
            if (!canonicalCode) {
                return null;
            }
            return registry.entriesByTrainCode.get(canonicalCode) ?? null;
        })();
    if (!entry) {
        return null;
    }

    return buildSupplementTimetable(getCurrentDateString(), entry);
}

function buildSupplementTimetable(
    date: string,
    entry: SupplementTrainEntry
): TodayScheduleTimetable {
    const stops = [...entry.stops].sort(
        (left, right) => left.stationNo - right.stationNo
    );
    const firstStop = stops[0]!;
    const lastStop = stops[stops.length - 1]!;
    const allCodes = [entry.trainCode, ...entry.aliases];
    const timetableStops: TodayScheduleStop[] = stops.map((stop, index) => {
        const isStart = index === 0;
        const isEnd = index === stops.length - 1;

        return {
            stationNo: stop.stationNo,
            stationName: stop.stationName,
            arriveAt: toUnixSecondsFromShanghaiDayOffset(
                date,
                parseTimeAsTimestamp(stop.arriveAt)
            ),
            departAt: toUnixSecondsFromShanghaiDayOffset(
                date,
                parseTimeAsTimestamp(stop.departAt)
            ),
            stationTrainCode: entry.trainCode,
            wicket: stop.wicket ?? '',
            distance: stop.distance ?? null,
            platformNo: stop.platformNo ?? null,
            isStart,
            isEnd
        };
    });

    return {
        trainCode: entry.trainCode,
        trainInternalCode: `supplement_trains_${entry.trainCode}`,
        allCodes,
        bureauCode: entry.bureauCode,
        trainStyle: entry.trainStyle,
        trainDepartment: entry.trainDepartment,
        passengerDepartment: entry.passengerDepartment,
        startAt: toUnixSecondsFromShanghaiDayOffset(
            date,
            parseTimeAsTimestamp(firstStop.departAt)
        ),
        endAt: toUnixSecondsFromShanghaiDayOffset(
            date,
            parseTimeAsTimestamp(lastStop.arriveAt)
        ),
        updatedAt: null,
        startStation: firstStop.stationName,
        endStation: lastStop.stationName,
        stops: timetableStops
    };
}
