#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_QRCODE_PATH = 'data/qrcode.jsonl';
const DEFAULT_EMU_LIST_PATH = 'data/emu_list.json';
const DEFAULT_PREFIX_LENGTH = 1;
const DEFAULT_CODE_SCOPE = 'short';
const DEFAULT_FORMAT = 'table';
const SHORT_CODE_PATTERN = /^[A-Z](\d{6}|\d{7})$/u;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

function printHelp() {
    console.log(`Usage: node scripts/compute-qrcode-prefix-bureaus.mjs [options]

Options:
    --qrcode=<path>         QRCode JSONL input path. Default: ${DEFAULT_QRCODE_PATH}
    --emu-list=<path>       EMU list allocation JSON input path. Default: ${DEFAULT_EMU_LIST_PATH}
    --prefix-length=<n>     Prefix length to group by. Default: ${DEFAULT_PREFIX_LENGTH}
    --code-scope=<scope>    Code scope: short | all. Default: ${DEFAULT_CODE_SCOPE}
    --format=<format>       Output format: table | json. Default: ${DEFAULT_FORMAT}
    --output=<path>         Optional JSON report output path.
    --help                  Show this message
`);
}

function resolvePathFromRepo(relativeOrAbsolutePath) {
    return resolve(repoRoot, relativeOrAbsolutePath);
}

function parseArgs(argv) {
    const options = {
        qrcodePath: resolvePathFromRepo(DEFAULT_QRCODE_PATH),
        emuListPath: resolvePathFromRepo(DEFAULT_EMU_LIST_PATH),
        prefixLength: DEFAULT_PREFIX_LENGTH,
        codeScope: DEFAULT_CODE_SCOPE,
        format: DEFAULT_FORMAT,
        outputPath: ''
    };

    for (const argument of argv) {
        if (argument.startsWith('--qrcode=')) {
            options.qrcodePath = resolvePathFromRepo(
                argument.slice('--qrcode='.length)
            );
            continue;
        }

        if (argument.startsWith('--emu-list=')) {
            options.emuListPath = resolvePathFromRepo(
                argument.slice('--emu-list='.length)
            );
            continue;
        }

        if (argument.startsWith('--prefix-length=')) {
            const rawValue = argument.slice('--prefix-length='.length);
            const prefixLength = Number.parseInt(rawValue, 10);
            if (!Number.isInteger(prefixLength) || prefixLength <= 0) {
                throw new Error(
                    `Invalid --prefix-length value: ${rawValue}. Expected a positive integer.`
                );
            }
            options.prefixLength = prefixLength;
            continue;
        }

        if (argument.startsWith('--code-scope=')) {
            const codeScope = argument.slice('--code-scope='.length).trim();
            if (codeScope !== 'short' && codeScope !== 'all') {
                throw new Error(
                    `Invalid --code-scope value: ${codeScope}. Expected short or all.`
                );
            }
            options.codeScope = codeScope;
            continue;
        }

        if (argument.startsWith('--format=')) {
            const format = argument.slice('--format='.length).trim();
            if (format !== 'table' && format !== 'json') {
                throw new Error(
                    `Invalid --format value: ${format}. Expected table or json.`
                );
            }
            options.format = format;
            continue;
        }

        if (argument.startsWith('--output=')) {
            const outputPath = argument.slice('--output='.length).trim();
            if (outputPath.length === 0) {
                throw new Error('Invalid --output value: path must be non-empty.');
            }
            options.outputPath = resolvePathFromRepo(outputPath);
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
            let parsed;
            try {
                parsed = JSON.parse(line);
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);
                throw new Error(
                    `Failed to parse ${filePath} line ${index + 1}: ${message}`
                );
            }

            if (
                parsed === null ||
                typeof parsed !== 'object' ||
                Array.isArray(parsed)
            ) {
                throw new Error(
                    `Invalid JSON object in ${filePath} line ${index + 1}.`
                );
            }

            return parsed;
        });
}

function readJsonObject(filePath) {
    if (!existsSync(filePath)) {
        throw new Error(`Input file does not exist: ${filePath}`);
    }

    let text = readFileSync(filePath, 'utf8');
    if (text.charCodeAt(0) === 0xfeff) {
        text = text.slice(1);
    }

    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`Invalid JSON object in ${filePath}.`);
    }

    return parsed;
}

function normalizeCode(value) {
    if (typeof value !== 'string') {
        return '';
    }

    return value.trim().toUpperCase();
}

function normalizeBureau(value) {
    if (typeof value !== 'string') {
        return '';
    }

    return value.trim();
}

function readRequiredArray(value, fieldName) {
    if (!Array.isArray(value)) {
        throw new Error(`EMU list field ${fieldName} must be an array.`);
    }

    return value;
}

