import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_CONFIG_PATH = 'data/config.json';
const DAILY_LEGACY_BACKUP_TABLE = 'daily_emu_routes_legacy_pre_timetable_id';
const SHANGHAI_OFFSET_SECONDS = 8 * 60 * 60;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

function printHelp() {
    console.log(`Usage: node scripts/rebuild-emu-history-service-date-timetable-id.mjs [options]

Options:
    --apply               Apply the migration. Without this flag the script only
                          analyzes the source tables and prints a dry-run summary.
    --config=<path>       Config JSON path. Default: ${DEFAULT_CONFIG_PATH}
    --emu-db=<path>       Override the EMUTracked SQLite database path.
    --timetable-db=<path> Override the timetable history SQLite database path.
    --help                Show this message
`);
}

function parseArgs(argv) {
    const options = {
        apply: false,
        configPath: resolve(repoRoot, DEFAULT_CONFIG_PATH),
        emuDbPath: '',
        timetableDbPath: ''
    };

    for (const argument of argv) {
        if (argument === '--apply') {
            options.apply = true;
            continue;
        }

        if (argument.startsWith('--config=')) {
            options.configPath = resolve(
                repoRoot,
                argument.slice('--config='.length)
            );
            continue;
        }

        if (argument.startsWith('--emu-db=')) {
            options.emuDbPath = resolve(
                repoRoot,
                argument.slice('--emu-db='.length)
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
    const emuDbPath =
        typeof databases?.EMUTracked?.path === 'string'
            ? databases.EMUTracked.path
            : '';
    const timetableDbPath =
        typeof databases?.timetableHistory?.path === 'string'
            ? databases.timetableHistory.path
            : '';

    if (emuDbPath.length === 0 || timetableDbPath.length === 0) {
        throw new Error(`Config file is missing database paths: ${configPath}`);
    }

    return {
        emuDbPath: resolve(repoRoot, emuDbPath),
        timetableDbPath: resolve(repoRoot, timetableDbPath)
    };
}

function normalizeCode(value) {
    return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function normalizeOptionalInteger(value) {
    return Number.isInteger(value) && value >= 0 ? value : null;
}

function normalizeOptionalText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function formatShanghaiDateStringFromUnixSeconds(timestampSeconds) {
    if (
        !Number.isFinite(timestampSeconds) ||
        !Number.isInteger(timestampSeconds) ||
        timestampSeconds <= 0
    ) {
        return '19700101';
    }

    const shiftedDate = new Date(
        (timestampSeconds + SHANGHAI_OFFSET_SECONDS) * 1000
    );
    const year = shiftedDate.getUTCFullYear();
    const month = String(shiftedDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(shiftedDate.getUTCDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

function getShanghaiDayStartUnixSeconds(serviceDate) {
    if (!/^\d{8}$/.test(serviceDate)) {
        return 0;
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
    if (offset === null) {
        return null;
    }

    return getShanghaiDayStartUnixSeconds(serviceDate) + offset;
}

function parseTimetableSummary(rawJson) {
    const parsed = JSON.parse(rawJson);
    const rawStops = Array.isArray(parsed?.stops) ? parsed.stops : [];
    const stops = rawStops
        .map((stop) => {
            if (typeof stop !== 'object' || stop === null) {
                return null;
            }

            const stationNo = normalizeOptionalInteger(stop.stationNo);
            const stationName = normalizeOptionalText(stop.stationName);
            if (stationNo === null || stationName.length === 0) {
                return null;
            }

            return {
                stationNo,
                stationName,
                arriveAt: normalizeOptionalInteger(stop.arriveAt),
                departAt: normalizeOptionalInteger(stop.departAt)
            };
        })
        .filter((stop) => stop !== null)
        .sort((left, right) => left.stationNo - right.stationNo);

    const firstStop = stops[0] ?? null;
    const lastStop = stops[stops.length - 1] ?? null;

    return {
        startStation: firstStop?.stationName ?? null,
        endStation: lastStop?.stationName ?? null,
        startOffset: firstStop?.departAt ?? firstStop?.arriveAt ?? null,
        endOffset: lastStop?.arriveAt ?? lastStop?.departAt ?? null
    };
}

function createTimetableResolver(timetableDb) {
    const selectCoverageByTrainCodeAtDate = timetableDb.prepare(
        loadSql(
            'assets/sql/timetable-history/queries/selectCoverageByTrainCodeAtDate.sql'
        )
    );
    const selectLatestCoverageByTrainCode = timetableDb.prepare(
        loadSql(
            'assets/sql/timetable-history/queries/selectLatestCoverageByTrainCode.sql'
        )
    );
    const selectContentById = timetableDb.prepare(
        loadSql('assets/sql/timetable-history/queries/selectContentById.sql')
    );
    const contentSummaryCache = new Map();

    function getExactCoverage(trainCode, serviceDate) {
        return (
            selectCoverageByTrainCodeAtDate.get(
                normalizeCode(trainCode),
                Number.parseInt(serviceDate, 10),
                Number.parseInt(serviceDate, 10)
            ) ?? null
        );
    }

    function getLatestCoverage(trainCode) {
        return (
            selectLatestCoverageByTrainCode.get(normalizeCode(trainCode)) ??
            null
        );
    }

    function getContentSummary(contentId) {
        if (!Number.isInteger(contentId) || contentId <= 0) {
            return null;
        }

        const cached = contentSummaryCache.get(contentId);
        if (cached !== undefined) {
            return cached;
        }

        const row = selectContentById.get(contentId) ?? null;
        if (!row) {
            contentSummaryCache.set(contentId, null);
            return null;
        }

        const summary = parseTimetableSummary(row.timetable_json);
        contentSummaryCache.set(contentId, summary);
        return summary;
    }

    function doesLatestCoverageMatchLegacyDailyRow(
        serviceDate,
        contentId,
        row
    ) {
        const summary = getContentSummary(contentId);
        if (!summary) {
            return false;
        }

        return (
            normalizeOptionalText(summary.startStation) ===
                normalizeOptionalText(row.start_station_name) &&
            normalizeOptionalText(summary.endStation) ===
                normalizeOptionalText(row.end_station_name) &&
            buildAbsoluteTimestamp(serviceDate, summary.startOffset) ===
                row.start_at &&
            buildAbsoluteTimestamp(serviceDate, summary.endOffset) ===
                row.end_at
        );
    }

    function resolveDailyRowTimetable(row) {
        const serviceDate = formatShanghaiDateStringFromUnixSeconds(
            row.start_at
        );
        const exactCoverage = getExactCoverage(row.train_code, serviceDate);
        if (exactCoverage) {
            return {
                serviceDate,
                timetableId: exactCoverage.content_id,
                resolution: 'exact'
            };
        }

        const latestCoverage = getLatestCoverage(row.train_code);
        if (
            latestCoverage &&
            doesLatestCoverageMatchLegacyDailyRow(
                serviceDate,
                latestCoverage.content_id,
                row
            )
        ) {
            return {
                serviceDate,
                timetableId: latestCoverage.content_id,
                resolution: 'fallback'
            };
        }

        return {
            serviceDate,
            timetableId: null,
            resolution: 'unresolved'
        };
    }

    return {
        resolveDailyRowTimetable
    };
}

function detectSchema(columnNames, currentColumns, legacyColumns) {
    const hasCurrentColumns = currentColumns.every((name) =>
        columnNames.has(name)
    );
    const hasLegacyColumns = legacyColumns.every((name) =>
        columnNames.has(name)
    );

    if (hasLegacyColumns) {
        return 'legacy';
    }

    if (hasCurrentColumns) {
        return 'current';
    }

    if (columnNames.size === 0) {
        return 'missing';
    }

    return 'unknown';
}

function createTableSummary(schema, backupExists) {
    return {
        schema,
        backupExists,
        scannedRows: 0,
        rebuiltRows: 0,
        exactMatches: 0,
        fallbackMatches: 0,
        unresolvedRows: 0,
        deduplicatedRows: 0
    };
}

function assertFileExists(filePath, label) {
    if (!existsSync(filePath)) {
        throw new Error(`${label} does not exist: ${filePath}`);
    }
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const configDbPaths = loadConfigDatabasePaths(options.configPath);
    const emuDbPath =
        options.emuDbPath.length > 0
            ? options.emuDbPath
            : configDbPaths.emuDbPath;
    const timetableDbPath =
        options.timetableDbPath.length > 0
            ? options.timetableDbPath
            : configDbPaths.timetableDbPath;

    assertFileExists(emuDbPath, 'EMUTracked database');
    assertFileExists(timetableDbPath, 'Timetable history database');

    const emuDb = new Database(emuDbPath);
    const timetableDb = new Database(timetableDbPath, { readonly: true });
    emuDb.pragma('foreign_keys = ON');
    emuDb.pragma('journal_mode = WAL');
    timetableDb.pragma('foreign_keys = ON');

    const selectDailyColumns = emuDb.prepare(
        loadSql('assets/sql/emu/migrations/selectDailyEmuRoutesColumns.sql')
    );
    const selectTableExists = emuDb.prepare(
        loadSql('assets/sql/emu/migrations/selectTableExists.sql')
    );

    try {
        const dailyColumnNames = new Set(
            selectDailyColumns.all().map((row) => row.name)
        );
        const dailySchema = detectSchema(
            dailyColumnNames,
            ['service_date', 'timetable_id'],
            ['start_station_name', 'end_station_name', 'start_at', 'end_at']
        );
        const dailyBackupExists =
            (selectTableExists.get(DAILY_LEGACY_BACKUP_TABLE) ?? null) !== null;

        const summary = {
            mode: options.apply ? 'apply' : 'dry-run',
            configPath: options.configPath,
            emuDbPath,
            timetableDbPath,
            tables: {
                dailyEmuRoutes: createTableSummary(
                    dailySchema,
                    dailyBackupExists
                )
            }
        };

        const resolver = createTimetableResolver(timetableDb);

        if (dailySchema === 'legacy') {
            throw new Error(
                'Unsupported legacy daily_emu_routes schema: this script was retired for ' +
                    'pre-v2 storage schemas (train_code/emu_code/start_at). Use ' +
                    'scripts/migrate-emu-storage-v2.mjs on the old database first, then run ' +
                    'this script against the current schema.'
            );
        }

        if (options.apply) {
            if (dailySchema === 'unknown') {
                throw new Error(
                    'Cannot apply migration because one or more source tables use an unknown schema.'
                );
            }

            if (dailySchema === 'missing') {
                throw new Error(
                    'Cannot apply migration because one or more source tables are missing.'
                );
            }
        }

        console.log(JSON.stringify(summary, null, 2));
    } finally {
        timetableDb.close();
        emuDb.close();
    }
}

try {
    main();
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Historical timetable link rebuild failed: ${message}`);
    process.exit(1);
}
