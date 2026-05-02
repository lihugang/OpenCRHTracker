import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_CONFIG_PATH = 'data/config.json';
const DAILY_LEGACY_BACKUP_TABLE = 'daily_emu_routes_legacy_pre_timetable_id';
const PROBE_LEGACY_BACKUP_TABLE = 'probe_status_legacy_pre_timetable_id';
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
        typeof databases?.EMUTracked === 'string' ? databases.EMUTracked : '';
    const timetableDbPath =
        typeof databases?.timetableHistory === 'string'
            ? databases.timetableHistory
            : '';

    if (emuDbPath.length === 0 || timetableDbPath.length === 0) {
        throw new Error(
            `Config file is missing database paths: ${configPath}`
        );
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
        return selectLatestCoverageByTrainCode.get(normalizeCode(trainCode)) ?? null;
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

    function doesLatestCoverageMatchLegacyDailyRow(serviceDate, contentId, row) {
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
            buildAbsoluteTimestamp(serviceDate, summary.endOffset) === row.end_at
        );
    }

    function resolveDailyRowTimetable(row) {
        const serviceDate = formatShanghaiDateStringFromUnixSeconds(row.start_at);
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

    function resolveProbeRowTimetable(row) {
        const serviceDate = formatShanghaiDateStringFromUnixSeconds(row.start_at);
        const exactCoverage = getExactCoverage(row.train_code, serviceDate);
        return {
            serviceDate,
            timetableId: exactCoverage?.content_id ?? null,
            resolution: exactCoverage ? 'exact' : 'unresolved'
        };
    }

    return {
        resolveDailyRowTimetable,
        resolveProbeRowTimetable
    };
}

