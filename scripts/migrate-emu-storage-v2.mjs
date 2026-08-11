#!/usr/bin/env node

import Database from 'better-sqlite3';
import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    copyFileSync,
    renameSync,
    writeFileSync,
    rmSync
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DAY_SECONDS = 24 * 60 * 60;
const SHANGHAI_EPOCH_SECONDS = -8 * 60 * 60;
const INTERNAL_JSON_VERSION = 2;
const INTERNAL_JSON_MARKER = '__opencrh_internal_schema_version';
const INTERNAL_JSON_SEMANTIC_KEY = '__opencrh_internal_json_semantic_key';
const SCHEMAS = {
    EMUTracked: 'emu',
    schedule: 'schedule',
    timetableHistory: 'timetable-history',
    trainProvenance: 'train-provenance',
    task: 'tasks',
    users: 'users',
    feedback: 'feedback'
};
const USER_OAUTH_SCHEMA_FILES = [
    'createOauthClientsTable.sql',
    'createOauthClientRedirectUrisTable.sql',
    'createOauthClientScopeRequestsTable.sql',
    'createOauthClientAdminGrantsTable.sql',
    'createOauthAuthorizationCodesTable.sql',
    'createOauthConsentsTable.sql',
    'createOauthLoginContinuationsTable.sql'
];

const TRAIN_KEYS = new Set([
    'trainCode',
    'relatedTrainCode',
    'primaryTrainCode',
    'scannedTrainCode',
    'matchedTrainCode',
    'stationTrainCode',
    'train_code',
    'related_train_code',
    'primary_train_code',
    'scanned_train_code',
    'matched_train_code',
    'station_train_code',
    'seatTrainCode',
    'probedTrainCode'
]);
const TRAIN_ARRAY_KEYS = new Set([
    'codes',
    'allTrainCodes',
    'failedEnrichCodes',
    'trainCodes',
    'stationTrainCodes',
    'attemptedTrainCodes',
    'allCodes',
    'directHitTrainCodes',
    'historicalTrainCodes',
    'matchedTrainCodes',
    'targetTrainCodes',
    'requestedCodes',
    'groupCodes',
    'checkedTrainCodes',
    'notRunningTrainCodes',
    'requestFailedTrainCodes',
    'mergedFromTrainCodes',
    'unresolvedTrainCodes',
    'train_codes',
    'station_train_codes',
    'attempted_train_codes'
]);
const EMU_KEYS = new Set([
    'emuCode',
    'primaryEmuCode',
    'candidateEmuCode',
    'relatedEmuCode',
    'configuredEmuCode',
    'scannedEmuCode',
    'untrustedEmuCode',
    'emu_code',
    'primary_emu_code',
    'candidate_emu_code',
    'related_emu_code'
]);
const EMU_ARRAY_KEYS = new Set([
    'emuCodes',
    'emu_codes',
    'persistedEmuCodes',
    'allEmuCodes',
    'affectedEmuCodes',
    'mergedFromEmuCodes'
]);
const DATE_KEYS = new Set([
    'lastBuildDate',
    'startDay',
    'endDay',
    'lastFullSweepDate',
    'serviceDate',
    'trainDate',
    'date',
    'service_date',
    'train_date'
]);

