import {
    getAdminAnomalyScan,
    postAdminAnomalyDeleteByType,
    postAdminAnomalyDeleteRoute
} from '~/server/domain/admin/anomaly';
import {
    getAdminConfigFile,
    getAdminConfigFiles,
    postAdminConfigFiles,
    putAdminConfigFile
} from '~/server/domain/admin/configFiles';
import {
    deleteAdminDailyRoute,
    getAdminDailyRoutes,
    getAdminDailyRoutesTimetables,
    postAdminDailyRoutes
} from '~/server/domain/admin/dailyRoutes';
import {
    getAdminMembershipCodes,
    postAdminMembershipCodes
} from '~/server/domain/admin/membershipCodes';
import {
    getAdminOauthClients,
    patchAdminOauthClient,
    postAdminOauthClientRevokeTokens
} from '~/server/domain/admin/oauth';
import {
    deleteAdminOfficialCirculation,
    getAdminOfficialCirculations
} from '~/server/domain/admin/officialCirculations';
import { getAdminPassiveAlerts } from '~/server/domain/admin/passiveAlerts';
import { getAdminServerMetrics } from '~/server/domain/admin/serverMetrics';
import { getAdminTasks, postAdminTasks } from '~/server/domain/admin/tasks';
import {
    deleteAdminTimetableHistoryCoverage,
    getAdminTimetableHistoryMergeCandidates
} from '~/server/domain/admin/timetableHistory';
import { getAdminTraffic } from '~/server/domain/admin/traffic';
import { postAdminWebappTokensRevokeAll } from '~/server/domain/admin/webappTokens';
import {
    ensureExternalEmuId,
    parseExternalServiceDate,
    parseExternalTrainCodeOrThrow
} from '~/server/utils/internal/boundaries';
import type {
    AdminConfigFileAction,
    AdminConfigFileTarget,
    AdminMembershipCodeStatus,
    AdminServerMetricsBucket,
    AdminServerMetricsPeak,
    AdminServerMetricsTopRoute,
    AdminServerMetricsWindow,
    AdminServerMetricsWindowSummary,
    AdminTrafficWindow,
    AdminTrafficWindowSummary
} from '~/types/admin';
import {
    AdminAnomalyTypeSchema,
    AdminConfigFileActionSchema,
    AdminConfigFileTargetSchema
} from '#shared/generated/proto/opencrh/v2/admin_pb';
import {
    OAuthClientScopeReviewStatusSchema,
    OAuthClientStatusSchema
} from '#shared/generated/proto/opencrh/v2/oauth_pb';
import { enumJsonName } from '~/server/utils/api/v2/requestValidator';
import { serviceDateToDay } from '~/server/utils/date/serviceDay';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import ensure from '~/server/utils/api/executor/ensure';
import parseLimit from '~/server/utils/api/query/parseLimit';
import type { V2OperationContext } from '~/server/utils/api/v2/V2Types';

function requireDate(query: Record<string, unknown>): string {
    const date = typeof query.date === 'string' ? query.date.trim() : '';
    ensure(/^\d{8}$/.test(date), 400, 'invalid_param', 'date 必须是 YYYYMMDD');
    return date;
}

function toTrainCode(code: string) {
    const parts = parseExternalTrainCodeOrThrow(code, 'trainCode');
    return {
        prefix: parts.prefix,
        number: parts.number
    };
}

function toEmuId(code: string) {
    return Number(ensureExternalEmuId(code));
}

function requireDateString(date: string): string {
    ensure(/^\d{8}$/.test(date), 400, 'invalid_param', 'date 必须是 YYYYMMDD');
    return date;
}

function toConfigTargetString(value: number | undefined): string {
    if (value === undefined || value === 0) {
        return '';
    }
    const name = enumJsonName(AdminConfigFileTargetSchema, value);
    switch (name) {
        case 'emu_list':
            return 'EMUList';
        case 'qr_code':
            return 'QRCode';
        case 'station_coord':
            return 'stationCoord';
        case 'train_style_mapping':
            return 'trainStyleMapping';
        case 'qrcode_detection':
            return 'qrcodeDetection';
        case 'supplement_trains':
            return 'supplementTrains';
        default:
            return name;
    }
}

