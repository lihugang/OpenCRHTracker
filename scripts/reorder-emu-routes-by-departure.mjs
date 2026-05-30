#!/usr/bin/env node

import Database from 'better-sqlite3';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_CONFIG_PATH = 'data/config.json';
const DEFAULT_BATCH_SIZE = 2000;
const SHANGHAI_OFFSET_SECONDS = 8 * 60 * 60;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

function printHelp() {
    console.log(`Usage: node scripts/reorder-emu-routes-by-departure.mjs [options]

Options:
    --config=<path>        Config JSON path. Default: ${DEFAULT_CONFIG_PATH}
    --source-emu-db=<path> Override the source EMUTracked SQLite database path.
    --timetable-db=<path>  Override the timetable history SQLite database path.
    --output-db=<path>     Override the output SQLite database path.
                           Default: data/emu_new.db
    --batch-size=<n>       Batch size for source row scanning.
                           Default: ${DEFAULT_BATCH_SIZE}
    --help                 Show this message
`);
}

function parseArgs(argv) {
    const options = {
        configPath: resolve(repoRoot, DEFAULT_CONFIG_PATH),
        sourceEmuDbPath: '',
        timetableDbPath: '',
        outputDbPath: resolve(repoRoot, 'data/emu_new.db'),
        batchSize: DEFAULT_BATCH_SIZE
    };

    for (const argument of argv) {
        if (argument.startsWith('--config=')) {
            options.configPath = resolve(
                repoRoot,
                argument.slice('--config='.length)
            );
            continue;
        }

        if (argument.startsWith('--source-emu-db=')) {
            options.sourceEmuDbPath = resolve(
                repoRoot,
                argument.slice('--source-emu-db='.length)
            );
            continue;
        }

        if (argument.startsWith('--timetable-db=')) {
            options.timetableDbPath = resolve(
                repoRoot,
                argument.slice('--timetable-db='.length)
            );
            continue;
        }

        if (argument.startsWith('--output-db=')) {
            options.outputDbPath = resolve(
                repoRoot,
                argument.slice('--output-db='.length)
            );
            continue;
        }

        if (argument.startsWith('--batch-size=')) {
            const rawValue = argument.slice('--batch-size='.length);
            const batchSize = Number.parseInt(rawValue, 10);

            if (!Number.isInteger(batchSize) || batchSize <= 0) {
                throw new Error(`Invalid --batch-size value: ${rawValue}`);
            }

            options.batchSize = batchSize;
            continue;
        }

        if (argument === '--help') {
            printHelp();
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

function loadConfigDatabasePaths(configPath) {
    if (!existsSync(configPath)) {
        throw new Error(`Config file does not exist: ${configPath}`);
    }

    const parsed = JSON.parse(readUtf8File(configPath));
    const databases = parsed?.data?.databases;
    const sourceEmuDbPath =
        typeof databases?.EMUTracked === 'string' ? databases.EMUTracked : '';
    const timetableDbPath =
        typeof databases?.timetableHistory === 'string'
            ? databases.timetableHistory
            : 'data/timetable-history.db';

    if (sourceEmuDbPath.length === 0) {
        throw new Error(
            `Config file is missing database paths: ${configPath}`
        );
    }

    return {
        sourceEmuDbPath: resolve(repoRoot, sourceEmuDbPath),
        timetableDbPath: resolve(repoRoot, timetableDbPath)
    };
}

function assertFileExists(filePath, label) {
    if (!existsSync(filePath)) {
        throw new Error(`${label} does not exist: ${filePath}`);
    }
}

function assertFileNotExists(filePath, label) {
    if (existsSync(filePath)) {
        throw new Error(`${label} already exists: ${filePath}`);
    }
}

function getShanghaiDayStartUnixSeconds(serviceDate) {
    if (!/^\d{8}$/.test(serviceDate)) {
        return null;
    }

    const year = Number.parseInt(serviceDate.slice(0, 4), 10);
    const month = Number.parseInt(serviceDate.slice(4, 6), 10);
    const day = Number.parseInt(serviceDate.slice(6, 8), 10);
    return (
        Math.floor(Date.UTC(year, month - 1, day, 0, 0, 0) / 1000) -
        SHANGHAI_OFFSET_SECONDS
    );
}

function buildAbsoluteTimestamp(serviceDate, offset) {
    if (!Number.isInteger(offset) || offset < 0) {
        return null;
    }

    const dayStart = getShanghaiDayStartUnixSeconds(serviceDate);
    if (dayStart === null) {
        return null;
    }

    return dayStart + offset;
}

function escapeSqliteStringLiteral(value) {
    return `'${String(value).replace(/'/g, "''")}'`;
}

function normalizeOptionalInteger(value) {
    return Number.isInteger(value) && value >= 0 ? value : null;
}

function parseStartOffsetFromTimetableJson(rawJson) {
    const parsed = JSON.parse(rawJson);
    const rawStops = Array.isArray(parsed?.stops) ? parsed.stops : [];
    const firstStop = rawStops
        .map((stop) => {
            if (typeof stop !== 'object' || stop === null) {
                return null;
            }

            return {
                stationNo: normalizeOptionalInteger(stop.stationNo),
                arriveAt: normalizeOptionalInteger(stop.arriveAt),
                departAt: normalizeOptionalInteger(stop.departAt)
            };
        })
        .filter((stop) => stop !== null && stop.stationNo !== null)
        .sort((left, right) => left.stationNo - right.stationNo)[0];

    if (!firstStop) {
        return null;
    }

    return firstStop.departAt ?? firstStop.arriveAt ?? null;
}

function createTimetableStartOffsetResolver(timetableDb) {
    const selectContentById = timetableDb.prepare(
        loadSql('assets/sql/timetable-history/queries/selectContentById.sql')
    );
    const cache = new Map();

    return {
        resolveStartOffset(timetableId) {
            if (!Number.isInteger(timetableId) || timetableId <= 0) {
                return {
                    ok: false,
                    reason: 'null_timetable_id'
                };
            }

            const cached = cache.get(timetableId);
            if (cached !== undefined) {
                return cached;
            }

            const row = selectContentById.get(timetableId) ?? null;
            if (!row) {
                const missingResult = {
                    ok: false,
                    reason: 'missing_content'
                };
                cache.set(timetableId, missingResult);
                return missingResult;
            }

            let startOffset;
            try {
                startOffset = parseStartOffsetFromTimetableJson(row.timetable_json);
            } catch {
                const invalidResult = {
                    ok: false,
                    reason: 'invalid_json'
                };
                cache.set(timetableId, invalidResult);
                return invalidResult;
            }

            if (startOffset === null) {
                const missingOffsetResult = {
                    ok: false,
                    reason: 'missing_start_offset'
                };
                cache.set(timetableId, missingOffsetResult);
                return missingOffsetResult;
            }

            const resolvedResult = {
                ok: true,
                startOffset
            };
            cache.set(timetableId, resolvedResult);
            return resolvedResult;
        }
    };
}

function createOutputSchema(outputDb) {
    outputDb.exec(loadSql('assets/sql/emu/schema/createDailyEmuRoutesTable.sql'));
    outputDb.exec(loadSql('assets/sql/emu/schema/createProbeStatusTable.sql'));
    outputDb.exec(`CREATE TABLE daily_emu_routes_sorted_stage (
        original_id INTEGER NOT NULL,
        train_code TEXT NOT NULL,
        emu_code TEXT NOT NULL,
        service_date TEXT NOT NULL,
        timetable_id INTEGER NULL,
        start_at INTEGER NOT NULL
    );`);
    outputDb.exec(`CREATE INDEX idx_daily_emu_routes_sorted_stage_start_at_original_id
        ON daily_emu_routes_sorted_stage(start_at ASC, original_id ASC);`);
}

function createStatements(sourceDb, outputDb) {
    return {
        selectDailyRoutesBatch: sourceDb.prepare(`SELECT
                id,
                train_code,
                emu_code,
                service_date,
                timetable_id
            FROM daily_emu_routes
            WHERE id > ?
            ORDER BY id ASC
            LIMIT ?`),
        selectDailyRoutesCount: sourceDb.prepare(
            'SELECT COUNT(*) AS count FROM daily_emu_routes'
        ),
        selectProbeStatusCount: sourceDb.prepare(
            'SELECT COUNT(*) AS count FROM probe_status'
        ),
        selectProbeStatusBatch: sourceDb.prepare(`SELECT
                id,
                train_code,
                emu_code,
                service_date,
                timetable_id,
                status
            FROM probe_status
            WHERE id > ?
            ORDER BY id ASC
            LIMIT ?`),
        insertUnresolvedDailyRoute: outputDb.prepare(`INSERT INTO daily_emu_routes (
                train_code,
                emu_code,
                service_date,
                timetable_id
            ) VALUES (?, ?, ?, ?)`),
        insertStageDailyRoute: outputDb.prepare(`INSERT INTO daily_emu_routes_sorted_stage (
                original_id,
                train_code,
                emu_code,
                service_date,
                timetable_id,
                start_at
            ) VALUES (?, ?, ?, ?, ?, ?)`),
        insertResolvedDailyRoutes: outputDb.prepare(`INSERT INTO daily_emu_routes (
                train_code,
                emu_code,
                service_date,
                timetable_id
            ) SELECT
                train_code,
                emu_code,
                service_date,
                timetable_id
            FROM daily_emu_routes_sorted_stage
            ORDER BY start_at ASC, original_id ASC`),
        dropStageTable: outputDb.prepare(
            'DROP TABLE daily_emu_routes_sorted_stage'
        ),
        insertProbeStatus: outputDb.prepare(`INSERT INTO probe_status (
                train_code,
                emu_code,
                service_date,
                timetable_id,
                status
            ) VALUES (?, ?, ?, ?, ?)`),
        selectOutputDailyRoutesCount: outputDb.prepare(
            'SELECT COUNT(*) AS count FROM daily_emu_routes'
        ),
        selectOutputProbeStatusCount: outputDb.prepare(
            'SELECT COUNT(*) AS count FROM probe_status'
        )
    };
}

function buildStats(sourceEmuDbPath, timetableDbPath, outputDbPath, batchSize) {
    return {
        sourceEmuDbPath,
        timetableDbPath,
        outputDbPath,
        batchSize,
        scannedDailyRoutes: 0,
        resolvedDailyRoutes: 0,
        unresolvedDailyRoutes: 0,
        unresolvedReasons: new Map(),
        copiedProbeStatus: 0,
        writtenDailyRoutes: 0,
        startedAtMs: Date.now()
    };
}

function incrementReason(stats, reason) {
    stats.unresolvedReasons.set(
        reason,
        (stats.unresolvedReasons.get(reason) ?? 0) + 1
    );
}

function reorderDailyRoutes(sourceDb, outputDb, resolver, statements, stats) {
    let lastId = 0;

    const writeBatch = outputDb.transaction((rows) => {
        for (const row of rows) {
            stats.scannedDailyRoutes += 1;

            if (row.timetable_id === null) {
                statements.insertUnresolvedDailyRoute.run(
                    row.train_code,
                    row.emu_code,
                    row.service_date,
                    row.timetable_id
                );
                stats.unresolvedDailyRoutes += 1;
                incrementReason(stats, 'null_timetable_id');
                continue;
            }

            const resolution = resolver.resolveStartOffset(row.timetable_id);
            if (!resolution.ok) {
                statements.insertUnresolvedDailyRoute.run(
                    row.train_code,
                    row.emu_code,
                    row.service_date,
                    row.timetable_id
                );
                stats.unresolvedDailyRoutes += 1;
                incrementReason(stats, resolution.reason);
                continue;
            }

            const startAt = buildAbsoluteTimestamp(
                row.service_date,
                resolution.startOffset
            );
            if (startAt === null) {
                statements.insertUnresolvedDailyRoute.run(
                    row.train_code,
                    row.emu_code,
                    row.service_date,
                    row.timetable_id
                );
                stats.unresolvedDailyRoutes += 1;
                incrementReason(stats, 'invalid_service_date');
                continue;
            }

            statements.insertStageDailyRoute.run(
                row.id,
                row.train_code,
                row.emu_code,
                row.service_date,
                row.timetable_id,
                startAt
            );
            stats.resolvedDailyRoutes += 1;
        }
    });

    while (true) {
        const rows = statements.selectDailyRoutesBatch.all(lastId, stats.batchSize);
        if (rows.length === 0) {
            break;
        }

        writeBatch(rows);
        lastId = rows[rows.length - 1].id;

        if (rows.length < stats.batchSize) {
            break;
        }
    }

    statements.insertResolvedDailyRoutes.run();
    statements.dropStageTable.run();
    stats.writtenDailyRoutes =
        stats.unresolvedDailyRoutes + stats.resolvedDailyRoutes;
}

function copyProbeStatus(outputDb, statements, stats) {
    let lastId = 0;

    const writeBatch = outputDb.transaction((rows) => {
        for (const row of rows) {
            statements.insertProbeStatus.run(
                row.train_code,
                row.emu_code,
                row.service_date,
                row.timetable_id,
                row.status
            );
            stats.copiedProbeStatus += 1;
        }
    });

    while (true) {
        const rows = statements.selectProbeStatusBatch.all(lastId, stats.batchSize);
        if (rows.length === 0) {
            break;
        }

        writeBatch(rows);
        lastId = rows[rows.length - 1].id;

        if (rows.length < stats.batchSize) {
            break;
        }
    }
}

function printSummary(stats, sourceCounts, outputCounts) {
    const durationMs = Date.now() - stats.startedAtMs;
    console.log(`Source EMU DB: ${stats.sourceEmuDbPath}`);
    console.log(`Timetable DB: ${stats.timetableDbPath}`);
    console.log(`Output DB: ${stats.outputDbPath}`);
    console.log(`Batch size: ${stats.batchSize}`);
    console.log(`Source daily_emu_routes rows: ${sourceCounts.dailyRoutes}`);
    console.log(`Source probe_status rows: ${sourceCounts.probeStatus}`);
    console.log(`Scanned daily_emu_routes rows: ${stats.scannedDailyRoutes}`);
    console.log(`Resolved daily_emu_routes rows: ${stats.resolvedDailyRoutes}`);
    console.log(`Unresolved daily_emu_routes rows: ${stats.unresolvedDailyRoutes}`);
    console.log(`Written daily_emu_routes rows: ${stats.writtenDailyRoutes}`);
    console.log(`Copied probe_status rows: ${stats.copiedProbeStatus}`);
    console.log(`Output daily_emu_routes rows: ${outputCounts.dailyRoutes}`);
    console.log(`Output probe_status rows: ${outputCounts.probeStatus}`);
    console.log(`Elapsed ms: ${durationMs}`);

    if (stats.unresolvedReasons.size === 0) {
        console.log('Unresolved reasons: none');
        return;
    }

    console.log('Unresolved reasons:');
    for (const [reason, count] of Array.from(stats.unresolvedReasons.entries()).sort(
        (left, right) => left[0].localeCompare(right[0], 'en')
    )) {
        console.log(`  ${reason}: ${count}`);
    }
}

function removeFileIfExists(filePath) {
    if (existsSync(filePath)) {
        unlinkSync(filePath);
    }
}

function cleanupOutputArtifacts(outputDbPath) {
    removeFileIfExists(outputDbPath);
    removeFileIfExists(`${outputDbPath}-shm`);
    removeFileIfExists(`${outputDbPath}-wal`);
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const configDatabasePaths = loadConfigDatabasePaths(options.configPath);
    const sourceEmuDbPath =
        options.sourceEmuDbPath.length > 0
            ? options.sourceEmuDbPath
            : configDatabasePaths.sourceEmuDbPath;
    const timetableDbPath =
        options.timetableDbPath.length > 0
            ? options.timetableDbPath
            : configDatabasePaths.timetableDbPath;
    const outputDbPath = options.outputDbPath;

    assertFileExists(sourceEmuDbPath, 'Source EMU database');
    assertFileExists(timetableDbPath, 'Timetable history database');
    assertFileNotExists(outputDbPath, 'Output database');

    const stats = buildStats(
        sourceEmuDbPath,
        timetableDbPath,
        outputDbPath,
        options.batchSize
    );
    let outputDb = null;

    const sourceDb = new Database(sourceEmuDbPath, { readonly: true });
    const timetableDb = new Database(timetableDbPath, { readonly: true });

    try {
        outputDb = new Database(outputDbPath);
        outputDb.pragma('foreign_keys = ON');
        outputDb.pragma('journal_mode = WAL');
        outputDb.pragma('synchronous = NORMAL');

        createOutputSchema(outputDb);

        const statements = createStatements(sourceDb, outputDb);
        const resolver = createTimetableStartOffsetResolver(timetableDb);
        const sourceCounts = {
            dailyRoutes:
                statements.selectDailyRoutesCount.get()?.count ?? 0,
            probeStatus:
                statements.selectProbeStatusCount.get()?.count ?? 0
        };

        reorderDailyRoutes(sourceDb, outputDb, resolver, statements, stats);
        copyProbeStatus(outputDb, statements, stats);

        const outputCounts = {
            dailyRoutes:
                statements.selectOutputDailyRoutesCount.get()?.count ?? 0,
            probeStatus:
                statements.selectOutputProbeStatusCount.get()?.count ?? 0
        };

        if (sourceCounts.dailyRoutes !== outputCounts.dailyRoutes) {
            throw new Error(
                `daily_emu_routes row count mismatch source=${sourceCounts.dailyRoutes} output=${outputCounts.dailyRoutes}`
            );
        }

        if (sourceCounts.probeStatus !== outputCounts.probeStatus) {
            throw new Error(
                `probe_status row count mismatch source=${sourceCounts.probeStatus} output=${outputCounts.probeStatus}`
            );
        }

        printSummary(stats, sourceCounts, outputCounts);
    } catch (error) {
        if (outputDb) {
            try {
                outputDb.close();
            } catch {
                // ignore cleanup errors during failure handling
            }
            outputDb = null;
        }

        cleanupOutputArtifacts(outputDbPath);
        throw error;
    } finally {
        sourceDb.close();
        timetableDb.close();
        if (outputDb) {
            outputDb.close();
        }
    }
}

main();