function normalizeId(value, fieldName) {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`EMU list field ${fieldName} must be a positive integer.`);
    }

    return value;
}

function buildRecordById(rows, fieldName) {
    const recordsById = new Map();

    for (const [index, row] of rows.entries()) {
        const id = normalizeId(row?.id, `${fieldName}[${index}].id`);
        if (recordsById.has(id)) {
            throw new Error(`EMU list field ${fieldName} has duplicate id ${id}.`);
        }
        recordsById.set(id, row);
    }

    return recordsById;
}

function normalizeRequiredString(value, fieldName) {
    if (typeof value !== 'string') {
        throw new Error(`EMU list field ${fieldName} must be a string.`);
    }

    const normalized = value.trim();
    if (normalized.length === 0) {
        throw new Error(`EMU list field ${fieldName} must be non-empty.`);
    }

    return normalized;
}

function buildJoinKey(model, trainSetNo) {
    return `${normalizeCode(model)}#${normalizeCode(trainSetNo)}`;
}

function getTrainsets(emuList) {
    if (Array.isArray(emuList.emu_trainsets)) {
        return emuList.emu_trainsets;
    }

    return readRequiredArray(emuList.trainsets, 'trainsets');
}

function buildEmuIndex(emuList) {
    const railwayBureauById = buildRecordById(
        readRequiredArray(emuList.railway_bureaus, 'railway_bureaus'),
        'railway_bureaus'
    );
    const trainDepotById = buildRecordById(
        readRequiredArray(emuList.train_depots, 'train_depots'),
        'train_depots'
    );
    const emuDepotById = buildRecordById(
        readRequiredArray(emuList.emu_depots, 'emu_depots'),
        'emu_depots'
    );
    const trainsetModelById = buildRecordById(
        readRequiredArray(emuList.trainset_models, 'trainset_models'),
        'trainset_models'
    );
    const trainsets = getTrainsets(emuList);
    const bureauByJoinKey = new Map();

    for (const [index, row] of trainsets.entries()) {
        if (row.railway_travel_code_enabled === false) {
            continue;
        }

        const modelId = normalizeId(row.model_id, `trainsets[${index}].model_id`);
        const trainsetModel = trainsetModelById.get(modelId);
        if (!trainsetModel) {
            throw new Error(`EMU list row ${index + 1} has missing model_id ${modelId}.`);
        }
        const emuDepotId = normalizeId(
            row.emu_depot_id,
            `trainsets[${index}].emu_depot_id`
        );
        const emuDepot = emuDepotById.get(emuDepotId);
        if (!emuDepot) {
            throw new Error(
                `EMU list row ${index + 1} has missing emu_depot_id ${emuDepotId}.`
            );
        }
        const trainDepotId = normalizeId(
            emuDepot.train_depot_id,
            `emu_depots[${emuDepotId}].train_depot_id`
        );
        const trainDepot = trainDepotById.get(trainDepotId);
        if (!trainDepot) {
            throw new Error(
                `EMU list row ${index + 1} has missing train_depot_id ${trainDepotId}.`
            );
        }
        const bureauId = normalizeId(
            trainDepot.bureau_id,
            `train_depots[${trainDepotId}].bureau_id`
        );
        const bureauRecord = railwayBureauById.get(bureauId);
        if (!bureauRecord) {
            throw new Error(
                `EMU list row ${index + 1} has missing bureau_id ${bureauId}.`
            );
        }

        const joinKey = buildJoinKey(
            normalizeRequiredString(trainsetModel.model, 'trainset_models.model'),
            normalizeRequiredString(row.car_no, 'trainsets.car_no')
        );
        const bureau = normalizeBureau(
            normalizeRequiredString(bureauRecord.name, 'railway_bureaus.name')
        );

        const existingBureau = bureauByJoinKey.get(joinKey);
        if (
            typeof existingBureau === 'string' &&
            existingBureau !== bureau
        ) {
            throw new Error(
                `EMU list conflict at row ${index + 1}: ${joinKey} maps to both ${existingBureau} and ${bureau}.`
            );
        }

        bureauByJoinKey.set(joinKey, bureau);
    }

    return bureauByJoinKey;
}

function shouldIncludeCode(code, codeScope) {
    if (codeScope === 'all') {
        return code.length > 0;
    }

    return SHORT_CODE_PATTERN.test(code);
}

