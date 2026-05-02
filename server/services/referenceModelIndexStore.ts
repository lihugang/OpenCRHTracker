import normalizeCode from '~/server/utils/12306/normalizeCode';
import parseEmuCode from '~/server/utils/12306/parseEmuCode';
import useConfig from '~/server/config';
import {
    listDailyRecordsPaged,
    type DailyEmuRouteRow
} from '~/server/services/emuRoutesStore';
import {
    formatShanghaiDateString,
    getRelativeDateString
} from '~/server/utils/date/getCurrentDateString';
import { getShanghaiDayStartUnixSeconds } from '~/server/utils/date/shanghaiDateTime';

interface CursorPoint {
    serviceDate: string;
    id: number;
}

interface ReferenceModelRunBucket {
    trainCode: string;
    startAt: number;
    serviceDate: string;
    startStation: string;
    endStation: string;
    models: Set<string>;
}

interface ReferenceModelObservedRun {
    runKey: string;
    serviceDate: string;
    models: string[];
}

export interface ReferenceModelIndexCache {
    currentDate: string;
    windowDays: number;
    runsByTrainCode: Map<string, ReferenceModelObservedRun[]>;
}

export interface ReferenceModelItem {
    model: string;
    weightedShare: number;
}

let cached: ReferenceModelIndexCache | null = null;

function getWindowConfig() {
    return useConfig().task.referenceModel;
}

function getWindowRange(currentDate: string, windowDays: number) {
    const todayStartAt = getShanghaiDayStartUnixSeconds(currentDate);
    const startAt = todayStartAt - (windowDays - 1) * 24 * 60 * 60;
    const endAt = todayStartAt + 24 * 60 * 60 - 1;
    return {
        todayStartAt,
        startAt,
        endAt
    };
}

function buildRunBucketKey(trainCode: string, startAt: number) {
    return `${trainCode}@${startAt}`;
}

function buildObservedRunKey(bucket: ReferenceModelRunBucket) {
    return [
        bucket.serviceDate,
        bucket.startAt,
        bucket.startStation,
        bucket.endStation,
        [...bucket.models]
            .sort((left, right) => left.localeCompare(right))
            .join('/')
    ].join('#');
}

function normalizeStationText(value: string) {
    return value.trim();
}

function normalizeQueryTrainCodes(trainCodes: string[]) {
    return Array.from(
        new Set(
            trainCodes
                .map((code) => normalizeCode(code))
                .filter((code) => code.length > 0)
        )
    );
}

function roundWeightedShare(value: number) {
    return Number(value.toFixed(4));
}

function buildRunsByTrainCode(
    buckets: Iterable<ReferenceModelRunBucket>
): Map<string, ReferenceModelObservedRun[]> {
    const runsByTrainCode = new Map<string, ReferenceModelObservedRun[]>();

    for (const bucket of buckets) {
        if (bucket.models.size === 0) {
            continue;
        }

        const run: ReferenceModelObservedRun = {
            runKey: buildObservedRunKey(bucket),
            serviceDate: bucket.serviceDate,
            models: [...bucket.models].sort((left, right) =>
                left.localeCompare(right)
            )
        };
        const existingRuns = runsByTrainCode.get(bucket.trainCode);
        if (existingRuns) {
            existingRuns.push(run);
            continue;
        }

        runsByTrainCode.set(bucket.trainCode, [run]);
    }

    return runsByTrainCode;
}

function readWindowRunBuckets(
    currentDate: string,
    windowDays: number,
    batchSize: number
) {
    const { startAt, endAt } = getWindowRange(currentDate, windowDays);
    const buckets = new Map<string, ReferenceModelRunBucket>();
    let cursor: CursorPoint | null = null;

    while (true) {
        const rows = listDailyRecordsPaged(startAt, endAt, cursor, batchSize);
        if (rows.length === 0) {
            break;
        }

        for (const row of rows) {
            consumeDailyRecordRow(buckets, row);
        }

        if (rows.length < batchSize) {
            break;
        }

        const lastRow = rows[rows.length - 1]!;
        cursor = {
            serviceDate: lastRow.service_date,
            id: lastRow.id
        };
    }

    return buckets;
}

