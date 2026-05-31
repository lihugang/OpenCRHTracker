import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import {
    listDailyRecordsPaged,
    type DailyEmuRouteRow
} from '~/server/services/emuRoutesStore';
import {
    getTodayScheduleProbeGroups,
    getTodayScheduleTimetableByTrainCode,
    type TodayScheduleTimetable
} from '~/server/services/todayScheduleCache';
import {
    loadScheduleCirculationEntry,
    loadScheduleCirculationMap
} from '~/server/utils/12306/scheduleProbe/stateStore';
import type { ScheduleCirculationEntry } from '~/server/utils/12306/scheduleProbe/types';
import { getRelativeDateString } from '~/server/utils/date/getCurrentDateString';
import {
    expandSequentialShanghaiDayOffsets,
    getShanghaiDayBucket,
    getShanghaiDayStartUnixSeconds
} from '~/server/utils/date/shanghaiDateTime';
import murmurHash32 from '~/server/utils/hash/murmurHash32';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import type {
    InferredTrainCirculationMetadata,
    InferredTrainCirculationReference,
    OfficialCirculationValidationState,
    TrainCirculation,
    TrainCirculationMetadata,
    TrainCirculationNode
} from '~/types/lookup';

interface CursorPoint {
    serviceDate: string;
    id: number;
}

interface RunBucket {
    runKey: string;
    startAt: number;
    endAt: number;
    nodeIds: Set<number>;
}

interface EmuScanState {
    pendingRun: RunBucket;
    currentRun: RunBucket | null;
    nextRun: RunBucket | null;
    gapPending: boolean;
}

interface EdgeStat {
    nodeId: number;
    count: number;
    weight: number;
}

interface CirculationWindowStats {
    rowsScanned: number;
    nodeCount: number;
    edgeCount: number;
    circulationCount: number;
    rebuiltAt: number;
}

interface TrainCirculationIndexCache {
    currentDate: string;
    windowDays: number;
    windowStart: number;
    windowEnd: number;
    threshold: number;
    inferredLookupByTrainCode: Map<string, InternalInferredCirculation[]>;
    validatedOfficialByInternalCode: Map<string, TrainCirculation>;
    stats: CirculationWindowStats;
}

interface InternalCirculationBuildResult {
    lookupByTrainCode: Map<string, InternalInferredCirculation[]>;
    lookupByInternalCode: Map<string, InternalInferredCirculation[]>;
    circulations: InternalInferredCirculation[];
    rowsScanned: number;
    nodeCount: number;
    edgeCount: number;
    circulationCount: number;
}

interface OfficialCirculationSegmentMatch {
    type: 'exact' | 'split';
    officialStartIndex: number;
    officialEndIndex: number;
    matchedNodeCount: number;
}

interface OfficialCirculationCandidateEvaluation {
    circulation: InternalInferredCirculation;
    publicReference: InferredTrainCirculationReference | null;
    match: OfficialCirculationSegmentMatch | null;
    matchedNodeCount: number;
}

interface CirculationNodeMeta {
    nodeKey: string;
    trainCode: string;
    internalCode: string | null;
    allCodes: string[];
}

interface InternalInferredCirculationNode {
    trainCode: string;
    internalCode: string | null;
    allCodes: string[];
    incomingTrainCodes: string[] | null;
    incomingWeight: number | null;
    incomingSupportCount: number | null;
    outgoingTrainCodes: string[] | null;
    outgoingWeight: number | null;
    outgoingSupportCount: number | null;
}

interface InternalInferredCirculation {
    routeId: string;
    trainCodes: string[];
    windowStart: number;
    windowEnd: number;
    threshold: number;
    lowestLinkWeight: number | null;
    lowestLinkSupportCount: number | null;
    containsLoopBreak: boolean;
    nodes: InternalInferredCirculationNode[];
}

const logger = getLogger('train-circulation-index');
const DAY_SECONDS = 24 * 60 * 60;

let cached: TrainCirculationIndexCache | null = null;

function getWindowConfig() {
    return useConfig().task.circulation;
}

function getWindowRange(currentDate: string, windowDays: number) {
    const todayStartAt = getShanghaiDayStartUnixSeconds(currentDate);
    const startAt = todayStartAt - (windowDays - 1) * 24 * 60 * 60;
    const endAt = todayStartAt + 24 * 60 * 60 - 1;
    return {
        startAt,
        endAt
    };
}

function uniqueNormalizedCodes(codes: string[]) {
    const normalizedCodes = new Set<string>();

    for (const code of codes) {
        const normalized = normalizeCode(code);
        if (normalized.length > 0) {
            normalizedCodes.add(normalized);
        }
    }

    return [...normalizedCodes].sort((left, right) =>
        left.localeCompare(right)
    );
}

function buildFallbackNodeMeta(trainCode: string): CirculationNodeMeta {
    return {
        nodeKey: `fallback:${trainCode}`,
        trainCode,
        internalCode: null,
        allCodes: [trainCode]
    };
}

function loadOfficialCirculationInternalCodes() {
    const scheduleFilePath = useConfig().data.assets.schedule.file;
    return new Set(
        Object.keys(loadScheduleCirculationMap(scheduleFilePath))
            .map((internalCode) => normalizeCode(internalCode))
            .filter((internalCode) => internalCode.length > 0)
    );
}