function analyzePrefixBureaus(qrcodeRows, bureauByJoinKey, options) {
    const prefixToBureauCounts = new Map();
    let matchedRows = 0;

    for (const row of qrcodeRows) {
        const joinKey = buildJoinKey(row.model, row.trainSetNo);
        const bureau = bureauByJoinKey.get(joinKey);
        const code = normalizeCode(row.code);
        if (
            typeof bureau !== 'string' ||
            !shouldIncludeCode(code, options.codeScope)
        ) {
            continue;
        }

        matchedRows += 1;
        const prefix = code.slice(0, options.prefixLength);
        const bureauCounts = prefixToBureauCounts.get(prefix) ?? new Map();
        const currentCount = bureauCounts.get(bureau) ?? 0;
        bureauCounts.set(bureau, currentCount + 1);
        prefixToBureauCounts.set(prefix, bureauCounts);
    }

    const prefixes = [...prefixToBureauCounts.entries()]
        .map(([prefix, bureauCounts]) => {
            const totalRecords = [...bureauCounts.values()].reduce(
                (sum, value) => sum + value,
                0
            );
            const bureaus = [...bureauCounts.entries()]
                .map(([bureau, count]) => ({
                    bureau,
                    count,
                    share: count / totalRecords
                }))
                .sort(
                    (left, right) =>
                        right.count - left.count ||
                        left.bureau.localeCompare(right.bureau, 'zh-Hans-CN')
                );

            const dominant = bureaus[0] ?? null;

            return {
                prefix,
                totalRecords,
                uniqueBureauCount: bureaus.length,
                isUnique: bureaus.length === 1,
                dominantBureau: dominant?.bureau ?? '',
                dominantShare: dominant ? dominant.count / totalRecords : 0,
                bureaus
            };
        })
        .sort((left, right) =>
            left.prefix.localeCompare(right.prefix, 'en-US')
        );

    const uniquePrefixCount = prefixes.filter((item) => item.isUnique).length;

    return {
        summary: {
            prefixLength: options.prefixLength,
            codeScope: options.codeScope,
            inputRows: qrcodeRows.length,
            matchedRows,
            ignoredRows: qrcodeRows.length - matchedRows,
            prefixCount: prefixes.length,
            uniquePrefixCount,
            ambiguousPrefixCount: prefixes.length - uniquePrefixCount
        },
        prefixes
    };
}

function formatShare(share) {
    return `${(share * 100).toFixed(2)}%`;
}

function formatBureauDistribution(bureaus) {
    return bureaus
        .map((entry) => `${entry.bureau} ${formatShare(entry.share)}`)
        .join(', ');
}

function padCell(value, width) {
    const text = String(value);
    if (text.length >= width) {
        return text;
    }

    return `${text}${' '.repeat(width - text.length)}`;
}

function renderTable(report, options) {
    const summaryLines = [
        `QRCode prefix bureau report`,
        `qrcode=${options.qrcodePath}`,
        `emuList=${options.emuListPath}`,
        `prefixLength=${report.summary.prefixLength}`,
        `codeScope=${report.summary.codeScope}`,
        `inputRows=${report.summary.inputRows}`,
        `matchedRows=${report.summary.matchedRows}`,
        `ignoredRows=${report.summary.ignoredRows}`,
        `prefixCount=${report.summary.prefixCount}`,
        `uniquePrefixCount=${report.summary.uniquePrefixCount}`,
        `ambiguousPrefixCount=${report.summary.ambiguousPrefixCount}`
    ];

    const headers = [
        'Prefix',
        'Total',
        'Bureaus',
        'Unique',
        'Dominant',
        'Share',
        'Distribution'
    ];
    const rows = report.prefixes.map((entry) => [
        entry.prefix,
        String(entry.totalRecords),
        String(entry.uniqueBureauCount),
        entry.isUnique ? 'yes' : 'no',
        entry.dominantBureau,
        formatShare(entry.dominantShare),
        formatBureauDistribution(entry.bureaus)
    ]);
    const widths = headers.map((header, index) =>
        Math.max(
            header.length,
            ...rows.map((row) => row[index].length)
        )
    );

    const divider = widths.map((width) => '-'.repeat(width)).join('  ');
    const tableLines = [
        headers
            .map((header, index) => padCell(header, widths[index]))
            .join('  '),
        divider,
        ...rows.map((row) =>
            row.map((cell, index) => padCell(cell, widths[index])).join('  ')
        )
    ];

    return `${summaryLines.join('\n')}\n\n${tableLines.join('\n')}`;
}

function writeJsonReport(filePath, report) {
    const parentDir = dirname(filePath);
    mkdirSync(parentDir, { recursive: true });
    writeFileSync(filePath, `${JSON.stringify(report, null, 4)}\n`, 'utf8');
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const emuList = readJsonObject(options.emuListPath);
    const qrcodeRows = readJsonlRows(options.qrcodePath);
    const bureauByJoinKey = buildEmuIndex(emuList);
    const report = analyzePrefixBureaus(qrcodeRows, bureauByJoinKey, options);

    if (options.outputPath.length > 0) {
        writeJsonReport(options.outputPath, report);
    }

    if (options.format === 'json') {
        console.log(JSON.stringify(report, null, 4));
        return;
    }

    console.log(renderTable(report, options));
}

try {
    main();
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
}