function readJson(file) {
    return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function parseArgs(argv) {
    const options = {
        apply: false,
        config: resolve(repoRoot, 'data/config.json'),
        outputDir: resolve(repoRoot, 'data'),
        overrides: {},
        scheduleFile: resolve(repoRoot, 'data/schedule.json')
    };
    for (const arg of argv) {
        if (arg === '--apply') options.apply = true;
        else if (arg.startsWith('--config='))
            options.config = resolve(repoRoot, arg.slice(9));
        else if (arg.startsWith('--output-dir='))
            options.outputDir = resolve(repoRoot, arg.slice(13));
        else if (arg.startsWith('--emu='))
            options.overrides.EMUTracked = resolve(repoRoot, arg.slice(6));
        else if (arg.startsWith('--schedule='))
            options.overrides.schedule = resolve(repoRoot, arg.slice(11));
        else if (arg.startsWith('--timetable-history='))
            options.overrides.timetableHistory = resolve(
                repoRoot,
                arg.slice(20)
            );
        else if (arg.startsWith('--train-provenance='))
            options.overrides.trainProvenance = resolve(
                repoRoot,
                arg.slice(19)
            );
        else if (arg.startsWith('--task='))
            options.overrides.task = resolve(repoRoot, arg.slice(7));
        else if (arg.startsWith('--schedule-file='))
            options.scheduleFile = resolve(repoRoot, arg.slice(16));
        else if (arg === '--help') {
            console.log(
                'Usage: node scripts/migrate-emu-storage-v2.mjs [--apply] [--config=path] [--output-dir=path] [--schedule-file=path] [--emu=path] [--schedule=path] [--timetable-history=path] [--train-provenance=path] [--task=path]'
            );
            process.exit(0);
        } else throw new Error(`unknown_argument ${arg}`);
    }
    return options;
}

function parseTrain(value, context = 'train') {
    const normalized = String(value ?? '')
        .trim()
        .toUpperCase();
    const match = /^([A-Z]?)([0-9]{1,4})$/.exec(normalized);
    if (!match)
        throw new Error(
            `invalid_train_code context=${context} value=${normalized}`
        );
    return { prefix: match[1] ?? '', number: Number(match[2]) };
}

function serviceDay(value, context = 'service_date') {
    const text = String(value ?? '').trim();
    if (/^[0-9]+$/.test(text) && Number(text) < 10000000) {
        const day = Number(text);
        if (Number.isInteger(day) && day >= 0) return day;
    }
    if (!/^\d{8}$/.test(text))
        throw new Error(
            `invalid_service_date context=${context} value=${text}`
        );
    const year = Number(text.slice(0, 4));
    const month = Number(text.slice(4, 6));
    const dayOfMonth = Number(text.slice(6, 8));
    const date = new Date(Date.UTC(year, month - 1, dayOfMonth));
    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() + 1 !== month ||
        date.getUTCDate() !== dayOfMonth
    ) {
        throw new Error(
            `invalid_service_date context=${context} value=${text}`
        );
    }
    return Math.floor(
        (date.getTime() / 1000 +
            SHANGHAI_EPOCH_SECONDS -
            SHANGHAI_EPOCH_SECONDS) /
            DAY_SECONDS
    );
}

function normalizeEmu(value, context) {
    const normalized = String(value ?? '')
        .trim()
        .toUpperCase();
    if (!normalized) throw new Error(`invalid_emu_code context=${context}`);
    return normalized;
}

