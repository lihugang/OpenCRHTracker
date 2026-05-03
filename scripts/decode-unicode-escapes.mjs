import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const supportedExtensions = new Set(['.vue', '.ts', '.js', '.mjs', '.cjs']);
const preservedCodePoints = new Set([0xfeff]);
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

function getTrackedCodeFiles() {
    const output = execFileSync('git', ['ls-files', '-z'], {
        cwd: repoRoot,
        encoding: 'buffer'
    });

    return output
        .toString('utf8')
        .split('\0')
        .filter(Boolean)
        .filter((filePath) => supportedExtensions.has(extname(filePath)));
}

function readUtf8File(filePath) {
    return utf8Decoder.decode(readFileSync(filePath));
}

function isHexDigit(character) {
    return /^[0-9a-f]$/i.test(character);
}

function isEscapedBackslash(source, index) {
    let backslashCount = 0;

    for (let currentIndex = index - 1; currentIndex >= 0; currentIndex -= 1) {
        if (source[currentIndex] !== '\\') {
            break;
        }

        backslashCount += 1;
    }

    return backslashCount % 2 === 1;
}

function readBraceEscape(source, index) {
    if (source[index + 2] !== '{') {
        return null;
    }

    let cursor = index + 3;
    let hexDigits = '';

    while (cursor < source.length && source[cursor] !== '}') {
        const character = source[cursor];

        if (!isHexDigit(character) || hexDigits.length >= 6) {
            return null;
        }

        hexDigits += character;
        cursor += 1;
    }

    if (hexDigits.length === 0 || source[cursor] !== '}') {
        return null;
    }

    const codePoint = Number.parseInt(hexDigits, 16);

    if (!Number.isInteger(codePoint) || codePoint > 0x10ffff) {
        return null;
    }

    return {
        codePoint,
        raw: source.slice(index, cursor + 1),
        length: cursor + 1 - index
    };
}

function readBasicEscape(source, index) {
    const hexDigits = source.slice(index + 2, index + 6);

    if (hexDigits.length !== 4 || [...hexDigits].some((digit) => !isHexDigit(digit))) {
        return null;
    }

    return {
        codePoint: Number.parseInt(hexDigits, 16),
        raw: source.slice(index, index + 6),
        length: 6
    };
}

function readUnicodeEscape(source, index) {
    if (source[index] !== '\\' || source[index + 1] !== 'u') {
        return null;
    }

    return readBraceEscape(source, index) ?? readBasicEscape(source, index);
}

function combineSurrogatePair(highSurrogate, lowSurrogate) {
    return (
        ((highSurrogate - 0xd800) << 10) +
        (lowSurrogate - 0xdc00) +
        0x10000
    );
}

function transformUnicodeEscapes(source) {
    let cursor = 0;
    let replacedCount = 0;
    let preservedCount = 0;
    let output = '';

    while (cursor < source.length) {
        if (source[cursor] !== '\\' || isEscapedBackslash(source, cursor)) {
            output += source[cursor];
            cursor += 1;
            continue;
        }

        const currentEscape = readUnicodeEscape(source, cursor);

        if (currentEscape === null) {
            output += source[cursor];
            cursor += 1;
            continue;
        }

        if (preservedCodePoints.has(currentEscape.codePoint)) {
            output += currentEscape.raw;
            cursor += currentEscape.length;
            preservedCount += 1;
            continue;
        }

        const nextEscape = readUnicodeEscape(source, cursor + currentEscape.length);
        const isHighSurrogate =
            currentEscape.codePoint >= 0xd800 && currentEscape.codePoint <= 0xdbff;
        const isLowSurrogate =
            nextEscape !== null &&
            nextEscape.codePoint >= 0xdc00 &&
            nextEscape.codePoint <= 0xdfff;

        if (isHighSurrogate && isLowSurrogate) {
            output += String.fromCodePoint(
                combineSurrogatePair(currentEscape.codePoint, nextEscape.codePoint)
            );
            cursor += currentEscape.length + nextEscape.length;
            replacedCount += 1;
            continue;
        }

        output += String.fromCodePoint(currentEscape.codePoint);
        cursor += currentEscape.length;
        replacedCount += 1;
    }

    return {
        content: output,
        replacedCount,
        preservedCount,
        changed: output !== source
    };
}

function formatFileResult(fileResult) {
    const segments = [];

    if (fileResult.replacedCount > 0) {
        segments.push(`replaceable=${fileResult.replacedCount}`);
    }

    if (fileResult.preservedCount > 0) {
        segments.push(`preservedFEFF=${fileResult.preservedCount}`);
    }

    return `${fileResult.filePath}: ${segments.join(', ')}`;
}

function main() {
    const shouldWrite = process.argv.includes('--write');
    const trackedFiles = getTrackedCodeFiles();
    const fileResults = [];
    let matchedFileCount = 0;
    let replacedTotal = 0;
    let preservedTotal = 0;
    let writtenFileCount = 0;

    for (const relativePath of trackedFiles) {
        const absolutePath = resolve(repoRoot, relativePath);
        const source = readUtf8File(absolutePath);
        const result = transformUnicodeEscapes(source);

        if (result.replacedCount === 0 && result.preservedCount === 0) {
            continue;
        }

        matchedFileCount += 1;
        replacedTotal += result.replacedCount;
        preservedTotal += result.preservedCount;

        if (shouldWrite && result.changed) {
            writeFileSync(absolutePath, result.content, 'utf8');
            writtenFileCount += 1;
        }

        fileResults.push({
            filePath: relativePath,
            replacedCount: result.replacedCount,
            preservedCount: result.preservedCount,
            changed: result.changed
        });
    }

    if (fileResults.length === 0) {
        console.log('No Unicode escapes found in tracked code files.');
    } else {
        for (const fileResult of fileResults) {
            console.log(formatFileResult(fileResult));
        }
    }

    console.log('');
    console.log(`scannedFiles=${trackedFiles.length}`);
    console.log(`matchedFiles=${matchedFileCount}`);
    console.log(`replaceableEscapes=${replacedTotal}`);
    console.log(`preservedFEFF=${preservedTotal}`);
    console.log(`writtenFiles=${writtenFileCount}`);
}

main();
