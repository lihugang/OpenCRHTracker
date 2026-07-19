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

const TEMPLATE_PATH = path.resolve('assets/typst/train-circulation-image.typ');
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
    node: TrainCirculation['nodes'][number]
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

    circulation.nodes.forEach((node) => {
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
            resolveCirculationNode(scheduleDate, stations, matchedItem, node)
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
        text: parts.join(' ‧ ')
    };
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
            cumulativeDistanceKm: stationAxisPoint.cumulativeDistanceKm
        })),
        nodes: nodes.map((node) => ({
            labelText: `${node.trainCodeText}  ${node.start.stationName} → ${node.end.stationName}`,
            start: {
                stationTelecode: node.start.stationTelecode,
                timestamp: node.start.timestamp,
                timeText: formatShanghaiTimeLabel(node.start.timestamp)
            },
            end: {
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
