import { getEmuAllocation } from '~/server/domain/allocation';
import { getTrainHistory, getEmuHistory } from '~/server/domain/history';
import { getDailyRecords } from '~/server/domain/records';
import { getSearchIndex } from '~/server/domain/search';
import {
    getCurrentTrainTimetable,
    getStationTimetable,
    getTrainCirculationImage,
    getTrainTimetableHistory
} from '~/server/domain/timetable';
import { getTodayScheduleServiceDay } from '~/server/services/todayScheduleCache';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import ensure from '~/server/utils/api/executor/ensure';
import parseLimit from '~/server/utils/api/query/parseLimit';
import parseOptionalTimestamp from '~/server/utils/api/query/parseOptionalTimestamp';
import type { TrainCodeParts } from '~/server/utils/12306/trainCode';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import { dayToServiceDate } from '~/server/utils/date/serviceDay';
import {
    ensureExternalEmuId,
    formatExternalTrainCode,
    parseExternalServiceDate,
    parseExternalEmuCode,
    parseExternalTrainCodeOrThrow
} from '~/server/utils/internal/boundaries';
import { formatV2Cursor, parseV2Cursor } from '~/server/utils/api/v2/v2Cursor';
import type { V2OperationContext } from '~/server/utils/api/v2/V2Types';
import {
    setCurrentTrainTimetablePlatformRefreshTaskPending
} from '~/server/utils/api/response/getCurrentTrainTimetableCacheMaxAge';
import {
    CirculationValidationState,
    TrainCirculationSource,
    type GetCurrentTrainTimetableRequest,
    type GetDailyRecordsRequest,
    type GetEmuAllocationRequest,
    type GetEmuHistoryRequest,
    type GetSearchIndexRequest,
    type GetStationTimetableRequest,
    type GetTrainHistoryRequest
} from '#shared/generated/proto/opencrh/v2/lookup_pb';
import type {
    GetTrainCirculationImageRequest as TimetableCirculationRequest,
    GetTrainTimetableHistoryRequest
} from '#shared/generated/proto/opencrh/v2/timetable_pb';
import type {
    TrainCirculation,
    TrainCirculationMetadata
} from '~/types/lookup';

function toTrainCode(parts: TrainCodeParts) {
    return {
        prefix: parts.prefix,
        number: parts.number
    };
}

function formatNextCursor(
    next: { serviceDate: number; id: number } | null
): string {
    return next === null ? '' : formatV2Cursor(next.serviceDate, next.id);
}

function optionalTimetableId(value: number | null) {
    return value === null ? {} : { timetableId: value };
}

export async function getDailyRecordsV2Adapter(ctx: V2OperationContext) {
    const date = typeof ctx.query.date === 'string' ? ctx.query.date : '';
    ensure(/^\d{8}$/.test(date), 400, 'invalid_param', 'date 必须是 YYYYMMDD');

    const result = getDailyRecords({
        serviceDay: parseExternalServiceDate(date),
        cursor: parseV2Cursor(ctx.query.cursor, 'cursor'),
        limit: parseLimit(ctx.event)
    });

    return {
        serviceDay: parseExternalServiceDate(date),
        cursor: typeof ctx.query.cursor === 'string' ? ctx.query.cursor : '',
        limit: result.limit,
        nextCursor: formatNextCursor(result.nextCursor),
        items: result.items.map((item) => ({
            id: item.id,
            serviceDay: item.serviceDay,
            ...optionalTimetableId(item.timetableId),
            emuId: item.emuId,
            trainCode: toTrainCode(item.trainCode),
            status: item.status
        }))
    };
}

