import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import Database from 'better-sqlite3';

const execFileAsync = promisify(execFile);

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const timezone = 'Asia/Shanghai';
const secondsPerDay = 24 * 60 * 60;
const shanghaiUtcOffsetSeconds = 8 * 60 * 60;

const sourceDir = path.join(
    rootDir,
    'assets',
    'fonts',
    'source-han-sans-sc-source',
);
const outputDir = path.join(
    rootDir,
    'public',
    'fonts',
    'curated',
    'source-han-sans-sc',
);
const generatedCssPath = path.join(
    rootDir,
    'assets',
    'css',
    'generated',
    'source-han-sans-sc-fonts.css',
);
const charsetPath = path.join(outputDir, 'charset.txt');
const reportPath = path.join(outputDir, 'report.json');
const conservativeCharsPath = path.join(
    rootDir,
    'scripts',
    'font-data',
    'source-han-conservative-chars.txt',
);
const emuDbPath = path.join(rootDir, 'data', 'emu.db');

const sourceFonts = [
    {
        key: 'regular',
        legacyName: 'SourceHanSansSC-Regular.woff2',
        sourceName: 'SourceHanSansSC-Full-Regular.woff2',
        subsetBaseName: 'SourceHanSansSC-Subset-Regular',
    },
    {
        key: 'medium',
        legacyName: 'SourceHanSansSC-Medium.woff2',
        sourceName: 'SourceHanSansSC-Full-Medium.woff2',
        subsetBaseName: 'SourceHanSansSC-Subset-Medium',
    },
    {
        key: 'bold',
        legacyName: 'SourceHanSansSC-Bold.woff2',
        sourceName: 'SourceHanSansSC-Full-Bold.woff2',
        subsetBaseName: 'SourceHanSansSC-Subset-Bold',
    },
];

const fallbackName = 'SourceHanSansSC-Fallback-Regular.woff2';
const subsetHashLength = 12;
const scanEntries = [
    'app.vue',
    'pages',
    'components',
    'layouts',
    'composables',
    'middleware',
    'server',
    'utils',
    'assets',
    'ui.md',
];
const textExtensions = new Set([
    '.css',
    '.html',
    '.js',
    '.json',
    '.md',
    '.mjs',
    '.sql',
    '.ts',
    '.txt',
    '.vue',
    '.yaml',
    '.yml',
]);
const ignoredPathParts = new Set([
    '.git',
    '.nuxt',
    '.output',
    'coverage',
    'dist',
    'node_modules',
]);

function logStep(message) {
    console.log(`[font-subset] ${message}`);
}

function relativeFromRoot(targetPath) {
    return path.relative(rootDir, targetPath).replaceAll('\\', '/');
}

function formatBytes(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KiB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function getSubsetTempName(font) {
    return `${font.subsetBaseName}.tmp.woff2`;
}

function getSubsetHashedName(font, hash) {
    return `${font.subsetBaseName}.${hash}.woff2`;
}

function isSubsetOutputFile(fileName) {
    return /^SourceHanSansSC-Subset-(Regular|Medium|Bold)(?:\.[0-9a-f]+)?(?:\.tmp)?\.woff2$/u.test(
        fileName,
    );
}

function buildAsciiChars() {
    return Array.from({ length: 95 }, (_, index) =>
        String.fromCharCode(32 + index),
    ).join('');
}

function getShanghaiDateParts(date = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    const parts = Object.fromEntries(
        formatter
            .formatToParts(date)
            .filter((part) => part.type !== 'literal')
            .map((part) => [part.type, part.value]),
    );

    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
    };
}

function formatShanghaiDate(timestampMs) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });

    return formatter.format(new Date(timestampMs));
}

function getRecentThreeDayWindow() {
    const { year, month, day } = getShanghaiDateParts();
    const todayStartUtcSeconds =
        Math.floor(
            Date.UTC(year, month - 1, day, 0, 0, 0) / 1000,
        ) - shanghaiUtcOffsetSeconds;
    const startAt = todayStartUtcSeconds - 2 * secondsPerDay;
    const endAt = todayStartUtcSeconds + secondsPerDay - 1;

    return {
        startAt,
        endAt,
        startDate: formatShanghaiDate(startAt * 1000),
        endDate: formatShanghaiDate(endAt * 1000),
    };
}

function addCharsToSet(target, text) {
    for (const char of text) {
        if (char === '\r' || char === '\n' || char === '\t') {
            continue;
        }

        target.add(char);
    }
}

