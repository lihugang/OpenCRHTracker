import fs from 'fs';
import path from 'path';
import useConfig from '~/server/config';
import { getReferenceModelsByTrainCodes } from '~/server/services/referenceModelIndexStore';
import { getPreferredTrainCirculation } from '~/server/services/trainCirculationIndexStore';
import { getTodayScheduleTimetableByTrainCode } from '~/server/services/todayScheduleCache';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import { ensureScheduleDocumentMigrated } from '~/server/utils/12306/scheduleProbe/stateStore';
import {
    listScheduleCandidateItemsForCodes,
    loadScheduleStateSummaries,
    loadScheduleStationsByTelecodes
} from '~/server/utils/12306/scheduleProbe/sqliteStore';
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
import type {
    TrainCirculation,
    TrainCirculationImageData
} from '~/types/lookup';
import resolveBureauNameByCode from '~/utils/railway/resolveBureauNameByCode';

interface TypstCompileSuccessPayload {
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

interface TypstCompileResult {
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

const TEMPLATE_PATH = path.resolve('assets/typst/train-circulation-image.typ');
const DOCUMENT_BORDER_CM = 10 / 28.3464567;
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

interface TrainCirculationHeaderInfo {
    text: string;
}

type TypstLiteral =
    | null
    | boolean
    | number
    | string
    | TypstLiteral[]
    | { [key: string]: TypstLiteral };

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

function quoteTypstText(value: string) {
    return JSON.stringify(value);
}

function formatCoordinate(value: number) {
    return value.toFixed(3);
}

function formatTypstNumber(value: number) {
    if (!Number.isFinite(value)) {
        throw new Error('Typst literal only supports finite numbers');
    }

    if (Object.is(value, -0)) {
        return '0';
    }

    if (Number.isInteger(value)) {
        return String(value);
    }

    return value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

function serializeTypstLiteral(value: TypstLiteral): string {
    if (value === null) {
        return 'none';
    }
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }
    if (typeof value === 'number') {
        return formatTypstNumber(value);
    }
    if (typeof value === 'string') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        if (value.length === 0) {
            return '()';
        }

        const serializedItems = value.map((item) =>
            serializeTypstLiteral(item)
        );
        return `(${serializedItems.join(', ')}${value.length === 1 ? ',' : ''})`;
    }

    const entries = Object.entries(value);
    if (entries.length === 0) {
        throw new Error('Typst literal does not support empty objects');
    }

