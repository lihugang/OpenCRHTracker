import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import {
    hydrateEmuHistoryRecords,
    hydrateTrainHistoryRecords,
    type HydratedEmuHistoryRecord,
    type HydratedTrainHistoryRecord
} from '~/composables/useHistoricalTimetableContent';
import type { TrackerApiResponse } from '~/types/homepage';
import type {
    EmuHistoryResponse,
    FutureAssignmentDisplayAnchor,
    FutureAssignmentPredictedEmuItem,
    FutureAssignmentPredictionMatchSource,
    FutureAssignmentPredictionNode,
    FutureAssignmentPredictionSourceType,
    FutureAssignmentPredictionStatus,
    FutureAssignmentProgress,
    InferredCirculation,
    InferredCirculationNode,
    RecentAssignmentsState,
    TrainHistoryResponse
} from '~/types/lookup';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';

const DAY_SECONDS = 24 * 60 * 60;
const SHANGHAI_OFFSET_SECONDS = 8 * 60 * 60;
const EMU_HISTORY_LIMIT = 200;

type RequestFetch = <T>(
    request: string,
    options?: {
        query?: Record<string, number | string | undefined>;
    }
) => Promise<T>;

interface RouteNodeSegment {
    key: string;
    routeNodeIndex: number;
    routeDayOffset: number;
    node: InferredCirculationNode;
    primaryTrainCode: string;
}

interface RouteDaySegment {
    routeDayOffset: number;
    nodes: RouteNodeSegment[];
    representativeNode: RouteNodeSegment | null;
}

interface RouteAnchor {
    progress: FutureAssignmentProgress;
    matchedNode: RouteNodeSegment;
    matchedRecordStartAt: number;
}

interface TrainRouteAnchor extends RouteAnchor {
    firstRouteNode: RouteNodeSegment;
    currentRouteDayNumber: number;
    routeDayCount: number;
    historyByDayBucket: Map<number, TrainHistoryRun>;
}

interface TrainCurrentCycleAnchorCandidate {
    firstNodeHistoryDayBucket: number;
    firstNodeHistoryRun: TrainHistoryRun;
    targetNode: RouteNodeSegment;
    predictedStartAt: number | null;
    predictedEndAt: number | null;
}

interface TrainHistoryRun {
    key: string;
    startAt: number;
    endAt: number;
    emuCodes: string[];
    startStation: string;
    endStation: string;
}

interface EmuNodeHistoryHit {
    node: RouteNodeSegment;
    record: HydratedEmuHistoryRecord;
}

type EmuNodeHistoryCandidate = EmuNodeHistoryHit & {
    difference: number;
};

const trainHistoryCache = new Map<string, HydratedTrainHistoryRecord[]>();
const emuHistoryCache = new Map<string, HydratedEmuHistoryRecord[]>();

function normalizeComparableCode(code: string | null | undefined) {
    return typeof code === 'string' ? code.trim().toUpperCase() : '';
}

function normalizeCodeList(codes: string[]) {
    return Array.from(
        new Set(
            codes
                .map((code) => normalizeComparableCode(code))
                .filter((code) => code.length > 0)
        )
    );
}

function getShanghaiDayBucket(timestamp: number) {
    return Math.floor((timestamp + SHANGHAI_OFFSET_SECONDS) / DAY_SECONDS);
}

function getShanghaiDayStartUnixSecondsByBucket(dayBucket: number) {
    return dayBucket * DAY_SECONDS - SHANGHAI_OFFSET_SECONDS;
}

function getShanghaiDayOffsetSeconds(timestamp: number | null) {
    if (timestamp === null || !Number.isFinite(timestamp)) {
        return null;
    }

    const normalizedTimestamp = Math.floor(timestamp);
    const dayBucket = getShanghaiDayBucket(normalizedTimestamp);
    return (
        normalizedTimestamp - getShanghaiDayStartUnixSecondsByBucket(dayBucket)
    );
}

function shiftTimestamp(timestamp: number | null, dayOffset: number) {
    if (timestamp === null || !Number.isFinite(timestamp)) {
        return null;
    }

    return timestamp + dayOffset * DAY_SECONDS;
}

function buildRouteNodeKey(node: InferredCirculationNode, index: number) {
    return (
        normalizeComparableCode(node.internalCode) ||
        normalizeCodeList(node.allCodes).join('/') ||
        `prediction-node:${index}`
    );
}

function getNodePrimaryTrainCode(node: InferredCirculationNode) {
    const publicTrainCodes = normalizeCodeList(node.allCodes);
    if (publicTrainCodes.length > 0) {
        return publicTrainCodes[0] ?? '';
    }

    return normalizeComparableCode(node.internalCode);
}

