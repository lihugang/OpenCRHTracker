#!/usr/bin/env node

import Database from 'better-sqlite3';
import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    statSync
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_CONFIG_PATH = 'data/config.json';
const TRAIN_NUMBER_TOLERANCE = 5;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

function printHelp() {
    console.log(`Usage: node scripts/remove-timetable-train-code-mismatches.mjs [options]

Options:
    --apply                 Apply the cleanup. Without this flag the script only
                            analyzes both databases and prints a dry-run report.
    --config=<path>         Config JSON path. Default: ${DEFAULT_CONFIG_PATH}
    --timetable-db=<path>   Override the timetable history database path.
    --emu-db=<path>         Override the EMU database path.
    --backup-dir=<path>     Backup directory for --apply. By default a new
                            timestamped directory is created below data/backup.
    --help                  Show this message.

Stop the application and all task workers before running with --apply.
`);
}

function parseArgs(argv) {
    const options = {
        apply: false,
        configPath: resolve(repoRoot, DEFAULT_CONFIG_PATH),
        timetableDbPath: '',
        emuDbPath: '',
        backupDir: ''
    };

    for (const argument of argv) {
        if (argument === '--apply') {
            options.apply = true;
        } else if (argument.startsWith('--config=')) {
            options.configPath = resolve(
                repoRoot,
                argument.slice('--config='.length)
            );
        } else if (argument.startsWith('--timetable-db=')) {
            options.timetableDbPath = resolve(
                repoRoot,
                argument.slice('--timetable-db='.length)
            );
        } else if (argument.startsWith('--emu-db=')) {
            options.emuDbPath = resolve(
                repoRoot,
                argument.slice('--emu-db='.length)
            );
        } else if (argument.startsWith('--backup-dir=')) {
            options.backupDir = resolve(
                repoRoot,
                argument.slice('--backup-dir='.length)
            );
        } else if (argument === '--help') {
            printHelp();
            process.exit(0);
        } else {
            throw new Error(`Unknown argument: ${argument}`);
        }
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

    const config = JSON.parse(readUtf8File(configPath));
    const timetableDbPath = config?.data?.databases?.timetableHistory?.path;
    const emuDbPath = config?.data?.databases?.EMUTracked?.path;
    if (typeof timetableDbPath !== 'string' || timetableDbPath.length === 0) {
        throw new Error(
            `Config file is missing data.databases.timetableHistory.path: ${configPath}`
        );
    }
    if (typeof emuDbPath !== 'string' || emuDbPath.length === 0) {
        throw new Error(
            `Config file is missing data.databases.EMUTracked.path: ${configPath}`
        );
    }

    return {
        timetableDbPath: resolve(repoRoot, timetableDbPath),
        emuDbPath: resolve(repoRoot, emuDbPath)
    };
}

function resolveDatabasePaths(options) {
    const configPaths =
        options.timetableDbPath.length > 0 && options.emuDbPath.length > 0
            ? null
            : loadConfig(options.configPath);
    const paths = {
        timetableDbPath: options.timetableDbPath || configPaths.timetableDbPath,
        emuDbPath: options.emuDbPath || configPaths.emuDbPath
    };

    if (paths.timetableDbPath === paths.emuDbPath) {
        throw new Error('Timetable history and EMU database paths must differ');
    }
    return paths;
}

function assertFileExists(filePath, label) {
    if (!existsSync(filePath)) {
        throw new Error(`${label} does not exist: ${filePath}`);
    }
    if (!statSync(filePath).isFile()) {
        throw new Error(`${label} is not a file: ${filePath}`);
    }
}

function parseContentTrainCodes(row) {
    let parsed;
    try {
        parsed = JSON.parse(row.timetable_json);
    } catch (error) {
        throw new Error(
            `Invalid timetable_json content_id=${row.id}: ${error instanceof Error ? error.message : String(error)}`
        );
    }

    if (
        parsed === null ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed) ||
        !Array.isArray(parsed.stops)
    ) {
        throw new Error(
            `Invalid timetable_json shape content_id=${row.id}: stops must be an array`
        );
    }

    const numbersByPrefix = new Map();
    const exactCodes = new Set();
    for (const [index, rawStop] of parsed.stops.entries()) {
        if (rawStop === null || typeof rawStop !== 'object') {
            throw new Error(
                `Invalid timetable stop content_id=${row.id} stop_index=${index}`
            );
        }

        const rawCode = rawStop.stationTrainCode;
        if (rawCode === null || typeof rawCode !== 'object') {
            throw new Error(
                `Invalid stationTrainCode content_id=${row.id} stop_index=${index}`
            );
        }

        const { prefix, number } = rawCode;
        if (
            typeof prefix !== 'string' ||
            !/^[A-Z]?$/.test(prefix) ||
            !Number.isInteger(number) ||
            number < 0 ||
            number > 9999
        ) {
            throw new Error(
                `Invalid stationTrainCode content_id=${row.id} stop_index=${index}`
            );
        }

        exactCodes.add(`${prefix}:${number}`);
        const numbers = numbersByPrefix.get(prefix) ?? [];
        if (!numbers.includes(number)) {
            numbers.push(number);
            numbersByPrefix.set(prefix, numbers);
        }
    }

    return { exactCodes, numbersByPrefix };
}