function buildTrainCodeNodeMetaMap(
    officialInternalCodes: ReadonlySet<string>,
    excludeOfficialInternalCodes: boolean
) {
    const nodeMetaByTrainCode = new Map<string, CirculationNodeMeta>();
    const excludedTrainCodes = new Set<string>();

    for (const group of getTodayScheduleProbeGroups().values()) {
        const allCodes = uniqueNormalizedCodes(group.allCodes);
        if (allCodes.length === 0) {
            continue;
        }

        const normalizedInternalCode = normalizeCode(group.trainInternalCode);
        if (
            excludeOfficialInternalCodes &&
            officialInternalCodes.has(normalizedInternalCode)
        ) {
            for (const trainCode of allCodes) {
                excludedTrainCodes.add(trainCode);
            }
            continue;
        }

        if (normalizedInternalCode.length === 0) {
            for (const trainCode of allCodes) {
                nodeMetaByTrainCode.set(
                    trainCode,
                    buildFallbackNodeMeta(trainCode)
                );
            }
            continue;
        }

        const nodeMeta: CirculationNodeMeta = {
            nodeKey: `internal:${normalizedInternalCode}`,
            trainCode: allCodes[0]!,
            internalCode: normalizedInternalCode,
            allCodes
        };

        for (const trainCode of allCodes) {
            nodeMetaByTrainCode.set(trainCode, nodeMeta);
        }
    }

    return {
        resolve(trainCode: string) {
            if (excludedTrainCodes.has(trainCode)) {
                return null;
            }
            return (
                nodeMetaByTrainCode.get(trainCode) ??
                buildFallbackNodeMeta(trainCode)
            );
        }
    };
}

function buildNodeIdStore() {
    const nodeIdsByNodeKey = new Map<string, number>();
    const nodeMetasByNodeId: CirculationNodeMeta[] = [];

    return {
        nodeIdsByNodeKey,
        nodeMetasByNodeId,
        getNodeId(nodeMeta: CirculationNodeMeta) {
            const existing = nodeIdsByNodeKey.get(nodeMeta.nodeKey);
            if (existing !== undefined) {
                return existing;
            }

            const nextNodeId = nodeMetasByNodeId.length;
            nodeIdsByNodeKey.set(nodeMeta.nodeKey, nextNodeId);
            nodeMetasByNodeId.push(nodeMeta);
            return nextNodeId;
        }
    };
}

function buildRunKey(row: DailyEmuRouteRow) {
    return `${row.start_at}:${row.end_at}`;
}

function createRunBucket(row: DailyEmuRouteRow, nodeId: number): RunBucket {
    return {
        runKey: buildRunKey(row),
        startAt: row.start_at,
        endAt: row.end_at,
        nodeIds: new Set<number>([nodeId])
    };
}

function createEmptyRunBucket(row: DailyEmuRouteRow): RunBucket {
    return {
        runKey: buildRunKey(row),
        startAt: row.start_at,
        endAt: row.end_at,
        nodeIds: new Set<number>()
    };
}

function addEdgeCount(
    sourceNodeId: number,
    targetNodeId: number,
    store: Map<number, Map<number, number>>
) {
    const existingTargets = store.get(sourceNodeId);
    if (existingTargets) {
        existingTargets.set(
            targetNodeId,
            (existingTargets.get(targetNodeId) ?? 0) + 1
        );
        return;
    }

    store.set(sourceNodeId, new Map<number, number>([[targetNodeId, 1]]));
}

function finalizeRunTransition(
    olderRun: RunBucket,
    newerRun: RunBucket,
    outgoingCounts: Map<number, Map<number, number>>,
    incomingCounts: Map<number, Map<number, number>>
) {
    const dayGap =
        getShanghaiDayBucket(newerRun.startAt) -
        getShanghaiDayBucket(olderRun.startAt);
    if (dayGap > 1) {
        return;
    }

    for (const sourceNodeId of olderRun.nodeIds) {
        for (const targetNodeId of newerRun.nodeIds) {
            addEdgeCount(sourceNodeId, targetNodeId, outgoingCounts);
            addEdgeCount(targetNodeId, sourceNodeId, incomingCounts);
        }
    }
}

function normalizeEdgeCounts(
    countsByNodeId: Map<number, Map<number, number>>,
    nodeMetasByNodeId: CirculationNodeMeta[]
) {
    const normalized = new Map<number, EdgeStat[]>();

    for (const [sourceNodeId, targets] of countsByNodeId.entries()) {
        const total = Array.from(targets.values()).reduce(
            (sum, count) => sum + count,
            0
        );
        const items = Array.from(targets.entries())
            .map(([nodeId, count]) => ({
                nodeId,
                count,
                weight: count / total
            }))
            .sort((left, right) => {
                if (left.weight !== right.weight) {
                    return right.weight - left.weight;
                }
                if (left.count !== right.count) {
                    return right.count - left.count;
                }
                return nodeMetasByNodeId[left.nodeId]!.trainCode.localeCompare(
                    nodeMetasByNodeId[right.nodeId]!.trainCode
                );
            });
        normalized.set(sourceNodeId, items);
    }

    return normalized;
}

function getTopEdge(
    edgesByNodeId: Map<number, EdgeStat[]>,
    nodeId: number
): EdgeStat | null {
    return edgesByNodeId.get(nodeId)?.[0] ?? null;
}

