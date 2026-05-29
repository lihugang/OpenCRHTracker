import fs from 'fs';
import path from 'path';
import useConfig from '~/server/config';
import { getReferenceModelsByTrainCodes } from '~/server/services/referenceModelIndexStore';
import { getPreferredTrainCirculation } from '~/server/services/trainCirculationIndexStore';
import { getTodayScheduleTimetableByTrainCode } from '~/server/services/todayScheduleCache';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import { loadScheduleDocument } from '~/server/utils/12306/scheduleProbe/stateStore';
import type {
    ScheduleItem,
    ScheduleStationEntry,
    ScheduleStop
} from '~/server/utils/12306/scheduleProbe/types';
import uniqueNormalizedCodes from '~/server/utils/12306/uniqueNormalizedCodes';
import getCurrentDateString, {
    formatShanghaiDateString
} from '~/server/utils/date/getCurrentDateString';
import {
    getShanghaiDayStartUnixSeconds,
    toUnixSecondsFromShanghaiDayOffset
} from '~/server/utils/date/shanghaiDateTime';
import type { TrainCirculation, TrainCirculationImageData } from '~/types/lookup';
import resolveBureauNameByCode from '~/utils/railway/resolveBureauNameByCode';

interface LatexCompileSuccessPayload {
    id?: unknown;
    pageNumber?: unknown;
    cacheHit?: unknown;
}

interface ResolvedScheduleTerminal {
    stationName: string;
    stationTelecode: string;
    timestamp: number;
    station: ScheduleStationEntry;
}

interface ResolvedCirculationNode {
    routeNodeIndex: number;
    trainCodes: string[];
    trainCodeText: string;
    start: ResolvedScheduleTerminal;
    end: ResolvedScheduleTerminal;
}

interface StationAxisPoint {
    stationTelecode: string;
    stationName: string;
    lat: number;
    lon: number;
    cumulativeDistanceKm: number;
}

interface LatexCompileResult {
    id: string;
    pageCount: number;
    cacheHit: boolean;
}

type TextAnchor = 'east' | 'west' | 'north' | 'south';
type TextMetricKind = 'station' | 'train' | 'time' | 'marker';

interface MergedScheduleItem {
    representativeItem: ScheduleItem;
    internalCode: string;
    allCodes: string[];
    startStation: string;
    endStation: string;
    startAt: number | null;
    endAt: number | null;
}

export type TrainCirculationImageFormat = 'png' | 'pdf';

export interface TrainCirculationImageRenderResult {
    requestTrainCode: string;
    trainCode: string;
    documentId: string;
    cacheHit: boolean;
    imageUrl: string;
    binaryContent: Uint8Array | null;
    binaryContentType: 'image/png' | 'application/pdf';
}

const TEMPLATE_PATH = path.resolve('assets/latex/train-circulation-image.tex');
const MIN_STATION_GAP_CM = 1.0;
const PLOT_TOP_PADDING_CM = 0.9;
const PLOT_BOTTOM_PADDING_CM = 0.9;
const ENDPOINT_TIME_MIN_X_GAP_CM = 0.26;
const ENDPOINT_TIME_HORIZONTAL_STEP_CM = 0.32;
const ENDPOINT_TIME_MAX_HORIZONTAL_STEPS = 96;
const ENDPOINT_TIME_LAYOUT_MAX_ITERATIONS = 6;
const ENDPOINT_TIME_RELAYOUT_GROWTH_CM = 2.4;
const ENDPOINT_TIME_RIGHT_PADDING_CM = 0.5;
const TRAIN_LABEL_SAFE_MIN_X_CM = 1.4;
const TRAIN_LABEL_SAFE_MAX_X_PADDING_CM = 0.4;
const TRAIN_LABEL_CANDIDATE_PROGRESS = [0.25, 0.4, 0.55] as const;
const TRAIN_LABEL_OFFSET_X_CM = 0.32;
const ENDPOINT_TIME_OFFSET_Y_CM = 0.16;
const MIDNIGHT_MARKER_OFFSET_Y_CM = 0.2;
const HEADER_INFO_OFFSET_Y_CM = 0.8;
const STATION_LABEL_RIGHT_PROTECTION_X_CM = 0.2;
const SHANGHAI_TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
});

interface TextBox {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

interface TextPlacement {
    x: number;
    y: number;
    text: string;
    anchor: TextAnchor;
    box: TextBox;
}

interface TextMetrics {
    widthCm: number;
    heightCm: number;
}

interface TopRightTextPlacement {
    x: number;
    y: number;
    text: string;
    box: TextBox;
}

interface StationAxisLayout {
    chartBodyHeightCm: number;
    projectedDistanceByTelecode: Map<string, number>;
}

interface EndpointTimePlacement extends TextPlacement {
    occupiedBox: TextBox;
}

interface EndpointTimeCandidate {
    text: string;
    x: number;
    y: number;
    anchor: Extract<TextAnchor, 'north' | 'south'>;
    direction: 'left' | 'right';
}

interface EndpointTimePlacementResult {
    placements: EndpointTimePlacement[];
    requiredChartWidthCm: number;
    hadOverlapFallback: boolean;
}

interface TrainCirculationHeaderInfo {
    text: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null;
    }

    return value as Record<string, unknown>;
}

function getNonEmptyString(value: unknown) {
    if (typeof value !== 'string') {
        return '';
    }

    return value.trim();
}

