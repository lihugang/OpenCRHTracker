import fs from 'node:fs/promises';
import path from 'node:path';
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
        subsetName: 'SourceHanSansSC-Subset-Regular.woff2',
    },
    {
        key: 'medium',
        legacyName: 'SourceHanSansSC-Medium.woff2',
        sourceName: 'SourceHanSansSC-Full-Medium.woff2',
        subsetName: 'SourceHanSansSC-Subset-Medium.woff2',
    },
    {
        key: 'bold',
        legacyName: 'SourceHanSansSC-Bold.woff2',
        sourceName: 'SourceHanSansSC-Full-Bold.woff2',
        subsetName: 'SourceHanSansSC-Subset-Bold.woff2',
    },
];

const fallbackName = 'SourceHanSansSC-Fallback-Regular.woff2';
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

async function writeGeneratedCss(unicodeRange) {
    const css = `/* Generated by scripts/build-source-han-sans-sc-subset.mjs. Do not edit manually. */

@font-face {
    font-family: 'Source Han Sans SC Subset';
    src:
        url('/fonts/curated/source-han-sans-sc/SourceHanSansSC-Subset-Regular.woff2')
            format('woff2');
    font-weight: 400;
    font-style: normal;
    font-display: swap;
    unicode-range: ${unicodeRange};
}

@font-face {
    font-family: 'Source Han Sans SC Subset';
    src:
        url('/fonts/curated/source-han-sans-sc/SourceHanSansSC-Subset-Medium.woff2')
            format('woff2');
    font-weight: 500;
    font-style: normal;
    font-display: swap;
    unicode-range: ${unicodeRange};
}

@font-face {
    font-family: 'Source Han Sans SC Subset';
    src:
        url('/fonts/curated/source-han-sans-sc/SourceHanSansSC-Subset-Bold.woff2')
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
}) {
    const fontFiles = {};

    for (const font of sourceFonts) {
        const fullSourcePath = path.join(sourceDir, font.sourceName);
        const subsetPath = path.join(outputDir, font.subsetName);
        const fullSourceStats = await fs.stat(fullSourcePath);
        const subsetStats = await fs.stat(subsetPath);

        fontFiles[font.key] = {
            fullSourcePath: path.relative(rootDir, fullSourcePath).replaceAll('\\', '/'),
            subsetPath: path.relative(rootDir, subsetPath).replaceAll('\\', '/'),
            fullSourceBytes: fullSourceStats.size,
            subsetBytes: subsetStats.size,
            savedBytes: fullSourceStats.size - subsetStats.size,
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
            charsetPath: path.relative(rootDir, charsetPath).replaceAll('\\', '/'),
            totalCharCount: totalChars.length,
            unicodeRangeSegmentCount: unicodeRange.split(', ').length,
            generatedCssPath: path.relative(rootDir, generatedCssPath).replaceAll('\\', '/'),
            fallbackPath: path.relative(rootDir, fallbackPath).replaceAll('\\', '/'),
            fallbackBytes: fallbackStats.size,
            fonts: fontFiles,
        },
    };
}

await fs.access(emuDbPath);
await fs.mkdir(outputDir, { recursive: true });
await ensureSourceFonts();

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

for (const font of sourceFonts) {
    const inputPath = path.join(sourceDir, font.sourceName);
    const outputPath = path.join(outputDir, font.subsetName);

    await runPyftSubset(inputPath, outputPath);
}

await fs.copyFile(
    path.join(sourceDir, sourceFonts[0].sourceName),
    path.join(outputDir, fallbackName),
);
await writeGeneratedCss(unicodeRange);
await removeLegacyPublicFonts();

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
});

await fs.writeFile(reportPath, JSON.stringify(report, null, 4), 'utf8');

console.log(
    JSON.stringify(
        {
            charsetPath: path.relative(rootDir, charsetPath).replaceAll('\\', '/'),
            reportPath: path.relative(rootDir, reportPath).replaceAll('\\', '/'),
            generatedCssPath: path
                .relative(rootDir, generatedCssPath)
                .replaceAll('\\', '/'),
            totalChars: totalChars.length,
            stationNameCount: databaseResult.stationNames.length,
        },
        null,
        2,
    ),
);