async function readConservativeChars() {
    const raw = await fs.readFile(conservativeCharsPath, 'utf8');
    return raw
        .split(/\r?\n/u)
        .filter((line) => !line.trimStart().startsWith('#'))
        .join('');
}

async function walkTextFiles(entryPath, collectedFiles) {
    const stats = await fs.stat(entryPath);

    if (stats.isDirectory()) {
        const entries = await fs.readdir(entryPath, { withFileTypes: true });

        for (const entry of entries) {
            if (ignoredPathParts.has(entry.name)) {
                continue;
            }

            await walkTextFiles(path.join(entryPath, entry.name), collectedFiles);
        }

        return;
    }

    if (!textExtensions.has(path.extname(entryPath).toLowerCase())) {
        return;
    }

    collectedFiles.push(entryPath);
}

async function collectStaticText() {
    const files = [];

    for (const entry of scanEntries) {
        const absoluteEntry = path.join(rootDir, entry);

        try {
            await fs.access(absoluteEntry);
        } catch {
            continue;
        }

        await walkTextFiles(absoluteEntry, files);
    }

    const uniqueFiles = [...new Set(files)].sort();
    const charSet = new Set();
    const relativeFiles = [];

    for (const filePath of uniqueFiles) {
        const relativePath = path.relative(rootDir, filePath).replaceAll('\\', '/');

        if (
            relativePath.startsWith('assets/fonts/') ||
            relativePath.startsWith('public/fonts/')
        ) {
            continue;
        }

        const content = await fs.readFile(filePath, 'utf8');

        addCharsToSet(charSet, content);
        relativeFiles.push(relativePath);
    }

    return {
        charSet,
        files: relativeFiles,
    };
}

function collectDatabaseStations(window) {
    const database = new Database(emuDbPath, {
        readonly: true,
        fileMustExist: true,
    });

    try {
        const rows = database
            .prepare(
                `SELECT start_station_name, end_station_name
                 FROM daily_emu_routes
                 WHERE start_at >= ? AND start_at <= ?`,
            )
            .all(window.startAt, window.endAt);

        const stationNames = new Set();

        for (const row of rows) {
            if (typeof row.start_station_name === 'string' && row.start_station_name) {
                stationNames.add(row.start_station_name);
            }

            if (typeof row.end_station_name === 'string' && row.end_station_name) {
                stationNames.add(row.end_station_name);
            }
        }

        const charSet = new Set();

        for (const stationName of stationNames) {
            addCharsToSet(charSet, stationName);
        }

        return {
            rows,
            stationNames: [...stationNames].sort((left, right) =>
                left.localeCompare(right, 'zh-Hans-CN'),
            ),
            charSet,
        };
    } finally {
        database.close();
    }
}

function buildUnicodeRange(chars) {
    const codePoints = [...new Set(chars.map((char) => char.codePointAt(0)))].sort(
        (left, right) => left - right,
    );
    const ranges = [];
    let rangeStart = codePoints[0];
    let previous = codePoints[0];

    for (let index = 1; index < codePoints.length; index += 1) {
        const current = codePoints[index];

        if (current === previous + 1) {
            previous = current;
            continue;
        }

        ranges.push([rangeStart, previous]);
        rangeStart = current;
        previous = current;
    }

    ranges.push([rangeStart, previous]);

    return ranges
        .map(([start, end]) =>
            start === end
                ? `U+${start.toString(16).toUpperCase()}`
                : `U+${start.toString(16).toUpperCase()}-${end
                      .toString(16)
                      .toUpperCase()}`,
        )
        .join(', ');
}

async function ensureSourceFonts() {
    await fs.mkdir(sourceDir, { recursive: true });

    for (const font of sourceFonts) {
        const sourcePath = path.join(sourceDir, font.sourceName);

        try {
            await fs.access(sourcePath);
            continue;
        } catch {
            const legacyPath = path.join(outputDir, font.legacyName);

            await fs.access(legacyPath);
            await fs.copyFile(legacyPath, sourcePath);
            logStep(
                `restored missing source font from legacy public copy: ${relativeFromRoot(sourcePath)}`,
            );
        }
    }
}

async function runPyftSubset(inputPath, outputPath) {
    await execFileAsync('pyftsubset', [
        inputPath,
        `--output-file=${outputPath}`,
        '--flavor=woff2',
        `--text-file=${charsetPath}`,
        '--layout-features=*',
        '--glyph-names',
        '--symbol-cmap',
        '--legacy-cmap',
        '--notdef-glyph',
        '--notdef-outline',
        '--recommended-glyphs',
        '--name-IDs=*',
        '--name-legacy',
        '--name-languages=*',
    ]);
}