function toProtoConfigTarget(value: string): string {
    switch (value) {
        case 'EMUList':
            return 'emu_list';
        case 'QRCode':
            return 'qr_code';
        case 'stationCoord':
            return 'station_coord';
        case 'trainStyleMapping':
            return 'train_style_mapping';
        case 'qrcodeDetection':
            return 'qrcode_detection';
        case 'supplementTrains':
            return 'supplement_trains';
        default:
            return value;
    }
}

function toConfigActionString(value: number | undefined): string {
    return value === undefined || value === 0
        ? ''
        : enumJsonName(AdminConfigFileActionSchema, value);
}

export async function getAdminAnomalyScanV2Adapter(ctx: V2OperationContext) {
    const result = await getAdminAnomalyScan(
        parseExternalServiceDate(requireDate(ctx.query))
    );
    return {
        ...result,
        items: result.items.map((item) => ({
            ...item,
            routes: item.routes.map((route) => ({
                ...route,
                id: Number(route.id)
            }))
        }))
    };
}

export async function postAdminAnomalyDeleteByTypeV2Adapter(
    ctx: V2OperationContext
) {
    const request = ctx.request as { date?: string; type?: number };
    const date = typeof request.date === 'string' ? request.date.trim() : '';
    const type =
        request.type === undefined || request.type === 0
            ? ''
            : enumJsonName(AdminAnomalyTypeSchema, request.type);
    ensure(type.length > 0, 400, 'invalid_param', 'type 不能为空');
    return postAdminAnomalyDeleteByType(
        parseExternalServiceDate(requireDateString(date)),
        type
    );
}

export async function postAdminAnomalyDeleteRouteV2Adapter(
    ctx: V2OperationContext
) {
    const request = ctx.request as { date?: string; routeId?: number };
    const date = typeof request.date === 'string' ? request.date.trim() : '';
    const routeId =
        request.routeId === undefined || request.routeId === 0
            ? ''
            : String(request.routeId);
    ensure(routeId.length > 0, 400, 'invalid_param', 'routeId 不能为空');
    return postAdminAnomalyDeleteRoute(
        parseExternalServiceDate(requireDateString(date)),
        routeId
    );
}

export async function getAdminConfigFilesV2Adapter(ctx: V2OperationContext) {
    const result = getAdminConfigFiles();
    return {
        ...result,
        items: result.items.map((item) => ({
            ...item,
            target: toProtoConfigTarget(item.target)
        }))
    };
}

export async function postAdminConfigFilesV2Adapter(ctx: V2OperationContext) {
    const request = ctx.request as {
        target?: number;
        action?: number;
    };
    const target = toConfigTargetString(request.target);
    const action = toConfigActionString(request.action);
    ensure(
        target === 'config' ||
            target === 'EMUList' ||
            target === 'QRCode' ||
            target === 'stationCoord' ||
            target === 'trainStyleMapping' ||
            target === 'qrcodeDetection' ||
            target === 'supplementTrains',
        400,
        'invalid_param',
        '不支持的配置文件目标'
    );
    ensure(
        action === 'reload_local' || action === 'refresh_remote',
        400,
        'invalid_param',
        'action 必须为 reload_local 或 refresh_remote'
    );
    const result = await postAdminConfigFiles(
        {
            target: target as AdminConfigFileTarget,
            action: action as AdminConfigFileAction
        },
        ctx.identity.id
    );
    return {
        ...result,
        item: {
            ...result.item,
            target: toProtoConfigTarget(result.item.target)
        }
    };
}

export async function getAdminConfigFileV2Adapter(ctx: V2OperationContext) {
    return getAdminConfigFile(ctx.params.target ?? '');
}