function getRouteNodeReferenceTimestamp(node: RouteNodeSegment) {
    return node.node.startAt ?? node.node.endAt;
}

function getPredictedReferenceTimestamp(
    predictedStartAt: number | null,
    predictedEndAt: number | null
) {
    return predictedStartAt ?? predictedEndAt;
}

function getRouteDayCount(routeNodes: RouteNodeSegment[]) {
    if (routeNodes.length === 0) {
        return 0;
    }

    return Math.max(...routeNodes.map((node) => node.routeDayOffset), 0) + 1;
}

function buildRouteSegments(circulation: InferredCirculation) {
    const routeNodes: RouteNodeSegment[] = [];
    const routeDays: RouteDaySegment[] = [];
    let currentRouteDayOffset = 0;

    circulation.nodes.forEach((node, index) => {
        if (index > 0) {
            const previousNode = circulation.nodes[index - 1] ?? null;
            const previousReference =
                getShanghaiDayOffsetSeconds(previousNode?.endAt ?? null) ??
                getShanghaiDayOffsetSeconds(previousNode?.startAt ?? null);
            const currentReference =
                getShanghaiDayOffsetSeconds(node.startAt) ??
                getShanghaiDayOffsetSeconds(node.endAt);

            if (
                previousReference !== null &&
                currentReference !== null &&
                currentReference < previousReference
            ) {
                currentRouteDayOffset += 1;
            }
        }

        const routeNode: RouteNodeSegment = {
            key: buildRouteNodeKey(node, index),
            routeNodeIndex: index,
            routeDayOffset: currentRouteDayOffset,
            node,
            primaryTrainCode: getNodePrimaryTrainCode(node)
        };
        routeNodes.push(routeNode);

        const existingRouteDay = routeDays[currentRouteDayOffset];
        if (existingRouteDay) {
            existingRouteDay.nodes.push(routeNode);
            return;
        }

        routeDays[currentRouteDayOffset] = {
            routeDayOffset: currentRouteDayOffset,
            nodes: [routeNode],
            representativeNode: null
        };
    });

    for (const routeDay of routeDays) {
        if (!routeDay) {
            continue;
        }

        routeDay.representativeNode =
            routeDay.nodes
                .filter((node) => node.primaryTrainCode.length > 0)
                .filter((node) => node.node.startAt !== null)
                .sort((left, right) => {
                    const leftStartAt =
                        left.node.startAt ?? Number.MAX_SAFE_INTEGER;
                    const rightStartAt =
                        right.node.startAt ?? Number.MAX_SAFE_INTEGER;

                    if (leftStartAt !== rightStartAt) {
                        return leftStartAt - rightStartAt;
                    }

                    return left.routeNodeIndex - right.routeNodeIndex;
                })[0] ?? null;
    }

    return {
        routeNodes,
        routeDays: routeDays.filter((routeDay): routeDay is RouteDaySegment =>
            Boolean(routeDay)
        )
    };
}

async function fetchTrainHistoryRecords(
    requestFetch: RequestFetch,
    trainCode: string,
    startAt: number,
    endAt: number,
    limit: number
) {
    const normalizedTrainCode = normalizeComparableCode(trainCode);
    if (normalizedTrainCode.length === 0) {
        return [];
    }

    const cacheKey = [
        normalizedTrainCode,
        String(startAt),
        String(endAt),
        String(limit)
    ].join(':');
    const cachedRecords = trainHistoryCache.get(cacheKey);
    if (cachedRecords !== undefined) {
        return cachedRecords;
    }

    const response = await requestFetch<
        TrackerApiResponse<TrainHistoryResponse>
    >('/api/v1/history/train/' + encodeURIComponent(normalizedTrainCode), {
        query: {
            start: startAt,
            end: endAt,
            limit
        }
    });

    if (!response.ok) {
        throw {
            data: response
        };
    }

    const items = await hydrateTrainHistoryRecords(
        requestFetch,
        normalizedTrainCode,
        response.data.items
    );
    trainHistoryCache.set(cacheKey, items);
    return items;
}