function detectSchema(columnNames, currentColumns, legacyColumns) {
    const hasCurrentColumns = currentColumns.every((name) => columnNames.has(name));
    const hasLegacyColumns = legacyColumns.every((name) => columnNames.has(name));

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

function buildRowKey(row) {
    return [
        row.train_code,
        row.emu_code,
        row.service_date,
        row.timetable_id === null ? 'null' : String(row.timetable_id)
    ].join('|');
}

function buildLegacyStartAtKey(trainCode, emuCode, startAt) {
    return [normalizeCode(trainCode), normalizeCode(emuCode), String(startAt)].join(
        '|'
    );
}

function migrateLegacyDailyRows(legacyRows, resolver) {
    const rowByBusinessKey = new Map();
    const timetableIdByLegacyStartAtKey = new Map();
    const summary = createTableSummary('legacy', false);

    for (const row of legacyRows) {
        summary.scannedRows += 1;

        const resolved = resolver.resolveDailyRowTimetable(row);
        if (resolved.resolution === 'exact') {
            summary.exactMatches += 1;
        } else if (resolved.resolution === 'fallback') {
            summary.fallbackMatches += 1;
        } else {
            summary.unresolvedRows += 1;
        }

        const migratedRow = {
            id: row.id,
            train_code: normalizeCode(row.train_code),
            emu_code: normalizeCode(row.emu_code),
            service_date: resolved.serviceDate,
            timetable_id: resolved.timetableId
        };
        const businessKey = buildRowKey(migratedRow);
        const existingRow = rowByBusinessKey.get(businessKey);
        if (!existingRow || migratedRow.id >= existingRow.id) {
            rowByBusinessKey.set(businessKey, migratedRow);
        }

        if (resolved.timetableId !== null) {
            const legacyStartAtKey = buildLegacyStartAtKey(
                row.train_code,
                row.emu_code,
                row.start_at
            );
            const existingResolved = timetableIdByLegacyStartAtKey.get(
                legacyStartAtKey
            );
            if (
                !existingResolved ||
                row.id >= existingResolved.sourceRowId
            ) {
                timetableIdByLegacyStartAtKey.set(legacyStartAtKey, {
                    sourceRowId: row.id,
                    timetableId: resolved.timetableId
                });
            }
        }
    }

    summary.rebuiltRows = rowByBusinessKey.size;
    summary.deduplicatedRows = summary.scannedRows - summary.rebuiltRows;
    return {
        rows: [...rowByBusinessKey.values()].sort((left, right) => left.id - right.id),
        summary,
        timetableIdByLegacyStartAtKey: new Map(
            [...timetableIdByLegacyStartAtKey.entries()].map(([key, value]) => [
                key,
                value.timetableId
            ])
        )
    };
}

function migrateLegacyProbeRows(
    legacyRows,
    resolver,
    dailyFallbackTimetableIdByLegacyStartAtKey = new Map()
) {
    const rowByBusinessKey = new Map();
    const summary = createTableSummary('legacy', false);

    for (const row of legacyRows) {
        summary.scannedRows += 1;

        let resolved = resolver.resolveProbeRowTimetable(row);
        if (resolved.resolution === 'unresolved') {
            const fallbackTimetableId =
                dailyFallbackTimetableIdByLegacyStartAtKey.get(
                    buildLegacyStartAtKey(row.train_code, row.emu_code, row.start_at)
                ) ?? null;
            if (fallbackTimetableId !== null) {
                resolved = {
                    ...resolved,
                    timetableId: fallbackTimetableId,
                    resolution: 'fallback'
                };
            }
        }

        if (resolved.resolution === 'exact') {
            summary.exactMatches += 1;
        } else if (resolved.resolution === 'fallback') {
            summary.fallbackMatches += 1;
        } else {
            summary.unresolvedRows += 1;
        }

        const migratedRow = {
            id: row.id,
            train_code: normalizeCode(row.train_code),
            emu_code: normalizeCode(row.emu_code),
            service_date: resolved.serviceDate,
            timetable_id: resolved.timetableId,
            status: row.status
        };
        const businessKey = buildRowKey(migratedRow);
        const existingRow = rowByBusinessKey.get(businessKey);
        if (!existingRow || migratedRow.id >= existingRow.id) {
            rowByBusinessKey.set(businessKey, migratedRow);
        }
    }

    summary.rebuiltRows = rowByBusinessKey.size;
    summary.deduplicatedRows = summary.scannedRows - summary.rebuiltRows;
    return {
        rows: [...rowByBusinessKey.values()].sort((left, right) => left.id - right.id),
        summary
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
        options.emuDbPath.length > 0 ? options.emuDbPath : configDbPaths.emuDbPath;
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
    const selectProbeColumns = emuDb.prepare(
        loadSql('assets/sql/emu/migrations/selectProbeStatusColumns.sql')
    );
    const selectTableExists = emuDb.prepare(
        loadSql('assets/sql/emu/migrations/selectTableExists.sql')
    );

    try {
        const dailyColumnNames = new Set(
            selectDailyColumns.all().map((row) => row.name)
        );
        const probeColumnNames = new Set(
            selectProbeColumns.all().map((row) => row.name)
        );
        const dailySchema = detectSchema(
            dailyColumnNames,
            ['service_date', 'timetable_id'],
            ['start_station_name', 'end_station_name', 'start_at', 'end_at']
        );
        const probeSchema = detectSchema(
            probeColumnNames,
            ['service_date', 'timetable_id', 'status'],
            ['start_at', 'status']
        );
        const dailyBackupExists =
            (selectTableExists.get(DAILY_LEGACY_BACKUP_TABLE) ?? null) !== null;
        const probeBackupExists =
            (selectTableExists.get(PROBE_LEGACY_BACKUP_TABLE) ?? null) !== null;

        const summary = {
            mode: options.apply ? 'apply' : 'dry-run',
            configPath: options.configPath,
            emuDbPath,
            timetableDbPath,
            tables: {
                dailyEmuRoutes: createTableSummary(
                    dailySchema,
                    dailyBackupExists
                ),
                probeStatus: createTableSummary(probeSchema, probeBackupExists)
            }
        };

        const resolver = createTimetableResolver(timetableDb);
        let migratedDailyRows = [];
        let migratedProbeRows = [];
        let dailyFallbackTimetableIdByLegacyStartAtKey = new Map();

        if (dailySchema === 'legacy') {
            const selectLegacyDailyRows = emuDb.prepare(
                loadSql(
                    'assets/sql/emu/migrations/selectLegacyDailyEmuRoutesRows.sql'
                )
            );
            const result = migrateLegacyDailyRows(
                selectLegacyDailyRows.all(),
                resolver
            );
            migratedDailyRows = result.rows;
            dailyFallbackTimetableIdByLegacyStartAtKey =
                result.timetableIdByLegacyStartAtKey;
            summary.tables.dailyEmuRoutes = {
                ...summary.tables.dailyEmuRoutes,
                ...result.summary,
                backupExists: dailyBackupExists
            };
        }

        if (probeSchema === 'legacy') {
            const selectLegacyProbeRows = emuDb.prepare(
                loadSql(
                    'assets/sql/emu/migrations/selectLegacyProbeStatusRows.sql'
                )
            );
            const result = migrateLegacyProbeRows(
                selectLegacyProbeRows.all(),
                resolver,
                dailyFallbackTimetableIdByLegacyStartAtKey
            );
            migratedProbeRows = result.rows;
            summary.tables.probeStatus = {
                ...summary.tables.probeStatus,
                ...result.summary,
                backupExists: probeBackupExists
            };
        }

        if (options.apply) {
            if (dailySchema === 'unknown' || probeSchema === 'unknown') {
                throw new Error(
                    'Cannot apply migration because one or more source tables use an unknown schema.'
                );
            }

            if (dailySchema === 'missing' || probeSchema === 'missing') {
                throw new Error(
                    'Cannot apply migration because one or more source tables are missing.'
                );
            }

            if (dailySchema === 'legacy' && dailyBackupExists) {
                throw new Error(
                    `Backup table already exists: ${DAILY_LEGACY_BACKUP_TABLE}`
                );
            }

            if (probeSchema === 'legacy' && probeBackupExists) {
                throw new Error(
                    `Backup table already exists: ${PROBE_LEGACY_BACKUP_TABLE}`
                );
            }

            if (dailySchema === 'legacy' || probeSchema === 'legacy') {
                const renameDailyTableSql = loadSql(
                    'assets/sql/emu/migrations/renameDailyEmuRoutesToLegacyBackup.sql'
                );
                const renameProbeTableSql = loadSql(
                    'assets/sql/emu/migrations/renameProbeStatusToLegacyBackup.sql'
                );
                const createDailyTableSql = loadSql(
                    'assets/sql/emu/schema/createDailyEmuRoutesTable.sql'
                );
                const createProbeTableSql = loadSql(
                    'assets/sql/emu/schema/createProbeStatusTable.sql'
                );
                const applyMigration = emuDb.transaction(() => {
                    if (dailySchema === 'legacy') {
                        emuDb.exec(renameDailyTableSql);
                        emuDb.exec(createDailyTableSql);
                        const insertMigratedDailyRow = emuDb.prepare(
                            loadSql(
                                'assets/sql/emu/migrations/insertMigratedDailyEmuRouteRow.sql'
                            )
                        );
                        for (const row of migratedDailyRows) {
                            insertMigratedDailyRow.run(
                                row.id,
                                row.train_code,
                                row.emu_code,
                                row.service_date,
                                row.timetable_id
                            );
                        }
                    }

                    if (probeSchema === 'legacy') {
                        emuDb.exec(renameProbeTableSql);
                        emuDb.exec(createProbeTableSql);
                        const insertMigratedProbeRow = emuDb.prepare(
                            loadSql(
                                'assets/sql/emu/migrations/insertMigratedProbeStatusRow.sql'
                            )
                        );
                        for (const row of migratedProbeRows) {
                            insertMigratedProbeRow.run(
                                row.id,
                                row.train_code,
                                row.emu_code,
                                row.service_date,
                                row.timetable_id,
                                row.status
                            );
                        }
                    }
                });

                applyMigration();
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
    console.error(
        `Historical timetable link rebuild failed: ${message}`
    );
    process.exit(1);
}
