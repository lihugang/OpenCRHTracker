#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SCHEDULE_PATH = path.join(REPO_ROOT, 'data', 'schedule.json');

function normalizeCode(code) {
    return String(code ?? '').trim().toUpperCase();
}

function parseArgs(argv) {
    let inputPath = DEFAULT_SCHEDULE_PATH;

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (token === '--input') {
            const nextValue = argv[index + 1];
            if (!nextValue) {
                throw new Error('Missing value for --input.');
            }

            inputPath = path.isAbsolute(nextValue)
                ? nextValue
                : path.resolve(REPO_ROOT, nextValue);
            index += 1;
            continue;
        }

        throw new Error(`Unknown argument: ${token}`);
    }

    return {
        inputPath: path.resolve(inputPath)
    };
}

async function loadScheduleDocument(inputPath) {
    let raw;

    try {
        raw = await fs.readFile(inputPath, 'utf8');
    } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
            throw new Error(`Schedule file not found: ${inputPath}`);
        }
        throw error;
    }

    try {
        return JSON.parse(raw);
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error(`Failed to parse schedule JSON at ${inputPath}: ${error.message}`);
        }
        throw error;
    }
}

function assertObjectRecord(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`Expected ${label} to be an object.`);
    }

    return value;
}

function assertPublishedItems(document, inputPath) {
    const published = assertObjectRecord(
        document?.published,
        `"published" in ${inputPath}`
    );
    const items = published.items;

    if (!Array.isArray(items)) {
        throw new Error(`Expected "${inputPath}" to contain a "published.items" array.`);
    }

    return items;
}

function isValidCirculationNode(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }

    const internalCode = normalizeCode(value.internalCode);
    const allCodes =
        Array.isArray(value.allCodes) &&
        value.allCodes.every(
            (code) => typeof code === 'string' && normalizeCode(code).length > 0
        )
            ? value.allCodes
            : null;
    const startStation =
        typeof value.startStation === 'string' ? value.startStation.trim() : '';
    const endStation =
        typeof value.endStation === 'string' ? value.endStation.trim() : '';

    return (
        internalCode.length > 0 &&
        allCodes !== null &&
        allCodes.length > 0 &&
        startStation.length > 0 &&
        endStation.length > 0 &&
        Number.isInteger(value.startAt) &&
        value.startAt >= 0 &&
        Number.isInteger(value.endAt) &&
        value.endAt >= 0
    );
}

function isValidCirculationEntry(key, value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }

    if (!Number.isInteger(value.refreshedAt) || value.refreshedAt < 0) {
        return false;
    }

    if (!Array.isArray(value.nodes) || value.nodes.length === 0) {
        return false;
    }

    if (!value.nodes.every((node) => isValidCirculationNode(node))) {
        return false;
    }

    const normalizedKey = normalizeCode(key);
    const nodeKeys = new Set(
        value.nodes.map((node) => normalizeCode(node.internalCode))
    );

    return nodeKeys.has(normalizedKey);
}

function collectUniqueScheduleInternalCodes(items) {
    const internalCodes = new Set();

    items.forEach((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw new Error(`Expected published.items[${index}] to be an object.`);
        }

        const normalizedInternalCode = normalizeCode(item.internalCode);
        if (normalizedInternalCode.length === 0) {
            throw new Error(
                `Expected published.items[${index}].internalCode to be a non-empty string.`
            );
        }

        internalCodes.add(normalizedInternalCode);
    });

    return internalCodes;
}

function buildCoverageSummary(document, inputPath) {
    const items = assertPublishedItems(document, inputPath);
    const scheduleInternalCodes = collectUniqueScheduleInternalCodes(items);
    const circulation = assertObjectRecord(
        document?.circulation ?? {},
        `"circulation" in ${inputPath}`
    );

    const validCoverageCodes = new Set();
    let orphanCirculationKeyCount = 0;
    let invalidCirculationEntryCount = 0;

    for (const [key, entry] of Object.entries(circulation)) {
        if (!isValidCirculationEntry(key, entry)) {
            invalidCirculationEntryCount += 1;
            continue;
        }

        const normalizedKey = normalizeCode(key);
        if (scheduleInternalCodes.has(normalizedKey)) {
            validCoverageCodes.add(normalizedKey);
        } else {
            orphanCirculationKeyCount += 1;
        }
    }

    const total = scheduleInternalCodes.size;
    const covered = validCoverageCodes.size;
    const missing = total - covered;
    const coverageRate = total === 0 ? 0 : (covered / total) * 100;

    return {
        inputPath,
        total,
        covered,
        missing,
        coverageRate,
        invalidCirculationEntryCount,
        orphanCirculationKeyCount
    };
}

function printSummary(summary) {
    console.log(`Schedule file: ${summary.inputPath}`);
    console.log(`Unique internalCode total: ${summary.total}`);
    console.log(`Circulation covered: ${summary.covered}`);
    console.log(`Circulation missing: ${summary.missing}`);
    console.log(`Coverage rate: ${summary.coverageRate.toFixed(2)}%`);
    console.log(`Invalid circulation entries ignored: ${summary.invalidCirculationEntryCount}`);
    console.log(`Orphan circulation keys: ${summary.orphanCirculationKeyCount}`);
}

async function main() {
    const { inputPath } = parseArgs(process.argv.slice(2));
    const document = await loadScheduleDocument(inputPath);
    const summary = buildCoverageSummary(document, inputPath);
    printSummary(summary);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