export async function getTrainHistoryV2Adapter(ctx: V2OperationContext) {
    const trainCode = parseExternalTrainCodeOrThrow(
        ctx.params.trainCode,
        'trainCode'
    );
    const start = parseOptionalTimestamp(ctx.query.start, 'start');
    const end = parseOptionalTimestamp(ctx.query.end, 'end');
    const result = getTrainHistory({
        trainCode,
        start: start ?? 0,
        end: end ?? Number.MAX_SAFE_INTEGER,
        cursor: parseV2Cursor(ctx.query.cursor, 'cursor'),
        limit: parseLimit(ctx.event)
    });

    return {
        trainCode: toTrainCode(trainCode),
        ...(start === undefined ? {} : { start }),
        ...(end === undefined ? {} : { end }),
        cursor: typeof ctx.query.cursor === 'string' ? ctx.query.cursor : '',
        limit: result.limit,
        nextCursor: formatNextCursor(result.nextCursor),
        items: result.items.map((item) => ({
            id: item.id,
            serviceDay: item.serviceDay,
            ...optionalTimetableId(item.timetableId),
            emuId: item.emuId,
            status: item.status
        }))
    };
}

export async function getEmuHistoryV2Adapter(ctx: V2OperationContext) {
    const rawEmuCode = ctx.params.emuCode;
    ensure(
        typeof rawEmuCode === 'string' && rawEmuCode.trim().length > 0,
        400,
        'invalid_param',
        'emuCode 不能为空'
    );
    const emuId = parseExternalEmuCode(rawEmuCode);
    ensure(emuId !== null, 404, 'not_found', '未找到该动车组');
    const start = parseOptionalTimestamp(ctx.query.start, 'start');
    const end = parseOptionalTimestamp(ctx.query.end, 'end');
    const result = getEmuHistory({
        emuId,
        start: start ?? 0,
        end: end ?? Number.MAX_SAFE_INTEGER,
        cursor: parseV2Cursor(ctx.query.cursor, 'cursor'),
        limit: parseLimit(ctx.event)
    });

    return {
        emuId,
        ...(start === undefined ? {} : { start }),
        ...(end === undefined ? {} : { end }),
        cursor: typeof ctx.query.cursor === 'string' ? ctx.query.cursor : '',
        limit: result.limit,
        nextCursor: formatNextCursor(result.nextCursor),
        items: result.items.map((item) => ({
            id: item.id,
            serviceDay: item.serviceDay,
            ...optionalTimetableId(item.timetableId),
            trainCode: toTrainCode(item.trainCode),
            status: item.status
        }))
    };
}

function toValidationState(
    value: string | undefined
): CirculationValidationState | undefined {
    switch (value) {
        case 'raw_official':
            return CirculationValidationState.RAW_OFFICIAL;
        case 'split_official':
            return CirculationValidationState.SPLIT_OFFICIAL;
        case 'unmatched_official':
            return CirculationValidationState.UNMATCHED_OFFICIAL;
        default:
            return undefined;
    }
}

function toProtoCirculation(circulation: TrainCirculation) {
    return {
        source:
            circulation.source === 'official'
                ? TrainCirculationSource.OFFICIAL
                : TrainCirculationSource.INFERRED,
        ...(circulation.refreshAt === null ||
        circulation.refreshAt === undefined
            ? {}
            : { refreshAt: circulation.refreshAt }),
        nodes: circulation.nodes.map((node) => ({
            internalCode: node.internalCode,
            allCodes: node.allCodes.map((code) =>
                toTrainCode(parseExternalTrainCodeOrThrow(code, 'allCodes'))
            ),
            startStation: node.startStation,
            endStation: node.endStation,
            startAt: node.startAt,
            endAt: node.endAt
        })),
        ...(circulation.metadata
            ? { metadata: toProtoCirculationMetadata(circulation.metadata) }
            : {})
    };
}