function buildContentIndex(contentRows) {
    const index = new Map();
    for (const row of contentRows) {
        index.set(row.id, parseContentTrainCodes(row));
    }
    return index;
}

function exactCodeMatches(content, prefix, number) {
    return content.exactCodes.has(`${prefix}:${number}`);
}

function tolerantCodeMatches(content, prefix, number) {
    const contentNumbers = content.numbersByPrefix.get(prefix) ?? [];
    return contentNumbers.some(
        (contentNumber) =>
            Math.abs(contentNumber - number) <= TRAIN_NUMBER_TOLERANCE
    );
}

function trainCodeKey(prefix, number) {
    return `${prefix}:${number}`;
}

function analyzeCoverages(rows, contentIndex) {
    const exactMismatchIds = [];
    const toleranceExemptIds = [];
    const candidateIds = [];
    const candidateTrainCodes = new Set();
    const candidateContentIds = new Set();

    for (const row of rows) {
        const content = contentIndex.get(row.content_id);
        if (!content) {
            throw new Error(
                `Coverage references missing content coverage_id=${row.id} content_id=${row.content_id}`
            );
        }
        if (exactCodeMatches(content, row.train_prefix, row.train_number)) {
            continue;
        }

        exactMismatchIds.push(row.id);
        if (tolerantCodeMatches(content, row.train_prefix, row.train_number)) {
            toleranceExemptIds.push(row.id);
            continue;
        }

        candidateIds.push(row.id);
        candidateTrainCodes.add(
            trainCodeKey(row.train_prefix, row.train_number)
        );
        candidateContentIds.add(row.content_id);
    }

    return {
        scannedRows: rows.length,
        exactMismatchIds,
        toleranceExemptIds,
        candidateIds,
        affectedTrainCodes: candidateTrainCodes.size,
        affectedContentIds: candidateContentIds.size
    };
}

function coverageIdentityKey(prefix, number, contentId) {
    return `${prefix}:${number}:${contentId}`;
}

function coverageTrainKey(prefix, number) {
    return `${prefix}:${number}`;
}

function buildCoverageRangeIndexes(coverageRows) {
    const rangesByIdentity = new Map();
    const rangesByTrain = new Map();

    for (const row of coverageRows) {
        const identityKey = coverageIdentityKey(
            row.train_prefix,
            row.train_number,
            row.content_id
        );
        const identityRanges = rangesByIdentity.get(identityKey) ?? [];
        identityRanges.push([
            row.service_date_start,
            row.service_date_end_exclusive
        ]);
        rangesByIdentity.set(identityKey, identityRanges);

        const trainKey = coverageTrainKey(row.train_prefix, row.train_number);
        const trainRanges = rangesByTrain.get(trainKey) ?? [];
        trainRanges.push([
            row.service_date_start,
            row.service_date_end_exclusive
        ]);
        rangesByTrain.set(trainKey, trainRanges);
    }

    return { rangesByIdentity, rangesByTrain };
}

function dateIsCovered(ranges, serviceDate) {
    return (ranges ?? []).some(
        ([start, endExclusive]) =>
            start <= serviceDate && serviceDate < endExclusive
    );
}