    return `(${entries
        .map(([key, entryValue]) => {
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
                throw new Error(`Unsupported Typst literal key: ${key}`);
            }

            return `${key}: ${serializeTypstLiteral(entryValue)}`;
        })
        .join(', ')})`;
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

function roundUpToReferenceStep(
    value: number,
    reference: number,
    step: number
) {
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
    const overlapCount = nodeCodes.filter((code) =>
        itemCodes.includes(code)
    ).length;
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
            for (const item of indexes.itemsByInternalCode.get(internalCode) ??
                []) {
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

async function buildTrainCirculationHeaderInfo(input: {
    bureauCode: string;
    trainDepartment: string;
    passengerDepartment: string;
    allCodes: string[];
}): Promise<TrainCirculationHeaderInfo | null> {
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

    const primaryReferenceModel = (
        await getReferenceModelsByTrainCodes(input.allCodes)
    )[0];
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
        return kind === 'time' || kind === 'marker' ? 0.08 : 0.12;
    }

    if (/[\u3400-\u9fff\uf900-\ufaff]/u.test(character)) {
        switch (kind) {
            case 'station':
                return 0.49;
            case 'train':
                return 0.39;
            case 'time':
            case 'marker':
                return 0.36;
            default:
                return 0.39;
        }
    }

    if (/[A-Za-z0-9]/.test(character)) {
        switch (kind) {
            case 'station':
                return 0.26;
            case 'train':
                return 0.2;
            case 'time':
            case 'marker':
                return 0.18;
            default:
                return 0.2;
        }
    }

    switch (kind) {
        case 'station':
            return 0.3;
        case 'train':
            return 0.16;
        case 'time':
        case 'marker':
            return 0.14;
        default:
            return 0.16;
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

function expandTextBox(
    box: TextBox,
    deltaXCm: number,
    deltaYCm: number
): TextBox {
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
        maxX: Math.max(
            stationLabelBox.maxX,
            STATION_LABEL_RIGHT_PROTECTION_X_CM
        )
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

        for (
            let step = 0;
            step <= ENDPOINT_TIME_MAX_HORIZONTAL_STEPS;
            step += 1
        ) {
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

                if (boundaryViolationCm === 0 && overlapArea === 0) {
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

function getTypstColor(value: string) {
    return `rgb(${quoteTypstText(value)})`;
}

function buildTypstStroke(color: string, thicknessCm: number) {
    return `(paint: ${getTypstColor(color)}, thickness: ${formatCoordinate(thicknessCm)}cm)`;
}

function toTypstX(shiftXCm: number, x: number) {
    return shiftXCm + x;
}

function toTypstY(chartHeightCm: number, y: number) {
    return DOCUMENT_BORDER_CM + chartHeightCm - y;
}

function pushTypstLine(
    contentLines: string[],
    input: {
        chartHeightCm: number;
        shiftXCm: number;
        xStart: number;
        yStart: number;
        xEnd: number;
        yEnd: number;
        strokeColor: string;
        strokeWidthCm: number;
    }
) {
    const xStart = toTypstX(input.shiftXCm, input.xStart);
    const yStart = toTypstY(input.chartHeightCm, input.yStart);
    const xEnd = toTypstX(input.shiftXCm, input.xEnd);
    const yEnd = toTypstY(input.chartHeightCm, input.yEnd);
    const dx = xEnd - xStart;
    const dy = yEnd - yStart;
    const lengthCm = Math.hypot(dx, dy);
    if (lengthCm <= 0) {
        return;
    }

    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    contentLines.push(
        `#place(dx: ${formatCoordinate(xStart)}cm, dy: ${formatCoordinate(yStart)}cm, line(length: ${formatCoordinate(lengthCm)}cm, angle: ${formatCoordinate(angleDeg)}deg, stroke: ${buildTypstStroke(input.strokeColor, input.strokeWidthCm)}))`
    );
}

function pushTypstCircle(
    contentLines: string[],
    input: {
        chartHeightCm: number;
        shiftXCm: number;
        x: number;
        y: number;
        radiusCm: number;
        fillColor: string;
    }
) {
    contentLines.push(
        `#place(dx: ${formatCoordinate(toTypstX(input.shiftXCm, input.x) - input.radiusCm)}cm, dy: ${formatCoordinate(toTypstY(input.chartHeightCm, input.y) - input.radiusCm)}cm, circle(radius: ${formatCoordinate(input.radiusCm)}cm, fill: ${getTypstColor(input.fillColor)}))`
    );
}

function buildShiftedTextPlacement(
    placement: TextPlacement,
    shiftYCm: number
): TextPlacement {
    return {
        ...placement,
        y: placement.y + shiftYCm,
        box: {
            minX: placement.box.minX,
            maxX: placement.box.maxX,
            minY: placement.box.minY + shiftYCm,
            maxY: placement.box.maxY + shiftYCm
        }
    };
}

function buildShiftedTopRightTextPlacement(
    placement: TopRightTextPlacement,
    shiftYCm: number
): TopRightTextPlacement {
    return {
        ...placement,
        y: placement.y + shiftYCm,
        box: {
            minX: placement.box.minX,
            maxX: placement.box.maxX,
            minY: placement.box.minY + shiftYCm,
            maxY: placement.box.maxY + shiftYCm
        }
    };
}

function getTextAlign(anchor: TextAnchor): 'left' | 'right' | 'center' {
    switch (anchor) {
        case 'east':
            return 'right';
        case 'west':
            return 'left';
        case 'north':
        case 'south':
            return 'center';
        default:
            return 'center';
    }
}

function pushTypstTextBox(
    contentLines: string[],
    input: {
        chartHeightCm: number;
        shiftXCm: number;
        box: TextBox;
        text: string;
        fontSizePt: number;
        align: 'left' | 'right' | 'center';
        textColor?: string;
        fillColor?: string;
        insetPt?: number;
        verticalAlign?: 'top' | 'middle';
    }
) {
    const widthCm = Math.max(0.01, input.box.maxX - input.box.minX);
    const verticalAlign = input.verticalAlign ?? 'top';
    const yCm =
        verticalAlign === 'middle'
            ? DOCUMENT_BORDER_CM +
              input.chartHeightCm -
              (input.box.minY + input.box.maxY) / 2
            : DOCUMENT_BORDER_CM + input.chartHeightCm - input.box.maxY;

    contentLines.push(
        `#opencrhTextBox(${formatCoordinate(toTypstX(input.shiftXCm, input.box.minX))}cm, ${formatCoordinate(yCm)}cm, ${formatCoordinate(widthCm)}cm, ${quoteTypstText(input.align)}, ${formatCoordinate(input.fontSizePt)}pt, ${getTypstColor(input.textColor ?? '#000000')}, ${input.fillColor ? getTypstColor(input.fillColor) : 'none'}, ${formatCoordinate(input.insetPt ?? 0)}pt, ${quoteTypstText(verticalAlign)}, ${quoteTypstText(input.text)})`
    );
}

function buildTypstSource(
    _requestTrainCode: string,
    nodes: ResolvedCirculationNode[],
    stationAxisPoints: StationAxisPoint[],
    _scheduleDate: string,
    headerInfo: TrainCirculationHeaderInfo | null
) {
    const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
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
    const ticks: TypstLiteral[] = [];
    let midnightMarkerIndex = 1;

    for (
        let timestamp = axisStartTimestamp;
        timestamp <= axisEndTimestamp;
        timestamp += timeGridStepSeconds
    ) {
        const isMidnight =
            (timestamp - firstGridReferenceTimestamp) % (24 * 60 * 60) === 0;
        ticks.push({
            timestamp,
            isMidnight,
            midnightIndex: isMidnight ? midnightMarkerIndex : null
        });

        if (isMidnight) {
            midnightMarkerIndex += 1;
        }
    }

    const renderData: TypstLiteral = {
        layout: {
            documentBorderCm: DOCUMENT_BORDER_CM,
            minStationGapCm: MIN_STATION_GAP_CM,
            plotTopPaddingCm: PLOT_TOP_PADDING_CM,
            plotBottomPaddingCm: PLOT_BOTTOM_PADDING_CM,
            endpointTimeMinXGapCm: ENDPOINT_TIME_MIN_X_GAP_CM,
            endpointTimeHorizontalStepCm: ENDPOINT_TIME_HORIZONTAL_STEP_CM,
            endpointTimeMaxHorizontalSteps: ENDPOINT_TIME_MAX_HORIZONTAL_STEPS,
            endpointTimeLayoutMaxIterations:
                ENDPOINT_TIME_LAYOUT_MAX_ITERATIONS,
            endpointTimeRelayoutGrowthCm: ENDPOINT_TIME_RELAYOUT_GROWTH_CM,
            endpointTimeRightPaddingCm: ENDPOINT_TIME_RIGHT_PADDING_CM,
            trainLabelSafeMinXCm: TRAIN_LABEL_SAFE_MIN_X_CM,
            trainLabelSafeMaxXPaddingCm: TRAIN_LABEL_SAFE_MAX_X_PADDING_CM,
            trainLabelCandidateProgress: [...TRAIN_LABEL_CANDIDATE_PROGRESS],
            trainLabelOffsetXCm: TRAIN_LABEL_OFFSET_X_CM,
            endpointTimeOffsetYCm: ENDPOINT_TIME_OFFSET_Y_CM,
            midnightMarkerOffsetYCm: MIDNIGHT_MARKER_OFFSET_Y_CM,
            headerInfoOffsetYCm: HEADER_INFO_OFFSET_Y_CM,
            stationLabelRightProtectionXCm: STATION_LABEL_RIGHT_PROTECTION_X_CM
        },
        styles: {
            leftLabelXCm: -0.4,
            largeCjkFontPt: 13.5,
            trainLabelFontPt: 10.8,
            largeTimeFontPt: 10.8,
            headerFontPt: 9.6,
            footerFontPt: 8.1,
            gridLineColor: '#e5e7eb',
            midnightLineColor: '#000000',
            stationLineColor: '#000000',
            blueLineColor: '#0000b3',
            tealLineColor: '#005a5a',
            whiteColor: '#ffffff',
            blackColor: '#000000'
        },
        timeAxis: {
            axisStartTimestamp,
            axisEndTimestamp,
            axisRangeSeconds,
            timeGridStepSeconds,
            ticks
        },
        stations: stationAxisPoints.map((stationAxisPoint) => ({
            stationTelecode: stationAxisPoint.stationTelecode,
            stationName: stationAxisPoint.stationName,
            lat: stationAxisPoint.lat,
            lon: stationAxisPoint.lon,
            cumulativeDistanceKm: stationAxisPoint.cumulativeDistanceKm
        })),
        nodes: nodes.map((node) => ({
            routeNodeIndex: node.routeNodeIndex,
            trainCodes: node.trainCodes,
            trainCodeText: node.trainCodeText,
            labelText: `${node.trainCodeText}  ${node.start.stationName} → ${node.end.stationName}`,
            start: {
                stationName: node.start.stationName,
                stationTelecode: node.start.stationTelecode,
                timestamp: node.start.timestamp,
                timeText: formatShanghaiTimeLabel(node.start.timestamp)
            },
            end: {
                stationName: node.end.stationName,
                stationTelecode: node.end.stationTelecode,
                timestamp: node.end.timestamp,
                timeText: formatShanghaiTimeLabel(node.end.timestamp)
            }
        })),
        headerText: headerInfo?.text ?? null,
        footerText: '算法生成，仅供参考 | Open CRH Tracker'
    };

    return template.replace(
        '__RENDER_DATA__',
        serializeTypstLiteral(renderData)
    );
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
            '交路图渲染服务暂时不可用'
        );
    } finally {
        clearTimeout(timeoutHandle);
    }
}

function parseTypstCompileEnvelope(payload: unknown): TypstCompileResult {
    const envelope = asRecord(payload);
    if (!envelope || typeof envelope.ok !== 'boolean') {
        throw new ApiRequestError(
            502,
            'upstream_unavailable',
            '交路图渲染服务返回了无效响应'
        );
    }

    if (!envelope.ok) {
        const errorMessage = getNonEmptyString(envelope.error);
        throw new ApiRequestError(
            502,
            'upstream_compile_failed',
            errorMessage.length > 0
                ? `交路图编译失败：${errorMessage}`
                : '交路图编译失败，请稍后再试'
        );
    }

    const compilePayload = asRecord(
        envelope.data
    ) as TypstCompileSuccessPayload | null;
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
            '交路图渲染服务返回了无效响应'
        );
    }

    if (typeof compilePayload?.cacheHit !== 'boolean') {
        throw new ApiRequestError(
            502,
            'upstream_unavailable',
            '交路图渲染服务返回了无效响应'
        );
    }

    return {
        id: documentId,
        pageCount,
        cacheHit: compilePayload.cacheHit
    };
}

async function compileTypstDocument(typstSource: string) {
    const config = useConfig();
    const baseUrl = config.services.typstCompiler.baseUrl;
    const response = await fetchWithTimeout(
        `${baseUrl}/code?engine=typst`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.services.typstCompiler.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                payload: typstSource
            })
        },
        20_000
    );

