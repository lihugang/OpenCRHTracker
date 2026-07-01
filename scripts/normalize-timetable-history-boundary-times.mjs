import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_CONFIG_PATH = 'data/config.json';
const SAMPLE_LIMIT = 20;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

function printHelp() {
    console.log(`Usage: node scripts/normalize-timetable-history-boundary-times.mjs [options]

Options:
    --apply         Apply the normalization. Without this flag the script only
                    prints a dry-run summary.
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

function loadSql(relativePath) {
    return readUtf8File(resolve(repoRoot, relativePath));
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

function normalizeOptionalInteger(value) {
    return Number.isInteger(value) && value >= 0 ? value : null;
}

function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeStoredStop(rawStop, fallbackStationNo) {
    if (
        rawStop === null ||
        typeof rawStop !== 'object' ||
        Array.isArray(rawStop)
    ) {
        return null;
    }

    const stationNo =
        Number.isInteger(rawStop.stationNo) && rawStop.stationNo >= 0
            ? rawStop.stationNo
            : fallbackStationNo;
    const stationName = normalizeText(rawStop.stationName);
    if (stationName.length === 0) {
        return null;
    }

    return {
        stationNo,
        stationName,
        arriveAt: normalizeOptionalInteger(rawStop.arriveAt),
        departAt: normalizeOptionalInteger(rawStop.departAt),
        stationTrainCode: normalizeText(rawStop.stationTrainCode).toUpperCase()
    };
}

function normalizeBoundaryStopTimes(stops) {
    if (stops.length === 0) {
        return [];
    }

    const lastIndex = stops.length - 1;
    return stops.map((stop, index) => ({
        ...stop,
        arriveAt: index === 0 ? null : stop.arriveAt,
        departAt: index === lastIndex ? null : stop.departAt
    }));
}

function normalizeTimetableJson(rawJson) {
    const parsed = JSON.parse(rawJson);
    const rawStops = Array.isArray(parsed?.stops) ? parsed.stops : [];
    const stops = rawStops
        .map((stop, index) => normalizeStoredStop(stop, index + 1))
        .filter((stop) => stop !== null);
    const normalizedStops = normalizeBoundaryStopTimes(stops);
    const timetableJson = JSON.stringify({
        stops: normalizedStops
    });

    return {
        hash: createHash('sha256').update(timetableJson, 'utf8').digest('hex'),
        timetableJson,
        stopCount: normalizedStops.length
    };
}

function loadStatements(db) {
    return {
        selectAllContents: db.prepare(
            loadSql(
                'assets/sql/timetable-history/maintenance/selectAllContents.sql'
            )
        ),
        selectAllCoverages: db.prepare(
            loadSql(
                'assets/sql/timetable-history/maintenance/selectAllCoverages.sql'
            )
        ),
        updateContentById: db.prepare(
            loadSql(
                'assets/sql/timetable-history/maintenance/updateContentById.sql'
            )
        ),
        updateCoverageContentReferences: db.prepare(
            loadSql(
                'assets/sql/timetable-history/maintenance/updateCoverageContentReferences.sql'
            )
        ),
        updateCoverageRangeById: db.prepare(
            loadSql(
                'assets/sql/timetable-history/maintenance/updateCoverageRangeById.sql'
            )
        ),
        deleteCoverageById: db.prepare(
            loadSql(
                'assets/sql/timetable-history/maintenance/deleteCoverageById.sql'
            )
        )
    };
}

function buildContentPlan(contentRows) {
    const entries = [];
    const errors = [];
    const entriesByHash = new Map();

    for (const row of contentRows) {
        try {
            const normalized = normalizeTimetableJson(row.timetable_json);
            const boundaryChanged =
                row.timetable_json !== normalized.timetableJson ||
                row.stop_count !== normalized.stopCount;
            const entry = {
                row,
                ...normalized,
                boundaryChanged,
                changed:
                    row.hash !== normalized.hash ||
                    boundaryChanged
            };
            entries.push(entry);

            const sameHashEntries = entriesByHash.get(entry.hash) ?? [];
            sameHashEntries.push(entry);
            entriesByHash.set(entry.hash, sameHashEntries);
        } catch (error) {
            errors.push({
                id: row.id,
                message: error instanceof Error ? error.message : String(error)
            });
        }
    }

    if (errors.length > 0) {
        const sample = errors
            .slice(0, SAMPLE_LIMIT)
            .map((error) => `${error.id}: ${error.message}`)
            .join('; ');
        throw new Error(`Invalid timetable_json rows: ${sample}`);
    }

    const contentUpdates = [];
    const contentRemaps = [];

    for (const sameHashEntries of entriesByHash.values()) {
        const sortedEntries = [...sameHashEntries].sort(
            (left, right) => left.row.id - right.row.id
        );
        const keeper = sortedEntries[0];

        for (const redundant of sortedEntries.slice(1)) {
            contentRemaps.push({
                fromContentId: redundant.row.id,
                toContentId: keeper.row.id,
                hash: keeper.hash
            });
            const compatibilityHash = `${keeper.hash}:normalized:${redundant.row.id}`;
            if (
                redundant.row.hash !== compatibilityHash ||
                redundant.row.timetable_json !== redundant.timetableJson ||
                redundant.row.stop_count !== redundant.stopCount
            ) {
                contentUpdates.push({
                    id: redundant.row.id,
                    hash: compatibilityHash,
                    timetableJson: redundant.timetableJson,
                    stopCount: redundant.stopCount
                });
            }
        }

        if (keeper.changed) {
            contentUpdates.push({
                id: keeper.row.id,
                hash: keeper.hash,
                timetableJson: keeper.timetableJson,
                stopCount: keeper.stopCount
            });
        }
    }

    return {
        entries,
        contentUpdates,
        contentRemaps
    };
}

function remapCoverageContentIds(rows, contentRemaps) {
    const contentIdMap = new Map(
        contentRemaps.map((remap) => [remap.fromContentId, remap.toContentId])
    );

    return rows.map((row) => ({
        ...row,
        original_content_id: row.content_id,
        content_id: contentIdMap.get(row.content_id) ?? row.content_id
    }));
}

function appendMergeRun(mergeRuns, currentRun) {
    if (currentRun !== null && currentRun.rows.length > 1) {
        mergeRuns.push(currentRun);
    }
}

function buildCoverageMergeRuns(rows) {
    const mergeRuns = [];
    let currentRun = null;

    for (const row of rows) {
        const canAppend =
            currentRun !== null &&
            currentRun.trainCode === row.train_code &&
            currentRun.contentId === row.content_id &&
            row.service_date_start <= currentRun.serviceDateEndExclusive;

        if (canAppend) {
            currentRun.rows.push(row);
            currentRun.serviceDateEndExclusive = Math.max(
                currentRun.serviceDateEndExclusive,
                row.service_date_end_exclusive
            );
            continue;
        }

        appendMergeRun(mergeRuns, currentRun);
        currentRun = {
            trainCode: row.train_code,
            contentId: row.content_id,
            serviceDateStart: row.service_date_start,
            serviceDateEndExclusive: row.service_date_end_exclusive,
            rows: [row]
        };
    }

    appendMergeRun(mergeRuns, currentRun);
    return mergeRuns;
}

function buildCoverageMergePlan(rows) {
    const mergeRuns = buildCoverageMergeRuns(rows);
    const mergeGroups = [];
    let updatedRows = 0;
    let deletedRows = 0;

    for (const run of mergeRuns) {
        const keeper = [...run.rows].sort((left, right) => {
            if (left.service_date_start !== right.service_date_start) {
                return left.service_date_start - right.service_date_start;
            }
            return left.id - right.id;
        })[0];
        const removedRows = run.rows.filter((row) => row.id !== keeper.id);
        const keeperRangeChanged =
            keeper.service_date_start !== run.serviceDateStart ||
            keeper.service_date_end_exclusive !==
                run.serviceDateEndExclusive;

        if (keeperRangeChanged) {
            updatedRows += 1;
        }
        deletedRows += removedRows.length;

        mergeGroups.push({
            trainCode: run.trainCode,
            contentId: run.contentId,
            rowCount: run.rows.length,
            keeperId: keeper.id,
            keeperRangeChanged,
            serviceDateStart: run.serviceDateStart,
            serviceDateEndExclusive: run.serviceDateEndExclusive,
            removedIds: removedRows.map((row) => row.id),
            rows: run.rows
        });
    }

    return {
        mergeGroups,
        updatedRows,
        deletedRows
    };
}

function buildSummary(
    dbPath,
    contentRows,
    coverageRows,
    contentPlan,
    coverageReferenceUpdates,
    mergePlan
) {
    const affectedTrainCodes = new Set(
        mergePlan.mergeGroups.map((group) => group.trainCode)
    );
    const normalizedContentRows = contentPlan.entries.filter(
        (entry) => entry.boundaryChanged
    );

    return {
        dbPath,
        scannedContents: contentRows.length,
        scannedCoverages: coverageRows.length,
        normalizedContents: normalizedContentRows.length,
        contentRowsUpdated: contentPlan.contentUpdates.length,
        retainedEquivalentContentRows: contentPlan.contentRemaps.length,
        contentRemaps: coverageReferenceUpdates,
        coverageRowsUpdatedForContentRemap: coverageReferenceUpdates,
        mergeGroups: mergePlan.mergeGroups.length,
        affectedTrainCodes: affectedTrainCodes.size,
        coverageRangeUpdates: mergePlan.updatedRows,
        coverageRowsDeleted: mergePlan.deletedRows,
        samples: {
            normalizedContents: normalizedContentRows
                .slice(0, SAMPLE_LIMIT)
                .map((entry) => ({
                    id: entry.row.id,
                    oldHash: entry.row.hash,
                    newHash: entry.hash,
                    stopCount: entry.stopCount
                })),
            contentRemaps: contentPlan.contentRemaps
                .slice(0, SAMPLE_LIMIT)
                .map((remap) => ({
                    fromContentId: remap.fromContentId,
                    toContentId: remap.toContentId,
                    hash: remap.hash
                })),
            coverageMerges: mergePlan.mergeGroups
                .slice(0, SAMPLE_LIMIT)
                .map((group) => ({
                    trainCode: group.trainCode,
                    contentId: group.contentId,
                    rowCount: group.rowCount,
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
        }
    };
}

function applyPlan(db, statements, contentPlan, mergePlan) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const transaction = db.transaction(() => {
        for (const update of contentPlan.contentUpdates) {
            statements.updateContentById.run(
                `temporary-normalized:${update.id}:${update.hash}`,
                update.timetableJson,
                update.stopCount,
                update.id
            );
        }

        for (const update of contentPlan.contentUpdates) {
            statements.updateContentById.run(
                update.hash,
                update.timetableJson,
                update.stopCount,
                update.id
            );
        }

        for (const remap of contentPlan.contentRemaps) {
            statements.updateCoverageContentReferences.run(
                remap.toContentId,
                nowSeconds,
                remap.fromContentId
            );
        }

        for (const group of mergePlan.mergeGroups) {
            if (group.keeperRangeChanged) {
                statements.updateCoverageRangeById.run(
                    group.serviceDateStart,
                    group.serviceDateEndExclusive,
                    nowSeconds,
                    group.keeperId
                );
            }

            for (const removedId of group.removedIds) {
                statements.deleteCoverageById.run(removedId);
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
        const statements = loadStatements(db);
        const contentRows = statements.selectAllContents.all();
        const coverageRows = statements.selectAllCoverages.all();
        const contentPlan = buildContentPlan(contentRows);
        const remappedCoverageRows = remapCoverageContentIds(
            coverageRows,
            contentPlan.contentRemaps
        );
        const coverageReferenceUpdates = remappedCoverageRows.filter(
            (row) => row.original_content_id !== row.content_id
        ).length;
        const mergePlan = buildCoverageMergePlan(remappedCoverageRows);
        const summary = buildSummary(
            dbPath,
            contentRows,
            coverageRows,
            contentPlan,
            coverageReferenceUpdates,
            mergePlan
        );

        console.log(
            JSON.stringify(
                {
                    mode: options.apply ? 'apply' : 'dry-run',
                    note: 'Boundary stop times are normalized to null. Coverage merging only joins adjacent or overlapping same-content runs and supports runs longer than two rows.',
                    ...summary
                },
                null,
                2
            )
        );

        if (!options.apply) {
            return;
        }

        applyPlan(db, statements, contentPlan, mergePlan);
    } finally {
        db.close();
    }
}

try {
    main();
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
}