function analyzeDailyRoutes(dailyRows, contentIndex, coverageRangeIndexes) {
    let scannedRows = 0;
    let nullTimetableIdRows = 0;
    let missingContentRows = 0;
    let sameContentCoverageRows = 0;
    let differentContentCoverageRows = 0;
    let noCoverageRows = 0;
    const exactMismatchIds = [];
    const toleranceExemptIds = [];
    const candidateIds = [];
    const candidateTrainCodes = new Set();
    const candidateContentIds = new Set();

    for (const row of dailyRows) {
        scannedRows += 1;
        if (row.timetable_id === null || row.timetable_id === undefined) {
            nullTimetableIdRows += 1;
            continue;
        }

        const content = contentIndex.get(row.timetable_id);
        if (!content) {
            missingContentRows += 1;
            continue;
        }
        if (exactCodeMatches(content, row.train_prefix, row.train_number)) {
            continue;
        }

        exactMismatchIds.push(row.id);
        if (tolerantCodeMatches(content, row.train_prefix, row.train_number)) {
            toleranceExemptIds.push(row.id);
            continue;
        }

        candidateIds.push(row.id);
        candidateTrainCodes.add(
            trainCodeKey(row.train_prefix, row.train_number)
        );
        candidateContentIds.add(row.timetable_id);

        const identityRanges = coverageRangeIndexes.rangesByIdentity.get(
            coverageIdentityKey(
                row.train_prefix,
                row.train_number,
                row.timetable_id
            )
        );
        if (dateIsCovered(identityRanges, row.service_date)) {
            sameContentCoverageRows += 1;
            continue;
        }

        const trainRanges = coverageRangeIndexes.rangesByTrain.get(
            coverageTrainKey(row.train_prefix, row.train_number)
        );
        if (dateIsCovered(trainRanges, row.service_date)) {
            differentContentCoverageRows += 1;
        } else {
            noCoverageRows += 1;
        }
    }

    return {
        scannedRows,
        nullTimetableIdRows,
        missingContentRows,
        exactMismatchIds,
        toleranceExemptIds,
        candidateIds,
        affectedTrainCodes: candidateTrainCodes.size,
        affectedContentIds: candidateContentIds.size,
        coverageDistribution: {
            sameContent: sameContentCoverageRows,
            differentContent: differentContentCoverageRows,
            none: noCoverageRows
        }
    };
}

function loadHistoryStatements(db) {
    return {
        selectContents: db.prepare(
            loadSql(
                'assets/sql/timetable-history/maintenance/selectAllContents.sql'
            )
        ),
        selectCoverages: db.prepare(
            loadSql(
                'assets/sql/timetable-history/maintenance/selectAllCoverages.sql'
            )
        ),
        deleteCoverage: db.prepare(
            loadSql(
                'assets/sql/timetable-history/maintenance/deleteCoverageById.sql'
            )
        )
    };
}

function loadEmuStatements(db, attached) {
    return {
        selectDaily: db.prepare(
            loadSql(
                `assets/sql/emu/maintenance/selectAllDailyEmuRoutes${attached ? 'Attached' : ''}.sql`
            )
        ),
        deleteDaily: db.prepare(
            loadSql(
                `assets/sql/emu/maintenance/deleteDailyEmuRouteById${attached ? 'Attached' : ''}.sql`
            )
        )
    };
}

function analyze(historyStatements, emuStatements) {
    const contentRows = historyStatements.selectContents.all();
    const coverageRows = historyStatements.selectCoverages.all();
    const contentIndex = buildContentIndex(contentRows);
    const coverage = analyzeCoverages(coverageRows, contentIndex);
    const daily = analyzeDailyRoutes(
        emuStatements.selectDaily.iterate(),
        contentIndex,
        buildCoverageRangeIndexes(coverageRows)
    );

    return {
        contentRows: contentRows.length,
        coverage,
        daily
    };
}

function summarizeCategory(category) {
    return {
        scannedRows: category.scannedRows,
        exactMismatches: category.exactMismatchIds.length,
        toleranceExemptions: category.toleranceExemptIds.length,
        rowsToDelete: category.candidateIds.length,
        affectedTrainCodes: category.affectedTrainCodes,
        affectedContentIds: category.affectedContentIds
    };
}