function escapeLatexText(value: string) {
    return value.replaceAll(/([\\{}$&#_^%~])/g, (character) => {
        switch (character) {
            case '\\':
                return '\\textbackslash{}';
            case '{':
                return '\\{';
            case '}':
                return '\\}';
            case '$':
                return '\\$';
            case '&':
                return '\\&';
            case '#':
                return '\\#';
            case '_':
                return '\\_';
            case '^':
                return '\\textasciicircum{}';
            case '%':
                return '\\%';
            case '~':
                return '\\textasciitilde{}';
            default:
                return character;
        }
    });
}

function quoteTikzText(value: string) {
    return `{${escapeLatexText(value)}}`;
}

function formatCoordinate(value: number) {
    return value.toFixed(3);
}

function formatShanghaiTimeLabel(timestampSeconds: number) {
    return SHANGHAI_TIME_FORMATTER.format(new Date(timestampSeconds * 1000));
}

function roundDownToReferenceStep(
    value: number,
    reference: number,
    step: number
) {
    return reference + Math.floor((value - reference) / step) * step;
}

function roundUpToReferenceStep(value: number, reference: number, step: number) {
    return reference + Math.ceil((value - reference) / step) * step;
}

function buildImageUrl(
    baseUrl: string,
    documentId: string,
    format: TrainCirculationImageFormat,
    pageNumber: number
) {
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
    if (format === 'pdf') {
        return `${normalizedBaseUrl}/${documentId}/pdf`;
    }

    return `${normalizedBaseUrl}/${documentId}/png/${pageNumber}`;
}

function getBinaryContentType(
    format: TrainCirculationImageFormat
): 'image/png' | 'application/pdf' {
    return format === 'pdf' ? 'application/pdf' : 'image/png';
}

function haversineDistanceKm(
    left: Pick<ScheduleStationEntry, 'lat' | 'lon'>,
    right: Pick<ScheduleStationEntry, 'lat' | 'lon'>
) {
    const earthRadiusKm = 6371;
    const lat1 = (left.lat * Math.PI) / 180;
    const lat2 = (right.lat * Math.PI) / 180;
    const deltaLat = ((right.lat - left.lat) * Math.PI) / 180;
    const deltaLon = ((right.lon - left.lon) * Math.PI) / 180;
    const haversineValue =
        Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
        Math.cos(lat1) *
            Math.cos(lat2) *
            Math.sin(deltaLon / 2) *
            Math.sin(deltaLon / 2);
    const centralAngle =
        2 *
        Math.atan2(
            Math.sqrt(haversineValue),
            Math.sqrt(Math.max(0, 1 - haversineValue))
        );

    return earthRadiusKm * centralAngle;
}

function buildMergedScheduleItemKey(item: ScheduleItem) {
    return [
        normalizeCode(item.internalCode),
        item.startStation.trim(),
        item.endStation.trim(),
        item.startAt ?? '',
        item.endAt ?? ''
    ].join('|');
}

function mergeScheduleItems(items: ScheduleItem[]) {
    const mergedItemsByKey = new Map<string, MergedScheduleItem>();

    for (const item of items) {
        const mergedItemKey = buildMergedScheduleItemKey(item);
        const existingItem = mergedItemsByKey.get(mergedItemKey);

        if (existingItem) {
            existingItem.allCodes = uniqueNormalizedCodes([
                ...existingItem.allCodes,
                item.code,
                ...item.allCodes
            ]);
            continue;
        }

        mergedItemsByKey.set(mergedItemKey, {
            representativeItem: item,
            internalCode: normalizeCode(item.internalCode),
            allCodes: uniqueNormalizedCodes([item.code, ...item.allCodes]),
            startStation: item.startStation.trim(),
            endStation: item.endStation.trim(),
            startAt: item.startAt,
            endAt: item.endAt
        });
    }

    return [...mergedItemsByKey.values()];
}

function buildScheduleIndexes(items: MergedScheduleItem[]) {
    const itemsByInternalCode = new Map<string, MergedScheduleItem[]>();
    const itemsByTrainCode = new Map<string, MergedScheduleItem[]>();

    for (const item of items) {
        const internalCode = item.internalCode;
        if (internalCode.length > 0) {
            const internalCodeItems =
                itemsByInternalCode.get(internalCode) ?? [];
            internalCodeItems.push(item);
            itemsByInternalCode.set(internalCode, internalCodeItems);
        }

        for (const code of item.allCodes) {
            const codeItems = itemsByTrainCode.get(code) ?? [];
            codeItems.push(item);
            itemsByTrainCode.set(code, codeItems);
        }
    }

    return {
        itemsByInternalCode,
        itemsByTrainCode
    };
}

function getScheduleTerminalStop(
    item: MergedScheduleItem,
    type: 'start' | 'end'
): ScheduleStop | null {
    const stops = item.representativeItem.stops;
    const stop = stops.find((currentStop) =>
        type === 'start' ? currentStop.isStart : currentStop.isEnd
    );
    if (stop) {
        return stop;
    }

    if (stops.length === 0) {
        return null;
    }

    return type === 'start' ? stops[0]! : stops[stops.length - 1]!;
}

function scoreScheduleItemMatch(
    item: MergedScheduleItem,
    node: TrainCirculation['nodes'][number]
) {
    let score = 0;
    const normalizedInternalCode = normalizeCode(node.internalCode);
    const normalizedItemInternalCode = item.internalCode;

    if (
        normalizedInternalCode.length > 0 &&
        normalizedItemInternalCode === normalizedInternalCode
    ) {
        score += 8;
    }

    const itemCodes = item.allCodes;
    const nodeCodes = uniqueNormalizedCodes(node.allCodes);
    const overlapCount = nodeCodes.filter((code) => itemCodes.includes(code)).length;
    score += overlapCount * 4;

    if (item.startStation === node.startStation.trim()) {
        score += 2;
    }
    if (item.endStation === node.endStation.trim()) {
        score += 2;
    }
    if (item.startAt === node.startAt) {
        score += 1;
    }
    if (item.endAt === node.endAt) {
        score += 1;
    }

    return score;
}

function resolveScheduleItemForNode(
    items: MergedScheduleItem[],
    node: TrainCirculation['nodes'][number]
) {
    if (items.length === 0) {
        return null;
    }

    const rankedItems = items
        .map((item) => ({
            item,
            score: scoreScheduleItemMatch(item, node)
        }))
        .filter((rankedItem) => rankedItem.score > 0)
        .sort((left, right) => right.score - left.score);

    if (rankedItems.length === 0) {
        return null;
    }

    if (
        rankedItems.length > 1 &&
        rankedItems[0]!.score === rankedItems[1]!.score
    ) {
        throw new ApiRequestError(
            422,
            'invalid_schedule_data',
            `交路节点 ${node.allCodes[0] ?? node.internalCode} 无法唯一映射到今日时刻表`
        );
    }

    return rankedItems[0]!.item;
}

function resolveCirculationNode(
    scheduleDate: string,
    stations: Record<string, ScheduleStationEntry>,
    item: MergedScheduleItem,
    node: TrainCirculation['nodes'][number],
    routeNodeIndex: number
): ResolvedCirculationNode {
    const resolvedTrainCodes = uniqueNormalizedCodes([
        ...node.allCodes,
        ...item.allCodes
    ]);
    const startStop = getScheduleTerminalStop(item, 'start');
    const endStop = getScheduleTerminalStop(item, 'end');

    if (!startStop || !endStop) {
        throw new ApiRequestError(
            422,
            'invalid_schedule_data',
            `交路节点 ${node.allCodes[0] ?? node.internalCode} 缺少首末站停站信息`
        );
    }

    const startStation = stations[normalizeCode(startStop.stationTelecode)];
    const endStation = stations[normalizeCode(endStop.stationTelecode)];

    if (!startStation || !endStation) {
        throw new ApiRequestError(
            422,
            'invalid_schedule_data',
            `交路节点 ${node.allCodes[0] ?? node.internalCode} 的首末站缺少经纬度`
        );
    }

    return {
        routeNodeIndex,
        trainCodes: resolvedTrainCodes,
        trainCodeText: formatTrainCodeLabel(resolvedTrainCodes),
        start: {
            stationName: startStop.stationName.trim(),
            stationTelecode: normalizeCode(startStop.stationTelecode),
            timestamp: toUnixSecondsFromShanghaiDayOffset(
                scheduleDate,
                node.startAt
            ),
            station: startStation
        },
        end: {
            stationName: endStop.stationName.trim(),
            stationTelecode: normalizeCode(endStop.stationTelecode),
            timestamp: toUnixSecondsFromShanghaiDayOffset(
                scheduleDate,
                node.endAt
            ),
            station: endStation
        }
    };
}

function buildResolvedCirculationNodes(
    scheduleDate: string,
    circulation: TrainCirculation,
    items: ScheduleItem[],
    stations: Record<string, ScheduleStationEntry>
) {
    const indexes = buildScheduleIndexes(mergeScheduleItems(items));
    const resolvedNodes: ResolvedCirculationNode[] = [];

    circulation.nodes.forEach((node, routeNodeIndex) => {
        const internalCode = normalizeCode(node.internalCode);
        const candidateMap = new Map<MergedScheduleItem, MergedScheduleItem>();

        if (internalCode.length > 0) {
            for (const item of indexes.itemsByInternalCode.get(internalCode) ?? []) {
                candidateMap.set(item, item);
            }
        }

        for (const code of uniqueNormalizedCodes(node.allCodes)) {
            for (const item of indexes.itemsByTrainCode.get(code) ?? []) {
                candidateMap.set(item, item);
            }
        }

        const matchedItem = resolveScheduleItemForNode(
            [...candidateMap.values()],
            node
        );

        if (!matchedItem) {
            throw new ApiRequestError(
                422,
                'invalid_schedule_data',
                `交路节点 ${node.allCodes[0] ?? node.internalCode} 无法映射到今日时刻表`
            );
        }

        resolvedNodes.push(
            resolveCirculationNode(
                scheduleDate,
                stations,
                matchedItem,
                node,
                routeNodeIndex
            )
        );
    });

    return resolvedNodes;
}

function buildStationAxisPoints(nodes: ResolvedCirculationNode[]) {
    const stationMap = new Map<string, StationAxisPoint>();

    for (const node of nodes) {
        for (const terminal of [node.start, node.end]) {
            if (!stationMap.has(terminal.stationTelecode)) {
                stationMap.set(terminal.stationTelecode, {
                    stationTelecode: terminal.stationTelecode,
                    stationName: terminal.stationName,
                    lat: terminal.station.lat,
                    lon: terminal.station.lon,
                    cumulativeDistanceKm: 0
                });
            }
        }
    }

    const sortedStations = [...stationMap.values()].sort((left, right) => {
        if (left.lat !== right.lat) {
            return right.lat - left.lat;
        }
        if (left.lon !== right.lon) {
            return left.lon - right.lon;
        }
        return left.stationName.localeCompare(right.stationName, 'zh-Hans-CN');
    });

    for (let index = 1; index < sortedStations.length; index += 1) {
        const previous = sortedStations[index - 1]!;
        const current = sortedStations[index]!;
        current.cumulativeDistanceKm =
            previous.cumulativeDistanceKm +
            haversineDistanceKm(previous, current);
    }

    return sortedStations;
}

function getCommonPrefix(left: string, right: string) {
    const maxLength = Math.min(left.length, right.length);
    let index = 0;

    while (index < maxLength && left[index] === right[index]) {
        index += 1;
    }

    return left.slice(0, index);
}

function formatTrainCodeLabel(trainCodes: string[]) {
    const normalizedCodes = uniqueNormalizedCodes(trainCodes);
    if (normalizedCodes.length === 0) {
        return '';
    }

    if (normalizedCodes.length === 1) {
        return normalizedCodes[0]!;
    }

    if (normalizedCodes.length === 2) {
        const [firstCode, secondCode] = normalizedCodes;
        const commonPrefix = getCommonPrefix(firstCode!, secondCode!);
        const secondSuffix = secondCode!.slice(commonPrefix.length);

        if (commonPrefix.length > 0 && secondSuffix.length > 0) {
            return `${firstCode!}/${secondSuffix}`;
        }
    }

    return normalizedCodes.join('/');
}

function buildStationAxisLayout(
    stationAxisPoints: StationAxisPoint[]
): StationAxisLayout {
    const maxStationDistanceKm =
        stationAxisPoints[stationAxisPoints.length - 1]?.cumulativeDistanceKm ?? 0;
    const baseChartBodyHeightCm =
        Math.max(
            8,
            stationAxisPoints.length * 0.9,
            maxStationDistanceKm / 180
        ) * 2;
    const baseYScale =
        maxStationDistanceKm > 0 ? baseChartBodyHeightCm / maxStationDistanceKm : 0;
    const projectedDistanceByTelecode = new Map<string, number>();
    let projectedDistanceCm = 0;

    stationAxisPoints.forEach((stationAxisPoint, index) => {
        if (index > 0) {
            const previousStationAxisPoint = stationAxisPoints[index - 1]!;
            const rawGapKm =
                stationAxisPoint.cumulativeDistanceKm -
                previousStationAxisPoint.cumulativeDistanceKm;
            const rawGapCm = rawGapKm * baseYScale;
            projectedDistanceCm += Math.max(rawGapCm, MIN_STATION_GAP_CM);
        }

        projectedDistanceByTelecode.set(
            stationAxisPoint.stationTelecode,
            projectedDistanceCm
        );
    });

    return {
        chartBodyHeightCm: Math.max(baseChartBodyHeightCm, projectedDistanceCm),
        projectedDistanceByTelecode
    };
}

function buildTrainCirculationHeaderInfo(input: {
    bureauCode: string;
    trainDepartment: string;
    passengerDepartment: string;
    allCodes: string[];
}): TrainCirculationHeaderInfo | null {
    const parts: string[] = [];
    const bureauName = resolveBureauNameByCode(input.bureauCode);

    if (bureauName.length > 0) {
        parts.push(bureauName);
    }
    if (input.trainDepartment.length > 0) {
        parts.push(input.trainDepartment);
    }
    if (input.passengerDepartment.length > 0) {
        parts.push(input.passengerDepartment);
    }

    const primaryReferenceModel = getReferenceModelsByTrainCodes(input.allCodes)[0];
    if (primaryReferenceModel?.model) {
        parts.push(`${primaryReferenceModel.model} 型动车组`);
    }

    if (parts.length === 0) {
        return null;
    }

    return {
        text: parts.join(', ')
    };
}

function getTextMetricsKindWidthCm(character: string, kind: TextMetricKind) {
    if (character === ' ') {
        return kind === 'time' || kind === 'marker' ? 0.08 : 0.1;
    }

    if (/[\u3400-\u9fff\uf900-\ufaff]/u.test(character)) {
        switch (kind) {
            case 'station':
                return 0.34;
            case 'train':
                return 0.27;
            case 'time':
            case 'marker':
                return 0.18;
            default:
                return 0.27;
        }
    }

    if (/[A-Za-z0-9]/.test(character)) {
        switch (kind) {
            case 'station':
                return 0.18;
            case 'train':
                return 0.15;
            case 'time':
            case 'marker':
                return 0.14;
            default:
                return 0.15;
        }
    }

    switch (kind) {
        case 'station':
            return 0.24;
        case 'train':
            return 0.1;
        case 'time':
        case 'marker':
            return 0.1;
        default:
            return 0.1;
    }
}

function getTextMetrics(text: string, kind: TextMetricKind): TextMetrics {
    const baseHeightCm =
        kind === 'station' ? 0.52 : kind === 'train' ? 0.44 : 0.34;
    const paddingCm =
        kind === 'station' ? 0.06 : kind === 'train' ? 0.08 : 0.04;
    let textWidthCm = 0;

    for (const character of text) {
        textWidthCm += getTextMetricsKindWidthCm(character, kind);
    }

    return {
        widthCm: textWidthCm + paddingCm * 2,
        heightCm: baseHeightCm + paddingCm * 2
    };
}

function createTextBox(
    x: number,
    y: number,
    widthCm: number,
    heightCm: number,
    anchor: TextAnchor
): TextBox {
    const halfWidthCm = widthCm / 2;
    const halfHeightCm = heightCm / 2;

    switch (anchor) {
        case 'east':
            return {
                minX: x - widthCm,
                maxX: x,
                minY: y - halfHeightCm,
                maxY: y + halfHeightCm
            };
        case 'west':
            return {
                minX: x,
                maxX: x + widthCm,
                minY: y - halfHeightCm,
                maxY: y + halfHeightCm
            };
        case 'north':
            return {
                minX: x - halfWidthCm,
                maxX: x + halfWidthCm,
                minY: y - heightCm,
                maxY: y
            };
        case 'south':
            return {
                minX: x - halfWidthCm,
                maxX: x + halfWidthCm,
                minY: y,
                maxY: y + heightCm
            };
        default:
            return {
                minX: x - halfWidthCm,
                maxX: x + halfWidthCm,
                minY: y - halfHeightCm,
                maxY: y + halfHeightCm
            };
    }
}

function expandTextBox(box: TextBox, deltaXCm: number, deltaYCm: number): TextBox {
    return {
        minX: box.minX - deltaXCm,
        maxX: box.maxX + deltaXCm,
        minY: box.minY - deltaYCm,
        maxY: box.maxY + deltaYCm
    };
}

function doTextBoxesOverlap(left: TextBox, right: TextBox) {
    return !(
        left.maxX <= right.minX ||
        left.minX >= right.maxX ||
        left.maxY <= right.minY ||
        left.minY >= right.maxY
    );
}

function getTextBoxOverlapArea(left: TextBox, right: TextBox) {
    if (!doTextBoxesOverlap(left, right)) {
        return 0;
    }

    return (
        (Math.min(left.maxX, right.maxX) - Math.max(left.minX, right.minX)) *
        (Math.min(left.maxY, right.maxY) - Math.max(left.minY, right.minY))
    );
}

function getTotalTextBoxOverlapArea(box: TextBox, occupiedBoxes: TextBox[]) {
    return occupiedBoxes.reduce(
        (totalOverlapArea, occupiedBox) =>
            totalOverlapArea + getTextBoxOverlapArea(box, occupiedBox),
        0
    );
}

function createProtectedStationLabelBox(x: number, y: number, text: string) {
    const stationMetrics = getTextMetrics(text, 'station');
    const stationLabelBox = createTextBox(
        x,
        y,
        stationMetrics.widthCm,
        stationMetrics.heightCm,
        'east'
    );

    return {
        ...stationLabelBox,
        maxX: Math.max(stationLabelBox.maxX, STATION_LABEL_RIGHT_PROTECTION_X_CM)
    };
}

function createTextPlacement(
    x: number,
    y: number,
    text: string,
    anchor: TextAnchor,
    kind: TextMetricKind
): TextPlacement {
    const textMetrics = getTextMetrics(text, kind);

    return {
        x,
        y,
        text,
        anchor,
        box: createTextBox(
            x,
            y,
            textMetrics.widthCm,
            textMetrics.heightCm,
            anchor
        )
    };
}

function createTopRightTextPlacement(
    x: number,
    y: number,
    text: string,
    kind: TextMetricKind
): TopRightTextPlacement {
    const textMetrics = getTextMetrics(text, kind);

    return {
        x,
        y,
        text,
        box: {
            minX: x - textMetrics.widthCm,
            maxX: x,
            minY: y,
            maxY: y + textMetrics.heightCm
        }
    };
}

function buildMidnightMarkerPlacements(input: {
    axisStartTimestamp: number;
    axisEndTimestamp: number;
    firstGridReferenceTimestamp: number;
    chartBodyHeightCm: number;
    projectTime: (timestamp: number) => number;
}): TextPlacement[] {
    const placements: TextPlacement[] = [];
    let midnightMarkerIndex = 1;

    for (
        let timestamp = input.axisStartTimestamp;
        timestamp <= input.axisEndTimestamp;
        timestamp += 6 * 60 * 60
    ) {
        const isMidnightGridLine =
            (timestamp - input.firstGridReferenceTimestamp) % (24 * 60 * 60) ===
            0;

        if (!isMidnightGridLine) {
            continue;
        }

        placements.push(
            createTextPlacement(
                input.projectTime(timestamp),
                input.chartBodyHeightCm + MIDNIGHT_MARKER_OFFSET_Y_CM,
                String(midnightMarkerIndex),
                'south',
                'marker'
            )
        );
        midnightMarkerIndex += 1;
    }

    return placements;
}

function buildEndpointTimeCandidates(
    nodes: ResolvedCirculationNode[],
    stationYByTelecode: Map<string, number>,
    projectTime: (timestamp: number) => number
): EndpointTimeCandidate[] {
    return nodes.flatMap((node) => {
        const xStart = projectTime(node.start.timestamp);
        const xEnd = projectTime(node.end.timestamp);
        const yStart = stationYByTelecode.get(node.start.stationTelecode) ?? 0;
        const yEnd = stationYByTelecode.get(node.end.stationTelecode) ?? 0;
        const startTimeAboveLine = yEnd < yStart;
        const endTimeAboveLine = yEnd >= yStart;

        return [
            {
                text: formatShanghaiTimeLabel(node.start.timestamp),
                x: xStart,
                y:
                    yStart +
                    (startTimeAboveLine
                        ? ENDPOINT_TIME_OFFSET_Y_CM
                        : -ENDPOINT_TIME_OFFSET_Y_CM),
                anchor: startTimeAboveLine ? 'south' : 'north',
                direction: 'right'
            },
            {
                text: formatShanghaiTimeLabel(node.end.timestamp),
                x: xEnd,
                y:
                    yEnd +
                    (endTimeAboveLine
                        ? ENDPOINT_TIME_OFFSET_Y_CM
                        : -ENDPOINT_TIME_OFFSET_Y_CM),
                anchor: endTimeAboveLine ? 'south' : 'north',
                direction: 'left'
            }
        ];
    });
}

function placeEndpointTimeLabels(
    candidates: EndpointTimeCandidate[],
    occupiedBoxes: TextBox[]
): EndpointTimePlacementResult {
    const placedLabels: EndpointTimePlacement[] = [];
    const sortedCandidates = [...candidates].sort((left, right) => {
        if (left.anchor !== right.anchor) {
            return left.anchor === 'south' ? -1 : 1;
        }
        if (left.anchor === 'south' && left.y !== right.y) {
            return right.y - left.y;
        }
        if (left.anchor === 'north' && left.y !== right.y) {
            return left.y - right.y;
        }
        return left.x - right.x;
    });
    let hadOverlapFallback = false;
    let requiredChartWidthCm = 0;

    for (const candidate of sortedCandidates) {
        let selectedPlacement: EndpointTimePlacement | null = null;
        let fallbackPlacement: EndpointTimePlacement | null = null;
        let fallbackOverlapArea = Number.POSITIVE_INFINITY;
        let usedFallbackPlacement = false;
        const textMetrics = getTextMetrics(candidate.text, 'time');
        const halfWidthCm = textMetrics.widthCm / 2;

        for (let step = 0; step <= ENDPOINT_TIME_MAX_HORIZONTAL_STEPS; step += 1) {
            const candidateX =
                candidate.direction === 'right'
                    ? candidate.x +
                      ENDPOINT_TIME_MIN_X_GAP_CM +
                      halfWidthCm +
                      step * ENDPOINT_TIME_HORIZONTAL_STEP_CM
                    : candidate.x -
                      ENDPOINT_TIME_MIN_X_GAP_CM -
                      halfWidthCm -
                      step * ENDPOINT_TIME_HORIZONTAL_STEP_CM;
            const candidatePlacement = createTextPlacement(
                candidateX,
                candidate.y,
                candidate.text,
                candidate.anchor,
                'time'
            );
            const occupiedBox = expandTextBox(
                candidatePlacement.box,
                ENDPOINT_TIME_MIN_X_GAP_CM / 2,
                0
            );
            const overlapArea = getTotalTextBoxOverlapArea(
                occupiedBox,
                occupiedBoxes
            );

            if (overlapArea === 0) {
                selectedPlacement = {
                    ...candidatePlacement,
                    occupiedBox
                };
                break;
            }

            if (overlapArea < fallbackOverlapArea) {
                fallbackOverlapArea = overlapArea;
                fallbackPlacement = {
                    ...candidatePlacement,
                    occupiedBox
                };
            }
        }

        if (!selectedPlacement) {
            selectedPlacement = fallbackPlacement;
            usedFallbackPlacement = selectedPlacement !== null;
        }
        if (!selectedPlacement) {
            continue;
        }

        if (usedFallbackPlacement && fallbackOverlapArea > 0) {
            hadOverlapFallback = true;
        }

        occupiedBoxes.push(selectedPlacement.occupiedBox);
        placedLabels.push(selectedPlacement);
        requiredChartWidthCm = Math.max(
            requiredChartWidthCm,
            selectedPlacement.occupiedBox.maxX + ENDPOINT_TIME_RIGHT_PADDING_CM
        );
    }

    return {
        placements: placedLabels,
        requiredChartWidthCm,
        hadOverlapFallback
    };
}

function placeTrainLabels(
    nodes: ResolvedCirculationNode[],
    chartWidthCm: number,
    stationYByTelecode: Map<string, number>,
    projectTime: (timestamp: number) => number,
    occupiedBoxes: TextBox[]
) {
    const placedLabels: TextPlacement[] = [];

    for (const node of nodes) {
        const xStart = projectTime(node.start.timestamp);
        const xEnd = projectTime(node.end.timestamp);
        const yStart = stationYByTelecode.get(node.start.stationTelecode) ?? 0;
        const yEnd = stationYByTelecode.get(node.end.stationTelecode) ?? 0;
        const labelText = `${node.trainCodeText}  ${node.start.stationName} → ${node.end.stationName}`;
        const defaultDirection = yEnd > yStart ? 1 : -1;
        let selectedPlacement: TextPlacement | null = null;
        let fallbackPlacement: TextPlacement | null = null;
        let fallbackScore = Number.POSITIVE_INFINITY;

        for (const progress of TRAIN_LABEL_CANDIDATE_PROGRESS) {
            for (const direction of [defaultDirection, -defaultDirection]) {
                const baseX = xStart + (xEnd - xStart) * progress;
                const baseY = yStart + (yEnd - yStart) * progress;
                const placement = createTextPlacement(
                    baseX + direction * TRAIN_LABEL_OFFSET_X_CM,
                    baseY,
                    labelText,
                    direction > 0 ? 'west' : 'east',
                    'train'
                );
                const boundaryViolationCm =
                    Math.max(
                        0,
                        TRAIN_LABEL_SAFE_MIN_X_CM - placement.box.minX
                    ) +
                    Math.max(
                        0,
                        placement.box.maxX -
                            (chartWidthCm - TRAIN_LABEL_SAFE_MAX_X_PADDING_CM)
                    );
                const overlapArea = getTotalTextBoxOverlapArea(
                    placement.box,
                    occupiedBoxes
                );
                const score = overlapArea + boundaryViolationCm * 1000;

                if (
                    boundaryViolationCm === 0 &&
                    overlapArea === 0
                ) {
                    selectedPlacement = placement;
                    break;
                }

                if (score < fallbackScore) {
                    fallbackScore = score;
                    fallbackPlacement = placement;
                }
            }

            if (selectedPlacement) {
                break;
            }
        }

        const finalPlacement = selectedPlacement ?? fallbackPlacement;
        if (!finalPlacement) {
            continue;
        }

        occupiedBoxes.push(finalPlacement.box);
        placedLabels.push(finalPlacement);
    }

    return placedLabels;
}

function buildLatexSource(
    _requestTrainCode: string,
    nodes: ResolvedCirculationNode[],
    stationAxisPoints: StationAxisPoint[],
    _scheduleDate: string,
    headerInfo: TrainCirculationHeaderInfo | null
) {
    const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    const stationYByTelecode = new Map<string, number>();
    const { chartBodyHeightCm, projectedDistanceByTelecode } =
        buildStationAxisLayout(stationAxisPoints);

    for (const stationAxisPoint of stationAxisPoints) {
        stationYByTelecode.set(
            stationAxisPoint.stationTelecode,
            chartBodyHeightCm -
                (projectedDistanceByTelecode.get(
                    stationAxisPoint.stationTelecode
                ) ?? 0)
        );
    }

    const minTimestamp = Math.min(...nodes.map((node) => node.start.timestamp));
    const maxTimestamp = Math.max(...nodes.map((node) => node.end.timestamp));
    const paddingSeconds = 15 * 60;
    const minGridTimestamp = minTimestamp - paddingSeconds;
    const maxGridTimestamp = maxTimestamp + paddingSeconds;
    const timeGridStepSeconds = 6 * 60 * 60;
    const firstGridReferenceTimestamp = getShanghaiDayStartUnixSeconds(
        formatShanghaiDateString(minGridTimestamp * 1000)
    );
    const axisStartTimestamp = roundDownToReferenceStep(
        minGridTimestamp,
        firstGridReferenceTimestamp,
        timeGridStepSeconds
    );
    const axisEndTimestamp = roundUpToReferenceStep(
        maxGridTimestamp,
        firstGridReferenceTimestamp,
        timeGridStepSeconds
    );
    const axisRangeSeconds = Math.max(
        timeGridStepSeconds,
        axisEndTimestamp - axisStartTimestamp
    );
    let chartWidthCm = Math.max(18, axisRangeSeconds / 3600 / 1.2);

    const projectTime = (timestamp: number) =>
        ((timestamp - axisStartTimestamp) / axisRangeSeconds) * chartWidthCm;

    const contentLines: string[] = [];
    const leftLabelX = -0.4;
    const largeCjkFont = '\\fontsize{13.5}{16.5}\\selectfont';
    const trainLabelFont = '\\fontsize{10.8}{13.2}\\selectfont';
    const largeTimeFont = '\\fontsize{10.8}{13.5}\\selectfont';
    const headerFont = '\\fontsize{9.6}{11.8}\\selectfont';
    const footerFont = '\\fontsize{8.1}{10.1}\\selectfont';
    const stationLabelPlacements = stationAxisPoints.map((stationAxisPoint) => {
        const y = stationYByTelecode.get(stationAxisPoint.stationTelecode) ?? 0;
        const placement = createTextPlacement(
            leftLabelX,
            y,
            stationAxisPoint.stationName,
            'east',
            'station'
        );

        return placement;
    });
    const stationLabelOccupiedBoxes = stationLabelPlacements.map((placement) =>
        createProtectedStationLabelBox(leftLabelX, placement.y, placement.text)
    );
    let finalProjectTime = projectTime;
    let midnightMarkerPlacements: TextPlacement[] = [];
    let endpointTimePlacements: EndpointTimePlacement[] = [];
    let occupiedBoxes: TextBox[] = [];

    for (
        let iteration = 0;
        iteration < ENDPOINT_TIME_LAYOUT_MAX_ITERATIONS;
        iteration += 1
    ) {
        const iterationProjectTime = (timestamp: number) =>
            ((timestamp - axisStartTimestamp) / axisRangeSeconds) * chartWidthCm;
        const iterationOccupiedBoxes = [...stationLabelOccupiedBoxes];
        const iterationMidnightMarkerPlacements = buildMidnightMarkerPlacements({
            axisStartTimestamp,
            axisEndTimestamp,
            firstGridReferenceTimestamp,
            chartBodyHeightCm,
            projectTime: iterationProjectTime
        });
        for (const placement of iterationMidnightMarkerPlacements) {
            iterationOccupiedBoxes.push(placement.box);
        }

        const endpointTimePlacementResult = placeEndpointTimeLabels(
            buildEndpointTimeCandidates(
                nodes,
                stationYByTelecode,
                iterationProjectTime
            ),
            iterationOccupiedBoxes
        );
        const nextChartWidthCm = Math.max(
            chartWidthCm,
            endpointTimePlacementResult.requiredChartWidthCm
        );

        if (nextChartWidthCm > chartWidthCm + 1e-6) {
            chartWidthCm = nextChartWidthCm;
            continue;
        }

        if (
            endpointTimePlacementResult.hadOverlapFallback &&
            iteration < ENDPOINT_TIME_LAYOUT_MAX_ITERATIONS - 1
        ) {
            chartWidthCm += ENDPOINT_TIME_RELAYOUT_GROWTH_CM;
            continue;
        }

        finalProjectTime = iterationProjectTime;
        midnightMarkerPlacements = iterationMidnightMarkerPlacements;
        endpointTimePlacements = endpointTimePlacementResult.placements;
        occupiedBoxes = [
            ...iterationOccupiedBoxes,
            ...endpointTimePlacements.map((placement) => placement.occupiedBox)
        ];
        break;
    }

    if (endpointTimePlacements.length === 0 && nodes.length > 0) {
        finalProjectTime = (timestamp: number) =>
            ((timestamp - axisStartTimestamp) / axisRangeSeconds) * chartWidthCm;
        midnightMarkerPlacements = buildMidnightMarkerPlacements({
            axisStartTimestamp,
            axisEndTimestamp,
            firstGridReferenceTimestamp,
            chartBodyHeightCm,
            projectTime: finalProjectTime
        });
        occupiedBoxes = [
            ...stationLabelOccupiedBoxes,
            ...midnightMarkerPlacements.map((placement) => placement.box)
        ];
        endpointTimePlacements = placeEndpointTimeLabels(
            buildEndpointTimeCandidates(
                nodes,
                stationYByTelecode,
                finalProjectTime
            ),
            occupiedBoxes
        ).placements;
        occupiedBoxes.push(
            ...endpointTimePlacements.map((placement) => placement.occupiedBox)
        );
    }

    const trainLabelPlacements = placeTrainLabels(
        nodes,
        chartWidthCm,
        stationYByTelecode,
        finalProjectTime,
        occupiedBoxes
    );
    const allTextBoxes = [
        ...stationLabelPlacements.map((placement) => placement.box),
        ...midnightMarkerPlacements.map((placement) => placement.box),
        ...endpointTimePlacements.map((placement) => placement.box),
        ...trainLabelPlacements.map((placement) => placement.box)
    ];
    const headerPlacement =
        headerInfo === null
            ? null
            : createTopRightTextPlacement(
                  chartWidthCm,
                  chartBodyHeightCm + HEADER_INFO_OFFSET_Y_CM,
                  headerInfo.text,
                  'train'
              );
    if (headerPlacement) {
        allTextBoxes.push(headerPlacement.box);
    }
    const minTextY = allTextBoxes.reduce(
        (currentMinY, box) => Math.min(currentMinY, box.minY),
        0
    );
    const maxTextY = allTextBoxes.reduce(
        (currentMaxY, box) => Math.max(currentMaxY, box.maxY),
        chartBodyHeightCm
    );
    const shiftYCm = Math.max(0, PLOT_BOTTOM_PADDING_CM - minTextY);
    const chartBottomY = shiftYCm;
    const chartTopY = shiftYCm + chartBodyHeightCm;
    const chartHeightCm = shiftYCm + maxTextY + PLOT_TOP_PADDING_CM;

    for (
        let timestamp = axisStartTimestamp;
        timestamp <= axisEndTimestamp;
        timestamp += timeGridStepSeconds
    ) {
        const x = finalProjectTime(timestamp);
        const isMidnightGridLine =
            (timestamp - firstGridReferenceTimestamp) % (24 * 60 * 60) === 0;
        contentLines.push(
            `\\draw[line width=${isMidnightGridLine ? '0.04' : '0.01'}cm, ${isMidnightGridLine ? 'black' : 'gray!15'}] (${formatCoordinate(x)}, ${formatCoordinate(chartBottomY)}) -- (${formatCoordinate(x)}, ${formatCoordinate(chartTopY)});`
        );
    }

    for (const placement of midnightMarkerPlacements) {
        contentLines.push(
            `\\node[anchor=${placement.anchor},font=${largeTimeFont},text=black] at (${formatCoordinate(placement.x)}, ${formatCoordinate(placement.y + shiftYCm)}) ${quoteTikzText(placement.text)};`
        );
    }

    for (const stationAxisPoint of stationAxisPoints) {
        const y =
            (stationYByTelecode.get(stationAxisPoint.stationTelecode) ?? 0) +
            shiftYCm;
        contentLines.push(
            `\\draw[line width=0.02cm, black] (${formatCoordinate(0)}, ${formatCoordinate(y)}) -- (${formatCoordinate(chartWidthCm)}, ${formatCoordinate(y)});`
        );
    }

    for (const placement of stationLabelPlacements) {
        contentLines.push(
            `\\node[anchor=east,font=${largeCjkFont},align=right] at (${formatCoordinate(placement.x)}, ${formatCoordinate(placement.y + shiftYCm)}) ${quoteTikzText(placement.text)};`
        );
    }

    nodes.forEach((node, index) => {
        const xStart = finalProjectTime(node.start.timestamp);
        const xEnd = finalProjectTime(node.end.timestamp);
        const yStart =
            (stationYByTelecode.get(node.start.stationTelecode) ?? 0) + shiftYCm;
        const yEnd =
            (stationYByTelecode.get(node.end.stationTelecode) ?? 0) + shiftYCm;
        const drawColor = index % 2 === 0 ? 'blue!70!black' : 'teal!70!black';

        contentLines.push(
            `\\draw[line width=0.08cm, ${drawColor}] (${formatCoordinate(xStart)}, ${formatCoordinate(yStart)}) -- (${formatCoordinate(xEnd)}, ${formatCoordinate(yEnd)});`
        );
        contentLines.push(
            `\\fill[${drawColor}] (${formatCoordinate(xStart)}, ${formatCoordinate(yStart)}) circle[radius=0.06cm];`
        );
        contentLines.push(
            `\\fill[${drawColor}] (${formatCoordinate(xEnd)}, ${formatCoordinate(yEnd)}) circle[radius=0.06cm];`
        );
    });

    for (const placement of endpointTimePlacements) {
        contentLines.push(
            `\\node[fill=white,inner sep=1.1pt,font=${largeTimeFont},anchor=${placement.anchor}] at (${formatCoordinate(placement.x)}, ${formatCoordinate(placement.y + shiftYCm)}) ${quoteTikzText(placement.text)};`
        );
    }

    for (const placement of trainLabelPlacements) {
        contentLines.push(
            `\\node[fill=white,inner sep=2pt,font=${trainLabelFont},anchor=${placement.anchor}] at (${formatCoordinate(placement.x)}, ${formatCoordinate(placement.y + shiftYCm)}) ${quoteTikzText(placement.text)};`
        );
    }

    if (headerPlacement) {
        contentLines.push(
            `\\node[fill=white,inner sep=2pt,font=${headerFont},anchor=south east,align=right] at (${formatCoordinate(chartWidthCm)}, ${formatCoordinate(headerPlacement.y + shiftYCm)}) ${quoteTikzText(headerPlacement.text)};`
        );
    }

    contentLines.push(
        `\\node[anchor=south east,font=${footerFont},text=black,align=right] at (${formatCoordinate(chartWidthCm)}, ${formatCoordinate(0)}) ${quoteTikzText('算法生成，仅供参考 | Open CRH Tracker')};`
    );

    return template.replace('__CONTENT__', contentLines.join('\n'));
}

async function fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number
) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            ...init,
            signal: controller.signal
        });
    } catch {
        throw new ApiRequestError(
            502,
            'upstream_unavailable',
            '运行图渲染服务暂时不可用'
        );
    } finally {
        clearTimeout(timeoutHandle);
    }
}

