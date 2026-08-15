import {
    GetCurrentTrainTimetable,
    GetEmuAllocation,
    GetEmuHistory,
    GetSearchIndex,
    GetStationTimetable,
    GetTrainCirculationImage,
    GetTrainHistory,
    GetTrainTimetableHistory
} from '#shared/api/v2/registry/lookup';
import type { V2ClientOperation } from '#shared/api/v2/registry/types';
import type {
    GetCurrentTrainTimetableData,
    GetEmuAllocationData,
    GetEmuHistoryData,
    GetSearchIndexData,
    GetStationTimetableData,
    GetTrainHistoryData
} from '#shared/generated/proto/opencrh/v2/lookup_pb';
import type { GetTrainTimetableHistoryData as TimetableHistoryProto } from '#shared/generated/proto/opencrh/v2/timetable_pb';
import { V2ApiError } from '~/utils/api/v2/V2ApiError';
import {
    requestV2,
    requestV2Raw,
    type V2ApiResult,
    type V2RequestInput
} from '~/utils/api/v2/transport';
import { formatProtoTrainCode } from '~/utils/api/v2/mappers/trainCode';
import {
    epochServiceDayToDateString,
    epochServiceDayToShanghaiDayStartUnixSeconds
} from '~/utils/api/v2/mappers/serviceDay';
import { protoInt64ToNumber } from '~/utils/api/v2/mappers/numbers';
import type {
    CurrentTrainTimetableData,
    EmuAllocationProfileResponse,
    HistoricalTimetableData,
    HistoricalTimetableStop,
    LookupHistoryListItem,
    LookupSuggestItem,
    StationTimetableRecord,
    TrainCirculationMetadata,
    TrainTimetableHistoryListResponse
} from '~/types/lookup';
import type { HistoricalTimetableOption } from '~/types/lookupCurrentTimetable';

export interface LookupHistoryPageResult {
    requestedTargetCode: string;
    trainCode: string;
    emuCode?: string;
    emuId?: number | null;
    start?: number | null;
    end?: number | null;
    cursor: string;
    limit: number;
    nextCursor: string;
    items: LookupHistoryListItem[];
}

export interface StationTimetablePageResult {
    stationName: string;
    cursor: string;
    limit: number;
    nextCursor: string;
    items: StationTimetableRecord[];
}

export interface TrainTimetableHistoryNormalized {
    trainCode: string;
    items: HistoricalTimetableOption[];
    contentById: ReadonlyMap<number, HistoricalTimetableData>;
}

function requireSuccess<T>(entry: V2ClientOperation, result: V2ApiResult<T>) {
    if (result.ok) {
        return result.data;
    }

    throw new V2ApiError(entry.operationName, null, result.error, result.data);
}

function getSummaryOffsets(
    summary:
        | {
              startOffset?: bigint | undefined;
              endOffset?: bigint | undefined;
          }
        | null
        | undefined,
    serviceDay: number
) {
    const dayStart = epochServiceDayToShanghaiDayStartUnixSeconds(serviceDay);
    if (dayStart === null || !summary) {
        return {
            startAt: null,
            endAt: null
        };
    }

    const startOffset = protoInt64ToNumber(summary.startOffset);
    const endOffset = protoInt64ToNumber(summary.endOffset);
    return {
        startAt: startOffset === null ? null : dayStart + startOffset,
        endAt: endOffset === null ? null : dayStart + endOffset
    };
}

function mapHistoricalStop(stop: {
    stationNo: number;
    stationName: string;
    arriveOffset?: bigint | undefined;
    departOffset?: bigint | undefined;
    stationTrainCode?:
        | { prefix?: string | undefined; number?: number | undefined }
        | undefined;
    isStart: boolean;
    isEnd: boolean;
}): HistoricalTimetableStop {
    return {
        stationNo: stop.stationNo,
        stationName: stop.stationName,
        arriveOffset: protoInt64ToNumber(stop.arriveOffset),
        departOffset: protoInt64ToNumber(stop.departOffset),
        stationTrainCode: formatProtoTrainCode(stop.stationTrainCode),
        isStart: stop.isStart,
        isEnd: stop.isEnd
    };
}