function getEdgeStat(
    edgesByNodeId: Map<number, EdgeStat[]>,
    fromNodeId: number,
    toNodeId: number
): EdgeStat | null {
    const items = edgesByNodeId.get(fromNodeId);
    if (!items) {
        return null;
    }

    return items.find((item) => item.nodeId === toNodeId) ?? null;
}

function buildRouteId(nodeKeys: string[]) {
    const signature = nodeKeys.join('>');
    const hash = murmurHash32(signature).toString(16).padStart(8, '0');
    return `circulation_${hash}`;
}

function buildRouteTrainCodes(
    routeNodeIds: number[],
    nodeMetasByNodeId: CirculationNodeMeta[]
) {
    const trainCodes = new Set<string>();

    for (const nodeId of routeNodeIds) {
        for (const trainCode of nodeMetasByNodeId[nodeId]!.allCodes) {
            trainCodes.add(trainCode);
        }
    }

    return [...trainCodes];
}

function buildCirculation(
    routeNodeIds: number[],
    nodeMetasByNodeId: CirculationNodeMeta[],
    outgoingEdgesByNodeId: Map<number, EdgeStat[]>,
    windowStart: number,
    windowEnd: number,
    threshold: number,
    containsLoopBreak: boolean
): InternalInferredCirculation {
    const nodeKeys = routeNodeIds.map(
        (nodeId) => nodeMetasByNodeId[nodeId]!.nodeKey
    );
    const trainCodes = buildRouteTrainCodes(routeNodeIds, nodeMetasByNodeId);
    const nodes: InternalInferredCirculationNode[] = [];
    let lowestLinkWeight: number | null = null;
    let lowestLinkSupportCount: number | null = null;

    for (const [index, nodeId] of routeNodeIds.entries()) {
        const previousNodeId = index > 0 ? routeNodeIds[index - 1]! : null;
        const nextNodeId =
            index + 1 < routeNodeIds.length ? routeNodeIds[index + 1]! : null;
        const incomingEdge =
            previousNodeId === null
                ? null
                : getEdgeStat(outgoingEdgesByNodeId, previousNodeId, nodeId);
        const outgoingEdge =
            nextNodeId === null
                ? null
                : getEdgeStat(outgoingEdgesByNodeId, nodeId, nextNodeId);

        for (const edge of [incomingEdge, outgoingEdge]) {
            if (!edge) {
                continue;
            }

            lowestLinkWeight =
                lowestLinkWeight === null
                    ? edge.weight
                    : Math.min(lowestLinkWeight, edge.weight);
            lowestLinkSupportCount =
                lowestLinkSupportCount === null
                    ? edge.count
                    : Math.min(lowestLinkSupportCount, edge.count);
        }

        const currentNode = nodeMetasByNodeId[nodeId]!;
        const previousNode =
            previousNodeId === null ? null : nodeMetasByNodeId[previousNodeId]!;
        const nextNode =
            nextNodeId === null ? null : nodeMetasByNodeId[nextNodeId]!;

        nodes.push({
            trainCode: currentNode.trainCode,
            internalCode: currentNode.internalCode,
            allCodes: [...currentNode.allCodes],
            incomingTrainCodes:
                previousNode === null ? null : [...previousNode.allCodes],
            incomingWeight: incomingEdge?.weight ?? null,
            incomingSupportCount: incomingEdge?.count ?? null,
            outgoingTrainCodes:
                nextNode === null ? null : [...nextNode.allCodes],
            outgoingWeight: outgoingEdge?.weight ?? null,
            outgoingSupportCount: outgoingEdge?.count ?? null
        });
    }

    return {
        routeId: buildRouteId(nodeKeys),
        trainCodes,
        windowStart,
        windowEnd,
        threshold,
        lowestLinkWeight,
        lowestLinkSupportCount,
        containsLoopBreak,
        nodes
    };
}

function buildLookupByTrainCode(circulations: InternalInferredCirculation[]) {
    const lookupByTrainCode = new Map<string, InternalInferredCirculation[]>();

    for (const circulation of circulations) {
        for (const trainCode of circulation.trainCodes) {
            const existing = lookupByTrainCode.get(trainCode);
            if (existing) {
                existing.push(circulation);
                continue;
            }

            lookupByTrainCode.set(trainCode, [circulation]);
        }
    }

    return lookupByTrainCode;
}

function buildLookupByInternalCode(
    circulations: InternalInferredCirculation[]
) {
    const lookupByInternalCode = new Map<
        string,
        InternalInferredCirculation[]
    >();

    for (const circulation of circulations) {
        const normalizedInternalCodes = uniqueNormalizedCodes(
            circulation.nodes
                .map((node) => normalizeCode(node.internalCode ?? ''))
                .filter((internalCode) => internalCode.length > 0)
        );
        for (const internalCode of normalizedInternalCodes) {
            const existing = lookupByInternalCode.get(internalCode);
            if (existing) {
                existing.push(circulation);
                continue;
            }

            lookupByInternalCode.set(internalCode, [circulation]);
        }
    }

    return lookupByInternalCode;
}

function buildInferredMetadata(
    circulation: InternalInferredCirculation
): InferredTrainCirculationMetadata {
    return {
        routeId: circulation.routeId,
        windowStart: circulation.windowStart,
        windowEnd: circulation.windowEnd,
        threshold: circulation.threshold,
        lowestLinkWeight: circulation.lowestLinkWeight,
        lowestLinkSupportCount: circulation.lowestLinkSupportCount,
        containsLoopBreak: circulation.containsLoopBreak
    };
}