function buildSummary(analysis, mode, paths, backupDir = null) {
    return {
        mode,
        timetableDbPath: paths.timetableDbPath,
        emuDbPath: paths.emuDbPath,
        backupDir,
        matchingRule: {
            samePrefixRequired: true,
            maximumTrainNumberDifference: TRAIN_NUMBER_TOLERANCE
        },
        scannedContents: analysis.contentRows,
        coverages: summarizeCategory(analysis.coverage),
        dailyRoutes: {
            ...summarizeCategory(analysis.daily),
            nullTimetableIdRows: analysis.daily.nullTimetableIdRows,
            missingContentRows: analysis.daily.missingContentRows,
            rowsToDeleteByCoverageState: analysis.daily.coverageDistribution
        }
    };
}

function defaultBackupDir() {
    const timestamp = new Date()
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}Z$/, 'Z');
    return resolve(
        repoRoot,
        `data/backup/timetable-train-code-cleanup-${timestamp}`
    );
}

function prepareBackupDirectory(backupDir) {
    if (existsSync(backupDir)) {
        if (!statSync(backupDir).isDirectory()) {
            throw new Error(`Backup path is not a directory: ${backupDir}`);
        }
        if (readdirSync(backupDir).length > 0) {
            throw new Error(`Backup directory is not empty: ${backupDir}`);
        }
        return;
    }

    mkdirSync(backupDir, { recursive: true });
}

function validateDatabaseFile(dbPath, label) {
    const db = new Database(dbPath, { readonly: true });
    try {
        const integrity = db.pragma('integrity_check');
        if (integrity[0]?.integrity_check !== 'ok') {
            throw new Error(
                `${label} backup integrity_check failed: ${JSON.stringify(integrity[0])}`
            );
        }
        const foreignKeys = db.pragma('foreign_key_check');
        if (foreignKeys.length > 0) {
            throw new Error(
                `${label} backup foreign_key_check failed: ${JSON.stringify(foreignKeys[0])}`
            );
        }
    } finally {
        db.close();
    }
}

async function createAndValidateBackups(paths, backupDir) {
    prepareBackupDirectory(backupDir);
    const timetableBackupPath = resolve(backupDir, 'timetable-history.db');
    const emuBackupPath = resolve(backupDir, 'emu.db');
    const timetableSource = new Database(paths.timetableDbPath, {
        readonly: true
    });
    const emuSource = new Database(paths.emuDbPath, { readonly: true });

    try {
        await timetableSource.backup(timetableBackupPath);
        await emuSource.backup(emuBackupPath);
    } finally {
        timetableSource.close();
        emuSource.close();
    }

    validateDatabaseFile(timetableBackupPath, 'Timetable history');
    validateDatabaseFile(emuBackupPath, 'EMU');
}

function arraysEqual(left, right) {
    return (
        left.length === right.length &&
        left.every((value, index) => value === right[index])
    );
}

function assertCandidatesUnchanged(before, after) {
    if (
        !arraysEqual(
            before.coverage.candidateIds,
            after.coverage.candidateIds
        ) ||
        !arraysEqual(before.daily.candidateIds, after.daily.candidateIds)
    ) {
        throw new Error(
            'Cleanup candidates changed after backup; no rows were deleted. Stop all writers and run the script again.'
        );
    }
}

function assertAppliedState(analysis) {
    if (analysis.coverage.candidateIds.length > 0) {
        throw new Error(
            `Validation failed: ${analysis.coverage.candidateIds.length} coverage mismatch(es) remain`
        );
    }
    if (analysis.daily.candidateIds.length > 0) {
        throw new Error(
            `Validation failed: ${analysis.daily.candidateIds.length} daily route mismatch(es) remain`
        );
    }
}

