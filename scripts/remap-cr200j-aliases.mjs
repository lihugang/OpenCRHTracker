import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_INPUT_PATH = 'data/emu_list.json';
const DEFAULT_DB_PATH = 'data/emu.db';
const MAX_CONFLICT_SAMPLES = 20;
const STATUS_CONFIRMED_BIT = 0x01;
const STATUS_POSITION_MASK = 0x06;
const STATUS_POSITION_COUPLED_UNKNOWN = 0x02;
const STATUS_POSITION_COUPLED_I = 0x04;
const STATUS_POSITION_COUPLED_II = 0x06;
const STATUS_FAULT_BIT = 0x08;
const STATUS_HOT_SPARE_BIT = 0x10;
const SHANGHAI_OFFSET_SECONDS = 8 * 60 * 60;
const DAY_SECONDS = 24 * 60 * 60;
const EPOCH_SERVICE_DAY_START_SECONDS =
    Date.UTC(1970, 0, 1, 0, 0, 0) / 1000 - SHANGHAI_OFFSET_SECONDS;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

function printHelp() {
    console.log(`Usage: node scripts/remap-cr200j-aliases.mjs [options]

Options:
    --apply         Apply the remap. Without this flag the script only
                    analyzes the database and prints a dry-run summary.
    --input=<path>  Allocation export JSON input path. Default: ${DEFAULT_INPUT_PATH}
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

function dayNumberToServiceDate(dayNumber) {
    if (!Number.isInteger(dayNumber) || dayNumber < 0) {
        return '';
    }
    const timestampMs =
        (EPOCH_SERVICE_DAY_START_SECONDS + dayNumber * DAY_SECONDS) * 1000;
    const shifted = new Date(timestampMs + SHANGHAI_OFFSET_SECONDS * 1000);
    const year = shifted.getUTCFullYear();
    const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const day = String(shifted.getUTCDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

function formatTrainCode(row) {
    return `${normalizeText(row.train_prefix)}${row.train_number}`;
}

function mergeRouteStatuses(rows) {
    let confirmed = false;
    let position = 0x00;
    let fault = false;
    let hotSpare = false;

    for (const row of rows) {
        const status = Number(row.status);
        if (!Number.isInteger(status) || status < 0) {
            continue;
        }
        if ((status & STATUS_CONFIRMED_BIT) !== 0) {
            confirmed = true;
        }
        const rowPosition = status & STATUS_POSITION_MASK;
        if (rowPosition === STATUS_POSITION_COUPLED_II) {
            position = STATUS_POSITION_COUPLED_II;
        } else if (
            rowPosition === STATUS_POSITION_COUPLED_I &&
            position !== STATUS_POSITION_COUPLED_II
        ) {
            position = STATUS_POSITION_COUPLED_I;
        } else if (
            rowPosition === STATUS_POSITION_COUPLED_UNKNOWN &&
            position === 0x00
        ) {
            position = STATUS_POSITION_COUPLED_UNKNOWN;
        }
        if ((status & STATUS_FAULT_BIT) !== 0) {
            fault = true;
        }
        if ((status & STATUS_HOT_SPARE_BIT) !== 0) {
            hotSpare = true;
        }
    }

    return (
        (confirmed ? STATUS_CONFIRMED_BIT : 0x00) |
        position |
        (fault ? STATUS_FAULT_BIT : 0x00) |
        (hotSpare ? STATUS_HOT_SPARE_BIT : 0x00)
    );
}

function readEmuListRows(filePath) {
    if (!existsSync(filePath)) {
        throw new Error(`Input file does not exist: ${filePath}`);
    }

    const parsed = JSON.parse(readUtf8File(filePath));
    if (
        parsed === null ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed)
    ) {
        throw new Error(
            'Input file must contain an allocation export JSON object'
        );
    }

    const models = Array.isArray(parsed.trainset_models)
        ? parsed.trainset_models
        : [];
    const modelById = new Map(
        models
            .filter((row) => Number.isInteger(row?.id) && row.id > 0)
            .map((row) => [row.id, row])
    );
    const trainsets = Array.isArray(parsed.emu_trainsets)
        ? parsed.emu_trainsets
        : Array.isArray(parsed.trainsets)
          ? parsed.trainsets
          : [];

    return trainsets.map((row, index) => {
        const modelId = row?.model_id;
        const modelRow = modelById.get(modelId);
        if (!modelRow) {
            throw new Error(
                `Input row ${index + 1} references missing model_id ${modelId}`
            );
        }

        const remark =
            row?.remark !== null &&
            typeof row?.remark === 'object' &&
            !Array.isArray(row.remark)
                ? row.remark
                : {};

        return {
            model: modelRow.model,
            trainSetNo: row?.car_no,
            alias: remark.alias
        };
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
            'No CR200J alias rows were found in the input file. Update data/emu_list.json first.'
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
            dailyEmuRoutes: createTableSummary()
        }
    };
}

function buildTargetGroupKey(trainCode, emuId, serviceDate) {
    return [trainCode, emuId, serviceDate].join('|');
}

function chooseKeeperRow(rows, canonicalEmuId) {
    return [...rows].sort((left, right) => {
        const leftIsCanonical = left.emu_id === canonicalEmuId ? 1 : 0;
        const rightIsCanonical = right.emu_id === canonicalEmuId ? 1 : 0;
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
                canonical_emu_id: targetGroup.canonicalEmuId,
                timetable_ids: distinctResolvedTimetableIds,
                row_ids: targetGroup.rows.map((row) => row.id),
                emu_ids: [...new Set(targetGroup.rows.map((row) => row.emu_id))]
            });
        }
        return;
    }

    const nextTimetableId = distinctResolvedTimetableIds[0] ?? null;
    const keeper = chooseKeeperRow(
        targetGroup.rows,
        targetGroup.canonicalEmuId
    );
    const deleteIds = targetGroup.rows
        .filter((row) => row.id !== keeper.id)
        .map((row) => row.id);
    const nextStatus = mergeRouteStatuses(targetGroup.rows);

    const needsUpdate =
        keeper.emu_id !== targetGroup.canonicalEmuId ||
        keeper.timetable_id !== nextTimetableId ||
        keeper.status !== nextStatus;

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
            canonicalEmuId: targetGroup.canonicalEmuId,
            timetableId: nextTimetableId,
            status: nextStatus,
            deleteIds
        });
    }
}

function analyzeTableRows(
    tableName,
    rows,
    aliasToCanonical,
    emuIdToCode,
    codeToEmuId
) {
    const tableSummary = createTableSummary();
    const aliasHitCodes = new Set();
    const impactedTargetKeys = new Set();
    const normalizedRows = rows.map((row) => ({
        ...row,
        train_code: formatTrainCode(row),
        emu_code: normalizeText(emuIdToCode.get(Number(row.emu_id)) ?? ''),
        emu_id: Number(row.emu_id),
        service_date: dayNumberToServiceDate(row.service_date),
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
                codeToEmuId.get(canonicalEmuCode),
                row.service_date
            )
        );
    }

    const groupedRows = new Map();
    for (const row of normalizedRows) {
        const aliasCanonicalEmuCode = aliasToCanonical.get(row.emu_code);
        if (aliasCanonicalEmuCode) {
            const canonicalEmuId = codeToEmuId.get(aliasCanonicalEmuCode);
            if (canonicalEmuId === undefined) {
                continue;
            }
            const targetGroupKey = buildTargetGroupKey(
                row.train_code,
                canonicalEmuId,
                row.service_date
            );
            const targetGroup = groupedRows.get(targetGroupKey) ?? {
                train_code: row.train_code,
                service_date: row.service_date,
                canonicalEmuId,
                rows: []
            };
            targetGroup.rows.push(row);
            groupedRows.set(targetGroupKey, targetGroup);
            continue;
        }

        const currentGroupKey = buildTargetGroupKey(
            row.train_code,
            row.emu_id,
            row.service_date
        );
        if (!impactedTargetKeys.has(currentGroupKey)) {
            continue;
        }

        const targetGroup = groupedRows.get(currentGroupKey) ?? {
            train_code: row.train_code,
            service_date: row.service_date,
            canonicalEmuId: row.emu_id,
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
    const requiredDailyColumns = [
        'id',
        'train_prefix',
        'train_number',
        'emu_id',
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
}

function createStatements(db) {
    return {
        selectDailyColumns: db.prepare(
            loadSql('assets/sql/emu/migrations/selectDailyEmuRoutesColumns.sql')
        ),
        selectDailyRows: db.prepare(
            loadSql(
                'assets/sql/emu/maintenance/selectAllDailyEmuRoutesForAliasRemap.sql'
            )
        ),
        updateDailyRowById: db.prepare(
            loadSql(
                'assets/sql/emu/maintenance/updateDailyEmuRouteAliasById.sql'
            )
        ),
        deleteDailyRowById: db.prepare(
            loadSql('assets/sql/emu/maintenance/deleteDailyEmuRouteById.sql')
        ),
        selectEmuCodeMapping: db.prepare(
            loadSql('assets/sql/emu/exports/selectExportEmuCodeMappings.sql')
        )
    };
}

function analyzeDatabase(db, aliasToCanonical, summary) {
    const statements = createStatements(db);
    validateCurrentSchema(statements);

    const dailyRows = statements.selectDailyRows.all();
    const emuIdToCode = new Map();
    const codeToEmuId = new Map();
    for (const row of statements.selectEmuCodeMapping.all()) {
        const emuId = Number(row.id);
        const emuCode = normalizeText(row.emu_code);
        if (Number.isInteger(emuId) && emuId > 0 && emuCode.length > 0) {
            emuIdToCode.set(emuId, emuCode);
            if (!codeToEmuId.has(emuCode)) {
                codeToEmuId.set(emuCode, emuId);
            }
        }
    }

    const dailyAnalysis = analyzeTableRows(
        'daily_emu_routes',
        dailyRows,
        aliasToCanonical,
        emuIdToCode,
        codeToEmuId
    );
    const aliasHitCodes = new Set([...dailyAnalysis.aliasHitCodes]);

    summary.tables.dailyEmuRoutes = dailyAnalysis.tableSummary;
    summary.aliasHits = aliasHitCodes.size;
    summary.unusedAliases = aliasToCanonical.size - aliasHitCodes.size;

    return {
        statements,
        dailyActions: dailyAnalysis.actions,
        conflictGroups: dailyAnalysis.tableSummary.conflictGroups
    };
}

function applyActions(db, statements, dailyActions) {
    const applyChanges = db.transaction(() => {
        for (const action of dailyActions) {
            for (const deleteId of action.deleteIds) {
                statements.deleteDailyRowById.run(deleteId);
            }

            statements.updateDailyRowById.run(
                action.canonicalEmuId,
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
    const inputRows = readEmuListRows(options.inputPath);
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
            applyActions(db, analysis.statements, analysis.dailyActions);
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
