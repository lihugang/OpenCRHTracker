import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import {
    listDailyRecordsPaged,
    type DailyEmuRouteRow
} from '~/server/services/emuRoutesStore';
import { getTodayScheduleProbeGroups } from '~/server/services/todayScheduleCache';
import {
    getRelativeDateString
} from '~/server/utils/date/getCurrentDateString';
import {
    getShanghaiDayStartUnixSeconds,
    SHANGHAI_OFFSET_MS
} from '~/server/utils/date/shanghaiDateTime';
import murmurHash32 from '~/server/utils/hash/murmurHash32';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import type {
    InferredCirculation,
    InferredCirculationNode
} from '~/types/lookup';

interface CursorPoint {
    startAt: number;
    id: number;
}

interface RunBucket {
    runKey: string;
    startAt: number;
    endAt: number;
    nodeIds: Set<number>;
}

interface EmuScanState {
    currentRun: RunBucket;
    nextRun: RunBucket | null;
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
    lookupByTrainCode: Map<string, InternalInferredCirculation[]>;
    stats: CirculationWindowStats;
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
const SHANGHAI_OFFSET_SECONDS = SHANGHAI_OFFSET_MS / 1000;

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

    return [...normalizedCodes].sort((left, right) => left.localeCompare(right));
}

function buildFallbackNodeMeta(trainCode: string): CirculationNodeMeta {
    return {
        nodeKey: `fallback:${trainCode}`,
        trainCode,
        internalCode: null,
        allCodes: [trainCode]
    };
}

