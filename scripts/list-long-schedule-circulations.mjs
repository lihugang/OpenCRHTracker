#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SCHEDULE_PATH = path.join(REPO_ROOT, 'data', 'schedule.json');
const THREE_DAYS_IN_SECONDS = 3 * 24 * 60 * 60;

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

function buildLongCirculationSummary(document, inputPath) {
    const circulation = assertObjectRecord(
        document?.circulation ?? {},
        `"circulation" in ${inputPath}`
    );

    const matches = [];
    let invalidCirculationEntryCount = 0;
    let validCirculationEntryCount = 0;

    for (const [key, entry] of Object.entries(circulation)) {
        if (!isValidCirculationEntry(key, entry)) {
            invalidCirculationEntryCount += 1;
            continue;
        }

        validCirculationEntryCount += 1;

        const firstNode = entry.nodes[0];
        const lastNode = entry.nodes[entry.nodes.length - 1];
        const durationSeconds = lastNode.endAt - firstNode.startAt;

        if (durationSeconds <= THREE_DAYS_IN_SECONDS) {
            continue;
        }

        matches.push({
            key: normalizeCode(key),
            firstTrainCode: firstNode.allCodes[0],
            durationSeconds,
            durationDays: durationSeconds / (24 * 60 * 60),
            nodeCount: entry.nodes.length
        });
    }

    matches.sort((left, right) => {
        if (right.durationSeconds !== left.durationSeconds) {
            return right.durationSeconds - left.durationSeconds;
        }

        return left.firstTrainCode.localeCompare(right.firstTrainCode, 'en');
    });

    return {
        inputPath,
        totalCirculationEntryCount: Object.keys(circulation).length,
        validCirculationEntryCount,
        invalidCirculationEntryCount,
        matchCount: matches.length,
        matches
    };
}

function printSummary(summary) {
    console.log(`Schedule file: ${summary.inputPath}`);
    console.log(`Circulation entries scanned: ${summary.totalCirculationEntryCount}`);
    console.log(`Valid circulation entries: ${summary.validCirculationEntryCount}`);
    console.log(`Invalid circulation entries ignored: ${summary.invalidCirculationEntryCount}`);
    console.log(`Circulations longer than 3 days: ${summary.matchCount}`);

    if (summary.matches.length === 0) {
        console.log('No circulation longer than 3 days found.');
        return;
    }

    console.log('');
    console.log('First train code of long circulations:');

    for (const match of summary.matches) {
        console.log(
            [
                match.firstTrainCode,
                `key=${match.key}`,
                `days=${match.durationDays.toFixed(2)}`,
                `nodes=${match.nodeCount}`
            ].join('\t')
        );
    }
}

async function main() {
    const { inputPath } = parseArgs(process.argv.slice(2));
    const document = await loadScheduleDocument(inputPath);
    const summary = buildLongCirculationSummary(document, inputPath);
    printSummary(summary);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
