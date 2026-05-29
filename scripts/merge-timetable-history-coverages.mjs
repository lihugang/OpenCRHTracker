import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_CONFIG_PATH = 'data/config.json';
const EXAMPLE_SAMPLE_LIMIT = 20;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

function printHelp() {
    console.log(`Usage: node scripts/merge-timetable-history-coverages.mjs [options]

Options:
    --apply         Apply the merge. Without this flag the script only prints
                    a dry-run summary.
    --config=<path> Config JSON path. Default: ${DEFAULT_CONFIG_PATH}
    --db=<path>     Override the timetable history SQLite database path.
    --help          Show this message
`);
}

function parseArgs(argv) {
    const options = {
        apply: false,
        configPath: resolve(repoRoot, DEFAULT_CONFIG_PATH),
        dbPath: ''
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

        if (argument.startsWith('--db=')) {
            options.dbPath = resolve(repoRoot, argument.slice('--db='.length));
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

function loadConfigDatabasePath(configPath) {
    if (!existsSync(configPath)) {
        throw new Error(`Config file does not exist: ${configPath}`);
    }

    const parsed = JSON.parse(readUtf8File(configPath));
    const dbPath = parsed?.data?.databases?.timetableHistory;
    if (typeof dbPath !== 'string' || dbPath.trim().length === 0) {
        throw new Error(
            `Config file is missing data.databases.timetableHistory: ${configPath}`
        );
    }

    return resolve(repoRoot, dbPath);
}

function assertFileExists(filePath, label) {
    if (!existsSync(filePath)) {
        throw new Error(`${label} does not exist: ${filePath}`);
    }
}

function loadCoverageRows(db) {
    return db
        .prepare(
            `SELECT
                id,
                train_code,
                service_date_start,
                service_date_end_exclusive,
                content_id,
                created_at,
                updated_at
            FROM timetable_history_coverages
            ORDER BY train_code ASC, content_id ASC, service_date_start ASC, id ASC`
        )
        .all();
}

function groupCoverageRows(rows) {
    const groups = new Map();

    for (const row of rows) {
        const groupKey = `${row.train_code}|${row.content_id}`;
        const existing = groups.get(groupKey);
        if (existing) {
            existing.rows.push(row);
            existing.serviceDateStart = Math.min(
                existing.serviceDateStart,
                row.service_date_start
            );
            existing.serviceDateEndExclusive = Math.max(
                existing.serviceDateEndExclusive,
                row.service_date_end_exclusive
            );
            continue;
        }

        groups.set(groupKey, {
            trainCode: row.train_code,
            contentId: row.content_id,
            serviceDateStart: row.service_date_start,
            serviceDateEndExclusive: row.service_date_end_exclusive,
            rows: [row]
        });
    }

    return [...groups.values()];
}

function buildMergePlan(groups) {
    const mergeGroups = [];
    let updatedRows = 0;
    let deletedRows = 0;

    for (const group of groups) {
        if (group.rows.length < 2) {
            continue;
        }

        const keeper = group.rows[0];
        const requiresRangeUpdate =
            keeper.service_date_start !== group.serviceDateStart ||
            keeper.service_date_end_exclusive !== group.serviceDateEndExclusive;
        if (requiresRangeUpdate) {
            updatedRows += 1;
        }

        const removedRows = group.rows.slice(1);
        deletedRows += removedRows.length;
        mergeGroups.push({
            ...group,
            keeperId: keeper.id,
            keeperRangeChanged: requiresRangeUpdate,
            removedIds: removedRows.map((row) => row.id)
        });
    }

    return {
        mergeGroups,
        updatedRows,
        deletedRows
    };
}

function buildSummary(dbPath, rows, mergePlan) {
    const affectedTrainCodes = new Set(
        mergePlan.mergeGroups.map((group) => group.trainCode)
    );

    return {
        dbPath,
        scannedRows: rows.length,
        scannedTrainCodes: new Set(rows.map((row) => row.train_code)).size,
        mergeGroups: mergePlan.mergeGroups.length,
        affectedTrainCodes: affectedTrainCodes.size,
        updatedRows: mergePlan.updatedRows,
        deletedRows: mergePlan.deletedRows,
        samples: mergePlan.mergeGroups.slice(0, EXAMPLE_SAMPLE_LIMIT).map((group) => ({
            trainCode: group.trainCode,
            contentId: group.contentId,
            rowCount: group.rows.length,
            keeperId: group.keeperId,
            mergedRange: [
                group.serviceDateStart,
                group.serviceDateEndExclusive
            ],
            sourceRanges: group.rows.map((row) => ({
                id: row.id,
                start: row.service_date_start,
                endExclusive: row.service_date_end_exclusive
            }))
        }))
    };
}

function applyMergePlan(db, mergePlan) {
    const updateCoverage = db.prepare(`UPDATE timetable_history_coverages
        SET service_date_start = ?,
            service_date_end_exclusive = ?,
            updated_at = ?
        WHERE id = ?`);
    const deleteCoverage = db.prepare(
        'DELETE FROM timetable_history_coverages WHERE id = ?'
    );
    const nowSeconds = Math.floor(Date.now() / 1000);

    const transaction = db.transaction(() => {
        for (const group of mergePlan.mergeGroups) {
            if (group.keeperRangeChanged) {
                updateCoverage.run(
                    group.serviceDateStart,
                    group.serviceDateEndExclusive,
                    nowSeconds,
                    group.keeperId
                );
            }

            for (const removedId of group.removedIds) {
                deleteCoverage.run(removedId);
            }
        }
    });

    transaction();
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const dbPath =
        options.dbPath.length > 0
            ? options.dbPath
            : loadConfigDatabasePath(options.configPath);

    assertFileExists(dbPath, 'Timetable history database');

    const db = new Database(dbPath);
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');

    try {
        const rows = loadCoverageRows(db);
        const groups = groupCoverageRows(rows);
        const mergePlan = buildMergePlan(groups);
        const summary = buildSummary(dbPath, rows, mergePlan);

        console.log(JSON.stringify({
            mode: options.apply ? 'apply' : 'dry-run',
            note: 'Merging same train_code + content_id coverages will make gap dates count as covered by that timetable.',
            ...summary
        }, null, 2));

        if (!options.apply || mergePlan.mergeGroups.length === 0) {
            return;
        }

        applyMergePlan(db, mergePlan);
    } finally {
        db.close();
    }
}

try {
    main();
} catch (error) {
    console.error(
        error instanceof Error ? error.message : String(error)
    );
    process.exitCode = 1;
}