function resolvePublicNodeTimetable(node: InternalInferredCirculationNode) {
    const candidateTrainCodes = uniqueNormalizedCodes([
        node.trainCode,
        ...node.allCodes
    ]);

    for (const trainCode of candidateTrainCodes) {
        const timetable = getTodayScheduleTimetableByTrainCode(trainCode);
        if (timetable) {
            return timetable;
        }
    }

    const normalizedInternalCode = normalizeCode(node.internalCode ?? '');
    if (normalizedInternalCode.length === 0) {
        return null;
    }

    for (const group of getTodayScheduleProbeGroups().values()) {
        if (normalizeCode(group.trainInternalCode) !== normalizedInternalCode) {
            continue;
        }

        return getTodayScheduleTimetableByTrainCode(group.trainCode);
    }

    return null;
}

function buildPublicNodeInternalCode(
    node: InternalInferredCirculationNode,
    timetableTrainCode: string
) {
    const normalizedInternalCode = normalizeCode(node.internalCode ?? '');
    if (normalizedInternalCode.length > 0) {
        return normalizedInternalCode;
    }

    const publicTrainCode = uniqueNormalizedCodes([
        ...node.allCodes,
        node.trainCode,
        timetableTrainCode
    ])[0];
    return publicTrainCode ?? timetableTrainCode;
}

function buildPublicCirculationNodes(
    circulation: InternalInferredCirculation
): TrainCirculationNode[] | null {
    const nodes: TrainCirculationNode[] = [];
    const resolvedTimetables: TodayScheduleTimetable[] = [];

    for (const node of circulation.nodes) {
        const timetable = resolvePublicNodeTimetable(node);
        if (!timetable) {
            return null;
        }
        resolvedTimetables.push(timetable);
    }

    const expandedOffsets = expandSequentialShanghaiDayOffsets(
        resolvedTimetables,
        (timetable) => timetable.startAt,
        (timetable) => timetable.endAt
    );

    for (const [index, node] of circulation.nodes.entries()) {
        const timetable = resolvedTimetables[index]!;
        const expandedOffset = expandedOffsets[index]!;
        const allCodes = uniqueNormalizedCodes([
            ...node.allCodes,
            node.trainCode,
            timetable.trainCode
        ]);
        if (allCodes.length === 0) {
            return null;
        }

        nodes.push({
            internalCode: buildPublicNodeInternalCode(
                node,
                timetable.trainCode
            ),
            allCodes,
            startStation: timetable.startStation,
            endStation: timetable.endStation,
            startAt: expandedOffset.startAt,
            endAt: expandedOffset.endAt
        });
    }

    return nodes;
}

function toPublicTrainCirculation(
    circulation: InternalInferredCirculation,
    refreshAt: number | null
): TrainCirculation | null {
    const nodes = buildPublicCirculationNodes(circulation);
    if (!nodes || nodes.length === 0) {
        return null;
    }

    return {
        source: 'inferred',
        refreshAt,
        nodes,
        metadata: buildInferredMetadata(circulation)
    };
}

function toPublicInferredCirculationReference(
    circulation: InternalInferredCirculation,
    refreshAt: number | null
): InferredTrainCirculationReference | null {
    const publicCirculation = toPublicTrainCirculation(circulation, refreshAt);
    if (!publicCirculation || !publicCirculation.metadata?.routeId) {
        return null;
    }

    return {
        source: 'inferred',
        refreshAt: publicCirculation.refreshAt,
        nodes: publicCirculation.nodes.map((node) => ({
            ...node,
            allCodes: [...node.allCodes]
        })),
        metadata: buildInferredMetadata(circulation)
    };
}