function encodeJson(value, key, mapping, context) {
    if (TRAIN_KEYS.has(key)) return parseTrain(value, `${context}.${key}`);
    if (TRAIN_ARRAY_KEYS.has(key)) {
        if (!Array.isArray(value))
            throw new Error(`invalid_train_array context=${context}.${key}`);
        return value.map((item, index) =>
            parseTrain(item, `${context}.${key}[${index}]`)
        );
    }
    if (EMU_KEYS.has(key)) {
        if (
            value === null ||
            value === undefined ||
            String(value).trim() === ''
        )
            return null;
        const emu = normalizeEmu(value, `${context}.${key}`);
        const id = mapping.get(emu);
        if (!id)
            throw new Error(
                `unknown_emu_code context=${context}.${key} value=${emu}`
            );
        return id;
    }
    if (EMU_ARRAY_KEYS.has(key)) {
        if (!Array.isArray(value))
            throw new Error(`invalid_emu_array context=${context}.${key}`);
        return value.map((item, index) => {
            const emu = normalizeEmu(item, `${context}.${key}[${index}]`);
            const id = mapping.get(emu);
            if (!id)
                throw new Error(
                    `unknown_emu_code context=${context}.${key}[${index}] value=${emu}`
                );
            return id;
        });
    }
    if (DATE_KEYS.has(key) && typeof value === 'string')
        return serviceDay(value, `${context}.${key}`);
    if (Array.isArray(value))
        return value.map((item, index) =>
            encodeJson(item, '', mapping, `${context}[${index}]`)
        );
    if (value && typeof value === 'object') {
        const result = {};
        const isTrainRecord =
            Object.prototype.hasOwnProperty.call(value, 'internalCode') &&
            (Object.prototype.hasOwnProperty.call(value, 'stops') ||
                Object.prototype.hasOwnProperty.call(value, 'allCodes'));
        const isRouteRecord = key === 'route' || key === 'scannedRoute';
        const isEmuRecord = key === 'emu';
        for (const [childKey, childValue] of Object.entries(value)) {
            const outputKey =
                childKey === 'emuCode'
                    ? 'emuId'
                    : childKey === 'emuCodes'
                      ? 'emuIds'
                      : childKey === 'emu_code'
                        ? 'emu_id'
                        : childKey === 'emu_codes'
                          ? 'emu_ids'
                          : childKey;
            result[outputKey] = encodeJson(
                childValue,
                childKey === 'code' && (isTrainRecord || isRouteRecord)
                    ? 'trainCode'
                    : childKey === 'code' && isEmuRecord
                      ? 'emuCode'
                      : childKey,
                mapping,
                `${context}.${childKey}`
            );
        }
        return result;
    }
    return value;
}

function stringifyInternalJson(raw, mapping, context, semanticKey = '') {
    const parsed = JSON.parse(String(raw ?? 'null'));
    const encoded = encodeJson(parsed, semanticKey, mapping, context);
    const result = { [INTERNAL_JSON_MARKER]: INTERNAL_JSON_VERSION };
    if (semanticKey) {
        result[INTERNAL_JSON_SEMANTIC_KEY] = semanticKey;
        result.value = encoded;
    } else if (
        encoded &&
        typeof encoded === 'object' &&
        !Array.isArray(encoded)
    ) {
        Object.assign(result, encoded);
    } else {
        result.value = encoded;
    }
    return JSON.stringify(result);
}

function tableColumns(db, table) {
    return db
        .prepare(`PRAGMA table_info(${JSON.stringify(table)})`)
        .all()
        .map((row) => row.name);
}

function tableInfo(db, table) {
    return db
        .prepare(`PRAGMA table_xinfo(${JSON.stringify(table)})`)
        .all()
        .filter((row) => row.hidden === 0);
}

function tableNames(db) {
    return db
        .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
        .all()
        .map((row) => row.name);
}

function quoteIdentifier(value) {
    return `"${String(value).replaceAll('"', '""')}"`;
}

function jsonSemanticKey(column) {
    if (
        column === 'train_codes_json' ||
        column === 'station_train_codes_json' ||
        column === 'attempted_train_codes_json'
    )
        return 'trainCodes';
    return '';
}

function createTarget(kind, path) {
    mkdirSync(dirname(path), { recursive: true });
    if (existsSync(path)) throw new Error(`output_exists ${path}`);
    const db = new Database(path);
    db.pragma('foreign_keys = OFF');
    const dir = resolve(repoRoot, 'assets/sql', SCHEMAS[kind], 'schema');
    for (const name of readdirSync(dir)
        .filter((name) => name.endsWith('.sql'))
        .sort()) {
        db.exec(readFileSync(resolve(dir, name), 'utf8'));
    }
    if (kind === 'users') {
        // Mirrors orderedOauthKeys in server/libs/database/users.ts.
        const oauthDir = resolve(repoRoot, 'assets/sql/users/oauth');
        for (const name of USER_OAUTH_SCHEMA_FILES) {
            const file = resolve(oauthDir, name);
            if (existsSync(file)) db.exec(readFileSync(file, 'utf8'));
        }
    }
    return db;
}