function toProtoCirculationMetadata(
    metadata: TrainCirculationMetadata
): Record<string, unknown> {
    return {
        ...(metadata.routeId === undefined
            ? {}
            : { routeId: metadata.routeId }),
        ...(metadata.windowStart === undefined
            ? {}
            : { windowStart: metadata.windowStart }),
        ...(metadata.windowEnd === undefined
            ? {}
            : { windowEnd: metadata.windowEnd }),
        ...(metadata.threshold === undefined
            ? {}
            : { threshold: metadata.threshold }),
        ...(metadata.lowestLinkWeight === undefined ||
        metadata.lowestLinkWeight === null
            ? {}
            : { lowestLinkWeight: metadata.lowestLinkWeight }),
        ...(metadata.lowestLinkSupportCount === undefined ||
        metadata.lowestLinkSupportCount === null
            ? {}
            : { lowestLinkSupportCount: metadata.lowestLinkSupportCount }),
        ...(metadata.containsLoopBreak === undefined
            ? {}
            : { containsLoopBreak: metadata.containsLoopBreak }),
        ...(metadata.validationState
            ? {
                  validationState: toValidationState(metadata.validationState)
              }
            : {}),
        ...(metadata.originalOfficialEntryKey === undefined
            ? {}
            : { originalOfficialEntryKey: metadata.originalOfficialEntryKey }),
        ...(metadata.splitSegmentIndex === undefined
            ? {}
            : { splitSegmentIndex: metadata.splitSegmentIndex }),
        ...(metadata.splitSegmentCount === undefined
            ? {}
            : { splitSegmentCount: metadata.splitSegmentCount }),
        ...(metadata.matchedInferredRouteId === undefined
            ? {}
            : { matchedInferredRouteId: metadata.matchedInferredRouteId }),
        ...(metadata.candidateInferredCirculation === undefined ||
        metadata.candidateInferredCirculation === null
            ? {}
            : {
                  candidateInferredCirculation: {
                      ...(metadata.candidateInferredCirculation.refreshAt ===
                      null
                          ? {}
                          : {
                                refreshAt:
                                    metadata.candidateInferredCirculation
                                        .refreshAt
                            }),
                      nodes: metadata.candidateInferredCirculation.nodes.map(
                          (node) => ({
                              internalCode: node.internalCode,
                              allCodes: node.allCodes.map((code) =>
                                  toTrainCode(
                                      parseExternalTrainCodeOrThrow(
                                          code,
                                          'allCodes'
                                      )
                                  )
                              ),
                              startStation: node.startStation,
                              endStation: node.endStation,
                              startAt: node.startAt,
                              endAt: node.endAt
                          })
                      ),
                      metadata: toProtoCirculationMetadata(
                          metadata.candidateInferredCirculation.metadata
                      )
                  }
              })
    };
}

export async function getCurrentTrainTimetableV2Adapter(
    ctx: V2OperationContext
) {
    const trainCode = parseExternalTrainCodeOrThrow(
        ctx.params.trainCode,
        'trainCode'
    );
    const timetable = await getCurrentTrainTimetable(trainCode);
    setCurrentTrainTimetablePlatformRefreshTaskPending(
        ctx.event,
        timetable.platformRefreshTaskPending
    );

    return {
        ...(timetable.updatedAt === null
            ? {}
            : { updatedAt: timetable.updatedAt }),
        requestTrainCode: toTrainCode(trainCode),
        trainCode: toTrainCode(timetable.trainCode),
        internalCode: timetable.internalCode,
        allCodes: timetable.allCodes.map((code) =>
            toTrainCode(
                typeof code === 'string'
                    ? parseExternalTrainCodeOrThrow(code, 'allCodes')
                    : code
            )
        ),
        bureauCode: timetable.bureauCode,
        bureauName: timetable.bureauName,
        trainDepartment: timetable.trainDepartment,
        passengerDepartment: timetable.passengerDepartment,
        referenceModels: timetable.referenceModels.map((item) => ({
            model: item.model,
            weightedShare: item.weightedShare
        })),
        startStation: timetable.startStation,
        endStation: timetable.endStation,
        startAt: timetable.startAt,
        endAt: timetable.endAt,
        serviceDay: getTodayScheduleServiceDay(),
        ...(timetable.circulation === null
            ? {}
            : { circulation: toProtoCirculation(timetable.circulation) }),
        stops: timetable.stops.map((stop) => ({
            stationNo: stop.stationNo,
            stationName: stop.stationName,
            ...(stop.arriveAt === null ? {} : { arriveAt: stop.arriveAt }),
            ...(stop.departAt === null ? {} : { departAt: stop.departAt }),
            stationTrainCode: toTrainCode(stop.stationTrainCode),
            wicket: stop.wicket,
            ...(stop.distance === null ? {} : { distance: stop.distance }),
            ...(stop.platformNo === null
                ? {}
                : { platformNo: stop.platformNo }),
            isStart: stop.isStart,
            isEnd: stop.isEnd
        }))
    };
}