function buildCirculationsFromGraph(
    nodeMetasByNodeId: CirculationNodeMeta[],
    outgoingEdgesByNodeId: Map<number, EdgeStat[]>,
    incomingEdgesByNodeId: Map<number, EdgeStat[]>,
    windowStart: number,
    windowEnd: number,
    threshold: number
) {
    const unassignedNodeIds = new Set<number>(
        nodeMetasByNodeId.map((_, index) => index)
    );
    const circulations: InternalInferredCirculation[] = [];

    for (const seedNodeId of [...unassignedNodeIds]) {
        if (!unassignedNodeIds.has(seedNodeId)) {
            continue;
        }

        let startNodeId = seedNodeId;
        const seenDuringBacktrack = new Set<number>([startNodeId]);

        while (true) {
            const incomingEdge = getTopEdge(incomingEdgesByNodeId, startNodeId);
            if (
                !incomingEdge ||
                incomingEdge.weight < threshold ||
                !unassignedNodeIds.has(incomingEdge.nodeId) ||
                seenDuringBacktrack.has(incomingEdge.nodeId)
            ) {
                break;
            }

            startNodeId = incomingEdge.nodeId;
            seenDuringBacktrack.add(startNodeId);
        }

        const routeNodeIds: number[] = [];
        const visitedInRoute = new Map<number, number>();
        let currentNodeId = startNodeId;
        let containsLoopBreak = false;

        while (true) {
            routeNodeIds.push(currentNodeId);
            visitedInRoute.set(currentNodeId, routeNodeIds.length - 1);

            const outgoingEdges =
                outgoingEdgesByNodeId.get(currentNodeId) ?? [];
            let nextEdge: EdgeStat | null = null;
            let closingEdge: EdgeStat | null = null;

            for (const outgoingEdge of outgoingEdges) {
                if (outgoingEdge.weight < threshold) {
                    break;
                }

                if (!unassignedNodeIds.has(outgoingEdge.nodeId)) {
                    continue;
                }

                if (visitedInRoute.has(outgoingEdge.nodeId)) {
                    if (!closingEdge) {
                        closingEdge = outgoingEdge;
                    }
                    continue;
                }

                nextEdge = outgoingEdge;
                break;
            }

            if (nextEdge) {
                currentNodeId = nextEdge.nodeId;
                continue;
            }

            if (closingEdge) {
                containsLoopBreak = true;
            }
            break;
        }

        for (const nodeId of routeNodeIds) {
            unassignedNodeIds.delete(nodeId);
        }

        circulations.push(
            buildCirculation(
                routeNodeIds,
                nodeMetasByNodeId,
                outgoingEdgesByNodeId,
                windowStart,
                windowEnd,
                threshold,
                containsLoopBreak
            )
        );
    }

    for (const nodeId of [...unassignedNodeIds]) {
        unassignedNodeIds.delete(nodeId);
        circulations.push(
            buildCirculation(
                [nodeId],
                nodeMetasByNodeId,
                outgoingEdgesByNodeId,
                windowStart,
                windowEnd,
                threshold,
                false
            )
        );
    }

    circulations.sort((left, right) => {
        const leftCode = left.trainCodes[0] ?? '';
        const rightCode = right.trainCodes[0] ?? '';
        if (leftCode !== rightCode) {
            return leftCode.localeCompare(rightCode);
        }
        return left.routeId.localeCompare(right.routeId);
    });

    return circulations;
}

