import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const timezone = 'Asia/Shanghai';

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
const configCandidatePaths = [
    path.join(rootDir, 'data', 'config.dev.json'),
    path.join(rootDir, 'data', 'config.json'),
];
const conservativeCharsPath = path.join(
    rootDir,
    'scripts',
    'font-data',
    'source-han-conservative-chars.txt',
);

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

function addCharsToSet(target, text) {
    for (const char of text) {
        if (char === '\r' || char === '\n' || char === '\t') {
            continue;
        }

        target.add(char);
    }
}

function ensureObjectRecord(value, label) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`${label} must be a JSON object`);
    }

    return value;
}

function resolveConfigFilePath(filePath) {
    if (typeof filePath !== 'string' || filePath.trim().length === 0) {
        throw new Error('config asset path must be a non-empty string');
    }

    return path.isAbsolute(filePath)
        ? filePath
        : path.resolve(rootDir, filePath);
}

async function readConservativeChars() {
    const raw = await fs.readFile(conservativeCharsPath, 'utf8');
    return raw
        .split(/\r?\n/u)
        .filter((line) => !line.trimStart().startsWith('#'))
        .join('');
}

async function resolveRuntimeConfigPath() {
    for (const candidatePath of configCandidatePaths) {
        try {
            await fs.access(candidatePath);
            return candidatePath;
        } catch (error) {
            if (error && typeof error === 'object' && error.code === 'ENOENT') {
                continue;
            }

            throw error;
        }
    }

    throw new Error(
        `runtime config file not found; tried ${configCandidatePaths
            .map(relativeFromRoot)
            .join(', ')}`,
    );
}

async function readRuntimeAssetPaths(runtimeConfigPath) {
    const configLabel = relativeFromRoot(runtimeConfigPath);
    const raw = await fs.readFile(runtimeConfigPath, 'utf8');
    const parsed = ensureObjectRecord(JSON.parse(raw), configLabel);
    const data = ensureObjectRecord(parsed.data, `${configLabel} data`);
    const assets = ensureObjectRecord(data.assets, `${configLabel} data.assets`);
    const schedule = ensureObjectRecord(
        assets.schedule,
        `${configLabel} data.assets.schedule`,
    );
    const emuList = ensureObjectRecord(
        assets.EMUList,
        `${configLabel} data.assets.EMUList`,
    );

    return {
        schedulePath: resolveConfigFilePath(schedule.file),
        emuListPath: resolveConfigFilePath(emuList.file),
    };
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

function collectJsonChars(value, charSet) {
    if (typeof value === 'string') {
        addCharsToSet(charSet, value);
        return;
    }

    if (!value || typeof value !== 'object') {
        return;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            collectJsonChars(item, charSet);
        }

        return;
    }

    for (const [key, item] of Object.entries(value)) {
        addCharsToSet(charSet, key);
        collectJsonChars(item, charSet);
    }
}

async function collectScheduleJsonChars(schedulePath) {
    const raw = await fs.readFile(schedulePath, 'utf8');
    const parsed = ensureObjectRecord(JSON.parse(raw), 'schedule.json');
    const published =
        parsed.published === null || parsed.published === undefined
            ? null
            : ensureObjectRecord(parsed.published, 'schedule.json published');
    const items = Array.isArray(published?.items) ? published.items : [];
    const charSet = new Set();

    collectJsonChars(parsed, charSet);

    return {
        scheduleItemCount: items.length,
        charSet,
    };
}

async function collectEmuListJsonChars(emuListPath) {
    const raw = await fs.readFile(emuListPath, 'utf8');
    const parsed = ensureObjectRecord(JSON.parse(raw), 'emu_list.json');
    const rows = Array.isArray(parsed.emu_trainsets)
        ? parsed.emu_trainsets
        : Array.isArray(parsed.trainsets)
          ? parsed.trainsets
          : [];
    const charSet = new Set();

    collectJsonChars(parsed, charSet);

    return {
        emuRecordCount: rows.length,
        charSet,
    };
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
    configPath,
    schedulePath,
    emuListPath,
    staticFiles,
    staticChars,
    conservativeChars,
    scheduleItemCount,
    scheduleChars,
    emuRecordCount,
    emuListChars,
    totalChars,
    unicodeRange,
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
        inputs: {
            configPath: relativeFromRoot(configPath),
            schedulePath: relativeFromRoot(schedulePath),
            emuListPath: relativeFromRoot(emuListPath),
            staticFileCount: staticFiles.length,
            staticFiles,
            staticCharCount: staticChars.size,
            conservativeCharCount: conservativeChars.size,
            scheduleItemCount,
            scheduleJsonCharCount: scheduleChars.size,
            emuRecordCount,
            emuListJsonCharCount: emuListChars.size,
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
await fs.access(conservativeCharsPath);
await fs.mkdir(outputDir, { recursive: true });
await ensureSourceFonts();
logStep(`source fonts ready in ${relativeFromRoot(sourceDir)}`);

const configPath = await resolveRuntimeConfigPath();
logStep(`using runtime config: ${relativeFromRoot(configPath)}`);
const assetPaths = await readRuntimeAssetPaths(configPath);
await fs.access(assetPaths.schedulePath);
await fs.access(assetPaths.emuListPath);

logStep('collecting characters from repository and runtime assets');
const staticResult = await collectStaticText();
const conservativeCharsRaw = await readConservativeChars();
const scheduleResult = await collectScheduleJsonChars(assetPaths.schedulePath);
const emuListResult = await collectEmuListJsonChars(assetPaths.emuListPath);

const mergedChars = new Set();

addCharsToSet(mergedChars, buildAsciiChars());

for (const char of conservativeCharsRaw) {
    mergedChars.add(char);
}

for (const char of staticResult.charSet) {
    mergedChars.add(char);
}

for (const char of scheduleResult.charSet) {
    mergedChars.add(char);
}

for (const char of emuListResult.charSet) {
    mergedChars.add(char);
}

const totalChars = [...mergedChars].sort(
    (left, right) => left.codePointAt(0) - right.codePointAt(0),
);
const unicodeRange = buildUnicodeRange(totalChars);

await fs.writeFile(charsetPath, totalChars.join(''), 'utf8');
logStep(
    `collected ${totalChars.length} total chars from ${staticResult.files.length} static files, ` +
        `${scheduleResult.charSet.size} schedule JSON chars, ` +
        `${emuListResult.charSet.size} emu list JSON chars`,
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
    configPath,
    schedulePath: assetPaths.schedulePath,
    emuListPath: assetPaths.emuListPath,
    staticFiles: staticResult.files,
    staticChars: staticResult.charSet,
    conservativeChars: new Set(conservativeCharsRaw),
    scheduleItemCount: scheduleResult.scheduleItemCount,
    scheduleChars: scheduleResult.charSet,
    emuRecordCount: emuListResult.emuRecordCount,
    emuListChars: emuListResult.charSet,
    totalChars,
    unicodeRange,
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
            configPath: relativeFromRoot(configPath),
            charsetPath: relativeFromRoot(charsetPath),
            reportPath: relativeFromRoot(reportPath),
            generatedCssPath: relativeFromRoot(generatedCssPath),
            totalChars: totalChars.length,
            scheduleJsonCharCount: scheduleResult.charSet.size,
            emuListJsonCharCount: emuListResult.charSet.size,
            subsetFiles: generatedFonts.map((font) => font.subsetName),
        },
        null,
        2,
    ),
);