function decodeStationName(rawStationName: string | undefined) {
    if (typeof rawStationName !== 'string') {
        return '';
    }

    try {
        return decodeURIComponent(rawStationName).trim();
    } catch {
        return rawStationName.trim();
    }
}

export async function getStationTimetableV2Adapter(ctx: V2OperationContext) {
    const stationName = decodeStationName(ctx.params.stationName);
    ensure(
        stationName.length > 0,
        400,
        'invalid_param',
        'stationName 不能为空'
    );

    const limit = parseLimit(ctx.event);
    const result = await getStationTimetable({
        stationName,
        cursor: parseV2Cursor(ctx.query.cursor, 'cursor'),
        limit
    });

    return {
        stationName,
        cursor: typeof ctx.query.cursor === 'string' ? ctx.query.cursor : '',
        limit: result.limit,
        nextCursor:
            result.nextCursor === null
                ? ''
                : formatV2Cursor(
                      result.nextCursor.serviceDate,
                      result.nextCursor.id
                  ),
        items: result.items.map((item) => ({
            trainCode: toTrainCode(item.trainCode),
            allCodes: item.allCodes.map((code) =>
                toTrainCode(
                    typeof code === 'string'
                        ? parseExternalTrainCodeOrThrow(code, 'allCodes')
                        : code
                )
            ),
            ...(item.arriveAt === null ? {} : { arriveAt: item.arriveAt }),
            ...(item.departAt === null ? {} : { departAt: item.departAt }),
            ...(item.platformNo === null
                ? {}
                : { platformNo: item.platformNo }),
            startStation: item.startStation,
            endStation: item.endStation,
            ...(item.updatedAt === null ? {} : { updatedAt: item.updatedAt }),
            referenceModels: item.referenceModels.map((reference) => ({
                model: reference.model,
                weightedShare: reference.weightedShare
            }))
        }))
    };
}

export async function getEmuAllocationV2Adapter(ctx: V2OperationContext) {
    const rawEmuCode = ctx.params.emuCode;
    ensure(
        typeof rawEmuCode === 'string' && rawEmuCode.length > 0,
        400,
        'invalid_param',
        'emuCode 不能为空'
    );
    const normalizedCode = normalizeCode(rawEmuCode);
    ensure(normalizedCode.length > 0, 400, 'invalid_param', 'emuCode 不能为空');

    const profile = await getEmuAllocation(normalizedCode);

    return {
        emuId: profile.emuId,
        model: profile.model,
        trainSetNo: profile.trainSetNo,
        bureau: profile.bureau,
        trainDepot: profile.trainDepot,
        depot: profile.depot,
        subModel: profile.subModel,
        customType: profile.customType,
        trainsetManufacturer: profile.trainsetManufacturer,
        trailerManufacturer: profile.trailerManufacturer,
        manufactureMonth: profile.manufactureMonth,
        designMaxSpeed: profile.designMaxSpeed,
        operatingMaxSpeed: profile.operatingMaxSpeed,
        isPublic: profile.isPublic,
        railwayTravelCodeEnabled: profile.railwayTravelCodeEnabled,
        firstClassPowerLegrest: profile.firstClassPowerLegrest,
        toiletStatus: profile.toiletStatus,
        socketLocation: profile.socketLocation,
        businessSeatType: profile.businessSeatType,
        modelRemark: profile.modelRemark,
        note: profile.note,
        tags: profile.tags,
        alias: profile.alias,
        coachLayouts: profile.coachLayouts.map((rawLayout) => {
            const layout = rawLayout as {
                coachNo: number;
                coachTypeCode: string;
                coachTypeName: string;
                capacity: number;
                hasPower: boolean;
                hasPantograph: boolean;
                hasLargeLuggageArea: boolean;
                hasAccessibleFacility: boolean;
            };
            return {
                coachNo: layout.coachNo,
                coachTypeCode: layout.coachTypeCode,
                coachTypeName: layout.coachTypeName,
                capacity: layout.capacity,
                hasPower: layout.hasPower,
                hasPantograph: layout.hasPantograph,
                hasLargeLuggageArea: layout.hasLargeLuggageArea,
                hasAccessibleFacility: layout.hasAccessibleFacility
            };
        })
    };
}