async function fetchEmuHistoryRecords(
    requestFetch: RequestFetch,
    emuCode: string,
    startAt: number,
    endAt: number
) {
    const normalizedEmuCode = normalizeComparableCode(emuCode);
    if (normalizedEmuCode.length === 0) {
        return [];
    }

    const cacheKey = [normalizedEmuCode, String(startAt), String(endAt)].join(
        ':'
    );
    const cachedRecords = emuHistoryCache.get(cacheKey);
    if (cachedRecords !== undefined) {
        return cachedRecords;
    }

    const response = await requestFetch<TrackerApiResponse<EmuHistoryResponse>>(
        '/api/v1/history/emu/' + encodeURIComponent(normalizedEmuCode),
        {
            query: {
                start: startAt,
                end: endAt,
                limit: EMU_HISTORY_LIMIT
            }
        }
    );

    if (!response.ok) {
        throw {
            data: response
        };
    }

    const items = await hydrateEmuHistoryRecords(
        requestFetch,
        response.data.items
    );
    emuHistoryCache.set(cacheKey, items);
    return items;
}

function matchEmuRecordToRouteNode(
    record: HydratedEmuHistoryRecord,
    routeNodes: RouteNodeSegment[],
    todayDayBucket: number
): EmuNodeHistoryHit | null {
    if (record.startAt === null) {
        return null;
    }

    const normalizedTrainCode = normalizeComparableCode(record.trainCode);
    if (normalizedTrainCode.length === 0) {
        return null;
    }

    const candidateNodes = routeNodes.filter((node) => {
        if (
            normalizeComparableCode(node.node.internalCode) ===
            normalizedTrainCode
        ) {
            return true;
        }

        return normalizeCodeList(node.node.allCodes).includes(
            normalizedTrainCode
        );
    });

    if (candidateNodes.length === 0) {
        return null;
    }

    const recordDayOffsetFromToday =
        getShanghaiDayBucket(record.startAt) - todayDayBucket;

    const matchedCandidates: EmuNodeHistoryCandidate[] = [];

    for (const node of candidateNodes) {
        const templateStartAt = node.node.startAt ?? node.node.endAt;
        if (templateStartAt === null) {
            continue;
        }

        const predictedStartAt = shiftTimestamp(
            templateStartAt,
            recordDayOffsetFromToday
        );
        if (predictedStartAt === null) {
            continue;
        }

        matchedCandidates.push({
            node,
            record,
            difference: Math.abs(predictedStartAt - record.startAt)
        });
    }

    const bestCandidate =
        matchedCandidates.sort((left, right) => {
            if (left.difference !== right.difference) {
                return left.difference - right.difference;
            }

            return right.node.routeNodeIndex - left.node.routeNodeIndex;
        })[0] ?? null;

    if (!bestCandidate) {
        return null;
    }

    return {
        node: bestCandidate.node,
        record: bestCandidate.record
    };
}

function buildPredictionNode(
    node: RouteNodeSegment,
    predictedStartAt: number | null,
    predictedEndAt: number | null,
    nowUnixSeconds: number,
    matchedBy: FutureAssignmentPredictionMatchSource
) {
    const predictedReferenceTimestamp = getPredictedReferenceTimestamp(
        predictedStartAt,
        predictedEndAt
    );
    if (
        predictedReferenceTimestamp === null ||
        predictedReferenceTimestamp <= nowUnixSeconds
    ) {
        return null;
    }

    return {
        key: node.key,
        allCodes: [...node.node.allCodes],
        startStation: node.node.startStation,
        endStation: node.node.endStation,
        predictedStartAt,
        predictedEndAt,
        routeDayOffset: node.routeDayOffset,
        routeNodeIndex: node.routeNodeIndex,
        dayOffsetFromToday:
            getShanghaiDayBucket(predictedReferenceTimestamp) -
            getShanghaiDayBucket(nowUnixSeconds),
        matchedBy
    } satisfies FutureAssignmentPredictionNode;
}

function getAlignedTemplateDayShift(anchor: RouteAnchor) {
    const matchedNodeReferenceTimestamp = getRouteNodeReferenceTimestamp(
        anchor.matchedNode
    );
    if (matchedNodeReferenceTimestamp === null) {
        return null;
    }

    return (
        getShanghaiDayBucket(anchor.matchedRecordStartAt) -
        getShanghaiDayBucket(matchedNodeReferenceTimestamp)
    );
}

function buildEmuPredictedNodes(
    routeNodes: RouteNodeSegment[],
    anchor: RouteAnchor,
    nowUnixSeconds: number
) {
    const templateDayShift = getAlignedTemplateDayShift(anchor);
    if (templateDayShift === null) {
        return [];
    }

    return routeNodes
        .filter(
            (node) => node.routeNodeIndex > anchor.progress.currentNodeIndex
        )
        .map((node) => {
            const templateRouteDayOffset =
                node.routeDayOffset - anchor.progress.currentRouteDayOffset;
            const predictedStartAt = shiftTimestamp(
                node.node.startAt,
                templateDayShift + templateRouteDayOffset
            );
            const predictedEndAt = shiftTimestamp(
                node.node.endAt,
                templateDayShift + templateRouteDayOffset
            );
            return buildPredictionNode(
                node,
                predictedStartAt,
                predictedEndAt,
                nowUnixSeconds,
                anchor.progress.matchedBy
            );
        })
        .filter(
            (node): node is FutureAssignmentPredictionNode => node !== null
        );
}