export function mapHistoricalTimetableContent(content: {
    timetableId: number;
    startStation?: string | undefined;
    endStation?: string | undefined;
    startOffset?: bigint | undefined;
    endOffset?: bigint | undefined;
    stops: Array<{
        stationNo: number;
        stationName: string;
        arriveOffset?: bigint | undefined;
        departOffset?: bigint | undefined;
        stationTrainCode?:
            | { prefix?: string | undefined; number?: number | undefined }
            | undefined;
        isStart: boolean;
        isEnd: boolean;
    }>;
}): HistoricalTimetableData {
    return {
        historyId: content.timetableId,
        startStation: content.startStation ?? null,
        endStation: content.endStation ?? null,
        startOffset: protoInt64ToNumber(content.startOffset),
        endOffset: protoInt64ToNumber(content.endOffset),
        stops: content.stops.map(mapHistoricalStop)
    };
}

function mapTrainHistoryPage(
    data: GetTrainHistoryData
): LookupHistoryPageResult {
    const trainCode = formatProtoTrainCode(data.trainCode);
    const items = data.items.map<LookupHistoryListItem>((record) => {
        const serviceDate = epochServiceDayToDateString(record.serviceDay);
        const summary =
            record.timetableId === undefined
                ? undefined
                : data.timetableMappings[record.timetableId];
        const offsets = getSummaryOffsets(summary, record.serviceDay);
        return {
            id: String(record.id),
            serviceDate,
            timetableId: record.timetableId ?? null,
            status: record.status,
            startAt: offsets.startAt,
            endAt: offsets.endAt,
            code: data.emuCodeMappings[record.emuId] ?? '',
            startStation: summary?.startStation ?? null,
            endStation: summary?.endStation ?? null,
            emuId: record.emuId
        };
    });

    return {
        requestedTargetCode: trainCode,
        trainCode,
        emuId: null,
        start: protoInt64ToNumber(data.start),
        end: protoInt64ToNumber(data.end),
        cursor: data.cursor,
        limit: data.limit,
        nextCursor: data.nextCursor,
        items
    };
}

function mapEmuHistoryPage(data: GetEmuHistoryData): LookupHistoryPageResult {
    const emuCode = data.emuCodeMappings[data.emuId] ?? '';
    const items = data.items.map<LookupHistoryListItem>((record) => {
        const serviceDate = epochServiceDayToDateString(record.serviceDay);
        const summary =
            record.timetableId === undefined
                ? undefined
                : data.timetableMappings[record.timetableId];
        const offsets = getSummaryOffsets(summary, record.serviceDay);
        return {
            id: String(record.id),
            serviceDate,
            timetableId: record.timetableId ?? null,
            status: record.status,
            startAt: offsets.startAt,
            endAt: offsets.endAt,
            code: formatProtoTrainCode(record.trainCode),
            startStation: summary?.startStation ?? null,
            endStation: summary?.endStation ?? null,
            emuId: null
        };
    });

    return {
        requestedTargetCode: '',
        trainCode: '',
        emuCode,
        emuId: data.emuId,
        start: protoInt64ToNumber(data.start),
        end: protoInt64ToNumber(data.end),
        cursor: data.cursor,
        limit: data.limit,
        nextCursor: data.nextCursor,
        items
    };
}

function mapStationPage(
    data: GetStationTimetableData
): StationTimetablePageResult {
    return {
        stationName: data.stationName,
        cursor: data.cursor,
        limit: data.limit,
        nextCursor: data.nextCursor,
        items: data.items.map<StationTimetableRecord>((record) => ({
            trainCode: formatProtoTrainCode(record.trainCode),
            allCodes: record.allCodes.map((code) => formatProtoTrainCode(code)),
            arriveAt: protoInt64ToNumber(record.arriveAt),
            departAt: protoInt64ToNumber(record.departAt),
            platformNo: record.platformNo ?? null,
            startStation: record.startStation,
            endStation: record.endStation,
            updatedAt: protoInt64ToNumber(record.updatedAt),
            referenceModels: record.referenceModels.map((reference) => ({
                model: reference.model,
                weightedShare: reference.weightedShare
            }))
        }))
    };
}