function parseLatexCompileEnvelope(payload: unknown): LatexCompileResult {
    const envelope = asRecord(payload);
    if (!envelope || typeof envelope.ok !== 'boolean') {
        throw new ApiRequestError(
            502,
            'upstream_unavailable',
            '运行图渲染服务返回了无效响应'
        );
    }

    if (!envelope.ok) {
        const errorMessage = getNonEmptyString(envelope.error);
        throw new ApiRequestError(
            502,
            'upstream_compile_failed',
            errorMessage.length > 0
                ? `运行图编译失败：${errorMessage}`
                : '运行图编译失败，请稍后再试'
        );
    }

    const compilePayload = asRecord(envelope.data) as LatexCompileSuccessPayload | null;
    const documentId = getNonEmptyString(compilePayload?.id);
    const pageCount = compilePayload?.pageNumber;

    if (
        !/^[a-f0-9]{64}$/.test(documentId) ||
        typeof pageCount !== 'number' ||
        !Number.isInteger(pageCount) ||
        pageCount < 1
    ) {
        throw new ApiRequestError(
            502,
            'upstream_unavailable',
            '运行图渲染服务返回了无效响应'
        );
    }

    if (typeof compilePayload?.cacheHit !== 'boolean') {
        throw new ApiRequestError(
            502,
            'upstream_unavailable',
            '运行图渲染服务返回了无效响应'
        );
    }

    return {
        id: documentId,
        pageCount,
        cacheHit: compilePayload.cacheHit
    };
}