function findMatchingRouteNodes(
    routeNodes: RouteNodeSegment[],
    codes: string[]
) {
    const normalizedCodes = normalizeCodeList(codes);
    if (normalizedCodes.length === 0) {
        return [];
    }

    return routeNodes.filter((routeNode) => {
        const nodeCodes = normalizeCodeList([
            ...(routeNode.node.internalCode
                ? [routeNode.node.internalCode]
                : []),
            ...routeNode.node.allCodes
        ]);

        return normalizedCodes.some((code) => nodeCodes.includes(code));
    });
}

function compareRouteNodePosition(
    left: RouteNodeSegment,
    right: RouteNodeSegment
) {
    if (left.routeDayOffset !== right.routeDayOffset) {
        return left.routeDayOffset - right.routeDayOffset;
    }

    return left.routeNodeIndex - right.routeNodeIndex;
}

function isTrainSource(sourceType: FutureAssignmentPredictionSourceType) {
    return sourceType === 'train';
}

function getTrainAnchorHistoryQuery(
    routeNodes: RouteNodeSegment[]
): { firstRouteNode: RouteNodeSegment; queryCode: string } | null {
    const firstRouteNode = routeNodes[0] ?? null;
    if (!firstRouteNode) {
        return null;
    }

    const publicTrainCode = normalizeComparableCode(
        firstRouteNode.node.allCodes[0] ?? ''
    );
    const fallbackInternalCode = normalizeComparableCode(
        firstRouteNode.node.internalCode
    );
    const queryCode = publicTrainCode || fallbackInternalCode;

    if (queryCode.length === 0) {
        return null;
    }

    return {
        firstRouteNode,
        queryCode
    };
}

function buildTrainHistoryRuns(records: HydratedTrainHistoryRecord[]) {
    const runs = new Map<string, TrainHistoryRun>();

    for (const record of records) {
        if (record.startAt === null || record.endAt === null) {
            continue;
        }

        const runKey = `${record.startAt}:${record.endAt}`;
        const normalizedEmuCode = normalizeComparableCode(record.emuCode);
        const existingRun = runs.get(runKey);

        if (existingRun) {
            if (
                normalizedEmuCode.length > 0 &&
                !existingRun.emuCodes.includes(normalizedEmuCode)
            ) {
                existingRun.emuCodes.push(normalizedEmuCode);
            }

            if (
                existingRun.startStation.trim().length === 0 &&
                (record.startStation ?? '').trim().length > 0
            ) {
                existingRun.startStation = record.startStation ?? '';
            }

            if (
                existingRun.endStation.trim().length === 0 &&
                (record.endStation ?? '').trim().length > 0
            ) {
                existingRun.endStation = record.endStation ?? '';
            }

            continue;
        }

        runs.set(runKey, {
            key: `${runKey}:${record.id}`,
            startAt: record.startAt,
            endAt: record.endAt,
            emuCodes: normalizedEmuCode.length > 0 ? [normalizedEmuCode] : [],
            startStation: record.startStation ?? '',
            endStation: record.endStation ?? ''
        });
    }

    return [...runs.values()];
}

function buildHistoryByDayBucket(runs: TrainHistoryRun[]) {
    const historyByDayBucket = new Map<number, TrainHistoryRun>();

    for (const run of runs) {
        const dayBucket = getShanghaiDayBucket(run.startAt);
        if (!historyByDayBucket.has(dayBucket)) {
            historyByDayBucket.set(dayBucket, run);
        }
    }

    return historyByDayBucket;
}

function buildTrainAlignedTimestamps(
    firstRouteNode: RouteNodeSegment,
    node: RouteNodeSegment,
    firstNodeHistoryDayBucket: number
) {
    const firstRouteNodeReferenceTimestamp =
        getRouteNodeReferenceTimestamp(firstRouteNode);
    if (firstRouteNodeReferenceTimestamp === null) {
        return {
            predictedStartAt: null,
            predictedEndAt: null
        };
    }

    const firstRouteNodeTemplateDayBucket = getShanghaiDayBucket(
        firstRouteNodeReferenceTimestamp
    );
    const alignedDayOffset =
        firstNodeHistoryDayBucket -
        firstRouteNodeTemplateDayBucket +
        (node.routeDayOffset - firstRouteNode.routeDayOffset);

    return {
        predictedStartAt: shiftTimestamp(node.node.startAt, alignedDayOffset),
        predictedEndAt: shiftTimestamp(node.node.endAt, alignedDayOffset)
    };
}