export async function putAdminConfigFileV2Adapter(ctx: V2OperationContext) {
    const request = ctx.request as unknown as {
        content?: string;
        expectedRevision?: string;
    };
    const content = typeof request.content === 'string' ? request.content : '';
    const expectedRevision =
        typeof request.expectedRevision === 'string'
            ? request.expectedRevision
            : '';
    ensure(
        content.length > 0,
        400,
        'invalid_param',
        'content 必须为非空字符串'
    );
    ensure(
        /^[a-f0-9]{64}$/.test(expectedRevision),
        400,
        'invalid_param',
        'expectedRevision 必须为有效的 SHA-256 revision'
    );
    const result = await putAdminConfigFile(
        ctx.params.target ?? '',
        {
            content,
            expectedRevision
        },
        ctx.identity.id
    );
    return {
        ...result,
        item: {
            ...result.item,
            target: toProtoConfigTarget(result.item.target)
        }
    };
}

function toAdminDailyRouteRecord(record: {
    id: string;
    serviceDate: string;
    trainCode: string;
    emuCode: string;
    timetableId: number | null;
    startStation: string;
    endStation: string;
    startAt: number;
    endAt: number;
}) {
    return {
        id: Number(record.id),
        serviceDay: serviceDateToDay(record.serviceDate),
        trainCode: toTrainCode(record.trainCode),
        emuId: toEmuId(record.emuCode),
        ...(record.timetableId === null
            ? {}
            : { timetableId: record.timetableId }),
        startStation: record.startStation,
        endStation: record.endStation,
        startAt: record.startAt,
        endAt: record.endAt
    };
}

export async function getAdminDailyRoutesV2Adapter(ctx: V2OperationContext) {
    const trainCode =
        typeof ctx.query.trainCode === 'string'
            ? ctx.query.trainCode.trim()
            : '';
    const emuCode =
        typeof ctx.query.emuCode === 'string' ? ctx.query.emuCode.trim() : '';
    ensure(
        trainCode.length > 0 || emuCode.length > 0,
        400,
        'invalid_param',
        'trainCode 与 emuCode 至少填写一个'
    );
    const result = getAdminDailyRoutes(
        parseExternalServiceDate(requireDate(ctx.query)),
        trainCode.length > 0
            ? parseExternalTrainCodeOrThrow(trainCode, 'trainCode')
            : null,
        emuCode.length > 0 ? ensureExternalEmuId(emuCode) : null
    );
    return {
        date: result.date,
        trainCode: result.trainCode,
        emuCode: result.emuCode,
        total: result.total,
        items: result.items.map(toAdminDailyRouteRecord)
    };
}

export async function postAdminDailyRoutesV2Adapter(ctx: V2OperationContext) {
    const request = ctx.request as {
        date?: string;
        trainCode?: string;
        emuCode?: string;
        timetableId?: number | null;
    };
    const result = postAdminDailyRoutes({
        serviceDay: parseExternalServiceDate(request.date ?? ''),
        trainCode: parseExternalTrainCodeOrThrow(
            request.trainCode ?? '',
            'trainCode'
        ),
        emuId: ensureExternalEmuId(request.emuCode ?? ''),
        timetableId: request.timetableId ?? null
    });
    return {
        date: result.date,
        trainCode: result.trainCode,
        emuCode: result.emuCode,
        ...(result.timetableId === null
            ? {}
            : { timetableId: result.timetableId }),
        ...(result.createdRecord === null
            ? {}
            : { createdRecord: toAdminDailyRouteRecord(result.createdRecord) }),
        inserted: result.inserted
    };
}

export async function deleteAdminDailyRouteV2Adapter(ctx: V2OperationContext) {
    const id = ctx.params.id ?? '';
    ensure(/^\d+$/.test(id), 400, 'invalid_param', 'id 必须是正整数');
    const result = await deleteAdminDailyRoute(Number.parseInt(id, 10));
    return {
        ...result,
        routeId: Number(result.routeId)
    };
}

