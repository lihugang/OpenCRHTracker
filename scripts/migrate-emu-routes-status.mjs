#!/usr/bin/env node

// One-time migration: move probe status onto daily_emu_routes.status,
// rebuild the EMU table, drop probe_status, and reset train provenance.
//
// Usage:
//   node scripts/migrate-emu-routes-status.mjs [--today YYYYMMDD] [--apply] [--db <path>]
//   node scripts/migrate-emu-routes-status.mjs [--today YYYYMMDD] [--apply] [--db <path>] [--provenance-db <path>]
//
// Without --apply the script performs a dry-run only.
// Dry-run executes the rebuild against a temporary SQLite backup and never
// modifies the configured source databases.
// The application and every task worker must be stopped before --apply.

import Database from 'better-sqlite3';
import {
    existsSync,
    mkdtempSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    rmSync,
    unlinkSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const DEFAULT_CONFIG_PATH = 'data/config.json';
const SHANGHAI_OFFSET_SECONDS = 8 * 60 * 60;
const DAY_SECONDS = 24 * 60 * 60;
const EPOCH_SERVICE_DAY_START_SECONDS =
    Date.UTC(1970, 0, 1, 0, 0, 0) / 1000 - SHANGHAI_OFFSET_SECONDS;
const EXPECTED_ROUTE_INDEXES = [
    'idx_daily_emu_routes_train_emu_service_timetable_resolved',
    'idx_daily_emu_routes_train_emu_service_unresolved',
    'idx_daily_emu_routes_train_service',
    'idx_daily_emu_routes_emu_service',
    'idx_daily_emu_routes_service_id',
    'idx_daily_emu_routes_timetable_id'
];

function printHelp() {
    console.log(`Usage: node scripts/migrate-emu-routes-status.mjs [options]

Options:
    --today YYYYMMDD    Frozen service date for the current-day probe mapping.
                        Defaults to the Asia/Shanghai date at script start.
                        Production runs must pass it explicitly.
    --apply             Apply the migration. Without this flag the script runs
                        the rebuild on a temporary database backup and leaves
                        the configured source databases unchanged.
    --db <path>         EMUTracked SQLite database path. Defaults to
                        data.databases.EMUTracked.path in data/config.json.
    --provenance-db <path>
                        Train provenance SQLite database path. Defaults to
                        data.databases.trainProvenance.path in data/config.json.
    --help              Show this message.

Run only while the application and all task workers are stopped.
`);
}

function parseArgs(argv) {
    const options = {
        today: '',
        apply: false,
        dbPath: '',
        provenanceDbPath: ''
    };

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--apply') {
            options.apply = true;
            continue;
        }
        if (argument === '--today') {
            const value = argv[index + 1];
            if (typeof value !== 'string' || !/^\d{8}$/.test(value)) {
                throw new Error('--today must be followed by YYYYMMDD');
            }
            options.today = value;
            index += 1;
            continue;
        }
        if (argument === '--db') {
            const value = argv[index + 1];
            if (typeof value !== 'string' || value.length === 0) {
                throw new Error('--db must be followed by a database path');
            }
            options.dbPath = resolve(repoRoot, value);
            index += 1;
            continue;
        }
        if (argument === '--provenance-db') {
            const value = argv[index + 1];
            if (typeof value !== 'string' || value.length === 0) {
                throw new Error(
                    '--provenance-db must be followed by a database path'
                );
            }
            options.provenanceDbPath = resolve(repoRoot, value);
            index += 1;
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

function loadConfig(configPath) {
    if (!existsSync(configPath)) {
        throw new Error(`Config file does not exist: ${configPath}`);
    }
    return JSON.parse(readUtf8File(configPath));
}

function getShanghaiToday() {
    const shifted = new Date(Date.now() + SHANGHAI_OFFSET_SECONDS * 1000);
    const year = shifted.getUTCFullYear();
    const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const day = String(shifted.getUTCDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

function serviceDateToDayNumber(serviceDate) {
    if (!/^\d{8}$/.test(serviceDate)) {
        throw new Error(`invalid_service_date ${serviceDate}`);
    }
    const year = Number(serviceDate.slice(0, 4));
    const month = Number(serviceDate.slice(4, 6));
    const dayOfMonth = Number(serviceDate.slice(6, 8));
    const calendarDate = new Date(Date.UTC(year, month - 1, dayOfMonth));
    if (
        calendarDate.getUTCFullYear() !== year ||
        calendarDate.getUTCMonth() + 1 !== month ||
        calendarDate.getUTCDate() !== dayOfMonth
    ) {
        throw new Error(`invalid_service_date ${serviceDate}`);
    }
    const dayStart =
        Math.floor(Date.UTC(year, month - 1, dayOfMonth) / 1000) -
        SHANGHAI_OFFSET_SECONDS;
    return Math.floor(
        (dayStart - EPOCH_SERVICE_DAY_START_SECONDS) / DAY_SECONDS
    );
}

function dayNumberToServiceDate(dayNumber) {
    const timestampMs =
        (EPOCH_SERVICE_DAY_START_SECONDS + dayNumber * DAY_SECONDS) * 1000;
    const shifted = new Date(timestampMs + SHANGHAI_OFFSET_SECONDS * 1000);
    const year = shifted.getUTCFullYear();
    const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const day = String(shifted.getUTCDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

function assertFileExists(filePath, label) {
    if (!existsSync(filePath)) {
        throw new Error(`${label} does not exist: ${filePath}`);
    }
}

function buildRouteGroupKey(row) {
    return [
        row.train_prefix,
        row.train_number,
        row.service_date,
        row.timetable_id === null ? 'null' : String(row.timetable_id)
    ].join('|');
}

function groupRows(rows) {
    const groups = new Map();
    for (const row of rows) {
        const key = buildRouteGroupKey(row);
        const group = groups.get(key) ?? [];
        group.push(row);
        groups.set(key, group);
    }
    return groups;
}

function distinctEmuCount(rows) {
    return new Set(rows.map((row) => Number(row.emu_id))).size;
}

function maxNumber(values) {
    let maximum = 0;
    for (const value of values) {
        if (value > maximum) {
            maximum = value;
        }
    }
    return maximum;
}

function resolveTodayGroupStatus(probeRows) {
    if (probeRows.some((row) => row.status === 3)) {
        return { status: 0x03, source: 'probe_coupled' };
    }
    if (probeRows.some((row) => row.status === 2)) {
        return { status: 0x01, source: 'probe_single' };
    }
    if (probeRows.some((row) => row.status === 1)) {
        return { status: 0x00, source: 'probe_pending' };
    }
    return null;
}

function fallbackTodayGroupStatus(rows) {
    return distinctEmuCount(rows) > 1 ? 0x02 : 0x00;
}

function historicalGroupStatus(rows) {
    return distinctEmuCount(rows) > 1 ? 0x03 : 0x01;
}

function isSingleStatus(status) {
    return status === 0x00 || status === 0x01;
}

function createDaySummary(serviceDate) {
    return {
        serviceDate,
        scannedRows: 0,
        updatedRows: 0,
        singleGroups: 0,
        singleRows: 0,
        coupledGroups: 0,
        coupledRows: 0,
        missingCurrentDayMappings: 0,
        fallbackGroups: 0,
        fallbackRows: 0,
        anomalies: 0
    };
}

function planDay(serviceDate, routeRows, probeRows, isToday) {
    const summary = createDaySummary(serviceDate);
    summary.scannedRows = routeRows.length;

    const probeGroups = groupRows(probeRows);
    const routeGroups = groupRows(routeRows);
    const updates = [];

    for (const group of routeGroups.values()) {
        let status;
        let source;
        if (isToday) {
            const groupProbeRows = probeGroups.get(
                buildRouteGroupKey(group[0])
            );
            if (!groupProbeRows || groupProbeRows.length === 0) {
                summary.missingCurrentDayMappings += 1;
                status = fallbackTodayGroupStatus(group);
                source = 'fallback';
                summary.fallbackGroups += 1;
                summary.fallbackRows += group.length;
            } else {
                const resolved = resolveTodayGroupStatus(groupProbeRows);
                if (resolved === null) {
                    summary.anomalies += 1;
                    status = fallbackTodayGroupStatus(group);
                    source = 'fallback_invalid_probe';
                    summary.fallbackGroups += 1;
                    summary.fallbackRows += group.length;
                } else {
                    status = resolved.status;
                    source = resolved.source;
                }
            }
        } else {
            status = historicalGroupStatus(group);
            source = 'historical_inference';
        }

        if (isSingleStatus(status)) {
            summary.singleGroups += 1;
            summary.singleRows += group.length;
        } else {
            summary.coupledGroups += 1;
            summary.coupledRows += group.length;
        }

        for (const row of group) {
            updates.push({
                id: row.id,
                train_prefix: row.train_prefix,
                train_number: row.train_number,
                emu_id: row.emu_id,
                service_date: row.service_date,
                timetable_id: row.timetable_id,
                status,
                source
            });
            summary.updatedRows += 1;
        }
    }

    if (routeRows.length === 0 && isToday) {
        summary.missingCurrentDayMappings = 0;
    }

    return { summary, updates };
}

function detectDailySchema(db) {
    const selectColumns = db.prepare(
        loadSql('assets/sql/emu/migrations/selectDailyEmuRoutesColumns.sql')
    );
    return new Set(selectColumns.all().map((row) => row.name));
}

function tableExists(db, tableName) {
    const selectTableExists = db.prepare(
        loadSql('assets/sql/emu/migrations/selectTableExists.sql')
    );
    return selectTableExists.get(tableName) !== undefined;
}

function loadAllRouteDays(db) {
    const selectDays = db.prepare(
        loadSql(
            'assets/sql/emu/migrations/selectAllDailyEmuRouteServiceDaysForMigration.sql'
        )
    );
    return selectDays.all().map((row) => row.service_date);
}

function loadProbeDays(db) {
    const selectDays = db.prepare(
        loadSql(
            'assets/sql/emu/migrations/selectOldProbeStatusServiceDaysForMigration.sql'
        )
    );
    return selectDays.all().map((row) => row.service_date);
}

function verifyOldTableHealth(db) {
    const selectIds = db.prepare(
        loadSql(
            'assets/sql/emu/migrations/selectDailyEmuRouteIdsForMigration.sql'
        )
    );
    const selectDuplicates = db.prepare(
        loadSql(
            'assets/sql/emu/migrations/selectDuplicateRouteIdentitiesForMigration.sql'
        )
    );
    return {
        routeIds: new Set(selectIds.all().map((row) => Number(row.id))),
        duplicateIdentities: selectDuplicates.all().length
    };
}

function prepareVerification(db) {
    return {
        selectOldCount: db.prepare(
            loadSql(
                'assets/sql/emu/migrations/selectDailyEmuRouteCountForMigration.sql'
            )
        ),
        selectOldIds: db.prepare(
            loadSql(
                'assets/sql/emu/migrations/selectDailyEmuRouteIdsForMigration.sql'
            )
        ),
        selectDuplicates: db.prepare(
            loadSql(
                'assets/sql/emu/migrations/selectDuplicateRouteIdentitiesForMigration.sql'
            )
        ),
        foreignKeyCheck: db.prepare(
            loadSql('assets/sql/emu/migrations/foreignKeyCheckForMigration.sql')
        ),
        integrityCheck: db.prepare(
            loadSql('assets/sql/emu/migrations/integrityCheckForMigration.sql')
        ),
        selectIndexes: db.prepare(
            loadSql(
                'assets/sql/emu/migrations/selectExpectedRouteIndexesForMigration.sql'
            )
        )
    };
}

function prepareTempVerification(db) {
    return {
        selectNewCount: db.prepare(
            loadSql(
                'assets/sql/emu/migrations/selectMigratedDailyEmuRouteCountForMigration.sql'
            )
        ),
        selectNewIds: db.prepare(
            loadSql(
                'assets/sql/emu/migrations/selectMigratedDailyEmuRouteIdsForMigration.sql'
            )
        ),
        selectInvalidStatuses: db.prepare(
            loadSql(
                'assets/sql/emu/migrations/selectInvalidMigratedDailyEmuRouteStatusCountForMigration.sql'
            )
        )
    };
}

function runSchemaRebuild(db) {
    const dropOldTableSql = loadSql(
        'assets/sql/emu/migrations/dropDailyEmuRoutesForMigration.sql'
    );
    const renameTableSql = loadSql(
        'assets/sql/emu/migrations/renameMigratedDailyEmuRoutesForMigration.sql'
    );
    const createIndexesSql = loadSql(
        'assets/sql/emu/schema/createDailyEmuRoutesTable.sql'
    );
    const deleteSequence = db.prepare(
        loadSql(
            'assets/sql/emu/migrations/deleteSqliteSequenceForMigration.sql'
        )
    );
    const insertSequence = db.prepare(
        loadSql(
            'assets/sql/emu/migrations/insertSqliteSequenceForMigration.sql'
        )
    );
    const statements = prepareVerification(db);
    const tempStatements = prepareTempVerification(db);

    const rebuildTransaction = db.transaction(() => {
        const oldCount = statements.selectOldCount.get().row_count;
        const newCount = tempStatements.selectNewCount.get().row_count;
        if (oldCount !== newCount) {
            throw new Error(
                `route_row_count_mismatch old=${oldCount} new=${newCount}`
            );
        }

        const oldIds = new Set(
            statements.selectOldIds.all().map((row) => Number(row.id))
        );
        const newIds = new Set(
            tempStatements.selectNewIds.all().map((row) => Number(row.id))
        );
        if (oldIds.size !== newIds.size) {
            throw new Error(
                `route_id_set_size_mismatch old=${oldIds.size} new=${newIds.size}`
            );
        }
        for (const id of oldIds) {
            if (!newIds.has(id)) {
                throw new Error(`route_id_missing_in_new_table id=${id}`);
            }
        }
        for (const id of newIds) {
            if (!oldIds.has(id)) {
                throw new Error(`unexpected_route_id_in_new_table id=${id}`);
            }
        }

        const invalidStatuses =
            tempStatements.selectInvalidStatuses.get().invalid_count;
        if (invalidStatuses !== 0) {
            throw new Error(`invalid_route_statuses count=${invalidStatuses}`);
        }

        db.exec(dropOldTableSql);
        db.exec(renameTableSql);
        db.exec(createIndexesSql);

        const maxRouteId = maxNumber(newIds);
        deleteSequence.run('daily_emu_routes');
        insertSequence.run('daily_emu_routes', maxRouteId);
    });

    rebuildTransaction();
}

function collectVerificationResults(db) {
    const statements = prepareVerification(db);
    const invalidStatusCount = db
        .prepare(
            loadSql(
                'assets/sql/emu/migrations/selectInvalidDailyEmuRouteStatusCountForMigration.sql'
            )
        )
        .get().invalid_count;
    const rowCount = statements.selectOldCount.get().row_count;
    const duplicateIdentities = statements.selectDuplicates.all().length;
    const foreignKeyViolations = statements.foreignKeyCheck.all();
    const integrityResult = statements.integrityCheck.all();
    const indexNames = new Set(
        statements.selectIndexes.all().map((row) => row.name)
    );
    const missingIndexes = EXPECTED_ROUTE_INDEXES.filter(
        (name) => !indexNames.has(name)
    );
    const sequenceRow = db
        .prepare(
            loadSql(
                'assets/sql/emu/migrations/selectSqliteSequenceValueForMigration.sql'
            )
        )
        .get('daily_emu_routes');
    const maxRouteId = maxNumber(
        db
            .prepare(
                loadSql(
                    'assets/sql/emu/migrations/selectDailyEmuRouteIdsForMigration.sql'
                )
            )
            .all()
            .map((row) => Number(row.id))
    );
    const sequenceValue = sequenceRow?.seq ?? null;

    return {
        routeRowCount: rowCount,
        invalidStatusCount,
        duplicateRouteIdentities: duplicateIdentities,
        foreignKeyCheckPassed: foreignKeyViolations.length === 0,
        integrityCheckPassed:
            integrityResult.length === 1 &&
            integrityResult[0].integrity_check === 'ok',
        expectedIndexesPresent: missingIndexes.length === 0,
        missingIndexes,
        sqliteSequenceValid:
            sequenceValue === maxRouteId ||
            (rowCount === 0 && (sequenceValue === null || sequenceValue === 0))
    };
}

function formatStatusDistribution(entries) {
    const distribution = new Map([
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0]
    ]);
    for (const [status, count] of entries) {
        distribution.set(Number(status), Number(count));
    }
    return Object.fromEntries(
        Array.from(distribution.entries())
            .sort(([left], [right]) => left - right)
            .map(([status, count]) => [String(status), count])
    );
}

function collectStoredStatusDistribution(db) {
    return formatStatusDistribution(
        db
            .prepare(
                loadSql(
                    'assets/sql/emu/migrations/selectDailyEmuRouteStatusDistributionForMigration.sql'
                )
            )
            .all()
            .map((row) => [row.status, row.row_count])
    );
}

async function resumeIncompleteApply(
    db,
    today,
    emuDbPath,
    provenanceDbPath,
    provenanceReport
) {
    const verification = collectVerificationResults(db);
    if (
        verification.invalidStatusCount !== 0 ||
        verification.duplicateRouteIdentities !== 0 ||
        !verification.foreignKeyCheckPassed ||
        !verification.integrityCheckPassed ||
        !verification.expectedIndexesPresent ||
        !verification.sqliteSequenceValid
    ) {
        throw new Error(
            `incomplete_migration_resume_verification_failed ${JSON.stringify(verification)}`
        );
    }

    await backupProvenanceBeforeApply(provenanceDbPath, provenanceReport);
    resetProvenanceDatabase(provenanceDbPath, provenanceReport);
    db.exec(
        loadSql(
            'assets/sql/emu/migrations/dropProbeStatusTableForMigration.sql'
        )
    );
    const probeStatusDropped = !tableExists(db, 'probe_status');
    if (!probeStatusDropped) {
        throw new Error('probe_status_drop_failed');
    }

    console.log(
        JSON.stringify(
            {
                mode: 'apply-resume',
                today,
                emuDbPath,
                provenanceDbPath,
                totals: {
                    finalStatusDistribution: collectStoredStatusDistribution(db)
                },
                verification: {
                    ...verification,
                    statusesValid: true,
                    probeStatusDropped
                },
                provenance: provenanceReport
            },
            null,
            2
        )
    );
}

function resolveProvenancePaths(config, provenanceDbPath, explicitOverride) {
    const backupConfig = config?.data?.databases?.trainProvenance?.backup;
    const backupArea =
        !explicitOverride &&
        typeof backupConfig?.path === 'string' &&
        backupConfig.path.length > 0
            ? dirname(resolve(repoRoot, backupConfig.path))
            : dirname(provenanceDbPath);
    return {
        dbPath: provenanceDbPath,
        backupArea
    };
}

function listProvenanceTables(db) {
    const selectTableCount = db.prepare(
        loadSql(
            'assets/sql/emu/migrations/selectProvenanceTableCountForMigration.sql'
        )
    );
    return selectTableCount.get().table_count;
}

async function backupProvenanceDatabase(sourcePath, backupPath) {
    const sourceDb = new Database(sourcePath);
    let sourceTableCount;
    try {
        sourceTableCount = listProvenanceTables(sourceDb);
        await sourceDb.backup(backupPath);
    } finally {
        sourceDb.close();
    }

    const backupDb = new Database(backupPath, { readonly: true });
    try {
        return {
            sourceTableCount,
            backupTableCount: listProvenanceTables(backupDb)
        };
    } finally {
        backupDb.close();
    }
}

function deleteProvenanceFiles(dbPath) {
    for (const candidatePath of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
        if (existsSync(candidatePath)) {
            unlinkSync(candidatePath);
        }
    }
}

function recreateProvenanceDatabase(dbPath) {
    const schemaDir = resolve(repoRoot, 'assets/sql/train-provenance/schema');
    const schemaFiles = readdirSync(schemaDir)
        .filter((fileName) => fileName.endsWith('.sql'))
        .sort();

    const db = new Database(dbPath);
    try {
        db.pragma('foreign_keys = ON');
        db.pragma('journal_mode = WAL');
        for (const fileName of schemaFiles) {
            db.exec(readUtf8File(resolve(schemaDir, fileName)));
        }
        return {
            recreatedTableCount: listProvenanceTables(db),
            schemaFiles: schemaFiles.length
        };
    } finally {
        db.close();
    }
}

function buildProvenanceReport(config, provenanceDbPath, explicitOverride) {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    const timestamp =
        `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
        `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const paths = resolveProvenancePaths(
        config,
        provenanceDbPath,
        explicitOverride
    );
    return {
        dbPath: paths.dbPath,
        backupArea: paths.backupArea,
        backupPath: resolve(
            paths.backupArea,
            `train-provenance.pre-emu-route-status-${timestamp}.db`
        ),
        status: 'pending'
    };
}

async function backupProvenanceBeforeApply(provenanceDbPath, report) {
    assertFileExists(provenanceDbPath, 'Train provenance database');
    mkdirSync(report.backupArea, { recursive: true });

    const backupResult = await backupProvenanceDatabase(
        provenanceDbPath,
        report.backupPath
    );
    if (backupResult.sourceTableCount !== backupResult.backupTableCount) {
        throw new Error(
            `provenance_backup_table_count_mismatch source=${backupResult.sourceTableCount} backup=${backupResult.backupTableCount}`
        );
    }
    report.backupVerified = true;
    report.sourceTableCount = backupResult.sourceTableCount;
    report.backupTableCount = backupResult.backupTableCount;
    report.status = 'backed_up';
}

function resetProvenanceDatabase(provenanceDbPath, report) {
    assertFileExists(provenanceDbPath, 'Train provenance database');
    deleteProvenanceFiles(provenanceDbPath);
    const recreateResult = recreateProvenanceDatabase(provenanceDbPath);
    report.recreated = true;
    report.recreatedTableCount = recreateResult.recreatedTableCount;
    report.schemaFiles = recreateResult.schemaFiles;
    report.status = 'completed';
}

function printProminent(message) {
    console.log(`\n${'='.repeat(72)}`);
    console.log(message);
    console.log(`${'='.repeat(72)}\n`);
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const configPath = resolve(repoRoot, DEFAULT_CONFIG_PATH);
    const config = loadConfig(configPath);
    const configEmuDbPath = config?.data?.databases?.EMUTracked?.path;
    if (typeof configEmuDbPath !== 'string' || configEmuDbPath.length === 0) {
        throw new Error(
            `Config file is missing data.databases.EMUTracked.path: ${configPath}`
        );
    }
    const emuDbPath =
        options.dbPath.length > 0
            ? options.dbPath
            : resolve(repoRoot, configEmuDbPath);
    const today = options.today.length > 0 ? options.today : getShanghaiToday();
    const todayDayNumber = serviceDateToDayNumber(today);
    const configProvenanceDbPath =
        config?.data?.databases?.trainProvenance?.path;
    if (
        typeof configProvenanceDbPath !== 'string' ||
        configProvenanceDbPath.length === 0
    ) {
        throw new Error(
            `Config file is missing data.databases.trainProvenance.path: ${configPath}`
        );
    }
    const provenanceDbPath =
        options.provenanceDbPath.length > 0
            ? options.provenanceDbPath
            : resolve(repoRoot, configProvenanceDbPath);
    if (!existsSync(provenanceDbPath)) {
        throw new Error(
            `Train provenance database does not exist: ${provenanceDbPath}`
        );
    }

    printProminent(
        `FROZEN SERVICE DAY: ${today} (Asia/Shanghai)\n` +
            `EMU database: ${emuDbPath}\n` +
            `Provenance database: ${provenanceDbPath}\n` +
            `Mode: ${options.apply ? 'APPLY' : 'DRY-RUN'}\n` +
            `Requirement: application and task workers must be stopped.`
    );
    if (options.today.length === 0) {
        console.log(
            'Warning: --today was not passed explicitly; production runs should always pass it.\n'
        );
    }

    assertFileExists(emuDbPath, 'EMU database');
    let dryRunTempDir = null;
    let db;
    if (options.apply) {
        db = new Database(emuDbPath);
    } else {
        dryRunTempDir = mkdtempSync(
            join(tmpdir(), 'opencrh-emu-route-status-dry-run-')
        );
        const dryRunDbPath = join(dryRunTempDir, 'EMUTracked.db');
        const sourceDb = new Database(emuDbPath, { readonly: true });
        try {
            await sourceDb.backup(dryRunDbPath);
        } catch (error) {
            rmSync(dryRunTempDir, { recursive: true, force: true });
            dryRunTempDir = null;
            throw error;
        } finally {
            sourceDb.close();
        }
        db = new Database(dryRunDbPath);
        console.log(
            'Dry-run will execute the complete EMU rebuild on a temporary SQLite backup; configured source databases remain unchanged.\n'
        );
    }
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');

    const provenanceReport = buildProvenanceReport(
        config,
        provenanceDbPath,
        options.provenanceDbPath.length > 0
    );

    try {
        const dailyColumns = detectDailySchema(db);
        const hasStatusColumn = dailyColumns.has('status');
        const hasProbeStatusTable = tableExists(db, 'probe_status');

        if (hasStatusColumn) {
            if (options.apply && hasProbeStatusTable) {
                console.log(
                    'Detected an incomplete prior apply; validating the rebuilt EMU schema before resuming provenance reset and probe_status removal.\n'
                );
                await resumeIncompleteApply(
                    db,
                    today,
                    emuDbPath,
                    provenanceDbPath,
                    provenanceReport
                );
                return;
            }
            throw new Error(
                'daily_emu_routes.status already exists; migration already applied or database is already on the new schema.'
            );
        }
        if (!hasProbeStatusTable) {
            throw new Error(
                'probe_status table is missing; cannot migrate a database that has no old probe status source.'
            );
        }
        if (tableExists(db, 'daily_emu_routes_migrated_status')) {
            console.log(
                'Detected a stale daily_emu_routes migration stage from an interrupted run; dropping it before rebuilding.\n'
            );
            db.exec(
                loadSql(
                    'assets/sql/emu/migrations/dropMigratedDailyEmuRoutesStageForMigration.sql'
                )
            );
        }

        const discoveredRouteDays = loadAllRouteDays(db);
        const futureRouteDays = discoveredRouteDays.filter(
            (dayNumber) => dayNumber > todayDayNumber
        );
        if (futureRouteDays.length > 0) {
            throw new Error(
                `future_service_days_not_authorized serviceDates=${futureRouteDays.map(dayNumberToServiceDate).join(',')} today=${today}`
            );
        }
        const routeDays = Array.from(
            new Set([...discoveredRouteDays, todayDayNumber])
        ).sort((left, right) => left - right);
        const probeDays = loadProbeDays(db);
        const oldHealth = verifyOldTableHealth(db);
        const processedDays = new Set();
        const dayReports = [];
        const totalDays = routeDays.length;
        let totalUpdatedRows = 0;
        let totalSingleRows = 0;
        let totalCoupledRows = 0;
        let totalFallbackGroups = 0;
        let totalFallbackRows = 0;
        let totalMissingTodayMappings = 0;
        let orphanProbeRowsToday = 0;
        const plannedRouteIds = new Set();
        const finalStatusDistribution = new Map();

        const selectRouteRows = db.prepare(
            loadSql(
                'assets/sql/emu/migrations/selectDailyEmuRoutesByServiceDayForMigration.sql'
            )
        );
        const selectProbeRows = db.prepare(
            loadSql(
                'assets/sql/emu/migrations/selectOldProbeStatusRowsForMigration.sql'
            )
        );
        db.exec(
            loadSql(
                'assets/sql/emu/migrations/createDailyEmuRoutesWithStatusTable.sql'
            )
        );
        const insertMigratedStatusRow = db.prepare(
            loadSql(
                'assets/sql/emu/migrations/insertMigratedDailyEmuRouteStatusRowForMigration.sql'
            )
        );

        for (let dayIndex = 0; dayIndex < routeDays.length; dayIndex += 1) {
            const dayNumber = routeDays[dayIndex];
            const isToday = dayNumber === todayDayNumber;
            const routeRows = selectRouteRows.all(dayNumber);
            const probeRows = isToday ? selectProbeRows.all(dayNumber) : [];
            const plan = planDay(
                dayNumberToServiceDate(dayNumber),
                routeRows,
                probeRows,
                isToday
            );

            dayReports.push({
                dayIndex: dayIndex + 1,
                totalDays,
                ...plan.summary
            });
            processedDays.add(dayNumber);
            totalUpdatedRows += plan.summary.updatedRows;
            totalSingleRows += plan.summary.singleRows;
            totalCoupledRows += plan.summary.coupledRows;
            totalFallbackGroups += plan.summary.fallbackGroups;
            totalFallbackRows += plan.summary.fallbackRows;
            totalMissingTodayMappings += plan.summary.missingCurrentDayMappings;
            for (const update of plan.updates) {
                if (plannedRouteIds.has(update.id)) {
                    throw new Error(
                        `duplicate_planned_route_id id=${update.id}`
                    );
                }
                plannedRouteIds.add(update.id);
                finalStatusDistribution.set(
                    update.status,
                    (finalStatusDistribution.get(update.status) ?? 0) + 1
                );
            }

            console.log(
                JSON.stringify({
                    progress: 'service_day_complete',
                    dayIndex: dayIndex + 1,
                    totalDays,
                    ...plan.summary
                })
            );

            if (isToday) {
                const routeGroupKeys = new Set(
                    routeRows.map(buildRouteGroupKey)
                );
                orphanProbeRowsToday = probeRows.filter(
                    (row) => !routeGroupKeys.has(buildRouteGroupKey(row))
                ).length;
            }

            const dayTransaction = db.transaction((updates) => {
                for (const update of updates) {
                    insertMigratedStatusRow.run(
                        update.id,
                        update.train_prefix,
                        update.train_number,
                        update.emu_id,
                        update.service_date,
                        update.timetable_id,
                        update.status
                    );
                }
            });
            try {
                dayTransaction(plan.updates);
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);
                throw new Error(
                    `service_day_apply_failed day=${dayNumber} error=${message}`
                );
            }
        }

        const probeDaysOutsideRoutes = probeDays.filter(
            (dayNumber) => !processedDays.has(dayNumber)
        );
        const allDaysProcessed =
            routeDays.every((dayNumber) => processedDays.has(dayNumber)) &&
            totalDays === processedDays.size;
        const todayRouteRows =
            dayReports.find((report) => report.serviceDate === today)
                ?.scannedRows ?? 0;
        const todayUpdatedRows =
            dayReports.find((report) => report.serviceDate === today)
                ?.updatedRows ?? 0;
        const todayMappingReconciled = todayUpdatedRows === todayRouteRows;
        const historicalUpdatedRows = dayReports
            .filter((report) => report.serviceDate < today)
            .reduce((total, report) => total + report.updatedRows, 0);
        const historicalRouteRows = dayReports
            .filter((report) => report.serviceDate < today)
            .reduce((total, report) => total + report.scannedRows, 0);
        const historicalMappingReconciled =
            historicalUpdatedRows === historicalRouteRows;

        const verification = {
            routeRowCount: oldHealth.routeIds.size,
            routeIdSetPreserved:
                plannedRouteIds.size === oldHealth.routeIds.size &&
                Array.from(oldHealth.routeIds).every((id) =>
                    plannedRouteIds.has(id)
                ),
            statusesValid: Array.from(finalStatusDistribution.keys()).every(
                (status) =>
                    Number.isInteger(status) && status >= 0 && status <= 0x1f
            ),
            allDiscoveredServiceDaysProcessed: allDaysProcessed,
            todayMappingReconciled,
            historicalMappingReconciled,
            duplicateRouteIdentities: oldHealth.duplicateIdentities,
            foreignKeyCheckPassed: null,
            expectedIndexesPresent: null,
            sqliteSequenceValid: null,
            integrityCheckPassed: null,
            probeStatusDropped: null
        };

        if (options.apply) {
            await backupProvenanceBeforeApply(
                provenanceDbPath,
                provenanceReport
            );
        }

        runSchemaRebuild(db);
        const finalVerification = collectVerificationResults(db);
        verification.routeIdSetPreserved =
            finalVerification.routeRowCount === oldHealth.routeIds.size;
        verification.statusesValid = finalVerification.invalidStatusCount === 0;
        verification.duplicateRouteIdentities =
            finalVerification.duplicateRouteIdentities;
        verification.foreignKeyCheckPassed =
            finalVerification.foreignKeyCheckPassed;
        verification.expectedIndexesPresent =
            finalVerification.expectedIndexesPresent;
        verification.sqliteSequenceValid =
            finalVerification.sqliteSequenceValid;
        verification.integrityCheckPassed =
            finalVerification.integrityCheckPassed;
        verification.routeRowCount = finalVerification.routeRowCount;

        if (
            !verification.routeIdSetPreserved ||
            !verification.statusesValid ||
            !verification.allDiscoveredServiceDaysProcessed ||
            !verification.todayMappingReconciled ||
            !verification.historicalMappingReconciled ||
            verification.duplicateRouteIdentities !== 0 ||
            !verification.foreignKeyCheckPassed ||
            !verification.expectedIndexesPresent ||
            !verification.sqliteSequenceValid ||
            !verification.integrityCheckPassed
        ) {
            throw new Error(
                `migration_verification_failed ${JSON.stringify(verification)}`
            );
        }

        if (!options.apply) {
            db.exec(
                loadSql(
                    'assets/sql/emu/migrations/dropProbeStatusTableForMigration.sql'
                )
            );
            verification.probeStatusDropped = !tableExists(db, 'probe_status');
            if (!verification.probeStatusDropped) {
                throw new Error('probe_status_drop_failed');
            }
        }

        const report = {
            mode: options.apply ? 'apply' : 'dry-run',
            today,
            emuDbPath,
            provenanceDbPath,
            execution: {
                temporaryDatabase: !options.apply,
                sourceDatabaseModified: options.apply
            },
            serviceDays: {
                totalDays,
                processedDays: processedDays.size,
                probeDaysOutsideRoutes: probeDaysOutsideRoutes.length
            },
            totals: {
                updatedRows: totalUpdatedRows,
                singleRows: totalSingleRows,
                coupledRows: totalCoupledRows,
                fallbackGroups: totalFallbackGroups,
                fallbackRows: totalFallbackRows,
                missingTodayMappings: totalMissingTodayMappings,
                orphanProbeRowsToday,
                finalStatusDistribution: formatStatusDistribution(
                    finalStatusDistribution.entries()
                )
            },
            days: dayReports,
            verification,
            provenance: provenanceReport
        };

        if (options.apply) {
            resetProvenanceDatabase(provenanceDbPath, report.provenance);
            report.provenance.status = 'completed';

            db.exec(
                loadSql(
                    'assets/sql/emu/migrations/dropProbeStatusTableForMigration.sql'
                )
            );
            verification.probeStatusDropped = !tableExists(db, 'probe_status');
            if (!verification.probeStatusDropped) {
                throw new Error('probe_status_drop_failed');
            }

            console.log(JSON.stringify(report, null, 2));
            console.log('\nProvenance reset report:');
            console.log(JSON.stringify(report.provenance, null, 2));
        } else {
            console.log(JSON.stringify(report, null, 2));
            console.log(
                '\nProvenance reset would create (dry-run, source database unchanged):'
            );
            console.log(JSON.stringify(report.provenance, null, 2));
        }
    } catch (error) {
        if (options.apply) {
            try {
                db.exec(
                    loadSql(
                        'assets/sql/emu/migrations/dropMigratedDailyEmuRoutesStageForMigration.sql'
                    )
                );
            } catch {
                // Ignore cleanup failures; the original error is more useful.
            }
        }
        throw error;
    } finally {
        db.close();
        if (dryRunTempDir !== null) {
            rmSync(dryRunTempDir, { recursive: true, force: true });
        }
    }
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    const stack =
        error instanceof Error && error.stack ? `\n${error.stack}` : '';
    console.error(`migrate-emu-routes-status failed: ${message}${stack}`);
    process.exit(1);
});
