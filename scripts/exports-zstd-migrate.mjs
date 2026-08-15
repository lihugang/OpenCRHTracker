#!/usr/bin/env node

import {
    existsSync,
    readFileSync,
    readdirSync,
    statSync,
    unlinkSync
} from 'node:fs';
import path, { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    assertDailyExportZstdRoundTrip,
    compressDailyExportCsv,
    decompressDailyExportCsv,
    writeDailyExportZstdAtomically
} from '../server/utils/compression/dailyExportZstd.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const DAILY_EXPORT_FILE_PATTERN = /^\d{8}\.csv$/;

function parseArgs(argv) {
    const options = {
        dryRun: false,
        keepSource: false,
        exportsDirectory: resolve(repoRoot, 'data/exports')
    };

    for (const argument of argv) {
        if (argument === '--') {
            continue;
        }
        if (argument === '--dry-run') {
            options.dryRun = true;
            continue;
        }
        if (argument === '--keep-source') {
            options.keepSource = true;
            continue;
        }
        if (argument.startsWith('--exports-dir=')) {
            const value = argument.slice('--exports-dir='.length).trim();
            if (value.length === 0) {
                throw new Error('--exports-dir must not be empty');
            }
            options.exportsDirectory = resolve(repoRoot, value);
            continue;
        }
        if (argument === '--help') {
            console.log(
                'Usage: node scripts/exports-zstd-migrate.mjs [--dry-run] [--keep-source] [--exports-dir=<path>]'
            );
            process.exit(0);
        }
        throw new Error(`Unknown argument: ${argument}`);
    }

    return options;
}

function getFileSignature(filePath) {
    const stat = statSync(filePath);
    if (!stat.isFile()) {
        throw new Error(`Not a regular file: ${filePath}`);
    }
    return {
        ino: stat.ino,
        size: stat.size,
        mtimeMs: stat.mtimeMs
    };
}

function signaturesMatch(left, right) {
    return (
        left.ino === right.ino &&
        left.size === right.size &&
        left.mtimeMs === right.mtimeMs
    );
}

function readStableSource(filePath) {
    const before = getFileSignature(filePath);
    const content = readFileSync(filePath);
    const after = getFileSignature(filePath);
    if (!signaturesMatch(before, after)) {
        throw new Error(`Source changed while being read: ${filePath}`);
    }
    return {
        content,
        signature: after
    };
}

function assertSourceUnchanged(filePath, expectedSignature) {
    const current = getFileSignature(filePath);
    if (!signaturesMatch(current, expectedSignature)) {
        throw new Error(`Source changed during conversion: ${filePath}`);
    }
}

function validateExistingTarget(targetPath, source) {
    const decompressed = decompressDailyExportCsv(readFileSync(targetPath));
    if (!Buffer.from(decompressed).equals(source)) {
        throw new Error(
            `Existing compressed export does not match source: ${targetPath}`
        );
    }
}

function migrateFile(sourcePath, options, counters) {
    const targetPath = `${sourcePath}.zst`;
    const source = readStableSource(sourcePath);

    if (existsSync(targetPath)) {
        validateExistingTarget(targetPath, source.content);
        counters.verifiedExisting += 1;
    } else {
        const compressed = compressDailyExportCsv(source.content);
        assertDailyExportZstdRoundTrip(source.content, compressed);
        writeDailyExportZstdAtomically(targetPath, compressed);
        counters.converted += 1;
    }

    assertSourceUnchanged(sourcePath, source.signature);
    if (options.keepSource) {
        counters.kept += 1;
        console.log(`verified source=${sourcePath} target=${targetPath}`);
        return;
    }

    unlinkSync(sourcePath);
    counters.deleted += 1;
    console.log(`migrated source=${sourcePath} target=${targetPath}`);
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    if (!existsSync(options.exportsDirectory)) {
        throw new Error(
            `Exports directory does not exist: ${options.exportsDirectory}`
        );
    }

    const fileNames = readdirSync(options.exportsDirectory, {
        withFileTypes: true
    })
        .filter(
            (entry) =>
                entry.isFile() && DAILY_EXPORT_FILE_PATTERN.test(entry.name)
        )
        .map((entry) => entry.name)
        .sort();

    if (options.dryRun) {
        for (const fileName of fileNames) {
            const sourcePath = path.join(options.exportsDirectory, fileName);
            const targetPath = `${sourcePath}.zst`;
            console.log(
                `dry-run source=${sourcePath} target=${targetPath} targetExists=${existsSync(targetPath)}`
            );
        }
        console.log(`dry-run complete files=${fileNames.length}`);
        return;
    }

    const counters = {
        converted: 0,
        verifiedExisting: 0,
        deleted: 0,
        kept: 0
    };
    for (const fileName of fileNames) {
        migrateFile(
            path.join(options.exportsDirectory, fileName),
            options,
            counters
        );
    }

    console.log(
        `complete files=${fileNames.length} converted=${counters.converted} verifiedExisting=${counters.verifiedExisting} deleted=${counters.deleted} kept=${counters.kept}`
    );
}

try {
    main();
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
}