async function hashFileContent(filePath) {
    const buffer = await fs.readFile(filePath);
    return createHash('sha256')
        .update(buffer)
        .digest('hex')
        .slice(0, subsetHashLength);
}

async function removeLegacyPublicFonts() {
    for (const font of sourceFonts) {
        const legacyPath = path.join(outputDir, font.legacyName);

        try {
            await fs.unlink(legacyPath);
        } catch (error) {
            if (error && typeof error === 'object' && error.code === 'ENOENT') {
                continue;
            }

            throw error;
        }
    }
}

async function cleanupOldSubsetOutputs(keepFileNames) {
    const entries = await fs.readdir(outputDir, { withFileTypes: true });
    const removedFiles = [];

    for (const entry of entries) {
        if (!entry.isFile() || !isSubsetOutputFile(entry.name)) {
            continue;
        }

        if (keepFileNames.has(entry.name)) {
            continue;
        }

        await fs.unlink(path.join(outputDir, entry.name));
        removedFiles.push(entry.name);
    }

    if (removedFiles.length === 0) {
        logStep('no stale subset files to clean');
        return [];
    }

    for (const fileName of removedFiles.sort()) {
        logStep(`removed stale subset file: ${fileName}`);
    }

    return removedFiles;
}

async function finalizeSubsetFont(font) {
    const tempName = getSubsetTempName(font);
    const tempPath = path.join(outputDir, tempName);
    const hash = await hashFileContent(tempPath);
    const finalName = getSubsetHashedName(font, hash);
    const finalPath = path.join(outputDir, finalName);

    try {
        await fs.unlink(finalPath);
    } catch (error) {
        if (!error || typeof error !== 'object' || error.code !== 'ENOENT') {
            throw error;
        }
    }

    await fs.rename(tempPath, finalPath);

    const stats = await fs.stat(finalPath);

    logStep(
        `finalized ${font.key} subset as ${finalName} (${formatBytes(stats.size)})`,
    );

    return {
        ...font,
        hash,
        subsetName: finalName,
        subsetPath: finalPath,
        subsetBytes: stats.size,
    };
}

async function writeGeneratedCss(unicodeRange, generatedFonts) {
    const fontsByKey = Object.fromEntries(
        generatedFonts.map((font) => [font.key, font]),
    );
    const css = `/* Generated by scripts/build-source-han-sans-sc-subset.mjs. Do not edit manually. */

@font-face {
    font-family: 'Source Han Sans SC Subset';
    src:
        url('/fonts/curated/source-han-sans-sc/${fontsByKey.regular.subsetName}')
            format('woff2');
    font-weight: 400;
    font-style: normal;
    font-display: swap;
    unicode-range: ${unicodeRange};
}

@font-face {
    font-family: 'Source Han Sans SC Subset';
    src:
        url('/fonts/curated/source-han-sans-sc/${fontsByKey.medium.subsetName}')
            format('woff2');
    font-weight: 500;
    font-style: normal;
    font-display: swap;
    unicode-range: ${unicodeRange};
}

@font-face {
    font-family: 'Source Han Sans SC Subset';
    src:
        url('/fonts/curated/source-han-sans-sc/${fontsByKey.bold.subsetName}')
            format('woff2');
    font-weight: 600 700;
    font-style: normal;
    font-display: swap;
    unicode-range: ${unicodeRange};
}

@font-face {
    font-family: 'Source Han Sans SC Fallback';
    src:
        url('/fonts/curated/source-han-sans-sc/SourceHanSansSC-Fallback-Regular.woff2')
            format('woff2');
    font-weight: 400 700;
    font-style: normal;
    font-display: swap;
}
`;

    await fs.mkdir(path.dirname(generatedCssPath), { recursive: true });
    await fs.writeFile(generatedCssPath, css, 'utf8');
    logStep(`wrote generated CSS: ${relativeFromRoot(generatedCssPath)}`);
}