function findTrainCurrentCycleAnchorCandidate(
    firstRouteNode: RouteNodeSegment,
    targetNodes: RouteNodeSegment[],
    historyByDayBucket: Map<number, TrainHistoryRun>,
    todayDayBucket: number
) {
    const candidates = [...historyByDayBucket.entries()]
        .flatMap(([firstNodeHistoryDayBucket, firstNodeHistoryRun]) =>
            targetNodes.map((targetNode) => {
                const { predictedStartAt, predictedEndAt } =
                    buildTrainAlignedTimestamps(
                        firstRouteNode,
                        targetNode,
                        firstNodeHistoryDayBucket
                    );
                const predictedReferenceTimestamp =
                    getPredictedReferenceTimestamp(
                        predictedStartAt,
                        predictedEndAt
                    );

                if (predictedReferenceTimestamp === null) {
                    return null;
                }

                if (
                    getShanghaiDayBucket(predictedReferenceTimestamp) !==
                    todayDayBucket
                ) {
                    return null;
                }

                return {
                    firstNodeHistoryDayBucket,
                    firstNodeHistoryRun,
                    targetNode,
                    predictedStartAt,
                    predictedEndAt
                } satisfies TrainCurrentCycleAnchorCandidate;
            })
        )
        .filter(
            (candidate): candidate is TrainCurrentCycleAnchorCandidate =>
                candidate !== null
        )
        .sort((left, right) => {
            if (
                left.firstNodeHistoryDayBucket !==
                right.firstNodeHistoryDayBucket
            ) {
                return (
                    right.firstNodeHistoryDayBucket -
                    left.firstNodeHistoryDayBucket
                );
            }

            const predictedTimeCompare = comparePredictedTime(
                {
                    key: '',
                    emuCodes: [],
                    predictedStartAt: left.predictedStartAt,
                    predictedEndAt: left.predictedEndAt,
                    dayOffsetFromToday: 0,
                    routeDayOffset: left.targetNode.routeDayOffset,
                    startStation: '',
                    endStation: '',
                    matchedBy: 'train-history'
                },
                {
                    key: '',
                    emuCodes: [],
                    predictedStartAt: right.predictedStartAt,
                    predictedEndAt: right.predictedEndAt,
                    dayOffsetFromToday: 0,
                    routeDayOffset: right.targetNode.routeDayOffset,
                    startStation: '',
                    endStation: '',
                    matchedBy: 'train-history'
                }
            );

            if (predictedTimeCompare !== 0) {
                return predictedTimeCompare;
            }

            return compareRouteNodePosition(left.targetNode, right.targetNode);
        });

    return candidates[0] ?? null;
}

function comparePredictedTime(
    left: FutureAssignmentPredictedEmuItem,
    right: FutureAssignmentPredictedEmuItem
) {
    const leftReference =
        getPredictedReferenceTimestamp(
            left.predictedStartAt,
            left.predictedEndAt
        ) ?? Number.MAX_SAFE_INTEGER;
    const rightReference =
        getPredictedReferenceTimestamp(
            right.predictedStartAt,
            right.predictedEndAt
        ) ?? Number.MAX_SAFE_INTEGER;

    if (leftReference !== rightReference) {
        return leftReference - rightReference;
    }

    return left.routeDayOffset - right.routeDayOffset;
}

function buildTrainPredictedEmuItem(
    node: RouteNodeSegment,
    historyRun: TrainHistoryRun,
    predictedStartAt: number | null,
    predictedEndAt: number | null,
    todayDayBucket: number
): FutureAssignmentPredictedEmuItem | null {
    const predictedReferenceTimestamp = getPredictedReferenceTimestamp(
        predictedStartAt,
        predictedEndAt
    );
    const normalizedEmuCodes = normalizeCodeList(historyRun.emuCodes);

    if (
        predictedReferenceTimestamp === null ||
        normalizedEmuCodes.length === 0
    ) {
        return null;
    }

    return {
        key: `${node.key}:${historyRun.key}:${predictedReferenceTimestamp}`,
        emuCodes: normalizedEmuCodes,
        predictedStartAt,
        predictedEndAt,
        dayOffsetFromToday:
            getShanghaiDayBucket(predictedReferenceTimestamp) - todayDayBucket,
        routeDayOffset: node.routeDayOffset,
        startStation: node.node.startStation,
        endStation: node.node.endStation,
        matchedBy: 'train-history'
    } satisfies FutureAssignmentPredictedEmuItem;
}