export async function getAdminDailyRoutesTimetablesV2Adapter(
    ctx: V2OperationContext
) {
    const trainCode =
        typeof ctx.query.trainCode === 'string'
            ? ctx.query.trainCode.trim()
            : '';
    ensure(trainCode.length > 0, 400, 'invalid_param', 'trainCode 不能为空');
    const result = getAdminDailyRoutesTimetables(
        parseExternalServiceDate(requireDate(ctx.query)),
        parseExternalTrainCodeOrThrow(trainCode, 'trainCode')
    );
    return {
        ...result,
        ...(result.defaultTimetableId === null
            ? {}
            : { defaultTimetableId: result.defaultTimetableId }),
        items: result.items.map((item) => ({
            ...item,
            serviceDayStart: serviceDateToDay(item.serviceDateStart),
            serviceDayEndExclusive: serviceDateToDay(
                item.serviceDateEndExclusive
            ),
            ...(item.timetableId === null
                ? {}
                : { timetableId: item.timetableId })
        }))
    };
}

export async function getAdminMembershipCodesV2Adapter(
    ctx: V2OperationContext
) {
    return getAdminMembershipCodes({
        groupId: typeof ctx.query.groupId === 'string' ? ctx.query.groupId : '',
        batchId: typeof ctx.query.batchId === 'string' ? ctx.query.batchId : '',
        status: (typeof ctx.query.status === 'string'
            ? ctx.query.status
            : '') as AdminMembershipCodeStatus | '',
        cursor: typeof ctx.query.cursor === 'string' ? ctx.query.cursor : '',
        limit: parseLimit(ctx.event)
    });
}

export async function postAdminMembershipCodesV2Adapter(
    ctx: V2OperationContext
) {
    const request = ctx.request as {
        groupId?: string;
        quantity?: number;
        durationDays?: number;
    };
    return postAdminMembershipCodes(
        {
            groupId: request.groupId ?? '',
            quantity: request.quantity ?? 0,
            durationDays: request.durationDays ?? 0
        },
        ctx.identity.id
    );
}

export async function getAdminOauthClientsV2Adapter(ctx: V2OperationContext) {
    return getAdminOauthClients();
}

export async function patchAdminOauthClientV2Adapter(ctx: V2OperationContext) {
    const request = ctx.request as {
        status?: number;
        isTrusted?: boolean;
        adminGrants?: { notificationSend?: boolean };
        scopeReviews?: Array<{ scope?: string; reviewStatus?: number }>;
    };
    const status =
        request.status === undefined || request.status === 0
            ? ''
            : enumJsonName(OAuthClientStatusSchema, request.status);
    ensure(
        status === 'active' || status === 'disabled',
        400,
        'invalid_param',
        'status 必须为 active 或 disabled'
    );
    ensure(
        typeof request.isTrusted === 'boolean',
        400,
        'invalid_param',
        'isTrusted 必须为布尔值'
    );
    ensure(
        Array.isArray(request.scopeReviews),
        400,
        'invalid_param',
        'scopeReviews 必须为数组'
    );
    const scopeReviews = request.scopeReviews!.map((item) => {
        const reviewStatus =
            item.reviewStatus === undefined || item.reviewStatus === 0
                ? ''
                : enumJsonName(
                      OAuthClientScopeReviewStatusSchema,
                      item.reviewStatus
                  );
        ensure(
            reviewStatus === 'pending' ||
                reviewStatus === 'approved' ||
                reviewStatus === 'rejected',
            400,
            'invalid_param',
            'reviewStatus 无效'
        );
        return {
            scope: String(item.scope ?? ''),
            reviewStatus: reviewStatus as 'pending' | 'approved' | 'rejected'
        };
    });
    return patchAdminOauthClient(
        ctx.params.clientId ?? '',
        {
            status: status as 'active' | 'disabled',
            isTrusted: request.isTrusted!,
            ...(request.adminGrants === undefined
                ? {}
                : {
                      adminGrants: {
                          notificationSend: request.adminGrants.notificationSend
                      }
                  }),
            scopeReviews
        },
        ctx.identity.id
    );
}

export async function postAdminOauthClientRevokeTokensV2Adapter(
    ctx: V2OperationContext
) {
    return postAdminOauthClientRevokeTokens(ctx.params.clientId ?? '');
}