function consumeDailyRecordRow(
    buckets: Map<string, ReferenceModelRunBucket>,
    row: DailyEmuRouteRow
) {
    const trainCode = normalizeCode(row.train_code);
    if (trainCode.length === 0) {
        return;
    }

    const parsedEmuCode = parseEmuCode(row.emu_code);
    const model = normalizeCode(parsedEmuCode?.model ?? '');
    if (model.length === 0) {
        return;
    }

    const bucketKey = buildRunBucketKey(trainCode, row.start_at);
    const serviceDate = formatShanghaiDateString(row.start_at * 1000);
    const startStation = normalizeStationText(row.start_station_name);
    const endStation = normalizeStationText(row.end_station_name);
    const existingBucket = buckets.get(bucketKey);

    if (existingBucket) {
        existingBucket.models.add(model);
        if (
            existingBucket.startStation.length === 0 &&
            startStation.length > 0
        ) {
            existingBucket.startStation = startStation;
        }
        if (existingBucket.endStation.length === 0 && endStation.length > 0) {
            existingBucket.endStation = endStation;
        }
        return;
    }

    buckets.set(bucketKey, {
        trainCode,
        startAt: row.start_at,
        serviceDate,
        startStation,
        endStation,
        models: new Set([model])
    });
}

export function rebuildReferenceModelIndex(): ReferenceModelIndexCache {
    const currentDate = getRelativeDateString(0);
    const config = getWindowConfig();
    const buckets = readWindowRunBuckets(
        currentDate,
        config.windowDays,
        config.batchSize
    );

    cached = {
        currentDate,
        windowDays: config.windowDays,
        runsByTrainCode: buildRunsByTrainCode(buckets.values())
    };

    return cached;
}

function getActiveCache() {
    const currentDate = getRelativeDateString(0);
    const { windowDays } = getWindowConfig();

    if (
        cached &&
        cached.currentDate === currentDate &&
        cached.windowDays === windowDays
    ) {
        return cached;
    }

    return rebuildReferenceModelIndex();
}

export function invalidateReferenceModelIndexCache() {
    cached = null;
}

export function getReferenceModelsByTrainCodes(
    trainCodes: string[]
): ReferenceModelItem[] {
    const normalizedTrainCodes = normalizeQueryTrainCodes(trainCodes);
    if (normalizedTrainCodes.length === 0) {
        return [];
    }

    const activeCache = getActiveCache();
    const threshold = getWindowConfig().threshold;
    const todayStartAt = getWindowRange(
        activeCache.currentDate,
        activeCache.windowDays
    ).todayStartAt;
    const dedupedRuns = new Map<string, ReferenceModelObservedRun>();

    for (const trainCode of normalizedTrainCodes) {
        const runs = activeCache.runsByTrainCode.get(trainCode) ?? [];
        for (const run of runs) {
            dedupedRuns.set(run.runKey, run);
        }
    }

    if (dedupedRuns.size === 0) {
        return [];
    }

    const modelsByServiceDate = new Map<string, Set<string>>();
    for (const run of dedupedRuns.values()) {
        const serviceDateModels =
            modelsByServiceDate.get(run.serviceDate) ?? new Set<string>();
        for (const model of run.models) {
            serviceDateModels.add(model);
        }
        modelsByServiceDate.set(run.serviceDate, serviceDateModels);
    }

    const modelScores = new Map<string, number>();
    let totalScore = 0;

    for (const [serviceDate, models] of modelsByServiceDate.entries()) {
        if (models.size === 0) {
            continue;
        }

        const ageDays = Math.max(
            0,
            Math.floor(
                (todayStartAt - getShanghaiDayStartUnixSeconds(serviceDate)) /
                    (24 * 60 * 60)
            )
        );
        const dayWeight = 1 / (1 + ageDays);
        const splitWeight = dayWeight / models.size;

        totalScore += dayWeight;
        for (const model of models) {
            modelScores.set(model, (modelScores.get(model) ?? 0) + splitWeight);
        }
    }

    if (totalScore <= 0 || modelScores.size === 0) {
        return [];
    }

    const scoredModels = [...modelScores.entries()]
        .map(([model, score]) => ({
            model,
            weightedShare: score / totalScore
        }))
        .sort((left, right) => {
            if (left.weightedShare !== right.weightedShare) {
                return right.weightedShare - left.weightedShare;
            }
            return left.model.localeCompare(right.model);
        });

    const thresholdModels = scoredModels.filter(
        (item) => item.weightedShare >= threshold
    );
    const displayModels =
        thresholdModels.length > 0 ? thresholdModels : scoredModels.slice(0, 1);

    return displayModels.map((item) => ({
        model: item.model,
        weightedShare: roundWeightedShare(item.weightedShare)
    }));
}
