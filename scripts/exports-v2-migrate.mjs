#!/usr/bin/env node

// Rebuilds historical data/exports/YYYYMMDD.csv files from the database for
// every service day actually present in daily_emu_routes. Never deletes old
// JSONL files. Mirrors server/services/dailyExportStore.ts CSV generator;
// keep in sync.

import Database from 'better-sqlite3';
import {
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    writeFileSync
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const DEFAULT_CONFIG_PATH = 'data/config.json';
const UTF8_BOM = '\uFEFF';
const SHANGHAI_OFFSET_SECONDS = 8 * 60 * 60;
const DAY_SECONDS = 24 * 60 * 60;
const EPOCH_SERVICE_DAY_START_SECONDS =
    Date.UTC(1970, 0, 1, 0, 0, 0) / 1000 - SHANGHAI_OFFSET_SECONDS;

function parseArgs(argv) {
    const options = {
        configPath: resolve(repoRoot, DEFAULT_CONFIG_PATH),
        dryRun: false
    };

    for (const argument of argv) {
        if (argument === '--dry-run') {
            options.dryRun = true;
            continue;
        }
        if (argument.startsWith('--config=')) {
            options.configPath = resolve(
                repoRoot,
                argument.slice('--config='.length)
            );
            continue;
        }
        if (argument === '--help') {
            console.log(
                'Usage: node scripts/exports-v2-migrate.mjs [--dry-run] [--config=<path>]'
            );
            process.exit(0);
        }
        throw new Error(`Unknown argument: ${argument}`);
    }

    return options;
}

function readUtf8File(filePath) {
    let text = readFileSync(filePath, 'utf8');
    if (text.charCodeAt(0) === 0xfeff) {
        text = text.slice(1);
    }
    return text;
}

function loadSql(relativePath) {
    return readUtf8File(resolve(repoRoot, relativePath));
}

function loadConfig(configPath) {
    if (!existsSync(configPath)) {
        throw new Error(`Config file does not exist: ${configPath}`);
    }
    return JSON.parse(readUtf8File(configPath));
}

function shanghaiDayStartUnixSeconds(dateYYYYMMDD) {
    const year = Number.parseInt(dateYYYYMMDD.slice(0, 4), 10);
    const month = Number.parseInt(dateYYYYMMDD.slice(4, 6), 10);
    const day = Number.parseInt(dateYYYYMMDD.slice(6, 8), 10);
    return Math.floor(
        Date.UTC(year, month - 1, day, 0, 0, 0, 0) / 1000 -
            SHANGHAI_OFFSET_SECONDS
    );
}

function dayToServiceDate(serviceDay) {
    const timestampMs =
        (EPOCH_SERVICE_DAY_START_SECONDS +
            serviceDay * DAY_SECONDS +
            SHANGHAI_OFFSET_SECONDS) *
        1000;
    const date = new Date(timestampMs);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

function shanghaiDayBucket(timestampSeconds) {
    return Math.floor(
        (timestampSeconds + SHANGHAI_OFFSET_SECONDS) / DAY_SECONDS
    );
}

function shanghaiDayOffsetSeconds(timestampSeconds) {
    const dayBucket = shanghaiDayBucket(timestampSeconds);
    return (
        timestampSeconds - (dayBucket * DAY_SECONDS - SHANGHAI_OFFSET_SECONDS)
    );
}

function toHhMm(offsetSeconds) {
    const totalMinutes = Math.floor(offsetSeconds / 60);
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function formatExportTime(timestampSeconds, departureDayBucket) {
    const dayOffset = shanghaiDayBucket(timestampSeconds) - departureDayBucket;
    const timeText = toHhMm(shanghaiDayOffsetSeconds(timestampSeconds));
    return dayOffset === 0 ? timeText : `${timeText}+${dayOffset}`;
}

function toCsvCell(value) {
    const text = String(value);
    if (!text.includes(',') && !text.includes('"') && !text.includes('\n')) {
        return text;
    }
    return `"${text.replace(/"/g, '""')}"`;
}

function parseStoredTimetable(rawJson) {
    const parsed = JSON.parse(rawJson);
    const rawStops = Array.isArray(parsed?.stops) ? parsed.stops : [];
    const stops = [];
    for (const stop of rawStops) {
        if (typeof stop !== 'object' || stop === null) {
            continue;
        }
        const stationNo = stop.stationNo;
        const stationName =
            typeof stop.stationName === 'string' ? stop.stationName.trim() : '';
        if (
            !Number.isInteger(stationNo) ||
            stationNo < 0 ||
            stationName.length === 0
        ) {
            continue;
        }
        const rawTrainCode = stop.stationTrainCode;
        if (typeof rawTrainCode !== 'object' || rawTrainCode === null) {
            throw new Error(
                `invalid_stored_station_train_code stationNo=${stationNo} stationName=${stationName}`
            );
        }
        const trainCodeText =
            `${String(rawTrainCode.prefix ?? '')}${String(rawTrainCode.number ?? '')}`
                .trim()
                .toUpperCase();
        if (!/^([A-Z]?)([0-9]{1,4})$/.test(trainCodeText)) {
            throw new Error(
                `invalid_stored_station_train_code stationNo=${stationNo} stationName=${stationName}`
            );
        }
        stops.push({
            stationNo,
            stationName,
            arriveAt:
                Number.isInteger(stop.arriveAt) && stop.arriveAt >= 0
                    ? stop.arriveAt
                    : null,
            departAt:
                Number.isInteger(stop.departAt) && stop.departAt >= 0
                    ? stop.departAt
                    : null
        });
    }
    return stops;
}

function serializeCsv(records) {
    const sorted = [...records].sort((left, right) => {
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
    });

    const rows = sorted.map((row) => {
        const departureDayBucket =
            row.startAt > 0 ? shanghaiDayBucket(row.startAt) : null;
        const startTime =
            departureDayBucket === null
                ? ''
                : formatExportTime(row.startAt, departureDayBucket);
        let endTime = '';
        if (
            departureDayBucket !== null &&
            Number.isInteger(row.endAt) &&
            row.endAt > 0 &&
            row.endAt >= row.startAt
        ) {
            endTime = formatExportTime(row.endAt, departureDayBucket);
        } else if (departureDayBucket !== null) {
            console.warn(
                `v2 export invalid endAt recordId=${row.id} trainCode=${row.trainCode} emuCode=${row.emuCode} recordStartAt=${row.startAt} recordEndAt=${row.endAt}`
            );
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

function loadTimetableContentById(timetableDb, contentId) {
    const row = timetableDb
        .prepare(
            loadSql(
                'assets/sql/timetable-history/queries/selectContentById.sql'
            )
        )
        .get(contentId);
    if (!row) {
        return null;
    }
    return parseStoredTimetable(row.timetable_json);
}

function buildRecords(emuDb, timetableDb, date) {
    const codeRows = emuDb
        .prepare(
            loadSql('assets/sql/emu/exports/selectExportEmuCodeMappings.sql')
        )
        .all();
    const emuCodeById = new Map(
        codeRows.map((row) => [
            row.id,
            String(row.emu_code ?? '')
                .trim()
                .toUpperCase()
        ])
    );

    const rows = emuDb
        .prepare(
            loadSql('assets/sql/emu/exports/selectExportRoutesByServiceDay.sql')
        )
        .all(date);

    const dayStart = shanghaiDayStartUnixSeconds(dayToServiceDate(date));
    const records = [];
    for (const row of rows) {
        const trainCode = `${row.train_prefix}${row.train_number}`;
        const emuCode = emuCodeById.get(row.emu_id);
        if (emuCode === undefined || emuCode.length === 0) {
            throw new Error(`unknown_emu_id ${row.emu_id}`);
        }
        let startStation = '';
        let endStation = '';
        let startAt = 0;
        let endAt = 0;

        if (row.timetable_id !== null && row.timetable_id !== undefined) {
            const stops = loadTimetableContentById(
                timetableDb,
                row.timetable_id
            );
            if (stops && stops.length > 0) {
                const first = stops[0];
                const last = stops[stops.length - 1];
                startStation = first.stationName;
                endStation = last.stationName;
                const startOffset = first.departAt ?? first.arriveAt;
                const endOffset = last.arriveAt ?? last.departAt;
                if (startOffset !== null) {
                    startAt = dayStart + startOffset;
                }
                if (endOffset !== null) {
                    endAt = dayStart + endOffset;
                }
            }
        }

        const record = {
            id: row.id,
            trainCode,
            emuCode,
            startStation,
            endStation,
            startAt,
            endAt
        };
        if (
            record.startAt > 0 &&
            (record.startAt < dayStart ||
                record.startAt > dayStart + DAY_SECONDS - 1)
        ) {
            continue;
        }
        records.push(record);
    }

    return records;
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const config = loadConfig(options.configPath);
    const emuDbPath = resolve(
        repoRoot,
        config?.data?.databases?.EMUTracked?.path ?? ''
    );
    const timetableDbPath = resolve(
        repoRoot,
        config?.data?.databases?.timetableHistory?.path ?? ''
    );

    if (!emuDbPath || !existsSync(emuDbPath)) {
        throw new Error(`EMUTracked database does not exist: ${emuDbPath}`);
    }
    if (!timetableDbPath || !existsSync(timetableDbPath)) {
        throw new Error(
            `timetableHistory database does not exist: ${timetableDbPath}`
        );
    }

    const emuDb = new Database(emuDbPath, { readonly: true });
    const timetableDb = new Database(timetableDbPath, { readonly: true });
    const dates = emuDb
        .prepare(loadSql('assets/sql/emu/exports/selectExportServiceDays.sql'))
        .all()
        .map((row) => row.service_date);

    if (dates.length === 0) {
        console.log('no service days found in daily_emu_routes');
        return;
    }

    const exportsDirectory = resolve(repoRoot, 'data/exports');
    if (!options.dryRun) {
        mkdirSync(exportsDirectory, { recursive: true });
    }

    let totalRecords = 0;
    for (const serviceDate of dates) {
        const date = dayToServiceDate(serviceDate);
        const records = buildRecords(emuDb, timetableDb, serviceDate);
        totalRecords += records.length;

        if (options.dryRun) {
            console.log(`dry-run date=${date} records=${records.length}`);
            continue;
        }

        const content = serializeCsv(records);
        const filePath = resolve(exportsDirectory, `${date}.csv`);
        const tempPath = `${filePath}.tmp-${process.pid}`;
        writeFileSync(tempPath, content, 'utf8');
        renameSync(tempPath, filePath);
        console.log(
            `written date=${date} total=${records.length} filePath=${filePath}`
        );
    }

    console.log(
        options.dryRun
            ? `dry-run complete dates=${dates.length} records=${totalRecords}`
            : `complete dates=${dates.length} records=${totalRecords}`
    );
}

main();