function mapCurrentTimetable(
    data: GetCurrentTrainTimetableData
): CurrentTrainTimetableData {
    return {
        updatedAt: protoInt64ToNumber(data.updatedAt),
        requestTrainCode: formatProtoTrainCode(data.requestTrainCode),
        trainCode: formatProtoTrainCode(data.trainCode),
        internalCode: data.internalCode,
        allCodes: data.allCodes.map((code) => formatProtoTrainCode(code)),
        bureauCode: data.bureauCode,
        bureauName: data.bureauName,
        trainDepartment: data.trainDepartment,
        passengerDepartment: data.passengerDepartment,
        referenceModels: data.referenceModels.map((reference) => ({
            model: reference.model,
            weightedShare: reference.weightedShare
        })),
        startStation: data.startStation,
        endStation: data.endStation,
        startAt: Number(data.startAt),
        endAt: Number(data.endAt),
        serviceDay: data.serviceDay,
        circulation: data.circulation
            ? {
                  source:
                      data.circulation.source === 1 ? 'official' : 'inferred',
                  refreshAt: protoInt64ToNumber(data.circulation.refreshAt),
                  nodes: data.circulation.nodes.map((node) => ({
                      internalCode: node.internalCode,
                      allCodes: node.allCodes.map((code) =>
                          formatProtoTrainCode(code)
                      ),
                      startStation: node.startStation,
                      endStation: node.endStation,
                      startAt: Number(node.startAt),
                      endAt: Number(node.endAt)
                  })),
                  metadata: data.circulation.metadata
                      ? mapCirculationMetadata(data.circulation.metadata)
                      : undefined
              }
            : null,
        stops: data.stops.map((stop) => ({
            stationNo: stop.stationNo,
            stationName: stop.stationName,
            arriveAt: protoInt64ToNumber(stop.arriveAt),
            departAt: protoInt64ToNumber(stop.departAt),
            stationTrainCode: formatProtoTrainCode(stop.stationTrainCode),
            wicket: stop.wicket,
            distance:
                stop.distance === undefined ? null : Number(stop.distance),
            platformNo: stop.platformNo ?? null,
            isStart: stop.isStart,
            isEnd: stop.isEnd
        }))
    };
}

interface CirculationMetadataLike {
    routeId?: string | undefined;
    windowStart?: bigint | number | undefined;
    windowEnd?: bigint | number | undefined;
    threshold?: number | undefined;
    lowestLinkWeight?: number | undefined;
    lowestLinkSupportCount?: number | undefined;
    containsLoopBreak?: boolean | undefined;
    validationState?: number | undefined;
    originalOfficialEntryKey?: string | undefined;
    splitSegmentIndex?: number | undefined;
    splitSegmentCount?: number | undefined;
    matchedInferredRouteId?: string | undefined;
    candidateInferredCirculation?:
        | {
              refreshAt?: bigint | number | undefined;
              nodes: Array<{
                  internalCode: string;
                  allCodes: Array<{ prefix: string; number: number }>;
                  startStation: string;
                  endStation: string;
                  startAt: bigint | number;
                  endAt: bigint | number;
              }>;
              metadata?: CirculationMetadataLike | undefined;
          }
        | undefined;
}

function mapCirculationMetadata(
    metadata: CirculationMetadataLike | undefined
): TrainCirculationMetadata | undefined {
    if (!metadata) {
        return undefined as never;
    }

    const common = {
        routeId: metadata.routeId ?? '',
        windowStart: protoInt64ToNumber(metadata.windowStart) ?? 0,
        windowEnd: protoInt64ToNumber(metadata.windowEnd) ?? 0,
        threshold: metadata.threshold ?? 0,
        lowestLinkWeight:
            metadata.lowestLinkWeight === undefined
                ? null
                : metadata.lowestLinkWeight,
        lowestLinkSupportCount:
            metadata.lowestLinkSupportCount === undefined
                ? null
                : metadata.lowestLinkSupportCount,
        containsLoopBreak: metadata.containsLoopBreak ?? false
    };

    return {
        ...common,
        validationState: metadata.validationState
            ? mapValidationState(metadata.validationState)
            : undefined,
        originalOfficialEntryKey:
            metadata.originalOfficialEntryKey ?? undefined,
        splitSegmentIndex:
            metadata.splitSegmentIndex === undefined
                ? undefined
                : metadata.splitSegmentIndex,
        splitSegmentCount:
            metadata.splitSegmentCount === undefined
                ? undefined
                : metadata.splitSegmentCount,
        matchedInferredRouteId: metadata.matchedInferredRouteId ?? undefined,
        candidateInferredCirculation: metadata.candidateInferredCirculation
            ? {
                  source: 'inferred',
                  refreshAt: protoInt64ToNumber(
                      metadata.candidateInferredCirculation.refreshAt
                  ),
                  nodes: metadata.candidateInferredCirculation.nodes.map(
                      (node) => ({
                          internalCode: node.internalCode,
                          allCodes: node.allCodes.map((code) =>
                              formatProtoTrainCode(code)
                          ),
                          startStation: node.startStation,
                          endStation: node.endStation,
                          startAt: Number(node.startAt),
                          endAt: Number(node.endAt)
                      })
                  ),
                  metadata: mapCirculationMetadata(
                      metadata.candidateInferredCirculation.metadata
                  )
              }
            : null
    } as TrainCirculationMetadata;
}