function sourceTrain(row, names, context) {
    for (const name of names) {
        if (
            row[name] !== undefined &&
            row[name] !== null &&
            String(row[name]).trim() !== ''
        )
            return parseTrain(row[name], context);
    }
    return { prefix: '', number: 0 };
}

function sourceEmu(row, names, mapping, context, nullable = true) {
    for (const name of names) {
        if (
            row[name] !== undefined &&
            row[name] !== null &&
            String(row[name]).trim() !== ''
        ) {
            const normalized = normalizeEmu(row[name], context);
            const id = mapping.get(normalized);
            if (!id)
                throw new Error(
                    `unknown_emu_code context=${context} value=${normalized}`
                );
            return id;
        }
    }
    if (nullable) return null;
    throw new Error(`missing_emu_code context=${context}`);
}

function valueForColumn(column, row, sourceCols, mapping, context) {
    if (
        [
            'service_date',
            'service_date_start',
            'service_date_end_exclusive',
            'train_date',
            'date'
        ].includes(column)
    ) {
        const raw =
            row[column] ??
            row.service_date_start ??
            row.service_date ??
            row.train_date ??
            row.date;
        return serviceDay(raw, `${context}.${column}`);
    }
    if (
        column.endsWith('_json') ||
        column === 'arguments' ||
        column === 'state_json' ||
        column === 'timetable_json'
    ) {
        const raw = sourceCols.includes(column) ? row[column] : 'null';
        return stringifyInternalJson(
            raw,
            mapping,
            `${context}.${column}`,
            jsonSemanticKey(column)
        );
    }
    if (
        column === 'train_prefix' ||
        column === 'item_prefix' ||
        column === 'alias_prefix' ||
        column === 'primary_train_prefix' ||
        column === 'scanned_train_prefix' ||
        column === 'matched_train_prefix' ||
        column === 'related_train_prefix' ||
        column === 'station_train_prefix' ||
        column === 'returned_train_prefix'
    ) {
        const names =
            column === 'item_prefix'
                ? ['item_code']
                : column === 'alias_prefix'
                  ? ['alias_code']
                  : column === 'station_train_prefix'
                    ? ['station_train_code']
                    : column === 'related_train_prefix'
                      ? ['related_train_code']
                      : column === 'returned_train_prefix'
                        ? ['returned_train_code']
                        : [
                              'train_code',
                              'primary_train_code',
                              'scanned_train_code',
                              'matched_train_code',
                              'station_train_code'
                          ];
        const train = sourceTrain(row, names, `${context}.${column}`);
        return train.prefix;
    }
    if (
        column === 'train_number' ||
        column === 'item_number' ||
        column === 'alias_number' ||
        column === 'primary_train_number' ||
        column === 'scanned_train_number' ||
        column === 'matched_train_number' ||
        column === 'station_train_number' ||
        column === 'returned_train_number'
    ) {
        const sourceNames = column.startsWith('item_')
            ? ['item_code']
            : column.startsWith('alias_')
              ? ['alias_code']
              : column.startsWith('station_')
                ? ['station_train_code']
                : column.startsWith('related_')
                  ? ['related_train_code']
                  : column.startsWith('returned_')
                    ? ['returned_train_code']
                    : [
                          'train_code',
                          'primary_train_code',
                          'scanned_train_code',
                          'matched_train_code',
                          'station_train_code'
                      ];
        return sourceTrain(row, sourceNames, `${context}.${column}`).number;
    }
    if (
        column === 'emu_id' ||
        column === 'primary_emu_id' ||
        column === 'candidate_emu_id' ||
        column === 'related_emu_id'
    ) {
        const names =
            column === 'primary_emu_id'
                ? ['primary_emu_code']
                : column === 'candidate_emu_id'
                  ? ['candidate_emu_code']
                  : column === 'related_emu_id'
                    ? ['related_emu_code']
                    : ['emu_code'];
        return sourceEmu(row, names, mapping, `${context}.${column}`);
    }
    if (sourceCols.includes(column)) return row[column];
    if (column === 'train_uuid') return row.train_uuid ?? '';
    if (column === 'id' && row.id !== undefined) return row.id;
    if (column.endsWith('_number')) return 0;
    if (column.endsWith('_id')) return null;
    if (column.endsWith('_prefix')) return '';
    if (column.endsWith('_json'))
        return stringifyInternalJson('null', mapping, `${context}.${column}`);
    return '';
}

