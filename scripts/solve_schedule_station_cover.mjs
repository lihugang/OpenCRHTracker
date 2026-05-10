#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import highsLoader from 'highs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SCHEDULE_PATH = path.join(REPO_ROOT, 'data', 'schedule.json');
const SKIPPED_SAMPLE_LIMIT = 10;

function normalizeString(value) {
    if (value === null || value === undefined) {
        return '';
    }

    return String(value).trim();
}

function normalizeStationName(value) {
    const stationName = normalizeString(value);
    if (!stationName) {
        return '';
    }

    if (/\s/u.test(stationName)) {
        return '';
    }

    return stationName;
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
        inputPath: path.resolve(inputPath),
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

    let payload;
    try {
        payload = JSON.parse(raw);
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error(`Failed to parse schedule JSON at ${inputPath}: ${error.message}`);
        }
        throw error;
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error(`Expected top-level object in ${inputPath}.`);
    }

    return payload;
}

async function extractScheduleItems(inputPath) {
    const payload = await loadScheduleDocument(inputPath);
    const published = payload.published;

    if (!published || typeof published !== 'object' || Array.isArray(published)) {
        throw new Error(`Expected "${inputPath}" to contain a "published" object.`);
    }

    const items = published.items;
    if (!Array.isArray(items)) {
        throw new Error(`Expected "${inputPath}" to contain a "published.items" array.`);
    }

    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw new Error(`Expected published.items[${index}] to be an object.`);
        }
    }

    return items;
}

async function buildCoverageData(inputPath) {
    const items = await extractScheduleItems(inputPath);
    const trains = [];
    const skippedTrains = [];
    const stationNames = new Set();

    items.forEach((item, index) => {
        const trainCode = normalizeString(item.code) || `<unknown:${index + 1}>`;
        const rawStops = item.stops;

        if (!Array.isArray(rawStops)) {
            skippedTrains.push(trainCode);
            return;
        }

        const orderedStations = [];
        const seenStations = new Set();

        rawStops.forEach((stop) => {
            if (!stop || typeof stop !== 'object' || Array.isArray(stop)) {
                return;
            }

            const stationName = normalizeStationName(stop.stationName);
            if (!stationName || seenStations.has(stationName)) {
                return;
            }

            seenStations.add(stationName);
            orderedStations.push(stationName);
            stationNames.add(stationName);
        });

        if (!orderedStations.length) {
            skippedTrains.push(trainCode);
            return;
        }

        trains.push({
            code: trainCode,
            stations: orderedStations,
        });
    });

    return {
        trains,
        skippedTrains,
        stationNames: [...stationNames].sort((left, right) =>
            left.localeCompare(right, 'zh-Hans-CN')
        ),
    };
}

function buildModel(data) {
    if (!data.trains.length) {
        throw new Error('No trains with valid stop data were found.');
    }

    if (!data.stationNames.length) {
        throw new Error('No candidate stations were found.');
    }

    const stationVariableByName = new Map();
    const stationNameByVariable = new Map();

    data.stationNames.forEach((stationName, index) => {
        const variableName = `x_${index + 1}`;
        stationVariableByName.set(stationName, variableName);
        stationNameByVariable.set(variableName, stationName);
    });

    const lines = ['Minimize'];
    lines.push(
        ` obj: ${data.stationNames
            .map((stationName) => stationVariableByName.get(stationName))
            .join(' + ')}`
    );
    lines.push('Subject To');

    data.trains.forEach((train, index) => {
        const terms = train.stations.map((stationName) =>
            stationVariableByName.get(stationName)
        );
        lines.push(` train_${index + 1}: ${terms.join(' + ')} >= 1`);
    });

    lines.push('Binary');
    data.stationNames.forEach((stationName) => {
        lines.push(` ${stationVariableByName.get(stationName)}`);
    });
    lines.push('End');

    return {
        lpText: lines.join('\n'),
        stationVariableByName,
        stationNameByVariable,
    };
}

function extractSelectedStations(solution, stationNameByVariable) {
    const columns = solution.Columns ?? {};
    const selectedStations = [];

    for (const [variableName, column] of Object.entries(columns)) {
        if (!column || typeof column !== 'object') {
            continue;
        }

        if (typeof column.Primal !== 'number' || column.Primal <= 0.5) {
            continue;
        }

        const stationName = stationNameByVariable.get(variableName);
        if (stationName) {
            selectedStations.push(stationName);
        }
    }

    selectedStations.sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));

    if (!selectedStations.length) {
        throw new Error('Solver returned an empty station set.');
    }

    return selectedStations;
}

function validateSolution(trains, selectedStations) {
    const selectedStationSet = new Set(selectedStations);
    const uncoveredTrains = trains
        .filter((train) => !train.stations.some((stationName) => selectedStationSet.has(stationName)))
        .map((train) => train.code);

    if (uncoveredTrains.length) {
        throw new Error(
            'Computed solution does not cover all trains. ' +
                `Uncovered examples: ${uncoveredTrains.slice(0, SKIPPED_SAMPLE_LIMIT).join(', ')}`
        );
    }
}

function printResult(result) {
    console.log(`输入文件: ${result.inputPath}`);
    console.log(`参与求解的车次数量: ${result.data.trains.length}`);
    console.log(`跳过的空停靠车次数量: ${result.data.skippedTrains.length}`);
    console.log(`候选车站数量: ${result.data.stationNames.length}`);
    console.log(`选取的车站数量: ${result.selectedStations.length}`);
    console.log(`建模耗时: ${result.buildMs.toFixed(1)} ms`);
    console.log(`求解耗时: ${result.solveMs.toFixed(1)} ms`);
    console.log(`总耗时: ${result.totalMs.toFixed(1)} ms`);
    console.log(`求解状态: ${result.solution.Status}`);
    console.log(`目标值: ${result.solution.ObjectiveValue}`);

    if (result.data.skippedTrains.length) {
        const sample = result.data.skippedTrains.slice(0, SKIPPED_SAMPLE_LIMIT);
        const suffix =
            result.data.skippedTrains.length > SKIPPED_SAMPLE_LIMIT ? ', ...' : '';
        console.log(`跳过车次示例: ${sample.join(', ')}${suffix}`);
    }

    console.log('选取的车站列表:');
    result.selectedStations.forEach((stationName) => {
        console.log(stationName);
    });
}

async function main() {
    const startedAt = performance.now();
    const { inputPath } = parseArgs(process.argv.slice(2));
    const data = await buildCoverageData(inputPath);

    const buildStartedAt = performance.now();
    const { lpText, stationNameByVariable } = buildModel(data);
    const buildMs = performance.now() - buildStartedAt;

    const highs = await highsLoader();
    const solveStartedAt = performance.now();
    const solution = highs.solve(lpText, {
        presolve: 'on',
    });
    const solveMs = performance.now() - solveStartedAt;

    if (solution.Status !== 'Optimal') {
        throw new Error(`Failed to find optimal solution: ${solution.Status}`);
    }

    const selectedStations = extractSelectedStations(solution, stationNameByVariable);
    validateSolution(data.trains, selectedStations);

    printResult({
        inputPath,
        data,
        selectedStations,
        solution,
        buildMs,
        solveMs,
        totalMs: performance.now() - startedAt,
    });
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
});