function buildInternalCirculationIndex(
    startAt: number,
    endAt: number,
    threshold: number,
    batchSize: number,
    officialInternalCodes: ReadonlySet<string>,
    excludeOfficialInternalCodes: boolean
): InternalCirculationBuildResult {
    const nodeIds = buildNodeIdStore();
    const trainCodeNodeMetaMap = buildTrainCodeNodeMetaMap(
        officialInternalCodes,
        excludeOfficialInternalCodes
    );
    const scanStatesByEmuCode = new Map<string, EmuScanState>();
    const outgoingCounts = new Map<number, Map<number, number>>();
    const incomingCounts = new Map<number, Map<number, number>>();
    let rowsScanned = 0;
    let cursor: CursorPoint | null = null;

    while (true) {
        const rows = listDailyRecordsPaged(startAt, endAt, cursor, batchSize);
        if (rows.length === 0) {
            break;
        }

        for (const row of rows) {
            if (
                consumeRow(
                    row,
                    nodeIds,
                    trainCodeNodeMetaMap,
                    scanStatesByEmuCode,
                    outgoingCounts,
                    incomingCounts
                )
            ) {
                rowsScanned += 1;
            }
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

    for (const state of scanStatesByEmuCode.values()) {
        commitClosedRun(
            state.pendingRun,
            state,
            outgoingCounts,
            incomingCounts
        );

        if (state.currentRun && state.nextRun) {
            finalizeRunTransition(
                state.currentRun,
                state.nextRun,
                outgoingCounts,
                incomingCounts
            );
        }
    }

    const outgoingEdgesByNodeId = normalizeEdgeCounts(
        outgoingCounts,
        nodeIds.nodeMetasByNodeId
    );
    const incomingEdgesByNodeId = normalizeEdgeCounts(
        incomingCounts,
        nodeIds.nodeMetasByNodeId
    );
    const circulations = buildCirculationsFromGraph(
        nodeIds.nodeMetasByNodeId,
        outgoingEdgesByNodeId,
        incomingEdgesByNodeId,
        startAt,
        endAt,
        threshold
    );

    return {
        lookupByTrainCode: buildLookupByTrainCode(circulations),
        lookupByInternalCode: buildLookupByInternalCode(circulations),
        circulations,
        rowsScanned,
        nodeCount: nodeIds.nodeMetasByNodeId.length,
        edgeCount: Array.from(outgoingCounts.values()).reduce(
            (sum, targets) => sum + targets.size,
            0
        ),
        circulationCount: circulations.length
    };
}

function buildComparableNodeCodes(node: {
    internalCode: string | null | undefined;
    allCodes: string[];
}) {
    const normalizedInternalCode = normalizeCode(node.internalCode ?? '');
    if (normalizedInternalCode.length > 0) {
        return [normalizedInternalCode];
    }

    return uniqueNormalizedCodes(node.allCodes);
}

function nodesShareComparableCode(
    left: { internalCode: string | null | undefined; allCodes: string[] },
    right: { internalCode: string | null | undefined; allCodes: string[] }
) {
    const leftCodes = buildComparableNodeCodes(left);
    const rightCodeSet = new Set(buildComparableNodeCodes(right));
    return leftCodes.some((code) => rightCodeSet.has(code));
}

function evaluateOfficialCirculationCandidate(
    entry: ScheduleCirculationEntry,
    circulation: InternalInferredCirculation,
    refreshAt: number | null
): OfficialCirculationCandidateEvaluation {
    const officialNodes = entry.nodes;
    const candidateNodes = circulation.nodes;
    const publicReference = toPublicInferredCirculationReference(
        circulation,
        refreshAt
    );

    if (officialNodes.length === 0 || candidateNodes.length === 0) {
        return {
            circulation,
            publicReference,
            match: null,
            matchedNodeCount: 0
        };
    }

    let bestMatchedNodeCount = 0;

    for (
        let officialStartIndex = 0;
        officialStartIndex < officialNodes.length;
        officialStartIndex += 1
    ) {
        if (
            !nodesShareComparableCode(
                officialNodes[officialStartIndex]!,
                candidateNodes[0]!
            )
        ) {
            continue;
        }

        let matchedNodeCount = 0;
        while (
            matchedNodeCount < candidateNodes.length &&
            officialStartIndex + matchedNodeCount < officialNodes.length &&
            nodesShareComparableCode(
                officialNodes[officialStartIndex + matchedNodeCount]!,
                candidateNodes[matchedNodeCount]!
            )
        ) {
            matchedNodeCount += 1;
        }

        bestMatchedNodeCount = Math.max(bestMatchedNodeCount, matchedNodeCount);

        if (matchedNodeCount !== candidateNodes.length) {
            continue;
        }

        const officialEndIndex = officialStartIndex + matchedNodeCount - 1;
        const matchType =
            matchedNodeCount === officialNodes.length ? 'exact' : 'split';
        if (matchType === 'split' && matchedNodeCount <= 1) {
            continue;
        }

        return {
            circulation,
            publicReference,
            match: {
                type: matchType,
                officialStartIndex,
                officialEndIndex,
                matchedNodeCount
            },
            matchedNodeCount
        };
    }

    return {
        circulation,
        publicReference,
        match: null,
        matchedNodeCount: bestMatchedNodeCount
    };
}

function compareOfficialCandidateEvaluations(
    left: OfficialCirculationCandidateEvaluation,
    right: OfficialCirculationCandidateEvaluation
) {
    if (left.matchedNodeCount !== right.matchedNodeCount) {
        return right.matchedNodeCount - left.matchedNodeCount;
    }

    const leftWeight = left.circulation.lowestLinkWeight ?? -1;
    const rightWeight = right.circulation.lowestLinkWeight ?? -1;
    if (leftWeight !== rightWeight) {
        return rightWeight - leftWeight;
    }

    const leftSupport = left.circulation.lowestLinkSupportCount ?? -1;
    const rightSupport = right.circulation.lowestLinkSupportCount ?? -1;
    if (leftSupport !== rightSupport) {
        return rightSupport - leftSupport;
    }

    return left.circulation.routeId.localeCompare(right.circulation.routeId);
}

function buildOfficialCandidateEvaluations(
    entry: ScheduleCirculationEntry,
    fullLookupByTrainCode: Map<string, InternalInferredCirculation[]>,
    fullLookupByInternalCode: Map<string, InternalInferredCirculation[]>,
    refreshAt: number | null
) {
    const candidateMap = new Map<string, InternalInferredCirculation>();

    for (const node of entry.nodes) {
        const normalizedInternalCode = normalizeCode(node.internalCode);
        if (normalizedInternalCode.length > 0) {
            for (const circulation of fullLookupByInternalCode.get(
                normalizedInternalCode
            ) ?? []) {
                candidateMap.set(circulation.routeId, circulation);
            }
        }

        for (const trainCode of node.allCodes) {
            for (const circulation of fullLookupByTrainCode.get(
                normalizeCode(trainCode)
            ) ?? []) {
                candidateMap.set(circulation.routeId, circulation);
            }
        }
    }

    return Array.from(candidateMap.values())
        .map((circulation) =>
            evaluateOfficialCirculationCandidate(entry, circulation, refreshAt)
        )
        .sort(compareOfficialCandidateEvaluations);
}

function buildOfficialValidationMetadata(
    validationState: OfficialCirculationValidationState,
    entryKey: string,
    overrides: Partial<TrainCirculationMetadata> = {}
): TrainCirculationMetadata {
    return {
        validationState,
        originalOfficialEntryKey: entryKey,
        ...overrides
    };
}

function cloneOfficialEntryNodes(nodes: TrainCirculationNode[]) {
    return nodes.map((node) => ({
        internalCode: node.internalCode,
        allCodes: [...node.allCodes],
        startStation: node.startStation,
        endStation: node.endStation,
        startAt: node.startAt,
        endAt: node.endAt
    }));
}

function buildPublicOfficialCirculationFromEntry(
    entryKey: string,
    entry: ScheduleCirculationEntry,
    nodes: TrainCirculationNode[],
    metadata: TrainCirculationMetadata
): TrainCirculation {
    return {
        source: 'official',
        refreshAt: entry.refreshedAt,
        nodes: cloneOfficialEntryNodes(nodes),
        metadata
    };
}

function indexOfficialCirculationByInternalCode(
    circulation: TrainCirculation,
    store: Map<string, TrainCirculation>
) {
    for (const node of circulation.nodes) {
        const normalizedInternalCode = normalizeCode(node.internalCode);
        if (normalizedInternalCode.length === 0) {
            continue;
        }

        store.set(normalizedInternalCode, circulation);
    }
}

function buildValidatedOfficialCirculationMap(
    fullBuild: InternalCirculationBuildResult,
    refreshAt: number | null
) {
    const scheduleFilePath = useConfig().data.assets.schedule.file;
    const officialMap = loadScheduleCirculationMap(scheduleFilePath);
    const validatedOfficialByInternalCode = new Map<string, TrainCirculation>();
    let splitCount = 0;
    let unmatchedCount = 0;

    for (const [entryKey, entry] of Object.entries(officialMap)) {
        const candidateEvaluations = buildOfficialCandidateEvaluations(
            entry,
            fullBuild.lookupByTrainCode,
            fullBuild.lookupByInternalCode,
            refreshAt
        );
        const bestCandidate = candidateEvaluations[0] ?? null;
        const splitCandidate =
            candidateEvaluations.find(
                (candidate) => candidate.match?.type === 'split'
            ) ?? null;
        const exactCandidate =
            candidateEvaluations.find(
                (candidate) => candidate.match?.type === 'exact'
            ) ?? null;

        if (splitCandidate?.match) {
            const { officialStartIndex, officialEndIndex } =
                splitCandidate.match;
            const segmentRanges = [
                {
                    startIndex: 0,
                    endIndex: officialStartIndex - 1
                },
                {
                    startIndex: officialStartIndex,
                    endIndex: officialEndIndex
                },
                {
                    startIndex: officialEndIndex + 1,
                    endIndex: entry.nodes.length - 1
                }
            ].filter((segment) => segment.startIndex <= segment.endIndex);
            const splitSegmentCount = segmentRanges.length;

            segmentRanges.forEach((segment, index) => {
                const segmentNodes = entry.nodes.slice(
                    segment.startIndex,
                    segment.endIndex + 1
                );
                const metadata = buildOfficialValidationMetadata(
                    'split_official',
                    entryKey,
                    {
                        splitSegmentIndex: index,
                        splitSegmentCount,
                        matchedInferredRouteId:
                            splitCandidate.circulation.routeId
                    }
                );
                const circulation = buildPublicOfficialCirculationFromEntry(
                    entryKey,
                    entry,
                    segmentNodes,
                    metadata
                );
                indexOfficialCirculationByInternalCode(
                    circulation,
                    validatedOfficialByInternalCode
                );
            });
            splitCount += 1;
            continue;
        }

        if (exactCandidate) {
            const circulation = buildPublicOfficialCirculationFromEntry(
                entryKey,
                entry,
                entry.nodes,
                buildOfficialValidationMetadata('raw_official', entryKey, {
                    matchedInferredRouteId: exactCandidate.circulation.routeId
                })
            );
            indexOfficialCirculationByInternalCode(
                circulation,
                validatedOfficialByInternalCode
            );
            continue;
        }

        const circulation = buildPublicOfficialCirculationFromEntry(
            entryKey,
            entry,
            entry.nodes,
            buildOfficialValidationMetadata('unmatched_official', entryKey, {
                matchedInferredRouteId: bestCandidate?.circulation.routeId,
                candidateInferredCirculation:
                    bestCandidate?.publicReference ?? null
            })
        );
        indexOfficialCirculationByInternalCode(
            circulation,
            validatedOfficialByInternalCode
        );
        unmatchedCount += 1;
    }

    logger.info(
        `official_validation scanned=${Object.keys(officialMap).length} split=${splitCount} unmatched=${unmatchedCount}`
    );

    return validatedOfficialByInternalCode;
}

function commitClosedRun(
    closedRun: RunBucket,
    state: EmuScanState,
    outgoingCounts: Map<number, Map<number, number>>,
    incomingCounts: Map<number, Map<number, number>>
) {
    if (closedRun.nodeIds.size === 0) {
        state.gapPending = true;
        return false;
    }

    if (!state.currentRun) {
        state.currentRun = closedRun;
        state.nextRun = null;
        state.gapPending = false;
        return true;
    }

    if (state.gapPending) {
        if (state.nextRun) {
            finalizeRunTransition(
                state.currentRun,
                state.nextRun,
                outgoingCounts,
                incomingCounts
            );
        }

        state.currentRun = closedRun;
        state.nextRun = null;
        state.gapPending = false;
        return true;
    }

    if (state.nextRun) {
        finalizeRunTransition(
            state.currentRun,
            state.nextRun,
            outgoingCounts,
            incomingCounts
        );
    }

    state.nextRun = state.currentRun;
    state.currentRun = closedRun;
    state.gapPending = false;
    return true;
}

function consumeRow(
    row: DailyEmuRouteRow,
    nodeIds: ReturnType<typeof buildNodeIdStore>,
    trainCodeNodeMetaMap: ReturnType<typeof buildTrainCodeNodeMetaMap>,
    scanStatesByEmuCode: Map<string, EmuScanState>,
    outgoingCounts: Map<number, Map<number, number>>,
    incomingCounts: Map<number, Map<number, number>>
) {
    const trainCode = normalizeCode(row.train_code);
    const emuCode = normalizeCode(row.emu_code);
    if (trainCode.length === 0 || emuCode.length === 0) {
        return false;
    }

    const nodeMeta = trainCodeNodeMetaMap.resolve(trainCode);
    const state = scanStatesByEmuCode.get(emuCode);
    const runKey = buildRunKey(row);
    if (!state) {
        const pendingRun = nodeMeta
            ? createRunBucket(row, nodeIds.getNodeId(nodeMeta))
            : createEmptyRunBucket(row);
        scanStatesByEmuCode.set(emuCode, {
            pendingRun,
            currentRun: null,
            nextRun: null,
            gapPending: false
        });
        return nodeMeta !== null;
    }

    if (state.pendingRun.runKey === runKey) {
        if (!nodeMeta) {
            return false;
        }

        state.pendingRun.nodeIds.add(nodeIds.getNodeId(nodeMeta));
        return true;
    }

    commitClosedRun(state.pendingRun, state, outgoingCounts, incomingCounts);
    state.pendingRun = nodeMeta
        ? createRunBucket(row, nodeIds.getNodeId(nodeMeta))
        : createEmptyRunBucket(row);

    return nodeMeta !== null;
}

export function rebuildTrainCirculationIndex(): TrainCirculationIndexCache {
    const currentDate = getRelativeDateString(0);
    const config = getWindowConfig();
    const { startAt, endAt } = getWindowRange(currentDate, config.windowDays);
    const officialInternalCodes = loadOfficialCirculationInternalCodes();
    const rebuiltAt = Math.floor(Date.now() / 1000);
    const inferredBuild = buildInternalCirculationIndex(
        startAt,
        endAt,
        config.threshold,
        config.batchSize,
        officialInternalCodes,
        true
    );
    const fullBuild = buildInternalCirculationIndex(
        startAt,
        endAt,
        config.threshold,
        config.batchSize,
        officialInternalCodes,
        false
    );
    const validatedOfficialByInternalCode =
        buildValidatedOfficialCirculationMap(fullBuild, rebuiltAt);

    cached = {
        currentDate,
        windowDays: config.windowDays,
        windowStart: startAt,
        windowEnd: endAt,
        threshold: config.threshold,
        inferredLookupByTrainCode: inferredBuild.lookupByTrainCode,
        validatedOfficialByInternalCode,
        stats: {
            rowsScanned: inferredBuild.rowsScanned,
            nodeCount: inferredBuild.nodeCount,
            edgeCount: inferredBuild.edgeCount,
            circulationCount: inferredBuild.circulationCount,
            rebuiltAt
        }
    };

    return cached;
}

function getActiveCache() {
    if (cached) {
        return cached;
    }

    const nextCache = rebuildTrainCirculationIndex();
    logger.info(
        `rebuild_on_demand currentDate=${nextCache.currentDate} windowDays=${nextCache.windowDays} rowsScanned=${nextCache.stats.rowsScanned} nodes=${nextCache.stats.nodeCount} edges=${nextCache.stats.edgeCount} circulations=${nextCache.stats.circulationCount}`
    );
    return nextCache;
}

export function getTrainCirculationIndexStats() {
    return getActiveCache().stats;
}

function getInternalInferredCirculationsByTrainCodes(
    trainCodes: string[]
): InternalInferredCirculation[] {
    const normalizedTrainCodes = Array.from(
        new Set(
            trainCodes
                .map((trainCode) => normalizeCode(trainCode))
                .filter((trainCode) => trainCode.length > 0)
        )
    );
    if (normalizedTrainCodes.length === 0) {
        return [];
    }

    const activeCache = getActiveCache();
    const resultsByRouteId = new Map<string, InternalInferredCirculation>();

    for (const trainCode of normalizedTrainCodes) {
        for (const circulation of activeCache.inferredLookupByTrainCode.get(
            trainCode
        ) ?? []) {
            resultsByRouteId.set(circulation.routeId, circulation);
        }
    }

    return Array.from(resultsByRouteId.values()).sort((left, right) =>
        left.routeId.localeCompare(right.routeId)
    );
}

export function getTrainCirculationByTrainCodes(
    trainCodes: string[]
): TrainCirculation | null {
    const activeCache = getActiveCache();
    const circulation =
        getInternalInferredCirculationsByTrainCodes(trainCodes)[0];
    return circulation
        ? toPublicTrainCirculation(circulation, activeCache.stats.rebuiltAt)
        : null;
}

function toPublicOfficialTrainCirculation(
    trainInternalCode: string
): TrainCirculation | null {
    const normalizedInternalCode = normalizeCode(trainInternalCode);
    if (normalizedInternalCode.length === 0) {
        return null;
    }

    const cachedOfficialCirculation =
        getActiveCache().validatedOfficialByInternalCode.get(
            normalizedInternalCode
        );
    if (cachedOfficialCirculation) {
        return cachedOfficialCirculation;
    }

    const entry = loadScheduleCirculationEntry(
        useConfig().data.assets.schedule.file,
        normalizedInternalCode
    );
    if (!entry) {
        return null;
    }

    return buildPublicOfficialCirculationFromEntry(
        normalizedInternalCode,
        entry,
        entry.nodes,
        buildOfficialValidationMetadata('raw_official', normalizedInternalCode)
    );
}

export function getPreferredTrainCirculation(input: {
    trainInternalCode: string;
    allCodes: string[];
}): TrainCirculation | null {
    const officialCirculation = toPublicOfficialTrainCirculation(
        input.trainInternalCode
    );
    if (officialCirculation) {
        return officialCirculation;
    }

    return getTrainCirculationByTrainCodes(input.allCodes);
}

export function invalidateTrainCirculationIndexCache() {
    cached = null;
}