export async function getAdminOfficialCirculationsV2Adapter(
    ctx: V2OperationContext
) {
    const keyword =
        typeof ctx.query.keyword === 'string' ? ctx.query.keyword : '';
    ensure(keyword.length > 0, 400, 'invalid_param', 'keyword 不能为空');
    return getAdminOfficialCirculations(keyword);
}

export async function deleteAdminOfficialCirculationV2Adapter(
    ctx: V2OperationContext
) {
    return deleteAdminOfficialCirculation(ctx.params.entryKey ?? '');
}

export async function getAdminPassiveAlertsV2Adapter(ctx: V2OperationContext) {
    const date = requireDate(ctx.query);
    const type =
        typeof ctx.query.type === 'string' ? ctx.query.type.trim() : '';
    const rawCursor =
        typeof ctx.query.cursor === 'string' ? ctx.query.cursor.trim() : '';
    const cursor = parsePassiveAlertCursor(rawCursor);
    return getAdminPassiveAlerts({
        date,
        type: type === 'all' ? '' : type,
        limit: parsePassiveAlertLimit(ctx),
        cursor,
        rawCursor
    });
}

function parsePassiveAlertCursor(rawCursor: string) {
    if (rawCursor.length === 0) {
        return null;
    }
    const match = rawCursor.match(/^(\d+):(\d+)$/);
    ensure(
        !!match,
        400,
        'invalid_param',
        'cursor 必须是 "timestamp:lineIndex" 格式'
    );
    const timestamp = Number(match[1]);
    const lineIndex = Number(match[2]);
    ensure(
        Number.isInteger(timestamp) &&
            timestamp >= 0 &&
            Number.isInteger(lineIndex) &&
            lineIndex >= 0,
        400,
        'invalid_param',
        'cursor 包含非法数字'
    );
    return {
        timestamp,
        lineIndex
    };
}

function parsePassiveAlertLimit(ctx: V2OperationContext) {
    const raw = ctx.query.limit;
    if (raw === undefined || raw === null || raw === '') {
        return parseLimit(ctx.event);
    }
    const value = Number(raw);
    ensure(
        Number.isInteger(value) && value > 0,
        400,
        'invalid_param',
        'limit 必须是正整数'
    );
    return Math.min(value, parseLimit(ctx.event));
}

function toProtoServerMetricsBucket(bucket: AdminServerMetricsBucket) {
    return {
        startAt: bucket.startAt,
        endAt: bucket.endAt,
        systemSampleCount: bucket.systemSampleCount,
        ...(bucket.cpuPercent === null
            ? {}
            : { cpuPercent: bucket.cpuPercent }),
        ...(bucket.memoryUsedRatio === null
            ? {}
            : { memoryUsedRatio: bucket.memoryUsedRatio }),
        ...(bucket.memoryUsedBytes === null
            ? {}
            : { memoryUsedBytes: bucket.memoryUsedBytes }),
        ...(bucket.memoryTotalBytes === null
            ? {}
            : { memoryTotalBytes: bucket.memoryTotalBytes }),
        ...(bucket.load1m === null ? {} : { load1m: bucket.load1m }),
        ssrRequestCount: bucket.ssrRequestCount,
        ...(bucket.ssrAvgDurationMs === null
            ? {}
            : { ssrAvgDurationMs: bucket.ssrAvgDurationMs }),
        ...(bucket.ssrP50DurationMs === null
            ? {}
            : { ssrP50DurationMs: bucket.ssrP50DurationMs }),
        ...(bucket.ssrP75DurationMs === null
            ? {}
            : { ssrP75DurationMs: bucket.ssrP75DurationMs }),
        ...(bucket.ssrP95DurationMs === null
            ? {}
            : { ssrP95DurationMs: bucket.ssrP95DurationMs }),
        apiRequestCount: bucket.apiRequestCount,
        ...(bucket.apiAvgDurationMs === null
            ? {}
            : { apiAvgDurationMs: bucket.apiAvgDurationMs }),
        ...(bucket.apiP50DurationMs === null
            ? {}
            : { apiP50DurationMs: bucket.apiP50DurationMs }),
        ...(bucket.apiP75DurationMs === null
            ? {}
            : { apiP75DurationMs: bucket.apiP75DurationMs }),
        ...(bucket.apiP95DurationMs === null
            ? {}
            : { apiP95DurationMs: bucket.apiP95DurationMs })
    };
}