function mapValidationState(value: number) {
    switch (value) {
        case 1:
            return 'raw_official' as const;
        case 2:
            return 'split_official' as const;
        case 3:
            return 'unmatched_official' as const;
        default:
            return undefined;
    }
}

function mapSearchIndex(data: GetSearchIndexData): LookupSuggestItem[] {
    return data.items.map((item) => ({
        type: item.type as LookupSuggestItem['type'],
        code: item.code,
        subtitle: item.subtitle,
        tags: item.tags
    }));
}

function mapEmuAllocation(
    data: GetEmuAllocationData,
    requestedEmuCode: string
): EmuAllocationProfileResponse {
    const emuCode = data.emuCodeMappings[data.emuId] ?? requestedEmuCode;
    return {
        emuId: data.emuId,
        requestEmuCode: requestedEmuCode,
        emuCode,
        model: data.model,
        trainSetNo: data.trainSetNo,
        bureau: data.bureau,
        trainDepot: data.trainDepot,
        depot: data.depot,
        subModel: data.subModel,
        customType: data.customType,
        trainsetManufacturer: data.trainsetManufacturer,
        trailerManufacturer: data.trailerManufacturer,
        manufactureMonth: data.manufactureMonth,
        designMaxSpeed: data.designMaxSpeed,
        operatingMaxSpeed: data.operatingMaxSpeed,
        isPublic: data.isPublic,
        railwayTravelCodeEnabled: data.railwayTravelCodeEnabled,
        firstClassPowerLegrest: data.firstClassPowerLegrest,
        toiletStatus: data.toiletStatus,
        socketLocation: data.socketLocation,
        businessSeatType: data.businessSeatType,
        modelRemark: data.modelRemark,
        note: data.note,
        tags: data.tags,
        alias: data.alias,
        coachLayouts: data.coachLayouts.map((layout) => ({
            coachNo: layout.coachNo,
            coachTypeCode: layout.coachTypeCode,
            coachTypeName: layout.coachTypeName,
            capacity: layout.capacity,
            hasPower: layout.hasPower,
            hasPantograph: layout.hasPantograph,
            hasLargeLuggageArea: layout.hasLargeLuggageArea,
            hasAccessibleFacility: layout.hasAccessibleFacility
        }))
    };
}

function mapTimetableHistory(
    data: TimetableHistoryProto
): TrainTimetableHistoryNormalized {
    const contentById = new Map<number, HistoricalTimetableData>();
    for (const [timetableId, content] of Object.entries(
        data.timetableMappings
    )) {
        contentById.set(
            Number(timetableId),
            mapHistoricalTimetableContent(content)
        );
    }

    const items = data.items
        .map<HistoricalTimetableOption>((item) => ({
            coverageId: item.coverageId,
            timetableId: item.timetableId,
            serviceDateStart: epochServiceDayToDateString(item.serviceDayStart),
            serviceDateEndExclusive: epochServiceDayToDateString(
                item.serviceDayEndExclusive
            ),
            sourceKey: `coverage:${item.coverageId}`,
            content: contentById.get(item.timetableId) ?? null
        }))
        .sort(
            (left, right) =>
                right.serviceDateStart.localeCompare(left.serviceDateStart) ||
                right.coverageId - left.coverageId
        );

    return {
        trainCode: formatProtoTrainCode(data.trainCode),
        items,
        contentById
    };
}

export async function fetchTrainHistoryPage(
    trainCode: string,
    options: {
        cursor?: string;
        limit?: number;
        start?: number;
        end?: number;
        signal?: AbortSignal;
    } = {}
) {
    const input: V2RequestInput = {
        params: { trainCode },
        query: {
            cursor: options.cursor || undefined,
            limit: options.limit,
            start: options.start,
            end: options.end
        }
    };
    const result = await requestV2<
        GetTrainHistoryData,
        LookupHistoryPageResult
    >(GetTrainHistory, input, mapTrainHistoryPage, {
        signal: options.signal
    });
    return requireSuccess(GetTrainHistory, result);
}