function copyTable(source, target, table, mapping, kind) {
    const sourceCols = tableColumns(source, table);
    const targetInfo = tableInfo(target, table);
    const targetCols = targetInfo.map((row) => row.name);
    if (targetCols.length === 0)
        throw new Error(`missing_target_table database=${kind} table=${table}`);
    const rows = source
        .prepare(`SELECT * FROM ${JSON.stringify(table)} ORDER BY rowid`)
        .iterate();
    const insert = target.prepare(
        `INSERT INTO ${quoteIdentifier(table)} (${targetCols.map(quoteIdentifier).join(',')}) VALUES (${targetCols.map(() => '?').join(',')})`
    );
    let count = 0;
    for (const row of rows) {
        const context = `${kind}.${table}.${row.id ?? row.rowid ?? count}`;
        try {
            insert.run(
                ...targetCols.map((column) =>
                    valueForColumn(column, row, sourceCols, mapping, context)
                )
            );
        } catch (error) {
            throw new Error(
                `${error instanceof Error ? error.message : String(error)} database=${kind} table=${table} primaryKey=${row.id ?? row.rowid ?? count} sample=${JSON.stringify(row).slice(0, 800)}`
            );
        }
        count += 1;
    }
    return count;
}

function collectEmuCodes(sourceDbs) {
    const codes = new Set();
    for (const [kind, db] of sourceDbs) {
        for (const table of tableNames(db)) {
            const columns = tableColumns(db, table);
            for (const column of columns.filter((name) =>
                name.includes('emu_code')
            )) {
                for (const row of db
                    .prepare(
                        `SELECT ${JSON.stringify(column)} AS value FROM ${JSON.stringify(table)}`
                    )
                    .iterate()) {
                    if (row.value !== null && String(row.value).trim() !== '')
                        codes.add(
                            normalizeEmu(
                                row.value,
                                `${kind}.${table}.${column}`
                            )
                        );
                }
            }
            for (const column of columns.filter(
                (name) =>
                    name.endsWith('_json') ||
                    name === 'arguments' ||
                    name === 'state_json' ||
                    name === 'timetable_json'
            )) {
                for (const row of db
                    .prepare(
                        `SELECT ${JSON.stringify(column)} AS value FROM ${JSON.stringify(table)}`
                    )
                    .iterate()) {
                    const raw = row.value;
                    if (raw === null || raw === '') continue;
                    let value;
                    try {
                        value = JSON.parse(raw);
                    } catch (error) {
                        throw new Error(
                            `invalid_json database=${kind} table=${table} column=${column}`
                        );
                    }
                    const visit = (node, key = '', parentKey = '') => {
                        if (
                            EMU_KEYS.has(key) &&
                            node !== null &&
                            node !== undefined &&
                            String(node).trim() !== ''
                        )
                            codes.add(
                                normalizeEmu(node, `${kind}.${table}.${column}`)
                            );
                        if (EMU_ARRAY_KEYS.has(key) && Array.isArray(node))
                            node.forEach((item) =>
                                codes.add(
                                    normalizeEmu(
                                        item,
                                        `${kind}.${table}.${column}`
                                    )
                                )
                            );
                        if (
                            key === 'code' &&
                            parentKey === 'emu' &&
                            node !== null &&
                            node !== undefined &&
                            String(node).trim() !== ''
                        )
                            codes.add(
                                normalizeEmu(
                                    node,
                                    `${kind}.${table}.${column}.emu.code`
                                )
                            );
                        if (Array.isArray(node))
                            node.forEach((item) => visit(item, '', key));
                        else if (node && typeof node === 'object')
                            Object.entries(node).forEach(
                                ([childKey, childValue]) =>
                                    visit(childValue, childKey, key)
                            );
                    };
                    visit(value);
                }
            }
        }
    }
    return new Map([...codes].sort().map((value, index) => [value, index + 1]));
}