async function buildReport({
    staticFiles,
    staticChars,
    conservativeChars,
    databaseRows,
    stationNames,
    stationChars,
    totalChars,
    unicodeRange,
    window,
    generatedFonts,
    removedSubsetFiles,
}) {
    const fontFiles = {};

    for (const font of generatedFonts) {
        const fullSourcePath = path.join(sourceDir, font.sourceName);
        const fullSourceStats = await fs.stat(fullSourcePath);

        fontFiles[font.key] = {
            fullSourcePath: relativeFromRoot(fullSourcePath),
            subsetPath: relativeFromRoot(font.subsetPath),
            subsetName: font.subsetName,
            hash: font.hash,
            fullSourceBytes: fullSourceStats.size,
            subsetBytes: font.subsetBytes,
            savedBytes: fullSourceStats.size - font.subsetBytes,
        };
    }

    const fallbackPath = path.join(outputDir, fallbackName);
    const fallbackStats = await fs.stat(fallbackPath);

    return {
        generatedAt: new Date().toISOString(),
        timezone,
        window,
        inputs: {
            staticFileCount: staticFiles.length,
            staticFiles,
            staticCharCount: staticChars.size,
            conservativeCharCount: conservativeChars.size,
            databaseRowCount: databaseRows.length,
            stationNameCount: stationNames.length,
            stationNames,
            stationCharCount: stationChars.size,
        },
        outputs: {
            charsetPath: relativeFromRoot(charsetPath),
            totalCharCount: totalChars.length,
            unicodeRangeSegmentCount: unicodeRange.split(', ').length,
            generatedCssPath: relativeFromRoot(generatedCssPath),
            fallbackPath: relativeFromRoot(fallbackPath),
            fallbackBytes: fallbackStats.size,
            removedSubsetFiles,
            fonts: fontFiles,
        },
    };
}

logStep('checking required input files');
await fs.access(emuDbPath);
await fs.access(conservativeCharsPath);
await fs.mkdir(outputDir, { recursive: true });
await ensureSourceFonts();
logStep(`source fonts ready in ${relativeFromRoot(sourceDir)}`);

logStep('collecting characters from repository and database');
const staticResult = await collectStaticText();
const conservativeCharsRaw = await readConservativeChars();
const window = getRecentThreeDayWindow();
const databaseResult = collectDatabaseStations(window);

const mergedChars = new Set();

addCharsToSet(mergedChars, buildAsciiChars());

for (const char of conservativeCharsRaw) {
    mergedChars.add(char);
}

for (const char of staticResult.charSet) {
    mergedChars.add(char);
}

for (const char of databaseResult.charSet) {
    mergedChars.add(char);
}

const totalChars = [...mergedChars].sort(
    (left, right) => left.codePointAt(0) - right.codePointAt(0),
);
const unicodeRange = buildUnicodeRange(totalChars);

await fs.writeFile(charsetPath, totalChars.join(''), 'utf8');
logStep(
    `collected ${totalChars.length} total chars from ${staticResult.files.length} static files, ` +
        `${databaseResult.stationNames.length} station names, ` +
        `window ${window.startDate}..${window.endDate}`,
);
logStep(`wrote charset file: ${relativeFromRoot(charsetPath)}`);

const generatedFonts = [];

for (const font of sourceFonts) {
    const inputPath = path.join(sourceDir, font.sourceName);
    const tempPath = path.join(outputDir, getSubsetTempName(font));

    logStep(
        `generating ${font.key} subset from ${relativeFromRoot(inputPath)} to ${path.basename(tempPath)}`,
    );
    await runPyftSubset(inputPath, tempPath);
    generatedFonts.push(await finalizeSubsetFont(font));
}

await fs.copyFile(
    path.join(sourceDir, sourceFonts[0].sourceName),
    path.join(outputDir, fallbackName),
);
logStep(`refreshed fallback font: ${relativeFromRoot(path.join(outputDir, fallbackName))}`);
await writeGeneratedCss(unicodeRange, generatedFonts);
await removeLegacyPublicFonts();
const removedSubsetFiles = await cleanupOldSubsetOutputs(
    new Set(generatedFonts.map((font) => font.subsetName)),
);

const report = await buildReport({
    staticFiles: staticResult.files,
    staticChars: staticResult.charSet,
    conservativeChars: new Set(conservativeCharsRaw),
    databaseRows: databaseResult.rows,
    stationNames: databaseResult.stationNames,
    stationChars: databaseResult.charSet,
    totalChars,
    unicodeRange,
    window,
    generatedFonts,
    removedSubsetFiles,
});

await fs.writeFile(reportPath, JSON.stringify(report, null, 4), 'utf8');
logStep(`wrote report: ${relativeFromRoot(reportPath)}`);
logStep(
    `current subset outputs: ${generatedFonts
        .map((font) => `${font.key}=${font.subsetName}`)
        .join(', ')}`,
);

console.log(
    JSON.stringify(
        {
            charsetPath: relativeFromRoot(charsetPath),
            reportPath: relativeFromRoot(reportPath),
            generatedCssPath: relativeFromRoot(generatedCssPath),
            totalChars: totalChars.length,
            stationNameCount: databaseResult.stationNames.length,
            subsetFiles: generatedFonts.map((font) => font.subsetName),
        },
        null,
        2,
    ),
);