async function compileLatexDocument(latexSource: string) {
    const config = useConfig();
    const baseUrl = config.services.simpleLatexContainer.baseUrl;
    const response = await fetchWithTimeout(
        `${baseUrl}/code`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.services.simpleLatexContainer.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                payload: latexSource
            })
        },
        20_000
    );

    if (!response.ok) {
        throw new ApiRequestError(
            502,
            'upstream_unavailable',
            '运行图渲染服务暂时不可用'
        );
    }

    return parseLatexCompileEnvelope((await response.json()) as unknown);
}

async function fetchBinaryContent(
    imageUrl: string,
    format: TrainCirculationImageFormat
) {
    const response = await fetchWithTimeout(
        imageUrl,
        {
            method: 'GET'
        },
        20_000
    );

    if (!response.ok) {
        throw new ApiRequestError(
            502,
            'upstream_unavailable',
            format === 'pdf' ? '运行图 PDF 暂时不可用' : '运行图图片暂时不可用'
        );
    }

    return new Uint8Array(await response.arrayBuffer());
}

function resolveCurrentCirculation(trainCode: string) {
    const timetable = getTodayScheduleTimetableByTrainCode(trainCode);
    if (!timetable || timetable.stops.length === 0) {
        throw new ApiRequestError(404, 'not_found', '当前暂无时刻表');
    }

    const circulation = getPreferredTrainCirculation({
        trainInternalCode: timetable.trainInternalCode,
        allCodes: timetable.allCodes
    });
    if (!circulation || circulation.nodes.length === 0) {
        throw new ApiRequestError(404, 'not_found', '当前暂无交路数据');
    }

    return {
        timetable,
        circulation
    };
}

