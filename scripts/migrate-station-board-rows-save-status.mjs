#!/usr/bin/env node

import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_CONFIG_PATH = 'data/config.json';
const LEGACY_SAVE_STATUS = 'unknown_legacy';
const LEGACY_REASON_CODE = 'legacy_unrecorded';
const LEGACY_REASON_TEXT = '旧记录未持久化逐行保存结果';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

function printHelp() {
    console.log(`Usage: node scripts/migrate-station-board-rows-save-status.mjs [options]

Options:
    --apply                      Apply the migration. Without this flag the script only
                                 analyzes rows_json and prints a dry-run summary.
    --config=<path>              Config JSON path. Default: ${DEFAULT_CONFIG_PATH}
    --train-provenance-db=<path> Override the train-provenance SQLite database path.
    --help                       Show this message
`);
}

function parseArgs(argv) {
    const options = {
        apply: false,
        configPath: resolve(repoRoot, DEFAULT_CONFIG_PATH),
        trainProvenanceDbPath: ''
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
        if (argument.startsWith('--train-provenance-db=')) {
            options.trainProvenanceDbPath = resolve(
                repoRoot,
                argument.slice('--train-provenance-db='.length)
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

function loadTrainProvenanceDbPath(configPath) {
    if (!existsSync(configPath)) {
        throw new Error(`Config file does not exist: ${configPath}`);
    }

    const parsed = JSON.parse(readUtf8File(configPath));
    const dbPath = parsed?.data?.databases?.trainProvenance?.path;
    if (typeof dbPath !== 'string' || dbPath.length === 0) {
        throw new Error(
            `Config file is missing trainProvenance DB path: ${configPath}`
        );
    }

    return resolve(repoRoot, dbPath);
}

function extractRows(parsed) {
    if (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        parsed.__opencrh_internal_schema_version !== undefined
    ) {
        return parsed.value;
    }
    return parsed;
}

function normalizeRow(row) {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
        return false;
    }
    if (row.saveStatus === 'saved' || row.saveStatus === 'not_saved') {
        return false;
    }
    row.saveStatus = LEGACY_SAVE_STATUS;
    row.saveReasonCode = LEGACY_REASON_CODE;
    row.saveReasonText = LEGACY_REASON_TEXT;
    return true;
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const dbPath =
        options.trainProvenanceDbPath ||
        loadTrainProvenanceDbPath(options.configPath);

    if (!existsSync(dbPath)) {
        throw new Error(`Train-provenance DB does not exist: ${dbPath}`);
    }

    const db = new Database(dbPath);
    const tableRow = db
        .prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?')
        .get('table', 'station_board_fetch_results');
    if (!tableRow) {
        db.close();
        throw new Error(
            `Table station_board_fetch_results does not exist in: ${dbPath}`
        );
    }

    const rows = db
        .prepare(
            'SELECT task_run_id, rows_json FROM station_board_fetch_results'
        )
        .all();
    let affectedResultRows = 0;
    let affectedEntryRows = 0;
    const update = db.prepare(
        'UPDATE station_board_fetch_results SET rows_json = ? WHERE task_run_id = ?'
    );

    const migrate = db.transaction(() => {
        for (const row of rows) {
            let parsed;
            try {
                parsed = JSON.parse(row.rows_json);
            } catch {
                continue;
            }

            const rowsValue = extractRows(parsed);
            if (!Array.isArray(rowsValue)) {
                continue;
            }

            let changed = false;
            for (const entry of rowsValue) {
                if (normalizeRow(entry)) {
                    changed = true;
                    affectedEntryRows += 1;
                }
            }
            if (!changed) {
                continue;
            }

            affectedResultRows += 1;
            if (options.apply) {
                update.run(JSON.stringify(parsed), row.task_run_id);
            }
        }
    });

    migrate();

    if (!options.apply) {
        console.log(
            `Dry run: ${affectedResultRows} result row(s) with ${affectedEntryRows} entry/entries would be migrated.`
        );
        console.log('Re-run with --apply to execute the migration.');
    } else {
        console.log(
            `Applied: migrated ${affectedResultRows} result row(s) with ${affectedEntryRows} entry/entries.`
        );
    }

    db.close();
}

main();
