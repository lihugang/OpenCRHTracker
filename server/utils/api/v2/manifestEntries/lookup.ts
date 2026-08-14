import useConfig from '~/server/config';
import {
    GetEmuAllocationRequestSchema,
    GetEmuAllocationDataSchema,
    GetEmuAllocationResponseSchema,
    GetSearchIndexRequestSchema,
    GetSearchIndexDataSchema,
    GetSearchIndexResponseSchema,
    GetCurrentTrainTimetableRequestSchema,
    GetCurrentTrainTimetableDataSchema,
    GetCurrentTrainTimetableResponseSchema,
    GetStationTimetableRequestSchema,
    GetStationTimetableDataSchema,
    GetStationTimetableResponseSchema,
    GetDailyRecordsRequestSchema,
    GetDailyRecordsDataSchema,
    GetDailyRecordsResponseSchema,
    GetTrainHistoryRequestSchema,
    GetTrainHistoryDataSchema,
    GetTrainHistoryResponseSchema,
    GetEmuHistoryRequestSchema,
    GetEmuHistoryDataSchema,
    GetEmuHistoryResponseSchema,
    type GetEmuAllocationData,
    type GetDailyRecordsData,
    type GetTrainHistoryData,
    type GetEmuHistoryData
} from '#shared/generated/proto/opencrh/v2/lookup_pb';
import {
    GetTrainTimetableHistoryRequestSchema,
    GetTrainTimetableHistoryDataSchema,
    GetTrainTimetableHistoryResponseSchema,
    GetTrainCirculationImageRequestSchema,
    GetTrainCirculationImageDataSchema,
    GetTrainCirculationImageResponseSchema,
    type GetTrainTimetableHistoryData,
    type GetTrainCirculationImageData
} from '#shared/generated/proto/opencrh/v2/timetable_pb';
import {
    getCurrentTrainTimetableV2Adapter,
    getDailyRecordsV2Adapter,
    getEmuAllocationV2Adapter,
    getEmuHistoryV2Adapter,
    getSearchIndexV2Adapter,
    getStationTimetableV2Adapter,
    getTrainCirculationImageV2Adapter,
    getTrainHistoryV2Adapter,
    getTrainTimetableHistoryV2Adapter
} from '~/server/utils/api/v2/adapters/lookup';
import { defineV2Operation } from '~/server/utils/api/v2/V2Types';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import {
    getDailyResponseCacheControlMaxAge,
    getHistoryResponseCacheControlMaxAge
} from '~/server/utils/api/response/getResponseCacheControlMaxAge';
import { parseV2Cursor } from '~/server/utils/api/v2/v2Cursor';
import { asServiceDay, dayToServiceDate } from '~/server/utils/date/serviceDay';

const IMMUTABLE_CACHE_SECONDS = 365 * 24 * 60 * 60;

function historyCursorDate(data: unknown): string | null {
    const cursor = (data as { cursor?: string }).cursor;
    const parsed = parseV2Cursor(cursor, 'cursor');
    return parsed === null ? null : dayToServiceDate(parsed.serviceDate);
}

function earliestCoverageDate(data: unknown): string | null {
    const items = (data as { items?: Array<{ serviceDayStart?: number }> })
        .items;
    if (!items || items.length === 0) {
        return null;
    }

    const earliest = Math.min(
        ...items.map((item) => item.serviceDayStart ?? 0)
    );
    return dayToServiceDate(asServiceDay(earliest));
}

function emuIds(data: unknown): number[] {
    return (
        (data as { items?: Array<{ emuId?: number }> }).items
            ?.map((item) => item.emuId)
            .filter((id): id is number => id !== undefined) ?? []
    );
}

function timetableIds(data: unknown): number[] {
    return (
        (data as { items?: Array<{ timetableId?: number }> }).items
            ?.map((item) => item.timetableId)
            .filter((id): id is number => id !== undefined) ?? []
    );
}