function buildTrainPredictedEmus(
    targetNodes: RouteNodeSegment[],
    anchor: TrainRouteAnchor,
    nowUnixSeconds: number
): FutureAssignmentPredictedEmuItem[] {
    if (targetNodes.length === 0) {
        return [];
    }

    const todayDayBucket = getShanghaiDayBucket(nowUnixSeconds);
    const windowEndDayBucket =
        todayDayBucket + anchor.currentRouteDayNumber - 1;

    return [...anchor.historyByDayBucket.entries()]
        .flatMap(([anchorDayBucket, historyRun]) =>
            targetNodes.map((node) => {
                const { predictedStartAt, predictedEndAt } =
                    buildTrainAlignedTimestamps(
                        anchor.firstRouteNode,
                        node,
                        anchorDayBucket
                    );
                const predictedReferenceTimestamp =
                    getPredictedReferenceTimestamp(
                        predictedStartAt,
                        predictedEndAt
                    );

                if (predictedReferenceTimestamp === null) {
                    return null;
                }

                const predictedDayBucket = getShanghaiDayBucket(
                    predictedReferenceTimestamp
                );

                if (
                    predictedDayBucket < todayDayBucket ||
                    predictedDayBucket > windowEndDayBucket
                ) {
                    return null;
                }

                if (
                    predictedDayBucket === todayDayBucket &&
                    predictedStartAt !== null &&
                    predictedStartAt <= nowUnixSeconds
                ) {
                    return null;
                }

                return buildTrainPredictedEmuItem(
                    node,
                    historyRun,
                    predictedStartAt,
                    predictedEndAt,
                    todayDayBucket
                );
            })
        )
        .filter(
            (item): item is FutureAssignmentPredictedEmuItem => item !== null
        )
        .sort((left, right) => comparePredictedTime(left, right));
}

async function resolveTrainAnchor(
    requestFetch: RequestFetch,
    routeNodes: RouteNodeSegment[],
    targetNodes: RouteNodeSegment[],
    nowUnixSeconds: number
) {
    const trainAnchorHistoryQuery = getTrainAnchorHistoryQuery(routeNodes);
    if (!trainAnchorHistoryQuery) {
        return null;
    }

    const routeDayCount = getRouteDayCount(routeNodes);
    if (routeDayCount <= 0) {
        return null;
    }
    if (targetNodes.length === 0) {
        return null;
    }

    const todayDayBucket = getShanghaiDayBucket(nowUnixSeconds);
    const todayStartAt = getShanghaiDayStartUnixSecondsByBucket(todayDayBucket);
    const startAt = todayStartAt - (routeDayCount - 1) * DAY_SECONDS;
    const endAt = todayStartAt + DAY_SECONDS - 1;
    const historyRecords = await fetchTrainHistoryRecords(
        requestFetch,
        trainAnchorHistoryQuery.queryCode,
        startAt,
        endAt,
        Math.max(routeDayCount * 6, routeDayCount)
    );
    const historyByDayBucket = buildHistoryByDayBucket(
        buildTrainHistoryRuns(historyRecords)
    );
    const orderedHistoryDayBuckets = [...historyByDayBucket.keys()].sort(
        (left, right) => right - left
    );
    const latestHistoryDayBucket = orderedHistoryDayBuckets[0] ?? null;

    if (latestHistoryDayBucket === null) {
        return null;
    }

    if (!historyByDayBucket.has(latestHistoryDayBucket)) {
        return null;
    }

    const currentCycleAnchorCandidate = findTrainCurrentCycleAnchorCandidate(
        trainAnchorHistoryQuery.firstRouteNode,
        targetNodes,
        historyByDayBucket,
        todayDayBucket
    );

    if (!currentCycleAnchorCandidate) {
        return null;
    }

    const currentRouteDayNumber =
        currentCycleAnchorCandidate.targetNode.routeDayOffset + 1;
    const actualDayOffsetFromToday =
        currentCycleAnchorCandidate.firstNodeHistoryDayBucket - todayDayBucket;

    return {
        progress: {
            currentRouteDayOffset:
                trainAnchorHistoryQuery.firstRouteNode.routeDayOffset,
            currentNodeIndex:
                trainAnchorHistoryQuery.firstRouteNode.routeNodeIndex,
            resolvedBy:
                actualDayOffsetFromToday === 0
                    ? 'today-history'
                    : actualDayOffsetFromToday === -1
                      ? 'yesterday-rollover'
                      : 'historical-route-anchor',
            matchedBy: 'train-history',
            actualDayOffsetFromToday
        },
        matchedNode: trainAnchorHistoryQuery.firstRouteNode,
        matchedRecordStartAt:
            currentCycleAnchorCandidate.firstNodeHistoryRun.startAt,
        firstRouteNode: trainAnchorHistoryQuery.firstRouteNode,
        currentRouteDayNumber,
        routeDayCount,
        historyByDayBucket
    } satisfies TrainRouteAnchor;
}