function validateLiveDatabases(historyDb) {
    const historyIntegrity = historyDb.pragma('integrity_check');
    if (historyIntegrity[0]?.integrity_check !== 'ok') {
        throw new Error(
            `Validation failed: timetable database integrity_check returned ${JSON.stringify(historyIntegrity[0])}`
        );
    }

    const emuIntegrity = historyDb
        .prepare(
            loadSql('assets/sql/emu/maintenance/integrityCheckAttached.sql')
        )
        .all();
    if (emuIntegrity[0]?.integrity_check !== 'ok') {
        throw new Error(
            `Validation failed: EMU database integrity_check returned ${JSON.stringify(emuIntegrity[0])}`
        );
    }

    const historyForeignKeys = historyDb.pragma('foreign_key_check');
    if (historyForeignKeys.length > 0) {
        throw new Error(
            `Validation failed: timetable database foreign_key_check returned ${JSON.stringify(historyForeignKeys[0])}`
        );
    }

    const emuForeignKeys = historyDb
        .prepare(
            loadSql('assets/sql/emu/maintenance/foreignKeyCheckAttached.sql')
        )
        .all();
    if (emuForeignKeys.length > 0) {
        throw new Error(
            `Validation failed: EMU database foreign_key_check returned ${JSON.stringify(emuForeignKeys[0])}`
        );
    }
}

function applyCleanup(
    historyDb,
    historyStatements,
    emuStatements,
    initialAnalysis
) {
    const transaction = historyDb.transaction(() => {
        const currentAnalysis = analyze(historyStatements, emuStatements);
        assertCandidatesUnchanged(initialAnalysis, currentAnalysis);

        for (const id of currentAnalysis.daily.candidateIds) {
            emuStatements.deleteDaily.run(id);
        }
        for (const id of currentAnalysis.coverage.candidateIds) {
            historyStatements.deleteCoverage.run(id);
        }

        const postApply = analyze(historyStatements, emuStatements);
        assertAppliedState(postApply);
        validateLiveDatabases(historyDb);
        return postApply;
    });

    return transaction.immediate();
}

function analyzeReadonly(paths) {
    const historyDb = new Database(paths.timetableDbPath, { readonly: true });
    const emuDb = new Database(paths.emuDbPath, { readonly: true });
    historyDb.pragma('busy_timeout = 30000');
    historyDb.pragma('foreign_keys = ON');
    emuDb.pragma('busy_timeout = 30000');
    emuDb.pragma('foreign_keys = ON');

    try {
        return analyze(
            loadHistoryStatements(historyDb),
            loadEmuStatements(emuDb, false)
        );
    } finally {
        emuDb.close();
        historyDb.close();
    }
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const paths = resolveDatabasePaths(options);
    assertFileExists(paths.timetableDbPath, 'Timetable history database');
    assertFileExists(paths.emuDbPath, 'EMU database');

    const initialAnalysis = analyzeReadonly(paths);
    const backupDir = options.apply
        ? options.backupDir || defaultBackupDir()
        : null;
    console.log(
        JSON.stringify(
            buildSummary(
                initialAnalysis,
                options.apply ? 'apply' : 'dry-run',
                paths,
                backupDir
            ),
            null,
            2
        )
    );

    if (!options.apply) {
        return;
    }
    if (
        initialAnalysis.coverage.candidateIds.length === 0 &&
        initialAnalysis.daily.candidateIds.length === 0
    ) {
        console.log(JSON.stringify({ status: 'no-op' }, null, 2));
        return;
    }

    await createAndValidateBackups(paths, backupDir);

    const historyDb = new Database(paths.timetableDbPath);
    historyDb.pragma('busy_timeout = 30000');
    historyDb.pragma('foreign_keys = ON');
    try {
        historyDb
            .prepare(loadSql('assets/sql/emu/maintenance/attachDatabase.sql'))
            .run(paths.emuDbPath);
        const historyStatements = loadHistoryStatements(historyDb);
        const emuStatements = loadEmuStatements(historyDb, true);
        const postApply = applyCleanup(
            historyDb,
            historyStatements,
            emuStatements,
            initialAnalysis
        );

        console.log(
            JSON.stringify(
                {
                    status: 'applied',
                    backupDir,
                    deletedCoverages:
                        initialAnalysis.coverage.candidateIds.length,
                    deletedDailyRoutes:
                        initialAnalysis.daily.candidateIds.length,
                    postApply: buildSummary(
                        postApply,
                        'post-apply',
                        paths,
                        backupDir
                    )
                },
                null,
                2
            )
        );
    } finally {
        historyDb.close();
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