function collectEmuCodesFromScheduleFile(scheduleFile, mapping) {
    if (!existsSync(scheduleFile)) return mapping;
    const codes = new Set(mapping.keys());
    const visit = (node, key = '', parentKey = '') => {
        if (
            EMU_KEYS.has(key) &&
            node !== null &&
            node !== undefined &&
            String(node).trim() !== ''
        ) {
            codes.add(normalizeEmu(node, `schedule-file.${key}`));
        }
        if (EMU_ARRAY_KEYS.has(key) && Array.isArray(node)) {
            node.forEach((item) =>
                codes.add(normalizeEmu(item, `schedule-file.${key}`))
            );
        }
        if (
            key === 'code' &&
            parentKey === 'emu' &&
            node !== null &&
            node !== undefined &&
            String(node).trim() !== ''
        ) {
            codes.add(normalizeEmu(node, 'schedule-file.emu.code'));
        }
        if (Array.isArray(node)) node.forEach((item) => visit(item, '', key));
        else if (node && typeof node === 'object')
            Object.entries(node).forEach(([childKey, childValue]) =>
                visit(childValue, childKey, key)
            );
    };
    visit(readJson(scheduleFile));
    return new Map([...codes].sort().map((value, index) => [value, index + 1]));
}

function copySqliteSequences(source, target) {
    const hasSourceSequence = source
        .prepare(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'"
        )
        .get();
    const hasTargetSequence = target
        .prepare(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'"
        )
        .get();
    if (!hasSourceSequence || !hasTargetSequence) return;
    const sourceSequences = source
        .prepare('SELECT name, seq FROM sqlite_sequence')
        .all();
    if (sourceSequences.length === 0) return;
    for (const row of sourceSequences) {
        const targetTable = target
            .prepare(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
            )
            .get(row.name);
        if (!targetTable) continue;
        target
            .prepare(
                'INSERT OR REPLACE INTO sqlite_sequence(name, seq) VALUES (?, ?)'
            )
            .run(row.name, row.seq);
    }
}

function validateInternalJsonFields(target, kind) {
    for (const table of tableNames(target)) {
        const columns = tableColumns(target, table).filter(
            (name) =>
                name.endsWith('_json') ||
                name === 'arguments' ||
                name === 'state_json' ||
                name === 'timetable_json'
        );
        for (const column of columns) {
            for (const row of target
                .prepare(
                    `SELECT rowid, ${quoteIdentifier(column)} AS value FROM ${quoteIdentifier(table)}`
                )
                .iterate()) {
                if (typeof row.value !== 'string')
                    throw new Error(
                        `invalid_internal_json_value database=${kind} table=${table} column=${column} rowid=${row.rowid}`
                    );
                let parsed;
                try {
                    parsed = JSON.parse(row.value);
                } catch {
                    throw new Error(
                        `invalid_internal_json database=${kind} table=${table} column=${column} rowid=${row.rowid} sample=${row.value.slice(0, 400)}`
                    );
                }
                if (
                    !parsed ||
                    parsed[INTERNAL_JSON_MARKER] !== INTERNAL_JSON_VERSION
                ) {
                    throw new Error(
                        `unsupported_internal_json_schema database=${kind} table=${table} column=${column} rowid=${row.rowid}`
                    );
                }
            }
        }
    }
}