async function resolveEmuAnchor(
    requestFetch: RequestFetch,
    routeNodes: RouteNodeSegment[],
    emuCode: string,
    startAt: number,
    endAt: number,
    todayDayBucket: number
) {
    const historyRecords = await fetchEmuHistoryRecords(
        requestFetch,
        emuCode,
        startAt,
        endAt
    );

    const matchedHistoryHits = historyRecords
        .map((record) =>
            matchEmuRecordToRouteNode(record, routeNodes, todayDayBucket)
        )
        .filter((hit): hit is EmuNodeHistoryHit => hit !== null)
        .sort((left, right) => {
            const leftStartAt = left.record.startAt ?? Number.MIN_SAFE_INTEGER;
            const rightStartAt =
                right.record.startAt ?? Number.MIN_SAFE_INTEGER;

            if (leftStartAt !== rightStartAt) {
                return rightStartAt - leftStartAt;
            }

            return right.node.routeNodeIndex - left.node.routeNodeIndex;
        });

    const latestMatchedHit = matchedHistoryHits[0] ?? null;
    if (!latestMatchedHit) {
        return null;
    }

    const matchedRecordStartAt = latestMatchedHit.record.startAt ?? 0;
    const actualDayOffsetFromToday =
        getShanghaiDayBucket(matchedRecordStartAt) - todayDayBucket;

    return {
        progress: {
            currentRouteDayOffset: latestMatchedHit.node.routeDayOffset,
            currentNodeIndex: latestMatchedHit.node.routeNodeIndex,
            resolvedBy:
                actualDayOffsetFromToday < 0
                    ? 'yesterday-rollover'
                    : 'today-history',
            matchedBy: 'emu-history',
            actualDayOffsetFromToday
        },
        matchedNode: latestMatchedHit.node,
        matchedRecordStartAt
    } satisfies RouteAnchor;
}

function buildWindow(nowUnixSeconds: number) {
    const todayDayBucket = getShanghaiDayBucket(nowUnixSeconds);
    const todayStartAt = getShanghaiDayStartUnixSecondsByBucket(todayDayBucket);

    return {
        todayDayBucket,
        startAt: todayStartAt - DAY_SECONDS,
        endAt: todayStartAt + DAY_SECONDS - 1
    };
}