export async function fetchEmuHistoryPage(
    emuCode: string,
    options: {
        cursor?: string;
        limit?: number;
        start?: number;
        end?: number;
        signal?: AbortSignal;
    } = {}
) {
    const result = await requestV2<GetEmuHistoryData, LookupHistoryPageResult>(
        GetEmuHistory,
        {
            params: { emuCode },
            query: {
                cursor: options.cursor || undefined,
                limit: options.limit,
                start: options.start,
                end: options.end
            }
        },
        (data) => ({
            ...mapEmuHistoryPage(data),
            requestedTargetCode: emuCode.trim().toUpperCase()
        }),
        { signal: options.signal }
    );
    return requireSuccess(GetEmuHistory, result);
}

export async function fetchStationTimetablePage(
    stationName: string,
    options: {
        cursor?: string;
        limit?: number;
        signal?: AbortSignal;
    } = {}
) {
    const result = await requestV2<
        GetStationTimetableData,
        StationTimetablePageResult
    >(
        GetStationTimetable,
        {
            params: { stationName },
            query: {
                cursor: options.cursor || undefined,
                limit: options.limit
            }
        },
        mapStationPage,
        { signal: options.signal }
    );
    return requireSuccess(GetStationTimetable, result);
}

export async function fetchCurrentTrainTimetable(
    trainCode: string,
    signal?: AbortSignal
) {
    const result = await requestV2<
        GetCurrentTrainTimetableData,
        CurrentTrainTimetableData
    >(
        GetCurrentTrainTimetable,
        { params: { trainCode } },
        mapCurrentTimetable,
        { signal }
    );
    return requireSuccess(GetCurrentTrainTimetable, result);
}

export async function fetchTrainTimetableHistory(
    trainCode: string,
    signal?: AbortSignal
) {
    const result = await requestV2<
        TimetableHistoryProto,
        TrainTimetableHistoryNormalized
    >(
        GetTrainTimetableHistory,
        { params: { trainCode } },
        mapTimetableHistory,
        { signal }
    );
    return requireSuccess(GetTrainTimetableHistory, result);
}

export async function fetchSearchIndex(signal?: AbortSignal) {
    const result = await requestV2<GetSearchIndexData, LookupSuggestItem[]>(
        GetSearchIndex,
        {},
        mapSearchIndex,
        { signal }
    );
    return requireSuccess(GetSearchIndex, result);
}

export async function fetchEmuAllocation(
    emuCode: string,
    signal?: AbortSignal
) {
    const result = await requestV2<
        GetEmuAllocationData,
        EmuAllocationProfileResponse
    >(
        GetEmuAllocation,
        { params: { emuCode } },
        (data) => mapEmuAllocation(data, emuCode),
        { signal }
    );
    return requireSuccess(GetEmuAllocation, result);
}

const emuIdByCodeCache = new Map<string, number>();

export async function resolveEmuIdByCode(
    emuCode: string
): Promise<number | null> {
    const normalizedCode = emuCode.trim().toUpperCase();
    if (normalizedCode.length === 0) {
        return null;
    }

    const cached = emuIdByCodeCache.get(normalizedCode);
    if (cached !== undefined) {
        return cached;
    }

    try {
        const page = await fetchEmuHistoryPage(normalizedCode, { limit: 1 });
        if (page.emuId !== undefined && page.emuId !== null) {
            emuIdByCodeCache.set(normalizedCode, page.emuId);
            return page.emuId;
        }
    } catch {
        // Fall through to allocation lookup.
    }

    try {
        const allocation = await fetchEmuAllocation(normalizedCode);
        if (allocation.emuId > 0) {
            emuIdByCodeCache.set(normalizedCode, allocation.emuId);
            return allocation.emuId;
        }
    } catch {
        // Keep the cache empty and return null.
    }

    return null;
}

export async function fetchTrainCirculationImageRaw(
    requestTrainCode: string,
    format: 'png' | 'pdf',
    mode: 'blob' | 'arrayBuffer' | 'text' = 'blob'
) {
    return requestV2Raw(
        GetTrainCirculationImage,
        {
            params: { trainCode: requestTrainCode },
            query: {
                format,
                binary: true
            }
        },
        mode,
        {
            rawContentType: format === 'pdf' ? 'application/pdf' : 'image/png'
        }
    );
}