function validateEmuReferences(target, kind, mapping) {
    for (const table of tableNames(target)) {
        const columns = tableColumns(target, table).filter(
            (name) => name === 'emu_id' || name.endsWith('_emu_id')
        );
        for (const column of columns) {
            for (const row of target
                .prepare(
                    `SELECT rowid, ${quoteIdentifier(column)} AS value FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier(column)} IS NOT NULL`
                )
                .iterate()) {
                if (!mapping.has(Number(row.value))) {
                    throw new Error(
                        `unknown_emu_id database=${kind} table=${table} column=${column} rowid=${row.rowid} value=${String(row.value)}`
                    );
                }
            }
        }
    }
}

function validateIndexes(target, kind) {
    for (const table of tableNames(target)) {
        const indexes = target
            .prepare(`PRAGMA index_list(${quoteIdentifier(table)})`)
            .all();
        for (const index of indexes) {
            if (
                String(index.name).startsWith('sqlite_autoindex_') ||
                index.partial
            )
                continue;
            const indexColumns = target
                .prepare(`PRAGMA index_info(${quoteIdentifier(index.name)})`)
                .all();
            const firstColumn = indexColumns[0]?.name;
            if (!firstColumn) continue;
            const plan = target
                .prepare(
                    `EXPLAIN QUERY PLAN SELECT 1 FROM ${quoteIdentifier(table)} INDEXED BY ${quoteIdentifier(index.name)} WHERE ${quoteIdentifier(firstColumn)} IS NOT NULL LIMIT 1`
                )
                .all();
            const detail = plan
                .map((row) => String(row.detail ?? ''))
                .join(' ');
            if (!detail.includes(String(index.name))) {
                throw new Error(
                    `index_not_used database=${kind} table=${table} index=${index.name} plan=${detail}`
                );
            }
        }
    }
}

function validateTarget(source, target, kind, copiedCounts, mapping) {
    for (const table of tableNames(source)) {
        const sourceCount = source
            .prepare(`SELECT COUNT(*) AS count FROM ${JSON.stringify(table)}`)
            .get().count;
        const targetCount = target
            .prepare(`SELECT COUNT(*) AS count FROM ${JSON.stringify(table)}`)
            .get().count;
        if (
            sourceCount !== targetCount ||
            copiedCounts.get(table) !== sourceCount
        ) {
            throw new Error(
                `row_count_mismatch database=${kind} table=${table} source=${sourceCount} target=${targetCount}`
            );
        }
    }
    const foreignKeyErrors = target.prepare('PRAGMA foreign_key_check').all();
    if (foreignKeyErrors.length > 0)
        throw new Error(
            `foreign_key_check_failed database=${kind} details=${JSON.stringify(foreignKeyErrors[0])}`
        );
    const integrity = target.prepare('PRAGMA integrity_check').get();
    if (integrity?.integrity_check !== 'ok')
        throw new Error(
            `integrity_check_failed database=${kind} result=${JSON.stringify(integrity)}`
        );
    validateInternalJsonFields(target, kind);
    validateEmuReferences(
        target,
        kind,
        new Map([...mapping].map(([, id]) => [id, true]))
    );
    validateIndexes(target, kind);
}

function migrateScheduleFile(scheduleFile, mapping, apply) {
    if (!existsSync(scheduleFile)) {
        return { exists: false, converted: false };
    }
    const rawText = readFileSync(scheduleFile, 'utf8').replace(/^\uFEFF/, '');
    const raw = JSON.parse(rawText);
    const encoded = encodeJson(raw, '', mapping, 'schedule-file');
    if (encoded && typeof encoded === 'object' && !Array.isArray(encoded)) {
        encoded.version = 8;
    }
    const output = JSON.stringify({
        [INTERNAL_JSON_MARKER]: INTERNAL_JSON_VERSION,
        ...(encoded && typeof encoded === 'object' && !Array.isArray(encoded)
            ? encoded
            : { value: encoded })
    });
    if (apply) {
        const backup = `${scheduleFile}.v1.bak`;
        if (!existsSync(backup)) copyFileSync(scheduleFile, backup);
        const temporary = `${scheduleFile}.v2.tmp`;
        writeFileSync(temporary, `${output}\n`, 'utf8');
        renameSync(temporary, scheduleFile);
    }
    return { exists: true, converted: true, bytes: output.length };
}

