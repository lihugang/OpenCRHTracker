import normalizeCode from '~/server/utils/12306/normalizeCode';
import parseEmuCode from '~/server/utils/12306/parseEmuCode';
import useConfig from '~/server/config';
import getLogger from '~/server/libs/log4js';
import {
    listDailyRecordsPaged,
    type DailyEmuRouteRow
} from '~/server/services/emuRoutesStore';
import { loadTrainStyleMapping } from '~/server/services/trainStyleMappingStore';
import {
    formatShanghaiDateString,
    getRelativeDateString
} from '~/server/utils/date/getCurrentDateString';
import { getShanghaiDayStartUnixSeconds } from '~/server/utils/date/shanghaiDateTime';
import { serviceDayToShanghaiDayStartUnixSeconds } from '~/server/utils/date/serviceDay';
import { getTodayScheduleCache } from '~/server/services/todayScheduleCache';
import {
    formatTrainCode,
    trainCodeKey,
    type TrainCodeParts
} from '~/server/utils/12306/trainCode';
import type { ServiceDay } from '~/server/utils/date/serviceDay';
import {
    formatExternalEmuCode,
    formatExternalTrainCode
} from '~/server/utils/internal/boundaries';

interface CursorPoint {
    serviceDate: ServiceDay;
    id: number;
}

interface ReferenceModelRunBucket {
    trainCode: TrainCodeParts;
    startAt: number;
    serviceDate: ServiceDay;
    startStation: string;
    endStation: string;
    models: Set<string>;
}

interface ReferenceModelObservedRun {
    runKey: string;
    serviceDate: ServiceDay;
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
const logger = getLogger('reference-model-index');

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

function buildRunBucketKey(trainCode: TrainCodeParts, startAt: number) {
    return `${trainCodeKey(trainCode)}@${startAt}`;
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

function normalizeQueryTrainCodes(
    trainCodes: readonly TrainCodeParts[]
): TrainCodeParts[] {
    const seen = new Set<string>();
    const result: TrainCodeParts[] = [];
    for (const code of trainCodes) {
        const key = trainCodeKey(code);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(code);
    }
    return result;
}

function roundWeightedShare(value: number) {
    return Number(value.toFixed(4));
}

async function getFallbackReferenceModelFromTimetableSources(
    trainCodes: TrainCodeParts[]
): Promise<ReferenceModelItem | null> {
    const scheduleRoutesByTrainCode = getTodayScheduleCache();
    const trainStyleMappingAssets = await loadTrainStyleMapping();

    for (const trainCode of trainCodes) {
        const route =
            scheduleRoutesByTrainCode.get(trainCodeKey(trainCode)) ?? null;
        const trainStyle = route?.trainStyle.trim() ?? '';
        const allCodes = route?.allCodes ?? [];

        if (trainStyle.length === 0) {
            continue;
        }

        const mappedModel =
            trainStyleMappingAssets.mappings.get(trainStyle) ?? trainStyle;
        if (mappedModel === trainStyle) {
            logger.warn(
                `train_style_mapping_miss trainCode=${formatTrainCode(trainCode)} trainStyle=${trainStyle} allCodes=${allCodes.map(formatTrainCode).join('/')} strategy=keep_raw_train_style`
            );
        }

        return {
            model: mappedModel,
            weightedShare: 0
        };
    }

    return null;
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
        const existingRuns = runsByTrainCode.get(
            trainCodeKey(bucket.trainCode)
        );
        if (existingRuns) {
            existingRuns.push(run);
            continue;
        }

        runsByTrainCode.set(trainCodeKey(bucket.trainCode), [run]);
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
    const parsedEmuCode = parseEmuCode(formatExternalEmuCode(row.emu_id));
    const model = normalizeCode(parsedEmuCode?.model ?? '');
    if (model.length === 0) {
        return;
    }

    const bucketKey = buildRunBucketKey(row.train_code, row.start_at);
    const serviceDate = row.service_date;
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
        trainCode: row.train_code,
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
    if (cached) {
        return cached;
    }

    return rebuildReferenceModelIndex();
}

export function invalidateReferenceModelIndexCache() {
    cached = null;
}

export async function getReferenceModelsByTrainCodes(
    trainCodes: readonly TrainCodeParts[]
): Promise<ReferenceModelItem[]> {
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
        const runs =
            activeCache.runsByTrainCode.get(trainCodeKey(trainCode)) ?? [];
        for (const run of runs) {
            dedupedRuns.set(run.runKey, run);
        }
    }

    if (dedupedRuns.size === 0) {
        const fallbackModel =
            await getFallbackReferenceModelFromTimetableSources(
                normalizedTrainCodes
            );
        return fallbackModel ? [fallbackModel] : [];
    }

    const modelsByServiceDate = new Map<ServiceDay, Set<string>>();
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
                (todayStartAt -
                    serviceDayToShanghaiDayStartUnixSeconds(serviceDate)) /
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