function resolvePublishedScheduleState() {
    const scheduleFilePath = useConfig().data.assets.schedule.file;
    const document = loadScheduleDocument(scheduleFilePath);
    if (!document?.published || document.published.date !== getCurrentDateString()) {
        throw new ApiRequestError(404, 'not_found', '当前暂无时刻表');
    }

    return {
        date: document.published.date,
        items: document.published.items,
        stations: document.stations
    };
}

export async function renderTrainCirculationImage(
    requestTrainCode: string,
    binaryRequested: boolean,
    format: TrainCirculationImageFormat
): Promise<TrainCirculationImageRenderResult> {
    const { timetable, circulation } = resolveCurrentCirculation(requestTrainCode);
    const publishedScheduleState = resolvePublishedScheduleState();
    const headerInfo = buildTrainCirculationHeaderInfo({
        bureauCode: timetable.bureauCode,
        trainDepartment: timetable.trainDepartment,
        passengerDepartment: timetable.passengerDepartment,
        allCodes: timetable.allCodes
    });
    const resolvedNodes = buildResolvedCirculationNodes(
        publishedScheduleState.date,
        circulation,
        publishedScheduleState.items,
        publishedScheduleState.stations
    );
    const stationAxisPoints = buildStationAxisPoints(resolvedNodes);
    const latexSource = buildLatexSource(
        requestTrainCode,
        resolvedNodes,
        stationAxisPoints,
        publishedScheduleState.date,
        headerInfo
    );
    const compileResult = await compileLatexDocument(latexSource);
    const imageUrl = buildImageUrl(
        useConfig().services.simpleLatexContainer.baseUrl,
        compileResult.id,
        format,
        1
    );
    const binaryContent = binaryRequested
        ? await fetchBinaryContent(imageUrl, format)
        : null;

    return {
        requestTrainCode,
        trainCode: timetable.trainCode,
        documentId: compileResult.id,
        cacheHit: compileResult.cacheHit,
        imageUrl,
        binaryContent,
        binaryContentType: getBinaryContentType(format)
    };
}

export function toTrainCirculationImageData(
    result: TrainCirculationImageRenderResult
): TrainCirculationImageData {
    return {
        requestTrainCode: result.requestTrainCode,
        trainCode: result.trainCode,
        documentId: result.documentId,
        imageUrl: result.imageUrl
    };
}