function atomicallyReplaceDatabase(sourcePath, stagedPath) {
    const backupPath = `${sourcePath}.v1.bak`;
    if (!existsSync(backupPath)) {
        renameSync(sourcePath, backupPath);
    } else {
        rmSync(sourcePath, { force: true });
    }
    renameSync(stagedPath, sourcePath);
}

function loadConfigPaths(options) {
    const config = readJson(options.config);
    const databases = config?.data?.databases ?? {};
    return Object.fromEntries(
        Object.keys(SCHEMAS).map((kind) => [
            kind,
            options.overrides[kind] ??
                resolve(repoRoot, databases[kind]?.path ?? `data/${kind}.db`)
        ])
    );
}

function migrate(options) {
    const sources = loadConfigPaths(options);
    const sourceDbs = new Map(
        Object.entries(sources).map(([kind, path]) => [
            kind,
            new Database(path, { readonly: true })
        ])
    );
    const mapping = collectEmuCodesFromScheduleFile(
        options.scheduleFile,
        collectEmuCodes(sourceDbs)
    );
    const scheduleFile = migrateScheduleFile(
        options.scheduleFile,
        mapping,
        false
    );
    console.log(
        JSON.stringify(
            {
                dryRun: !options.apply,
                emuCodes: mapping.size,
                sources,
                scheduleFile
            },
            null,
            2
        )
    );
    if (!options.apply) {
        for (const db of sourceDbs.values()) db.close();
        return;
    }
    const stagingDir = resolve(
        options.outputDir,
        `.internal-storage-v2-${process.pid}`
    );
    rmSync(stagingDir, { recursive: true, force: true });
    mkdirSync(stagingDir, { recursive: true });
    const stagedPaths = new Map();
    try {
        for (const [kind, source] of sourceDbs) {
            const outputName =
                kind === 'EMUTracked'
                    ? 'emu'
                    : kind === 'timetableHistory'
                      ? 'timetable-history'
                      : kind === 'trainProvenance'
                        ? 'train-provenance'
                        : kind;
            const output = createTarget(
                kind,
                resolve(stagingDir, `${outputName}.db`)
            );
            stagedPaths.set(kind, resolve(stagingDir, `${outputName}.db`));
            const sourceTables = tableNames(source);
            const targetTables = new Set(tableNames(output));
            for (const table of sourceTables)
                if (!targetTables.has(table))
                    throw new Error(
                        `missing_target_table database=${kind} table=${table}`
                    );
            const copiedCounts = new Map();
            const tx = output.transaction(() => {
                if (kind === 'EMUTracked') {
                    const insertMapping = output.prepare(
                        'INSERT INTO emu_code_mapping (id, emu_code) VALUES (?, ?)'
                    );
                    for (const [emu, id] of mapping) insertMapping.run(id, emu);
                }
                for (const table of sourceTables)
                    copiedCounts.set(
                        table,
                        copyTable(source, output, table, mapping, kind)
                    );
                copySqliteSequences(source, output);
            });
            tx();
            output.pragma('foreign_keys = ON');
            validateTarget(source, output, kind, copiedCounts, mapping);
            output.close();
        }
        for (const db of sourceDbs.values()) db.close();
        for (const [kind, sourcePath] of Object.entries(sources)) {
            atomicallyReplaceDatabase(sourcePath, stagedPaths.get(kind));
        }
        migrateScheduleFile(options.scheduleFile, mapping, true);
    } finally {
        for (const db of sourceDbs.values()) {
            try {
                db.close();
            } catch {}
        }
        rmSync(stagingDir, { recursive: true, force: true });
    }
}

migrate(parseArgs(process.argv.slice(2)));