export async function getSearchIndexV2Adapter(ctx: V2OperationContext) {
    const result = getSearchIndex();
    return {
        items: result.items.map((item) => ({
            type: item.type,
            code: item.code,
            subtitle: item.subtitle,
            tags: item.tags
        }))
    };
}

export async function getTrainTimetableHistoryV2Adapter(
    ctx: V2OperationContext
) {
    const trainCode = parseExternalTrainCodeOrThrow(
        ctx.params.trainCode,
        'trainCode'
    );
    const items = getTrainTimetableHistory(trainCode);

    return {
        trainCode: toTrainCode(trainCode),
        items: items.map((item) => ({
            coverageId: item.coverageId,
            timetableId: item.timetableId,
            serviceDayStart: item.serviceDayStart,
            serviceDayEndExclusive: item.serviceDayEndExclusive
        }))
    };
}

function parseBinaryFlag(value: unknown): boolean {
    if (value === undefined) {
        return false;
    }
    if (value === '1' || value === 'true') {
        return true;
    }
    if (value === '0' || value === 'false') {
        return false;
    }

    throw new Error('binary');
}

function parseFormat(value: unknown): 'png' | 'pdf' {
    if (value === undefined) {
        return 'png';
    }
    if (value === 'png' || value === 'pdf') {
        return value;
    }

    throw new Error('format');
}

export async function getTrainCirculationImageV2Adapter(
    ctx: V2OperationContext
) {
    const trainCode = ctx.params.trainCode;
    ensure(
        typeof trainCode === 'string' && trainCode.length > 0,
        400,
        'invalid_param',
        'trainCode 不能为空'
    );

    let binaryRequested = false;
    let format: 'png' | 'pdf' = 'png';
    try {
        binaryRequested = parseBinaryFlag(ctx.query.binary);
    } catch {
        ensure(false, 400, 'invalid_param', 'binary 必须是 true/false');
    }
    try {
        format = parseFormat(ctx.query.format);
    } catch {
        ensure(false, 400, 'invalid_param', 'format 必须是 png 或 pdf');
    }

    let parsedTrainCode: TrainCodeParts;
    try {
        parsedTrainCode = parseExternalTrainCodeOrThrow(trainCode, 'trainCode');
    } catch {
        ensure(false, 400, 'invalid_param', 'trainCode 非法');
    }

    const result = await getTrainCirculationImage(
        parsedTrainCode!,
        binaryRequested,
        format
    );

    return {
        cacheHit: result.cacheHit,
        requestTrainCode: toTrainCode(
            parseExternalTrainCodeOrThrow(
                result.requestTrainCode,
                'requestTrainCode'
            )
        ),
        trainCode: toTrainCode(
            parseExternalTrainCodeOrThrow(result.trainCode, 'trainCode')
        ),
        documentId: result.documentId,
        imageUrl: result.imageUrl,
        ...(result.binaryContent === null
            ? {}
            : { content: result.binaryContent }),
        ...(result.binaryContent === null
            ? {}
            : { binaryContentType: result.binaryContentType })
    };
}