    if (!response.ok) {
        throw new ApiRequestError(
            502,
            'upstream_unavailable',
            '交路图渲染服务暂时不可用'
        );
    }

    return parseTypstCompileEnvelope((await response.json()) as unknown);
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
            format === 'pdf' ? '交路图 PDF 暂时不可用' : '交路图图片暂时不可用'
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

function resolvePublishedScheduleProjection(circulation: TrainCirculation) {
    if (!ensureScheduleDocumentMigrated()) {
        throw new ApiRequestError(404, 'not_found', '当前暂无时刻表');
    }

    const currentDate = getCurrentDateString();
    const publishedSummary =
        loadScheduleStateSummaries().find(
            (summary) => summary.kind === 'published'
        ) ?? null;
    if (!publishedSummary || publishedSummary.date !== currentDate) {
        throw new ApiRequestError(404, 'not_found', '当前暂无时刻表');
    }

    const items = listScheduleCandidateItemsForCodes('published', {
        internalCodes: circulation.nodes.map((node) => node.internalCode),
        aliasCodes: circulation.nodes.flatMap((node) => node.allCodes)
    });
    const stations = loadScheduleStationsByTelecodes(
        items.flatMap((item) => item.stops.map((stop) => stop.stationTelecode))
    );

    return {
        date: publishedSummary.date,
        items,
        stations
    };
}

export async function renderTrainCirculationImage(
    requestTrainCode: string,
    binaryRequested: boolean,
    format: TrainCirculationImageFormat
): Promise<TrainCirculationImageRenderResult> {
    const { timetable, circulation } =
        resolveCurrentCirculation(requestTrainCode);
    const publishedScheduleState =
        resolvePublishedScheduleProjection(circulation);
    const headerInfo = await buildTrainCirculationHeaderInfo({
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
    const typstSource = buildTypstSource(
        requestTrainCode,
        resolvedNodes,
        stationAxisPoints,
        publishedScheduleState.date,
        headerInfo
    );
    const compileResult = await compileTypstDocument(typstSource);
    const imageUrl = buildImageUrl(
        useConfig().services.typstCompiler.baseUrl,
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