function toProtoServerMetricsWindow(key: AdminServerMetricsWindow) {
    return key === '24h' ? 'h24' : 'h4';
}

function toProtoServerMetricsTopRoute(route: AdminServerMetricsTopRoute) {
    return {
        path: route.path,
        requestCount: route.requestCount,
        ...(route.avgDurationMs === null
            ? {}
            : { avgDurationMs: route.avgDurationMs }),
        ...(route.p50DurationMs === null
            ? {}
            : { p50DurationMs: route.p50DurationMs }),
        ...(route.p75DurationMs === null
            ? {}
            : { p75DurationMs: route.p75DurationMs }),
        ...(route.p95DurationMs === null
            ? {}
            : { p95DurationMs: route.p95DurationMs })
    };
}

function toProtoPeakMap(
    peaks: AdminServerMetricsWindowSummary['peaks']
): Record<string, AdminServerMetricsPeak> {
    const entries: Array<[string, AdminServerMetricsPeak | null]> =
        Object.entries(peaks);
    return Object.fromEntries(
        entries.filter(
            (entry): entry is [string, AdminServerMetricsPeak] =>
                entry[1] !== null
        )
    );
}

function toProtoTrafficPeakMap(
    peaks: AdminTrafficWindowSummary['peaks']
): Record<string, AdminServerMetricsPeak> {
    const entries: Array<[string, AdminServerMetricsPeak | null]> = [
        ['webRequestsBucket', peaks.webRequestsBucket],
        ['apiCallsBucket', peaks.apiCallsBucket],
        ['uniqueVisitorsBucket', peaks.uniqueVisitorsBucket],
        ['activeUsersBucket', peaks.activeUsersBucket]
    ];
    return Object.fromEntries(
        entries.filter(
            (entry): entry is [string, AdminServerMetricsPeak] =>
                entry[1] !== null
        )
    );
}

function toProtoTrafficWindow(key: AdminTrafficWindow) {
    switch (key) {
        case '3h':
            return 'h3';
        case '24h':
            return 'h24';
        case '7d':
            return 'd7';
    }
}

export async function getAdminServerMetricsV2Adapter(ctx: V2OperationContext) {
    const result = getAdminServerMetrics();
    return {
        startedAt: result.startedAt,
        asOf: result.asOf,
        ...(result.lastSampleAt === null
            ? {}
            : { lastSampleAt: result.lastSampleAt }),
        loadAverageSupported: result.loadAverageSupported,
        windows: result.windows.map((window) => ({
            key: toProtoServerMetricsWindow(window.key),
            label: window.label,
            bucketSeconds: window.bucketSeconds,
            bucketCount: window.bucketCount,
            coverageSeconds: window.coverageSeconds,
            isPartial: window.isPartial,
            ...(window.latest === null
                ? {}
                : { latest: toProtoServerMetricsBucket(window.latest) }),
            peaks: toProtoPeakMap(window.peaks),
            topRoutes: {
                ssr: window.topRoutes.ssr.map(toProtoServerMetricsTopRoute),
                api: window.topRoutes.api.map(toProtoServerMetricsTopRoute)
            },
            buckets: window.buckets.map(toProtoServerMetricsBucket)
        }))
    };
}

export async function getAdminTasksV2Adapter(ctx: V2OperationContext) {
    return getAdminTasks();
}

