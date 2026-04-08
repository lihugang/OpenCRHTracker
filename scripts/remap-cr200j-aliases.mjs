import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_INPUT_PATH = 'data/emu_list.jsonl';
const DEFAULT_DB_PATH = 'data/emu.db';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

function printHelp() {
    console.log(`Usage: node scripts/remap-cr200j-aliases.mjs [options]

Options:
    --input=<path>  Alias JSONL input path. Default: ${DEFAULT_INPUT_PATH}
    --db=<path>     SQLite database path. Default: ${DEFAULT_DB_PATH}
    --help          Show this message
`);
}

function parseArgs(argv) {
    const options = {
        inputPath: resolve(repoRoot, DEFAULT_INPUT_PATH),
        dbPath: resolve(repoRoot, DEFAULT_DB_PATH)
    };

    for (const argument of argv) {
        if (argument.startsWith('--input=')) {
            options.inputPath = resolve(
                repoRoot,
                argument.slice('--input='.length)
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

function normalizeText(value) {
    if (typeof value !== 'string') {
        return '';
    }

    return value.trim().toUpperCase();
}

function normalizeAliases(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter((item) => typeof item === 'string')
        .map((item) => normalizeText(item))
        .filter(
            (item, index, array) =>
                item.length > 0 && array.indexOf(item) === index
        );
}

function readJsonlRows(filePath) {
    if (!existsSync(filePath)) {
        throw new Error(`Input file does not exist: ${filePath}`);
    }

    let text = readFileSync(filePath, 'utf8');
    if (text.charCodeAt(0) === 0xfeff) {
        text = text.slice(1);
    }

    return text
        .split(/\r?\n/u)
        .filter((line) => line.trim().length > 0)
        .map((line, index) => {
            try {
                return JSON.parse(line);
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);
                throw new Error(
                    `Failed to parse ${filePath} line ${index + 1}: ${message}`
                );
            }
        });
}

function buildCanonicalEmuCode(row, index) {
    const model = normalizeText(row?.model);
    const trainSetNo = normalizeText(row?.trainSetNo);

    if (model.length === 0 || trainSetNo.length === 0) {
        throw new Error(
            `Input row ${index + 1} is missing a valid model or trainSetNo`
        );
    }

    return `${model}-${trainSetNo}`;
}

function buildAliasMapping(rows) {
    const aliasToCanonical = new Map();
    let cr200jRowCount = 0;
    let aliasRowCount = 0;
    let aliasCount = 0;

    for (const [index, row] of rows.entries()) {
        const canonicalCode = buildCanonicalEmuCode(row, index);
        if (!canonicalCode.startsWith('CR200J')) {
            continue;
        }

        cr200jRowCount += 1;
        const aliases = normalizeAliases(row?.alias);
        if (aliases.length === 0) {
            continue;
        }

        aliasRowCount += 1;
        for (const alias of aliases) {
            if (alias === canonicalCode) {
                continue;
            }

            const existingCanonical = aliasToCanonical.get(alias);
            if (
                typeof existingCanonical === 'string' &&
                existingCanonical !== canonicalCode
            ) {
                throw new Error(
                    `Alias conflict for ${alias}: ${existingCanonical} vs ${canonicalCode}`
                );
            }

            if (!aliasToCanonical.has(alias)) {
                aliasCount += 1;
            }
            aliasToCanonical.set(alias, canonicalCode);
        }
    }

    if (aliasRowCount === 0 || aliasToCanonical.size === 0) {
        throw new Error(
            'No CR200J alias rows were found in the input file. Update data/emu_list.jsonl first.'
        );
    }

    return {
        aliasToCanonical,
        cr200jRowCount,
        aliasRowCount,
        aliasCount
    };
}

function choosePreferredText(primaryValue, fallbackValue) {
    const primary = typeof primaryValue === 'string' ? primaryValue.trim() : '';
    if (primary.length > 0) {
        return primary;
    }

    return typeof fallbackValue === 'string' ? fallbackValue.trim() : '';
}

function toSafeInteger(value) {
    return Number.isInteger(value) ? value : 0;
}

function loadTableRows(db) {
    const dailyRows = db
        .prepare(
            [
                'SELECT id, train_code, emu_code, start_station_name, end_station_name, start_at, end_at',
                'FROM daily_emu_routes'
            ].join(' ')
        )
        .all();

    const probeRows = db
        .prepare(
            'SELECT id, train_code, emu_code, start_at, status FROM probe_status'
        )
        .all();

    return {
        dailyRows,
        probeRows
    };
}

function buildSummarySkeleton(inputPath, dbPath, mapping) {
    return {
        inputPath,
        dbPath,
        cr200jRows: mapping.cr200jRowCount,
        aliasRows: mapping.aliasRowCount,
        aliasMappings: mapping.aliasCount,
        scanned: {
            dailyRows: 0,
            probeRows: 0
        },
        affected: {
            dailyRows: 0,
            probeRows: 0
        },
        updated: {
            dailyRows: 0,
            probeRows: 0
        },
        merged: {
            dailyRows: 0,
            probeRows: 0
        },
        deletedAliasRows: {
            dailyRows: 0,
            probeRows: 0
        },
        aliasHits: 0,
        unusedAliases: 0
    };
}

function remapDatabase(db, aliasToCanonical, summary) {
    const selectDailyByBusinessKey = db.prepare(
        [
            'SELECT id, train_code, emu_code, start_station_name, end_station_name, start_at, end_at',
            'FROM daily_emu_routes',
            'WHERE train_code = ? AND emu_code = ? AND start_at = ?',
            'LIMIT 1'
        ].join(' ')
    );
    const updateDailyEmuCodeById = db.prepare(
        'UPDATE daily_emu_routes SET emu_code = ? WHERE id = ?'
    );
    const updateDailyMergedRowById = db.prepare(
        [
            'UPDATE daily_emu_routes',
            'SET start_station_name = ?, end_station_name = ?, end_at = ?',
            'WHERE id = ?'
        ].join(' ')
    );
    const deleteDailyRowById = db.prepare(
        'DELETE FROM daily_emu_routes WHERE id = ?'
    );

    const selectProbeByBusinessKey = db.prepare(
        [
            'SELECT id, train_code, emu_code, start_at, status',
            'FROM probe_status',
            'WHERE train_code = ? AND emu_code = ? AND start_at = ?',
            'LIMIT 1'
        ].join(' ')
    );
    const updateProbeEmuCodeById = db.prepare(
        'UPDATE probe_status SET emu_code = ? WHERE id = ?'
    );
    const updateProbeStatusById = db.prepare(
        'UPDATE probe_status SET status = ? WHERE id = ?'
    );
    const deleteProbeRowById = db.prepare(
        'DELETE FROM probe_status WHERE id = ?'
    );

    const aliasHits = new Set();
    const applyChanges = db.transaction(() => {
        const { dailyRows, probeRows } = loadTableRows(db);

        summary.scanned.dailyRows = dailyRows.length;
        summary.scanned.probeRows = probeRows.length;

        for (const row of dailyRows) {
            const currentEmuCode = normalizeText(row.emu_code);
            const canonicalEmuCode = aliasToCanonical.get(currentEmuCode);
            if (!canonicalEmuCode) {
                continue;
            }

            summary.affected.dailyRows += 1;
            aliasHits.add(currentEmuCode);

            const existingRow = selectDailyByBusinessKey.get(
                row.train_code,
                canonicalEmuCode,
                row.start_at
            );

            if (!existingRow) {
                updateDailyEmuCodeById.run(canonicalEmuCode, row.id);
                summary.updated.dailyRows += 1;
                continue;
            }

            if (existingRow.id === row.id) {
                continue;
            }

            updateDailyMergedRowById.run(
                choosePreferredText(
                    existingRow.start_station_name,
                    row.start_station_name
                ),
                choosePreferredText(
                    existingRow.end_station_name,
                    row.end_station_name
                ),
                Math.max(
                    toSafeInteger(existingRow.end_at),
                    toSafeInteger(row.end_at)
                ),
                existingRow.id
            );
            deleteDailyRowById.run(row.id);
            summary.merged.dailyRows += 1;
            summary.deletedAliasRows.dailyRows += 1;
        }

        for (const row of probeRows) {
            const currentEmuCode = normalizeText(row.emu_code);
            const canonicalEmuCode = aliasToCanonical.get(currentEmuCode);
            if (!canonicalEmuCode) {
                continue;
            }

            summary.affected.probeRows += 1;
            aliasHits.add(currentEmuCode);

            const existingRow = selectProbeByBusinessKey.get(
                row.train_code,
                canonicalEmuCode,
                row.start_at
            );

            if (!existingRow) {
                updateProbeEmuCodeById.run(canonicalEmuCode, row.id);
                summary.updated.probeRows += 1;
                continue;
            }

            if (existingRow.id === row.id) {
                continue;
            }

            const mergedStatus = Math.max(
                toSafeInteger(existingRow.status),
                toSafeInteger(row.status)
            );
            if (mergedStatus !== existingRow.status) {
                updateProbeStatusById.run(mergedStatus, existingRow.id);
            }
            deleteProbeRowById.run(row.id);
            summary.merged.probeRows += 1;
            summary.deletedAliasRows.probeRows += 1;
        }
    });

    applyChanges();
    summary.aliasHits = aliasHits.size;
    summary.unusedAliases = aliasToCanonical.size - aliasHits.size;
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const inputRows = readJsonlRows(options.inputPath);
    const mapping = buildAliasMapping(inputRows);
    const summary = buildSummarySkeleton(
        options.inputPath,
        options.dbPath,
        mapping
    );

    if (!existsSync(options.dbPath)) {
        throw new Error(`Database file does not exist: ${options.dbPath}`);
    }

    const db = new Database(options.dbPath);
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');

    try {
        remapDatabase(db, mapping.aliasToCanonical, summary);
    } finally {
        db.close();
    }

    console.log(JSON.stringify(summary, null, 2));
}

try {
    main();
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`CR200J alias remap failed: ${message}`);
    process.exit(1);
}