export default function useFutureAssignmentPrediction(
    sourceTypeSource: MaybeRefOrGetter<FutureAssignmentPredictionSourceType>,
    sourceCodeSource: MaybeRefOrGetter<string>,
    anchorTrainCodeSource: MaybeRefOrGetter<string>,
    activeSource: MaybeRefOrGetter<boolean>
) {
    const requestFetch = import.meta.server ? useRequestFetch() : $fetch;
    const localState = ref<RecentAssignmentsState>('idle');
    const predictionState = ref<FutureAssignmentPredictionStatus>('idle');
    const predictedNodes = ref<FutureAssignmentPredictionNode[]>([]);
    const predictedEmus = ref<FutureAssignmentPredictedEmuItem[]>([]);
    const displayAnchor = ref<FutureAssignmentDisplayAnchor | null>(null);
    const errorMessage = ref('');
    let requestToken = 0;

    const normalizedSourceCode = computed(() =>
        normalizeComparableCode(String(toValue(sourceCodeSource) ?? ''))
    );
    const normalizedAnchorTrainCode = computed(() =>
        normalizeComparableCode(String(toValue(anchorTrainCodeSource) ?? ''))
    );
    const normalizedSourceType = computed(() => toValue(sourceTypeSource));
    const {
        state: timetableState,
        timetable,
        errorMessage: timetableErrorMessage
    } = useCurrentTrainTimetable(normalizedAnchorTrainCode, activeSource);

    watch(
        () =>
            [
                toValue(activeSource),
                normalizedSourceType.value,
                normalizedSourceCode.value,
                normalizedAnchorTrainCode.value,
                timetableState.value,
                timetable.value?.inferredCirculation?.routeId ?? ''
            ] as const,
        async ([
            isActive,
            sourceType,
            sourceCode,
            anchorTrainCode,
            nextTimetableState
        ]) => {
            requestToken += 1;
            const activeToken = requestToken;

            predictedNodes.value = [];
            predictedEmus.value = [];
            displayAnchor.value = null;
            predictionState.value = 'idle';
            errorMessage.value = '';

            if (!isActive) {
                localState.value = 'idle';
                return;
            }

            if (anchorTrainCode.length === 0 || sourceCode.length === 0) {
                localState.value = 'empty';
                return;
            }

            if (
                nextTimetableState === 'idle' ||
                nextTimetableState === 'loading'
            ) {
                localState.value = 'loading';
                return;
            }

            if (nextTimetableState === 'error') {
                localState.value = 'error';
                errorMessage.value = timetableErrorMessage.value;
                return;
            }

            if (nextTimetableState === 'empty' || !timetable.value) {
                localState.value = 'empty';
                return;
            }

            const circulation = timetable.value.inferredCirculation;
            if (!circulation || circulation.nodes.length === 0) {
                localState.value = 'success';
                predictionState.value = 'no_circulation';
                return;
            }

            localState.value = 'loading';

            try {
                const nowUnixSeconds = Math.floor(Date.now() / 1000);
                const window = buildWindow(nowUnixSeconds);
                const { routeNodes } = buildRouteSegments(circulation);
                const targetNodes = isTrainSource(sourceType)
                    ? findMatchingRouteNodes(routeNodes, [
                          sourceCode,
                          anchorTrainCode,
                          timetable.value.internalCode,
                          timetable.value.trainCode,
                          ...timetable.value.allCodes
                      ])
                    : [];

                if (sourceType === 'emu') {
                    const anchor = await resolveEmuAnchor(
                        requestFetch,
                        routeNodes,
                        sourceCode,
                        window.startAt,
                        window.endAt,
                        window.todayDayBucket
                    );

                    if (activeToken !== requestToken) {
                        return;
                    }

                    localState.value = 'success';

                    if (!anchor) {
                        predictionState.value = 'unresolved';
                        return;
                    }

                    displayAnchor.value = {
                        mode: 'current-progress',
                        routeDayOffset: anchor.progress.currentRouteDayOffset,
                        routeNodeIndex: anchor.progress.currentNodeIndex,
                        resolvedBy: anchor.progress.resolvedBy,
                        matchedBy: anchor.progress.matchedBy,
                        actualDayOffsetFromToday:
                            anchor.progress.actualDayOffsetFromToday
                    };
                    predictedNodes.value = buildEmuPredictedNodes(
                        routeNodes,
                        anchor,
                        nowUnixSeconds
                    );
                    predictionState.value =
                        predictedNodes.value.length > 0 ? 'ready' : 'no_future';
                    return;
                }

                const anchor = await resolveTrainAnchor(
                    requestFetch,
                    routeNodes,
                    targetNodes,
                    nowUnixSeconds
                );

                if (activeToken !== requestToken) {
                    return;
                }

                localState.value = 'success';

                if (!anchor) {
                    predictionState.value = 'unresolved';
                    return;
                }

                displayAnchor.value = {
                    mode: 'train-alignment',
                    routeDayOffset: anchor.progress.currentRouteDayOffset,
                    routeNodeIndex: anchor.progress.currentNodeIndex,
                    resolvedBy: anchor.progress.resolvedBy,
                    matchedBy: anchor.progress.matchedBy,
                    actualDayOffsetFromToday:
                        anchor.progress.actualDayOffsetFromToday
                };
                predictedEmus.value = buildTrainPredictedEmus(
                    targetNodes,
                    anchor,
                    nowUnixSeconds
                );
                predictionState.value =
                    predictedEmus.value.length > 0 ? 'ready' : 'no_future';
            } catch (error) {
                if (activeToken !== requestToken) {
                    return;
                }

                localState.value = 'error';
                errorMessage.value = getApiErrorMessage(
                    error,
                    '未来担当预测加载失败，请稍后重试。'
                );
            }
        },
        {
            immediate: true
        }
    );

    const displayAnchorNode = computed(() => {
        if (!timetable.value?.inferredCirculation || !displayAnchor.value) {
            return null;
        }

        return (
            timetable.value.inferredCirculation.nodes[
                displayAnchor.value.routeNodeIndex
            ] ?? null
        );
    });

    return {
        state: localState,
        timetable,
        errorMessage,
        predictionState,
        predictedNodes,
        predictedEmus,
        displayAnchor,
        displayAnchorNode,
        normalizedSourceCode,
        normalizedAnchorTrainCode
    };
}