function buildTrainCodeNodeMetaMap() {
    const nodeMetaByTrainCode = new Map<string, CirculationNodeMeta>();

    for (const group of getTodayScheduleProbeGroups().values()) {
        const allCodes = uniqueNormalizedCodes(group.allCodes);
        if (allCodes.length === 0) {
            continue;
        }

        const normalizedInternalCode = normalizeCode(group.trainInternalCode);
        if (normalizedInternalCode.length === 0) {
            for (const trainCode of allCodes) {
                nodeMetaByTrainCode.set(trainCode, buildFallbackNodeMeta(trainCode));
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

function getShanghaiDayBucket(timestampSeconds: number) {
    return Math.floor((timestampSeconds + SHANGHAI_OFFSET_SECONDS) / 86400);
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

function chooseLoopBreakNode(
    cycleNodeIds: number[],
    outgoingEdgesByNodeId: Map<number, EdgeStat[]>,
    nodeMetasByNodeId: CirculationNodeMeta[]
) {
    let selectedNodeId = cycleNodeIds[0]!;
    let selectedDelta = Number.NEGATIVE_INFINITY;
    let selectedTopWeight = Number.NEGATIVE_INFINITY;
    let selectedTrainCode = nodeMetasByNodeId[selectedNodeId]?.trainCode ?? '';

    for (const nodeId of cycleNodeIds) {
        const edges = outgoingEdgesByNodeId.get(nodeId) ?? [];
        const topWeight = edges[0]?.weight ?? 0;
        const secondWeight = edges[1]?.weight ?? 0;
        const delta = topWeight - secondWeight;
        const trainCode = nodeMetasByNodeId[nodeId]?.trainCode ?? '';

        if (
            delta > selectedDelta ||
            (delta === selectedDelta && topWeight > selectedTopWeight) ||
            (delta === selectedDelta &&
                topWeight === selectedTopWeight &&
                trainCode.localeCompare(selectedTrainCode) < 0)
        ) {
            selectedNodeId = nodeId;
            selectedDelta = delta;
            selectedTopWeight = topWeight;
            selectedTrainCode = trainCode;
        }
    }

    return selectedNodeId;
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
            outgoingTrainCodes: nextNode === null ? null : [...nextNode.allCodes],
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
            const outgoingEdge = getTopEdge(outgoingEdgesByNodeId, currentNodeId);

            if (
                !outgoingEdge ||
                outgoingEdge.weight < threshold ||
                !unassignedNodeIds.has(outgoingEdge.nodeId)
            ) {
                break;
            }

            const loopStartIndex = visitedInRoute.get(outgoingEdge.nodeId);
            if (loopStartIndex !== undefined) {
                const cycleNodeIds = routeNodeIds.slice(loopStartIndex);
                const terminalNodeId = chooseLoopBreakNode(
                    cycleNodeIds,
                    outgoingEdgesByNodeId,
                    nodeMetasByNodeId
                );
                const terminalNodeIndex = routeNodeIds.indexOf(terminalNodeId);
                routeNodeIds.splice(terminalNodeIndex + 1);
                containsLoopBreak = true;
                break;
            }

            currentNodeId = outgoingEdge.nodeId;
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

function toPublicInferredCirculation(
    circulation: InternalInferredCirculation
): InferredCirculation {
    const nodes: InferredCirculationNode[] = circulation.nodes.map((node) => ({
        internalCode: node.internalCode,
        allCodes: [...node.allCodes],
        incomingWeight: node.incomingWeight,
        incomingSupportCount: node.incomingSupportCount,
        outgoingWeight: node.outgoingWeight,
        outgoingSupportCount: node.outgoingSupportCount
    }));

    return {
        routeId: circulation.routeId,
        windowStart: circulation.windowStart,
        windowEnd: circulation.windowEnd,
        threshold: circulation.threshold,
        lowestLinkWeight: circulation.lowestLinkWeight,
        lowestLinkSupportCount: circulation.lowestLinkSupportCount,
        containsLoopBreak: circulation.containsLoopBreak,
        nodes
    };
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

    const nodeId = nodeIds.getNodeId(trainCodeNodeMetaMap.resolve(trainCode));
    const state = scanStatesByEmuCode.get(emuCode);
    if (!state) {
        scanStatesByEmuCode.set(emuCode, {
            currentRun: createRunBucket(row, nodeId),
            nextRun: null
        });
        return true;
    }

    const runKey = buildRunKey(row);
    if (state.currentRun.runKey === runKey) {
        state.currentRun.nodeIds.add(nodeId);
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
    state.currentRun = createRunBucket(row, nodeId);
    return true;
}

export function rebuildTrainCirculationIndex(): TrainCirculationIndexCache {
    const currentDate = getRelativeDateString(0);
    const config = getWindowConfig();
    const { startAt, endAt } = getWindowRange(currentDate, config.windowDays);
    const nodeIds = buildNodeIdStore();
    const trainCodeNodeMetaMap = buildTrainCodeNodeMetaMap();
    const scanStatesByEmuCode = new Map<string, EmuScanState>();
    const outgoingCounts = new Map<number, Map<number, number>>();
    const incomingCounts = new Map<number, Map<number, number>>();
    const rebuiltAt = Math.floor(Date.now() / 1000);
    let rowsScanned = 0;
    let cursor: CursorPoint | null = null;

    while (true) {
        const rows = listDailyRecordsPaged(
            startAt,
            endAt,
            cursor,
            config.batchSize
        );
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

        if (rows.length < config.batchSize) {
            break;
        }

        const lastRow = rows[rows.length - 1]!;
        cursor = {
            startAt: lastRow.start_at,
            id: lastRow.id
        };
    }

    for (const state of scanStatesByEmuCode.values()) {
        if (state.nextRun) {
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
        config.threshold
    );

    cached = {
        currentDate,
        windowDays: config.windowDays,
        windowStart: startAt,
        windowEnd: endAt,
        threshold: config.threshold,
        lookupByTrainCode: buildLookupByTrainCode(circulations),
        stats: {
            rowsScanned,
            nodeCount: nodeIds.nodeMetasByNodeId.length,
            edgeCount: Array.from(outgoingCounts.values()).reduce(
                (sum, targets) => sum + targets.size,
                0
            ),
            circulationCount: circulations.length,
            rebuiltAt
        }
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
        for (const circulation of activeCache.lookupByTrainCode.get(trainCode) ??
            []) {
            resultsByRouteId.set(circulation.routeId, circulation);
        }
    }

    return Array.from(resultsByRouteId.values()).sort((left, right) =>
        left.routeId.localeCompare(right.routeId)
    );
}

export function getInferredCirculationByTrainCodes(
    trainCodes: string[]
): InferredCirculation | null {
    const circulation = getInternalInferredCirculationsByTrainCodes(trainCodes)[0];
    return circulation ? toPublicInferredCirculation(circulation) : null;
}

export function invalidateTrainCirculationIndexCache() {
    cached = null;
}
