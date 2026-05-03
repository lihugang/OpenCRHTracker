import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_INPUT_PATH = 'data/emu_list.jsonl';
const DEFAULT_DB_PATH = 'data/emu.db';
const MAX_CONFLICT_SAMPLES = 20;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

function printHelp() {
    console.log(`Usage: node scripts/remap-cr200j-aliases.mjs [options]

Options:
    --apply         Apply the remap. Without this flag the script only
                    analyzes the database and prints a dry-run summary.
    --input=<path>  Alias JSONL input path. Default: ${DEFAULT_INPUT_PATH}
    --db=<path>     SQLite database path. Default: ${DEFAULT_DB_PATH}
    --help          Show this message
`);
}

function parseArgs(argv) {
    const options = {
        apply: false,
        inputPath: resolve(repoRoot, DEFAULT_INPUT_PATH),
        dbPath: resolve(repoRoot, DEFAULT_DB_PATH)
    };

    for (const argument of argv) {
        if (argument === '--apply') {
            options.apply = true;
            continue;
        }

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

function normalizeText(value) {
    if (typeof value !== 'string') {
        return '';
    }

    return value.trim().toUpperCase();
}

function normalizeServiceDate(value) {
    if (typeof value !== 'string') {
        return '';
    }

    return value.trim();
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

function normalizeNullableTimetableId(value) {
    return Number.isInteger(value) && value > 0 ? value : null;
}

function normalizeStatus(value) {
    return Number.isInteger(value) ? value : 0;
}

function readJsonlRows(filePath) {
    if (!existsSync(filePath)) {
        throw new Error(`Input file does not exist: ${filePath}`);
    }

    return readUtf8File(filePath)
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

function createTableSummary() {
    return {
        scannedRows: 0,
        matchedAliasRows: 0,
        impactedGroups: 0,
        updatedRows: 0,
        deletedRows: 0,
        mergedGroups: 0,
        conflictGroups: 0,
        conflicts: []
    };
}

function buildSummarySkeleton(inputPath, dbPath, mapping, mode) {
    return {
        mode,
        inputPath,
        dbPath,
        cr200jRows: mapping.cr200jRowCount,
        aliasRows: mapping.aliasRowCount,
        aliasMappings: mapping.aliasCount,
        aliasHits: 0,
        unusedAliases: mapping.aliasCount,
        tables: {
            dailyEmuRoutes: createTableSummary(),
            probeStatus: createTableSummary()
        }
    };
}

function buildTargetGroupKey(trainCode, emuCode, serviceDate) {
    return [trainCode, emuCode, serviceDate].join('|');
}

function chooseKeeperRow(rows, canonicalEmuCode) {
    return [...rows].sort((left, right) => {
        const leftIsCanonical = left.emu_code === canonicalEmuCode ? 1 : 0;
        const rightIsCanonical = right.emu_code === canonicalEmuCode ? 1 : 0;
        if (leftIsCanonical !== rightIsCanonical) {
            return rightIsCanonical - leftIsCanonical;
        }

        const leftHasTimetable = left.timetable_id === null ? 0 : 1;
        const rightHasTimetable = right.timetable_id === null ? 0 : 1;
        if (leftHasTimetable !== rightHasTimetable) {
            return rightHasTimetable - leftHasTimetable;
        }

        return left.id - right.id;
    })[0];
}

function analyzeTargetGroup(tableName, targetGroup, actions, tableSummary) {
    const distinctResolvedTimetableIds = [
        ...new Set(
            targetGroup.rows
                .map((row) => row.timetable_id)
                .filter((value) => value !== null)
        )
    ].sort((left, right) => left - right);

    if (distinctResolvedTimetableIds.length > 1) {
        tableSummary.conflictGroups += 1;
        if (tableSummary.conflicts.length < MAX_CONFLICT_SAMPLES) {
            tableSummary.conflicts.push({
                table: tableName,
                train_code: targetGroup.train_code,
                service_date: targetGroup.service_date,
                canonical_emu_code: targetGroup.canonical_emu_code,
                timetable_ids: distinctResolvedTimetableIds,
                row_ids: targetGroup.rows.map((row) => row.id),
                emu_codes: [...new Set(targetGroup.rows.map((row) => row.emu_code))]
            });
        }
        return;
    }

    const nextTimetableId = distinctResolvedTimetableIds[0] ?? null;
    const keeper = chooseKeeperRow(
        targetGroup.rows,
        targetGroup.canonical_emu_code
    );
    const deleteIds = targetGroup.rows
        .filter((row) => row.id !== keeper.id)
        .map((row) => row.id);
    const nextStatus =
        tableName === 'probe_status'
            ? targetGroup.rows.reduce(
                  (currentMax, row) =>
                      Math.max(currentMax, normalizeStatus(row.status)),
                  0
              )
            : undefined;

    const needsUpdate =
        keeper.emu_code !== targetGroup.canonical_emu_code ||
        keeper.timetable_id !== nextTimetableId ||
        (tableName === 'probe_status' && keeper.status !== nextStatus);

    if (needsUpdate) {
        tableSummary.updatedRows += 1;
    }
    if (deleteIds.length > 0) {
        tableSummary.deletedRows += deleteIds.length;
        tableSummary.mergedGroups += 1;
    }

    if (needsUpdate || deleteIds.length > 0) {
        actions.push({
            keeperId: keeper.id,
            canonicalEmuCode: targetGroup.canonical_emu_code,
            timetableId: nextTimetableId,
            status: nextStatus,
            deleteIds
        });
    }
}

function analyzeTableRows(tableName, rows, aliasToCanonical) {
    const tableSummary = createTableSummary();
    const aliasHitCodes = new Set();
    const impactedTargetKeys = new Set();
    const normalizedRows = rows.map((row) => ({
        ...row,
        train_code: normalizeText(row.train_code),
        emu_code: normalizeText(row.emu_code),
        service_date: normalizeServiceDate(row.service_date),
        timetable_id: normalizeNullableTimetableId(row.timetable_id)
    }));

    tableSummary.scannedRows = normalizedRows.length;

    for (const row of normalizedRows) {
        const canonicalEmuCode = aliasToCanonical.get(row.emu_code);
        if (!canonicalEmuCode) {
            continue;
        }

        tableSummary.matchedAliasRows += 1;
        aliasHitCodes.add(row.emu_code);
        impactedTargetKeys.add(
            buildTargetGroupKey(
                row.train_code,
                canonicalEmuCode,
                row.service_date
            )
        );
    }

    const groupedRows = new Map();
    for (const row of normalizedRows) {
        const aliasCanonicalEmuCode = aliasToCanonical.get(row.emu_code);
        if (aliasCanonicalEmuCode) {
            const targetGroupKey = buildTargetGroupKey(
                row.train_code,
                aliasCanonicalEmuCode,
                row.service_date
            );
            const targetGroup = groupedRows.get(targetGroupKey) ?? {
                train_code: row.train_code,
                service_date: row.service_date,
                canonical_emu_code: aliasCanonicalEmuCode,
                rows: []
            };
            targetGroup.rows.push(row);
            groupedRows.set(targetGroupKey, targetGroup);
            continue;
        }

        const currentGroupKey = buildTargetGroupKey(
            row.train_code,
            row.emu_code,
            row.service_date
        );
        if (!impactedTargetKeys.has(currentGroupKey)) {
            continue;
        }

        const targetGroup = groupedRows.get(currentGroupKey) ?? {
            train_code: row.train_code,
            service_date: row.service_date,
            canonical_emu_code: row.emu_code,
            rows: []
        };
        targetGroup.rows.push(row);
        groupedRows.set(currentGroupKey, targetGroup);
    }

    tableSummary.impactedGroups = groupedRows.size;
    const actions = [];
    for (const targetGroup of groupedRows.values()) {
        analyzeTargetGroup(tableName, targetGroup, actions, tableSummary);
    }

    return {
        tableSummary,
        aliasHitCodes,
        actions
    };
}

function validateCurrentSchema(statements) {
    const dailyColumnNames = new Set(
        statements.selectDailyColumns.all().map((row) => row.name)
    );
    const probeColumnNames = new Set(
        statements.selectProbeColumns.all().map((row) => row.name)
    );
    const requiredDailyColumns = [
        'id',
        'train_code',
        'emu_code',
        'service_date',
        'timetable_id'
    ];
    const requiredProbeColumns = [
        'id',
        'train_code',
        'emu_code',
        'service_date',
        'timetable_id',
        'status'
    ];

    const missingDailyColumns = requiredDailyColumns.filter(
        (name) => !dailyColumnNames.has(name)
    );
    if (missingDailyColumns.length > 0) {
        throw new Error(
            `Unsupported daily_emu_routes schema: missing ${missingDailyColumns.join(', ')}`
        );
    }

    const missingProbeColumns = requiredProbeColumns.filter(
        (name) => !probeColumnNames.has(name)
    );
    if (missingProbeColumns.length > 0) {
        throw new Error(
            `Unsupported probe_status schema: missing ${missingProbeColumns.join(', ')}`
        );
    }
}

function createStatements(db) {
    return {
        selectDailyColumns: db.prepare(
            loadSql('assets/sql/emu/migrations/selectDailyEmuRoutesColumns.sql')
        ),
        selectProbeColumns: db.prepare(
            loadSql('assets/sql/emu/migrations/selectProbeStatusColumns.sql')
        ),
        selectDailyRows: db.prepare(
            loadSql(
                'assets/sql/emu/maintenance/selectAllDailyEmuRoutesForAliasRemap.sql'
            )
        ),
        selectProbeRows: db.prepare(
            loadSql(
                'assets/sql/emu/maintenance/selectAllProbeStatusRowsForAliasRemap.sql'
            )
        ),
        updateDailyRowById: db.prepare(
            loadSql('assets/sql/emu/maintenance/updateDailyEmuRouteAliasById.sql')
        ),
        deleteDailyRowById: db.prepare(
            loadSql('assets/sql/emu/maintenance/deleteDailyEmuRouteById.sql')
        ),
        updateProbeRowById: db.prepare(
            loadSql('assets/sql/emu/maintenance/updateProbeStatusAliasById.sql')
        ),
        deleteProbeRowById: db.prepare(
            loadSql('assets/sql/emu/maintenance/deleteProbeStatusById.sql')
        )
    };
}

function analyzeDatabase(db, aliasToCanonical, summary) {
    const statements = createStatements(db);
    validateCurrentSchema(statements);

    const dailyRows = statements.selectDailyRows.all();
    const probeRows = statements.selectProbeRows.all();

    const dailyAnalysis = analyzeTableRows(
        'daily_emu_routes',
        dailyRows,
        aliasToCanonical
    );
    const probeAnalysis = analyzeTableRows(
        'probe_status',
        probeRows,
        aliasToCanonical
    );
    const aliasHitCodes = new Set([
        ...dailyAnalysis.aliasHitCodes,
        ...probeAnalysis.aliasHitCodes
    ]);

    summary.tables.dailyEmuRoutes = dailyAnalysis.tableSummary;
    summary.tables.probeStatus = probeAnalysis.tableSummary;
    summary.aliasHits = aliasHitCodes.size;
    summary.unusedAliases = aliasToCanonical.size - aliasHitCodes.size;

    return {
        statements,
        dailyActions: dailyAnalysis.actions,
        probeActions: probeAnalysis.actions,
        conflictGroups:
            dailyAnalysis.tableSummary.conflictGroups +
            probeAnalysis.tableSummary.conflictGroups
    };
}

function applyActions(db, statements, dailyActions, probeActions) {
    const applyChanges = db.transaction(() => {
        for (const action of dailyActions) {
            for (const deleteId of action.deleteIds) {
                statements.deleteDailyRowById.run(deleteId);
            }

            statements.updateDailyRowById.run(
                action.canonicalEmuCode,
                action.timetableId,
                action.keeperId
            );
        }

        for (const action of probeActions) {
            for (const deleteId of action.deleteIds) {
                statements.deleteProbeRowById.run(deleteId);
            }

            statements.updateProbeRowById.run(
                action.canonicalEmuCode,
                action.timetableId,
                action.status,
                action.keeperId
            );
        }
    });

    applyChanges();
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const inputRows = readJsonlRows(options.inputPath);
    const mapping = buildAliasMapping(inputRows);
    const summary = buildSummarySkeleton(
        options.inputPath,
        options.dbPath,
        mapping,
        options.apply ? 'apply' : 'dry-run'
    );

    if (!existsSync(options.dbPath)) {
        throw new Error(`Database file does not exist: ${options.dbPath}`);
    }

    const db = new Database(options.dbPath);
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');

    try {
        const analysis = analyzeDatabase(db, mapping.aliasToCanonical, summary);

        if (options.apply && analysis.conflictGroups > 0) {
            console.log(JSON.stringify(summary, null, 2));
            throw new Error(
                `Refusing to apply remap because ${analysis.conflictGroups} conflict group(s) require manual resolution`
            );
        }

        if (options.apply) {
            applyActions(
                db,
                analysis.statements,
                analysis.dailyActions,
                analysis.probeActions
            );
        }
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