export async function postAdminTasksV2Adapter(ctx: V2OperationContext) {
    const request = ctx.request as unknown as {
        task: { case?: string; value?: Record<string, unknown> };
    };
    const value = request.task.value ?? {};

    switch (request.task.case) {
        case 'regenerateDailyExport':
            return postAdminTasks({
                type: 'regenerate_daily_export',
                payload: { date: value.date }
            });
        case 'refreshRouteInfoNow':
            return postAdminTasks({
                type: 'refresh_route_info_now',
                payload: { trainCodes: value.trainCodes }
            });
        case 'refreshTrainCirculationNow':
            return postAdminTasks({
                type: 'refresh_train_circulation_now',
                payload: { trainCode: value.trainCode }
            });
        case 'refreshAllRoutesAndRequeueProbeNow':
            return postAdminTasks({
                type: 'refresh_all_routes_and_requeue_probe_now',
                payload: {}
            });
        case 'detectCoupledEmuGroupNow':
            return postAdminTasks({
                type: 'detect_coupled_emu_group_now',
                payload: { bureau: value.bureau, model: value.model }
            });
        case 'runQrcodeDetectionNow':
            return postAdminTasks({
                type: 'run_qrcode_detection_now',
                payload: {}
            });
        case 'dispatchStationBoardTasksNow':
            return postAdminTasks({
                type: 'dispatch_station_board_tasks_now',
                payload: {}
            });
        default:
            return postAdminTasks({ type: '', payload: {} });
    }
}

export async function getAdminTimetableHistoryMergeCandidatesV2Adapter(
    ctx: V2OperationContext
) {
    const trainCode =
        typeof ctx.query.trainCode === 'string'
            ? ctx.query.trainCode.trim()
            : '';
    ensure(trainCode.length > 0, 400, 'invalid_param', 'trainCode 不能为空');
    const result = getAdminTimetableHistoryMergeCandidates(
        parseExternalTrainCodeOrThrow(trainCode, 'trainCode')
    );
    return {
        ...result,
        items: result.items.map((item) => ({
            ...item,
            mergedServiceDayStart: serviceDateToDay(
                item.mergedServiceDateStart
            ),
            mergedServiceDayEndExclusive: serviceDateToDay(
                item.mergedServiceDateEndExclusive
            ),
            previous: toCoverageSummary(item.previous),
            middle: toCoverageSummary(item.middle),
            next: toCoverageSummary(item.next)
        }))
    };
}

function toCoverageSummary(summary: {
    coverageId: number;
    timetableId: number;
    serviceDateStart: string;
    serviceDateEndExclusive: string;
    startStation: string;
    endStation: string;
    stopCount: number;
}) {
    return {
        coverageId: summary.coverageId,
        timetableId: summary.timetableId,
        serviceDayStart: serviceDateToDay(summary.serviceDateStart),
        serviceDayEndExclusive: serviceDateToDay(
            summary.serviceDateEndExclusive
        ),
        startStation: summary.startStation,
        endStation: summary.endStation,
        stopCount: summary.stopCount
    };
}

export async function deleteAdminTimetableHistoryCoverageV2Adapter(
    ctx: V2OperationContext
) {
    const coverageId = ctx.params.coverageId ?? '';
    ensure(
        /^\d+$/.test(coverageId),
        400,
        'invalid_param',
        'coverageId 必须是正整数'
    );
    const result = deleteAdminTimetableHistoryCoverage(
        Number.parseInt(coverageId, 10)
    );
    return {
        ...result,
        previous: toCoverageSummary(result.previous),
        middle: toCoverageSummary(result.middle),
        next: toCoverageSummary(result.next),
        merged: toCoverageSummary(result.merged)
    };
}

export async function getAdminTrafficV2Adapter(ctx: V2OperationContext) {
    const result = getAdminTraffic();
    return {
        startedAt: result.startedAt,
        asOf: result.asOf,
        windows: result.windows.map((window) => ({
            key: toProtoTrafficWindow(window.key),
            label: window.label,
            bucketSeconds: window.bucketSeconds,
            bucketCount: window.bucketCount,
            coverageSeconds: window.coverageSeconds,
            isPartial: window.isPartial,
            estimatedMetrics: window.estimatedMetrics,
            totals: window.totals,
            peaks: toProtoTrafficPeakMap(window.peaks),
            buckets: window.buckets
        }))
    };
}

export async function postAdminWebappTokensRevokeAllV2Adapter(
    ctx: V2OperationContext
) {
    return postAdminWebappTokensRevokeAll(ctx.identity);
}
