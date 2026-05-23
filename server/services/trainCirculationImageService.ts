import fs from 'fs';
import path from 'path';
import useConfig from '~/server/config';
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

interface LatexCompileSuccessPayload {
    id?: unknown;
    pageNumber?: unknown;
}

interface ResolvedScheduleTerminal {
    stationName: string;
    stationTelecode: string;
    timestamp: number;
    station: ScheduleStationEntry;
}

interface ResolvedCirculationNode {
    routeNodeIndex: number;
    trainCode: string;
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
}

export interface TrainCirculationImageRenderResult {
    requestTrainCode: string;
    trainCode: string;
    documentId: string;
    imageUrl: string;
    pngContent: Uint8Array | null;
}

const TEMPLATE_PATH = path.resolve('assets/latex/train-circulation-image.tex');
const SHANGHAI_TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
});

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

function buildImageUrl(baseUrl: string, documentId: string, pageNumber: number) {
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
    return `${normalizedBaseUrl}/${documentId}/png/${pageNumber}`;
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

function buildScheduleIndexes(items: ScheduleItem[]) {
    const itemsByInternalCode = new Map<string, ScheduleItem[]>();
    const itemsByTrainCode = new Map<string, ScheduleItem[]>();

    for (const item of items) {
        const internalCode = normalizeCode(item.internalCode);
        if (internalCode.length > 0) {
            const internalCodeItems =
                itemsByInternalCode.get(internalCode) ?? [];
            internalCodeItems.push(item);
            itemsByInternalCode.set(internalCode, internalCodeItems);
        }

        const allCodes = uniqueNormalizedCodes([item.code, ...item.allCodes]);
        for (const code of allCodes) {
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
    item: ScheduleItem,
    type: 'start' | 'end'
): ScheduleStop | null {
    const stop = item.stops.find((currentStop) =>
        type === 'start' ? currentStop.isStart : currentStop.isEnd
    );
    if (stop) {
        return stop;
    }

    if (item.stops.length === 0) {
        return null;
    }

    return type === 'start' ? item.stops[0]! : item.stops[item.stops.length - 1]!;
}

function scoreScheduleItemMatch(
    item: ScheduleItem,
    node: TrainCirculation['nodes'][number]
) {
    let score = 0;
    const normalizedInternalCode = normalizeCode(node.internalCode);
    const normalizedItemInternalCode = normalizeCode(item.internalCode);

    if (
        normalizedInternalCode.length > 0 &&
        normalizedItemInternalCode === normalizedInternalCode
    ) {
        score += 8;
    }

    const itemCodes = uniqueNormalizedCodes([item.code, ...item.allCodes]);
    const nodeCodes = uniqueNormalizedCodes(node.allCodes);
    const overlapCount = nodeCodes.filter((code) => itemCodes.includes(code)).length;
    score += overlapCount * 4;

    if (item.startStation.trim() === node.startStation.trim()) {
        score += 2;
    }
    if (item.endStation.trim() === node.endStation.trim()) {
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
    items: ScheduleItem[],
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
    item: ScheduleItem,
    node: TrainCirculation['nodes'][number],
    routeNodeIndex: number
): ResolvedCirculationNode {
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

    if (item.startAt === null || item.endAt === null) {
        throw new ApiRequestError(
            422,
            'invalid_schedule_data',
            `交路节点 ${node.allCodes[0] ?? node.internalCode} 缺少发到时间`
        );
    }

    return {
        routeNodeIndex,
        trainCode: node.allCodes[0] ?? item.code,
        start: {
            stationName: startStop.stationName.trim(),
            stationTelecode: normalizeCode(startStop.stationTelecode),
            timestamp: toUnixSecondsFromShanghaiDayOffset(
                scheduleDate,
                item.startAt
            ),
            station: startStation
        },
        end: {
            stationName: endStop.stationName.trim(),
            stationTelecode: normalizeCode(endStop.stationTelecode),
            timestamp: toUnixSecondsFromShanghaiDayOffset(
                scheduleDate,
                item.endAt
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
    const indexes = buildScheduleIndexes(items);
    const resolvedNodes: ResolvedCirculationNode[] = [];

    circulation.nodes.forEach((node, routeNodeIndex) => {
        const internalCode = normalizeCode(node.internalCode);
        const candidateMap = new Map<ScheduleItem, ScheduleItem>();

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

function buildLatexSource(
    _requestTrainCode: string,
    nodes: ResolvedCirculationNode[],
    stationAxisPoints: StationAxisPoint[],
    _scheduleDate: string
) {
    const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    const stationYByTelecode = new Map<string, number>();
    const maxStationDistanceKm =
        stationAxisPoints[stationAxisPoints.length - 1]?.cumulativeDistanceKm ?? 0;
    const chartHeightCm = Math.max(
        8,
        stationAxisPoints.length * 0.9,
        maxStationDistanceKm / 180
    ) * 2;
    const yScale =
        maxStationDistanceKm > 0 ? chartHeightCm / maxStationDistanceKm : 1;

    for (const stationAxisPoint of stationAxisPoints) {
        stationYByTelecode.set(
            stationAxisPoint.stationTelecode,
            chartHeightCm - stationAxisPoint.cumulativeDistanceKm * yScale
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
    const chartWidthCm = Math.max(18, axisRangeSeconds / 3600 / 1.2);

    const projectTime = (timestamp: number) =>
        ((timestamp - axisStartTimestamp) / axisRangeSeconds) * chartWidthCm;

    const contentLines: string[] = [];
    const leftLabelX = -0.4;
    const trainLabelOffsetX = 0.32;
    const endpointTimeOffsetX = 0.32;
    const endpointTimeOffsetY = 0.16;
    let midnightMarkerIndex = 1;
    const largeCjkFont = '\\fontsize{13.5}{16.5}\\selectfont';
    const trainLabelFont = '\\fontsize{10.8}{13.2}\\selectfont';
    const largeTimeFont = '\\fontsize{10.8}{13.5}\\selectfont';
    const footerFont = '\\fontsize{8.1}{10.1}\\selectfont';

    for (
        let timestamp = axisStartTimestamp;
        timestamp <= axisEndTimestamp;
        timestamp += timeGridStepSeconds
    ) {
        const x = projectTime(timestamp);
        const isMidnightGridLine =
            (timestamp - firstGridReferenceTimestamp) % (24 * 60 * 60) === 0;
        contentLines.push(
            `\\draw[line width=${isMidnightGridLine ? '0.04' : '0.01'}cm, ${isMidnightGridLine ? 'black' : 'gray!15'}] (${formatCoordinate(x)}, ${formatCoordinate(0)}) -- (${formatCoordinate(x)}, ${formatCoordinate(chartHeightCm)});`
        );

        if (isMidnightGridLine) {
            contentLines.push(
                `\\node[anchor=south,font=${largeTimeFont},text=black] at (${formatCoordinate(x)}, ${formatCoordinate(chartHeightCm + 0.2)}) ${quoteTikzText(String(midnightMarkerIndex))};`
            );
            midnightMarkerIndex += 1;
        }
    }

    for (const stationAxisPoint of stationAxisPoints) {
        const y = stationYByTelecode.get(stationAxisPoint.stationTelecode) ?? 0;
        contentLines.push(
            `\\draw[line width=0.02cm, black] (${formatCoordinate(0)}, ${formatCoordinate(y)}) -- (${formatCoordinate(chartWidthCm)}, ${formatCoordinate(y)});`
        );
        contentLines.push(
            `\\node[anchor=east,font=${largeCjkFont},align=right] at (${formatCoordinate(leftLabelX)}, ${formatCoordinate(y)}) ${quoteTikzText(stationAxisPoint.stationName)};`
        );
    }

    nodes.forEach((node, index) => {
        const xStart = projectTime(node.start.timestamp);
        const xEnd = projectTime(node.end.timestamp);
        const yStart = stationYByTelecode.get(node.start.stationTelecode) ?? 0;
        const yEnd = stationYByTelecode.get(node.end.stationTelecode) ?? 0;
        const labelProgress = 0.25;
        const labelOnRight = yEnd > yStart;
        const labelX =
            xStart +
            (xEnd - xStart) * labelProgress +
            (labelOnRight ? trainLabelOffsetX : -trainLabelOffsetX);
        const labelY = yStart + (yEnd - yStart) * labelProgress;
        const labelText = `${node.trainCode}  ${node.start.stationName} → ${node.end.stationName}`;
        const drawColor = index % 2 === 0 ? 'blue!70!black' : 'teal!70!black';
        const startTimeAboveLine = yEnd < yStart;
        const endTimeAboveLine = yEnd >= yStart;
        const startTimeY =
            yStart + (startTimeAboveLine ? endpointTimeOffsetY : -endpointTimeOffsetY);
        const endTimeY =
            yEnd + (endTimeAboveLine ? endpointTimeOffsetY : -endpointTimeOffsetY);
        const startTimeAnchor = startTimeAboveLine ? 'south' : 'north';
        const endTimeAnchor = endTimeAboveLine ? 'south' : 'north';

        contentLines.push(
            `\\draw[line width=0.08cm, ${drawColor}] (${formatCoordinate(xStart)}, ${formatCoordinate(yStart)}) -- (${formatCoordinate(xEnd)}, ${formatCoordinate(yEnd)});`
        );
        contentLines.push(
            `\\fill[${drawColor}] (${formatCoordinate(xStart)}, ${formatCoordinate(yStart)}) circle[radius=0.06cm];`
        );
        contentLines.push(
            `\\fill[${drawColor}] (${formatCoordinate(xEnd)}, ${formatCoordinate(yEnd)}) circle[radius=0.06cm];`
        );
        contentLines.push(
            `\\node[fill=white,inner sep=2pt,font=${trainLabelFont},anchor=${labelOnRight ? 'west' : 'east'}] at (${formatCoordinate(labelX)}, ${formatCoordinate(labelY)}) ${quoteTikzText(labelText)};`
        );
        contentLines.push(
            `\\node[fill=white,inner sep=1.1pt,font=${largeTimeFont},anchor=${startTimeAnchor}] at (${formatCoordinate(xStart + endpointTimeOffsetX)}, ${formatCoordinate(startTimeY)}) ${quoteTikzText(formatShanghaiTimeLabel(node.start.timestamp))};`
        );
        contentLines.push(
            `\\node[fill=white,inner sep=1.1pt,font=${largeTimeFont},anchor=${endTimeAnchor}] at (${formatCoordinate(xEnd - endpointTimeOffsetX)}, ${formatCoordinate(endTimeY)}) ${quoteTikzText(formatShanghaiTimeLabel(node.end.timestamp))};`
        );
    });

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

    return {
        id: documentId,
        pageCount
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

async function fetchPngImageContent(imageUrl: string) {
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
            '运行图图片暂时不可用'
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
    binaryRequested: boolean
): Promise<TrainCirculationImageRenderResult> {
    const { timetable, circulation } = resolveCurrentCirculation(requestTrainCode);
    const publishedScheduleState = resolvePublishedScheduleState();
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
        publishedScheduleState.date
    );
    const compileResult = await compileLatexDocument(latexSource);
    const imageUrl = buildImageUrl(
        useConfig().services.simpleLatexContainer.baseUrl,
        compileResult.id,
        1
    );
    const pngContent = binaryRequested
        ? await fetchPngImageContent(imageUrl)
        : null;

    return {
        requestTrainCode,
        trainCode: timetable.trainCode,
        documentId: compileResult.id,
        imageUrl,
        pngContent
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