export const LOOKUP_MANIFEST_ENTRIES = {
    GetEmuAllocation: defineV2Operation({
        operationName: 'GetEmuAllocation',
        method: 'GET',
        pathTemplate: '/api/v2/allocation/emu/:emuCode',
        requestSchema: GetEmuAllocationRequestSchema,
        dataSchema: GetEmuAllocationDataSchema,
        responseSchema: GetEmuAllocationResponseSchema,
        requiredScopes: [API_SCOPES.allocation.emu.read],
        cors: true,
        cost: { kind: 'fixed', key: 'allocationEmu' },
        cache: () => useConfig().api.cache.searchIndexMaxAgeSeconds,
        bodyMode: 'none',
        mappings: {
            emuCode: (data) => [(data as GetEmuAllocationData).emuId]
        },
        handler: getEmuAllocationV2Adapter
    }),
    GetSearchIndex: defineV2Operation({
        operationName: 'GetSearchIndex',
        method: 'GET',
        pathTemplate: '/api/v2/search',
        requestSchema: GetSearchIndexRequestSchema,
        dataSchema: GetSearchIndexDataSchema,
        responseSchema: GetSearchIndexResponseSchema,
        requiredScopes: [API_SCOPES.search.read],
        cors: false,
        cost: { kind: 'fixed', key: 'searchIndex' },
        cache: () => useConfig().api.cache.searchIndexMaxAgeSeconds,
        bodyMode: 'none',
        handler: getSearchIndexV2Adapter
    }),
    GetCurrentTrainTimetable: defineV2Operation({
        operationName: 'GetCurrentTrainTimetable',
        method: 'GET',
        pathTemplate: '/api/v2/timetable/train/:trainCode/current',
        requestSchema: GetCurrentTrainTimetableRequestSchema,
        dataSchema: GetCurrentTrainTimetableDataSchema,
        responseSchema: GetCurrentTrainTimetableResponseSchema,
        requiredScopes: [API_SCOPES.timetable.train.current.read],
        cors: true,
        cost: { kind: 'fixed', key: 'timetableTrainCurrent' },
        cache: () => useConfig().api.cache.timetableMaxAgeSeconds,
        bodyMode: 'none',
        handler: getCurrentTrainTimetableV2Adapter
    }),
    GetStationTimetable: defineV2Operation({
        operationName: 'GetStationTimetable',
        method: 'GET',
        pathTemplate: '/api/v2/timetable/station/:stationName',
        requestSchema: GetStationTimetableRequestSchema,
        dataSchema: GetStationTimetableDataSchema,
        responseSchema: GetStationTimetableResponseSchema,
        requiredScopes: [API_SCOPES.timetable.station.read],
        cors: true,
        cost: {
            kind: 'perRecord',
            key: 'timetableStation',
            count: (data) => (data as { items: unknown[] }).items.length
        },
        cache: () => useConfig().api.cache.timetableMaxAgeSeconds,
        bodyMode: 'none',
        handler: getStationTimetableV2Adapter
    }),
    GetDailyRecords: defineV2Operation({
        operationName: 'GetDailyRecords',
        method: 'GET',
        pathTemplate: '/api/v2/records/daily',
        requestSchema: GetDailyRecordsRequestSchema,
        dataSchema: GetDailyRecordsDataSchema,
        responseSchema: GetDailyRecordsResponseSchema,
        requiredScopes: [API_SCOPES.records.daily.read],
        cors: true,
        cost: {
            kind: 'perRecord',
            key: 'recordsDaily',
            count: (data) => (data as GetDailyRecordsData).items.length
        },
        cache: (data) =>
            getDailyResponseCacheControlMaxAge(
                dayToServiceDate(
                    asServiceDay((data as GetDailyRecordsData).serviceDay)
                )
            ),
        bodyMode: 'none',
        mappings: {
            emuCode: (data) => emuIds(data),
            timetable: (data) => timetableIds(data)
        },
        handler: getDailyRecordsV2Adapter
    }),
    GetTrainHistory: defineV2Operation({
        operationName: 'GetTrainHistory',
        method: 'GET',
        pathTemplate: '/api/v2/history/train/:trainCode',
        requestSchema: GetTrainHistoryRequestSchema,
        dataSchema: GetTrainHistoryDataSchema,
        responseSchema: GetTrainHistoryResponseSchema,
        requiredScopes: [API_SCOPES.history.train.read],
        cors: true,
        cost: {
            kind: 'perRecord',
            key: 'historyTrain',
            count: (data) => (data as GetTrainHistoryData).items.length
        },
        cache: (data) =>
            getHistoryResponseCacheControlMaxAge(historyCursorDate(data)),
        bodyMode: 'none',
        mappings: {
            emuCode: (data) => emuIds(data),
            timetable: (data) => timetableIds(data)
        },
        handler: getTrainHistoryV2Adapter
    }),
    GetEmuHistory: defineV2Operation({
        operationName: 'GetEmuHistory',
        method: 'GET',
        pathTemplate: '/api/v2/history/emu/:emuCode',
        requestSchema: GetEmuHistoryRequestSchema,
        dataSchema: GetEmuHistoryDataSchema,
        responseSchema: GetEmuHistoryResponseSchema,
        requiredScopes: [API_SCOPES.history.emu.read],
        cors: true,
        cost: {
            kind: 'perRecord',
            key: 'historyEmu',
            count: (data) => (data as GetEmuHistoryData).items.length
        },
        cache: (data) =>
            getHistoryResponseCacheControlMaxAge(historyCursorDate(data)),
        bodyMode: 'none',
        mappings: {
            emuCode: (data) => [(data as GetEmuHistoryData).emuId],
            timetable: (data) => timetableIds(data)
        },
        handler: getEmuHistoryV2Adapter
    }),
    GetTrainTimetableHistory: defineV2Operation({
        operationName: 'GetTrainTimetableHistory',
        method: 'GET',
        pathTemplate: '/api/v2/timetable/train/:trainCode/history',
        requestSchema: GetTrainTimetableHistoryRequestSchema,
        dataSchema: GetTrainTimetableHistoryDataSchema,
        responseSchema: GetTrainTimetableHistoryResponseSchema,
        requiredScopes: [API_SCOPES.timetable.train.history.read],
        cors: true,
        cost: {
            kind: 'perRecord',
            key: 'timetableTrainHistory',
            count: (data) => (data as GetTrainTimetableHistoryData).items.length
        },
        cache: (data) => {
            const earliest = earliestCoverageDate(data);
            return earliest === null
                ? getHistoryResponseCacheControlMaxAge(undefined)
                : getDailyResponseCacheControlMaxAge(earliest);
        },
        bodyMode: 'none',
        mappings: {
            timetableContent: (data) => [
                ...(data as GetTrainTimetableHistoryData).items.map(
                    (item) => item.timetableId
                )
            ]
        },
        handler: getTrainTimetableHistoryV2Adapter
    }),
    GetTrainCirculationImage: defineV2Operation({
        operationName: 'GetTrainCirculationImage',
        method: 'GET',
        pathTemplate: '/api/v2/timetable/train/:trainCode/circulation/image',
        requestSchema: GetTrainCirculationImageRequestSchema,
        dataSchema: GetTrainCirculationImageDataSchema,
        responseSchema: GetTrainCirculationImageResponseSchema,
        requiredScopes: [API_SCOPES.timetable.train.circulation.image.read],
        cors: true,
        cost: {
            kind: 'custom',
            fixed: useConfig().cost.fixed.trainCirculationImageCacheHit,
            dynamic: (data) =>
                (data as { cacheHit?: boolean }).cacheHit === true
                    ? 0
                    : useConfig().cost.fixed.trainCirculationImage -
                      useConfig().cost.fixed.trainCirculationImageCacheHit
        },
        failureCost: useConfig().cost.fixed.trainCirculationImageFailure,
        cache: () => useConfig().api.cache.timetableMaxAgeSeconds,
        bodyMode: 'none',
        jsonData: (data) => {
            const typed = data as Record<string, unknown> & {
                content?: Uint8Array;
            };
            return {
                ...typed,
                ...(typed.content === undefined
                    ? {}
                    : {
                          content: Buffer.from(typed.content).toString('base64')
                      })
            };
        },
        rawMedia: {
            kind: 'png',
            isRequested: (query) =>
                query.binary === '1' || query.binary === 'true',
            resolveContentType: (query) => {
                if (query.format === undefined || query.format === 'png') {
                    return 'image/png';
                }
                if (query.format === 'pdf') {
                    return 'application/pdf';
                }
                return null;
            },
            build: (data) => ({
                content: (data as GetTrainCirculationImageData)
                    .content as Uint8Array,
                contentType: (data as GetTrainCirculationImageData)
                    .binaryContentType as string,
                contentDisposition: ''
            })
        },
        handler: getTrainCirculationImageV2Adapter
    })
} as const;
