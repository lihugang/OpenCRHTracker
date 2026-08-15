#!/usr/bin/env node

import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    statSync
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const DEFAULT_CONFIG_PATH = 'data/config.json';
const SAMPLE_LIMIT = 20;

function printHelp() {
    console.log(`Usage: node scripts/repair-timetable-history-content-ids.mjs [options]

Options:
    --apply                 Apply the repair. Without this flag the script only
                            prints a dry-run summary.
    --config=<path>         Config JSON path. Default: ${DEFAULT_CONFIG_PATH}
    --timetable-db=<path>   Override the timetable history database path.
    --emu-db=<path>         Override the EMU database path.
    --backup-dir=<path>     Backup directory for --apply. By default a new
                            directory is created below data/backup.
    --help                  Show this message.
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

function assertFileExists(filePath, label) {
    if (!existsSync(filePath)) {
        throw new Error(`${label} does not exist: ${filePath}`);
    }
    if (!statSync(filePath).isFile()) {
        throw new Error(`${label} is not a file: ${filePath}`);
    }
}

function sha256(text) {
    return createHash('sha256').update(text, 'utf8').digest('hex');
}

function stableSemanticJson(value) {
    if (Array.isArray(value)) {
        return `[${value.map(stableSemanticJson).join(',')}]`;
    }
    if (value !== null && typeof value === 'object') {
        return `{${Object.keys(value)
            .sort()
            .map(
                (key) =>
                    `${JSON.stringify(key)}:${stableSemanticJson(value[key])}`
            )
            .join(',')}}`;
    }
    return JSON.stringify(value);
}

function parseContent(row) {
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

    return {
        row,
        semanticKey: stableSemanticJson(parsed),
        actualHash: sha256(row.timetable_json),
        stopCount: parsed.stops.length,
        isV2: parsed.__opencrh_internal_schema_version === 2
    };
}

function chooseRepresentative(entries) {
    return [...entries].sort((left, right) => {
        const leftScore =
            (left.isV2 && left.row.hash === left.actualHash ? 4 : 0) +
            (left.isV2 ? 2 : 0) +
            (left.row.hash === left.actualHash ? 1 : 0);
        const rightScore =
            (right.isV2 && right.row.hash === right.actualHash ? 4 : 0) +
            (right.isV2 ? 2 : 0) +
            (right.row.hash === right.actualHash ? 1 : 0);
        if (leftScore !== rightScore) {
            return rightScore - leftScore;
        }
        if (left.row.created_at !== right.row.created_at) {
            return right.row.created_at - left.row.created_at;
        }
        return left.row.id - right.row.id;
    })[0];
}

function buildContentPlan(contentRows) {
    const entries = contentRows.map(parseContent);
    const groupsByKey = new Map();
    for (const entry of entries) {
        const group = groupsByKey.get(entry.semanticKey) ?? [];
        group.push(entry);
        groupsByKey.set(entry.semanticKey, group);
    }

    const remap = new Map();
    const referenceMap = new Map();
    const groups = [];
    const updates = [];
    const temporaryUpdates = [];

    for (const groupEntries of groupsByKey.values()) {
        const keeper = [...groupEntries].sort(
            (left, right) => left.row.id - right.row.id
        )[0];
        const representative = chooseRepresentative(groupEntries);
        const duplicate = groupEntries.length > 1;
        const desiredHash = representative.actualHash;
        const desiredJson = representative.row.timetable_json;
        const desiredStopCount = representative.stopCount;

        if (duplicate) {
            for (const entry of groupEntries) {
                referenceMap.set(entry.row.id, keeper.row.id);
                if (entry.row.id !== keeper.row.id) {
                    remap.set(entry.row.id, keeper.row.id);
                }
                temporaryUpdates.push(entry.row.id);
            }
        }

        if (
            duplicate ||
            keeper.row.hash !== desiredHash ||
            keeper.row.timetable_json !== desiredJson ||
            keeper.row.stop_count !== desiredStopCount
        ) {
            updates.push({
                id: keeper.row.id,
                hash: desiredHash,
                timetableJson: desiredJson,
                stopCount: desiredStopCount
            });
            if (!duplicate) {
                temporaryUpdates.push(keeper.row.id);
            }
        }

        if (duplicate) {
            groups.push({
                semanticKey: groupEntries[0].semanticKey,
                keeperId: keeper.row.id,
                representativeId: representative.row.id,
                sourceIds: groupEntries.map((entry) => entry.row.id),
                removedIds: groupEntries
                    .filter((entry) => entry.row.id !== keeper.row.id)
                    .map((entry) => entry.row.id),
                desiredHash,
                desiredJson,
                desiredStopCount
            });
        }
    }

    return {
        entries,
        groups,
        remap,
        referenceMap,
        updates,
        temporaryUpdates: [...new Set(temporaryUpdates)]
    };
}

function buildCoveragePlan(coverageRows, contentRemap) {
    const remappedRows = coverageRows.map((row) => ({
        ...row,
        originalContentId: row.content_id,
        content_id: contentRemap.get(row.content_id) ?? row.content_id
    }));
    const sortedRows = [...remappedRows].sort((left, right) => {
        if (left.train_prefix !== right.train_prefix) {
            return left.train_prefix.localeCompare(right.train_prefix);
        }
        if (left.train_number !== right.train_number) {
            return left.train_number - right.train_number;
        }
        if (left.service_date_start !== right.service_date_start) {
            return left.service_date_start - right.service_date_start;
        }
        return left.id - right.id;
    });
    const mergeGroups = [];
    let current = null;

    function appendCurrent() {
        if (current !== null && current.rows.length > 1) {
            const keeper = current.rows[0];
            mergeGroups.push({
                keeperId: keeper.id,
                removedIds: current.rows.slice(1).map((row) => row.id),
                trainPrefix: keeper.train_prefix,
                trainNumber: keeper.train_number,
                contentId: keeper.content_id,
                serviceDateStart: current.serviceDateStart,
                serviceDateEndExclusive: current.serviceDateEndExclusive,
                rows: current.rows
            });
        }
    }

    for (const row of sortedRows) {
        const canAppend =
            current !== null &&
            current.trainPrefix === row.train_prefix &&
            current.trainNumber === row.train_number &&
            current.contentId === row.content_id &&
            row.service_date_start <= current.serviceDateEndExclusive;
        if (!canAppend) {
            appendCurrent();
            current = {
                trainPrefix: row.train_prefix,
                trainNumber: row.train_number,
                contentId: row.content_id,
                serviceDateStart: row.service_date_start,
                serviceDateEndExclusive: row.service_date_end_exclusive,
                rows: [row]
            };
            continue;
        }
        current.rows.push(row);
        current.serviceDateEndExclusive = Math.max(
            current.serviceDateEndExclusive,
            row.service_date_end_exclusive
        );
    }
    appendCurrent();

    return {
        remappedRows,
        referenceUpdates: remappedRows.filter(
            (row) => row.originalContentId !== row.content_id
        ).length,
        mergeGroups,
        rowsDeleted: mergeGroups.reduce(
            (count, group) => count + group.removedIds.length,
            0
        )
    };
}

function emuGroupKey(row, timetableId) {
    return `${row.train_prefix}:${row.train_number}:${row.emu_id}:${row.service_date}:${timetableId}`;
}

function buildEmuTablePlan(rows, contentReferenceMap, kind) {
    const groupsByKey = new Map();
    for (const row of rows) {
        if (row.timetable_id === null || row.timetable_id === undefined) {
            continue;
        }
        const targetId = contentReferenceMap.get(row.timetable_id);
        if (targetId === undefined) {
            continue;
        }
        const key = emuGroupKey(row, targetId);
        const group = groupsByKey.get(key) ?? [];
        group.push({ ...row, targetId });
        groupsByKey.set(key, group);
    }

    const actions = [];
    for (const rowsForKey of groupsByKey.values()) {
        const targetId = rowsForKey[0].targetId;
        const keeper = [...rowsForKey].sort((left, right) => {
            const leftMatches = left.timetable_id === targetId ? 1 : 0;
            const rightMatches = right.timetable_id === targetId ? 1 : 0;
            if (leftMatches !== rightMatches) {
                return rightMatches - leftMatches;
            }
            return left.id - right.id;
        })[0];
        const status =
            kind === 'probe'
                ? Math.max(...rowsForKey.map((row) => row.status))
                : null;
        actions.push({
            kind,
            keeperId: keeper.id,
            timetableId: targetId,
            status,
            deleteIds: rowsForKey
                .filter((row) => row.id !== keeper.id)
                .map((row) => row.id),
            needsUpdate:
                keeper.timetable_id !== targetId ||
                (kind === 'probe' && keeper.status !== status)
        });
    }
    return actions;
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
        updateContent: db.prepare(
            loadSql(
                'assets/sql/timetable-history/maintenance/updateContentById.sql'
            )
        ),
        updateCoverageContent: db.prepare(
            loadSql(
                'assets/sql/timetable-history/maintenance/updateCoverageContentReferences.sql'
            )
        ),
        updateCoverageRange: db.prepare(
            loadSql(
                'assets/sql/timetable-history/maintenance/updateCoverageRangeById.sql'
            )
        ),
        deleteCoverage: db.prepare(
            loadSql(
                'assets/sql/timetable-history/maintenance/deleteCoverageById.sql'
            )
        ),
        deleteContent: db.prepare(
            loadSql(
                'assets/sql/timetable-history/maintenance/deleteContentById.sql'
            )
        )
    };
}

function loadEmuStatements(db, attached) {
    const prefix = attached ? 'Attached' : '';
    return {
        selectDaily: db.prepare(
            loadSql(
                `assets/sql/emu/maintenance/selectAllDailyEmuRoutes${prefix}.sql`
            )
        ),
        selectProbe: db.prepare(
            loadSql(
                `assets/sql/emu/maintenance/selectAllProbeStatusRows${prefix}.sql`
            )
        ),
        updateDaily: db.prepare(
            loadSql(
                `assets/sql/emu/maintenance/updateDailyEmuRouteTimetableId${prefix}.sql`
            )
        ),
        updateProbe: db.prepare(
            loadSql(
                `assets/sql/emu/maintenance/updateProbeStatusTimetableId${prefix}.sql`
            )
        ),
        deleteDaily: db.prepare(
            loadSql(
                `assets/sql/emu/maintenance/deleteDailyEmuRouteById${attached ? 'Attached' : ''}.sql`
            )
        ),
        deleteProbe: db.prepare(
            loadSql(
                `assets/sql/emu/maintenance/deleteProbeStatusById${attached ? 'Attached' : ''}.sql`
            )
        )
    };
}

function scanAffectedEmuRows(statement, contentReferenceMap) {
    const affectedRows = [];
    let scannedRows = 0;
    for (const row of statement.iterate()) {
        scannedRows += 1;
        if (
            row.timetable_id !== null &&
            row.timetable_id !== undefined &&
            contentReferenceMap.has(row.timetable_id)
        ) {
            affectedRows.push(row);
        }
    }
    return {
        scannedRows,
        affectedRows
    };
}

function analyze(historyStatements, emuStatements) {
    const contentRows = historyStatements.selectContents.all();
    const coverageRows = historyStatements.selectCoverages.all();
    const contentPlan = buildContentPlan(contentRows);
    const dailyScan = scanAffectedEmuRows(
        emuStatements.selectDaily,
        contentPlan.referenceMap
    );
    const probeScan = scanAffectedEmuRows(
        emuStatements.selectProbe,
        contentPlan.referenceMap
    );
    const coveragePlan = buildCoveragePlan(coverageRows, contentPlan.remap);
    const dailyPlan = buildEmuTablePlan(
        dailyScan.affectedRows,
        contentPlan.referenceMap,
        'daily'
    );
    const probePlan = buildEmuTablePlan(
        probeScan.affectedRows,
        contentPlan.referenceMap,
        'probe'
    );

    return {
        contentRows,
        coverageRows,
        dailyScan,
        probeScan,
        contentPlan,
        coveragePlan,
        dailyPlan,
        probePlan
    };
}

function buildSummary(analysis, mode, paths, backupDir = null) {
    const { contentRows, coverageRows, dailyScan, probeScan } = analysis;
    const { contentPlan, coveragePlan, dailyPlan, probePlan } = analysis;
    const hashMismatches = contentPlan.entries.filter(
        (entry) => entry.row.hash !== entry.actualHash
    ).length;
    const changedContentRows = contentPlan.updates.length;
    const dailyUpdated = dailyPlan.filter(
        (action) => action.needsUpdate
    ).length;
    const probeUpdated = probePlan.filter(
        (action) => action.needsUpdate
    ).length;
    return {
        mode,
        timetableDbPath: paths.timetableDbPath,
        emuDbPath: paths.emuDbPath,
        backupDir,
        scannedContents: contentRows.length,
        hashMismatches,
        semanticDuplicateGroups: contentPlan.groups.length,
        duplicateContentIds: contentPlan.groups.reduce(
            (count, group) => count + group.removedIds.length,
            0
        ),
        contentRowsToUpdate: changedContentRows,
        scannedCoverages: coverageRows.length,
        coverageReferenceUpdates: coveragePlan.referenceUpdates,
        coverageMergeGroups: coveragePlan.mergeGroups.length,
        coverageRowsToDelete: coveragePlan.rowsDeleted,
        scannedDailyRows: dailyScan.scannedRows,
        affectedDailyRows: dailyScan.affectedRows.length,
        dailyRowsToUpdate: dailyUpdated,
        dailyRowsToDelete: dailyPlan.reduce(
            (count, action) => count + action.deleteIds.length,
            0
        ),
        scannedProbeRows: probeScan.scannedRows,
        affectedProbeRows: probeScan.affectedRows.length,
        probeRowsToUpdate: probeUpdated,
        probeRowsToDelete: probePlan.reduce(
            (count, action) => count + action.deleteIds.length,
            0
        ),
        samples: {
            contentGroups: contentPlan.groups
                .slice(0, SAMPLE_LIMIT)
                .map((group) => ({
                    keeperId: group.keeperId,
                    representativeId: group.representativeId,
                    sourceIds: group.sourceIds,
                    hash: group.desiredHash
                })),
            coverageMerges: coveragePlan.mergeGroups
                .slice(0, SAMPLE_LIMIT)
                .map((group) => ({
                    trainCode: `${group.trainPrefix}${group.trainNumber}`,
                    contentId: group.contentId,
                    keeperId: group.keeperId,
                    removedIds: group.removedIds,
                    range: [
                        group.serviceDateStart,
                        group.serviceDateEndExclusive
                    ]
                }))
        }
    };
}

function applyEmuPlan(statements, dailyPlan, probePlan) {
    for (const action of dailyPlan) {
        for (const id of action.deleteIds) {
            statements.deleteDaily.run(id);
        }
    }
    for (const action of dailyPlan) {
        if (action.needsUpdate) {
            statements.updateDaily.run(action.timetableId, action.keeperId);
        }
    }
    for (const action of probePlan) {
        for (const id of action.deleteIds) {
            statements.deleteProbe.run(id);
        }
    }
    for (const action of probePlan) {
        if (action.needsUpdate) {
            statements.updateProbe.run(
                action.timetableId,
                action.status,
                action.keeperId
            );
        }
    }
}

function applyHistoryPlan(statements, analysis) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const { contentPlan, coveragePlan } = analysis;
    for (const id of contentPlan.temporaryUpdates) {
        statements.updateContent.run(
            `repair-temporary:${nowSeconds}:${id}`,
            '{}',
            0,
            id
        );
    }
    for (const update of contentPlan.updates) {
        statements.updateContent.run(
            update.hash,
            update.timetableJson,
            update.stopCount,
            update.id
        );
    }
    for (const [fromId, toId] of contentPlan.remap) {
        statements.updateCoverageContent.run(toId, nowSeconds, fromId);
    }
    for (const group of coveragePlan.mergeGroups) {
        statements.updateCoverageRange.run(
            group.serviceDateStart,
            group.serviceDateEndExclusive,
            nowSeconds,
            group.keeperId
        );
        for (const id of group.removedIds) {
            statements.deleteCoverage.run(id);
        }
    }
    for (const group of contentPlan.groups) {
        for (const id of group.removedIds) {
            statements.deleteContent.run(id);
        }
    }
}

function validateEmuReferences(statement, contentIds, label) {
    for (const row of statement.iterate()) {
        if (
            row.timetable_id !== null &&
            row.timetable_id !== undefined &&
            !contentIds.has(row.timetable_id)
        ) {
            throw new Error(
                `Validation failed: orphan ${label} timetable ID reference ${row.timetable_id} row_id=${row.id}`
            );
        }
    }
}

function validateAppliedState(historyStatements, emuStatements) {
    const analysis = analyze(historyStatements, emuStatements);
    const hashMismatches = analysis.contentPlan.entries.filter(
        (entry) => entry.row.hash !== entry.actualHash
    );
    if (hashMismatches.length > 0) {
        throw new Error(
            `Validation failed: ${hashMismatches.length} content hash mismatch(es) remain`
        );
    }
    if (analysis.contentPlan.groups.length > 0) {
        throw new Error(
            `Validation failed: ${analysis.contentPlan.groups.length} duplicate content group(s) remain`
        );
    }
    if (analysis.coveragePlan.referenceUpdates > 0) {
        throw new Error(
            `Validation failed: ${analysis.coveragePlan.referenceUpdates} coverage reference update(s) remain`
        );
    }
    if (analysis.coveragePlan.mergeGroups.length > 0) {
        throw new Error(
            `Validation failed: ${analysis.coveragePlan.mergeGroups.length} coverage merge group(s) remain`
        );
    }
    const contentIds = new Set(analysis.contentRows.map((row) => row.id));
    for (const row of analysis.coverageRows) {
        if (!contentIds.has(row.content_id)) {
            throw new Error(
                `Validation failed: orphan timetable content reference ${row.content_id}`
            );
        }
    }
    validateEmuReferences(emuStatements.selectDaily, contentIds, 'daily route');
    validateEmuReferences(
        emuStatements.selectProbe,
        contentIds,
        'probe status'
    );
    return analysis;
}

async function createBackups(paths, backupDir) {
    if (existsSync(backupDir)) {
        if (readdirSync(backupDir).length > 0) {
            throw new Error(`Backup directory is not empty: ${backupDir}`);
        }
    } else {
        mkdirSync(backupDir, { recursive: true });
    }

    const timetableSource = new Database(paths.timetableDbPath, {
        readonly: true
    });
    const emuSource = new Database(paths.emuDbPath, { readonly: true });
    try {
        await timetableSource.backup(
            resolve(backupDir, 'timetable-history.db')
        );
        await emuSource.backup(resolve(backupDir, 'emu.db'));
    } finally {
        timetableSource.close();
        emuSource.close();
    }
}

function defaultBackupDir() {
    const timestamp = new Date()
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}Z$/, 'Z');
    return resolve(
        repoRoot,
        `data/backup/timetable-content-repair-${timestamp}`
    );
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const configPaths =
        options.timetableDbPath && options.emuDbPath
            ? null
            : loadConfig(options.configPath);
    const paths = {
        timetableDbPath: options.timetableDbPath || configPaths.timetableDbPath,
        emuDbPath: options.emuDbPath || configPaths.emuDbPath
    };
    assertFileExists(paths.timetableDbPath, 'Timetable history database');
    assertFileExists(paths.emuDbPath, 'EMU database');

    const historyDb = new Database(paths.timetableDbPath, {
        readonly: !options.apply
    });
    historyDb.pragma('busy_timeout = 30000');
    historyDb.pragma('foreign_keys = ON');
    const historyStatements = loadHistoryStatements(historyDb);
    let emuDb = null;
    let emuStatements;
    let analysis;
    try {
        if (options.apply) {
            const attach = historyDb.prepare(
                loadSql('assets/sql/emu/maintenance/attachDatabase.sql')
            );
            attach.run(paths.emuDbPath);
            emuStatements = loadEmuStatements(historyDb, true);
        } else {
            emuDb = new Database(paths.emuDbPath, { readonly: true });
            emuDb.pragma('busy_timeout = 30000');
            emuStatements = loadEmuStatements(emuDb, false);
        }

        analysis = analyze(historyStatements, emuStatements);
        const backupDir = options.apply
            ? options.backupDir || defaultBackupDir()
            : null;
        console.log(
            JSON.stringify(
                buildSummary(
                    analysis,
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

        await createBackups(paths, backupDir);
        const transaction = historyDb.transaction(() => {
            applyEmuPlan(emuStatements, analysis.dailyPlan, analysis.probePlan);
            applyHistoryPlan(historyStatements, analysis);
            validateAppliedState(historyStatements, emuStatements);
            const integrity = historyDb.pragma('integrity_check');
            if (integrity[0]?.integrity_check !== 'ok') {
                throw new Error(
                    `Validation failed: timetable database integrity check returned ${JSON.stringify(integrity[0])}`
                );
            }
            const emuIntegrity = historyDb
                .prepare(
                    loadSql(
                        'assets/sql/emu/maintenance/integrityCheckAttached.sql'
                    )
                )
                .all();
            if (emuIntegrity[0]?.integrity_check !== 'ok') {
                throw new Error(
                    `Validation failed: EMU database integrity check returned ${JSON.stringify(emuIntegrity[0])}`
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
                    loadSql(
                        'assets/sql/emu/maintenance/foreignKeyCheckAttached.sql'
                    )
                )
                .all();
            if (emuForeignKeys.length > 0) {
                throw new Error(
                    `Validation failed: EMU database foreign_key_check returned ${JSON.stringify(emuForeignKeys[0])}`
                );
            }
        });
        transaction();
        console.log(
            JSON.stringify(
                {
                    status: 'applied',
                    backupDir,
                    postApply: buildSummary(
                        analyze(historyStatements, emuStatements),
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
        if (emuDb) {
            emuDb.close();
        }
        historyDb.close();
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
