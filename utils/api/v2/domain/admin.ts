import type { MessageInitShape } from '@bufbuild/protobuf';
import type {
    AdminAnomalyItem,
    AdminAnomalyScanResponse,
    AdminAnomalyTypeCount,
    AdminDailyRouteCreateResponse,
    AdminDailyRouteSearchResponse,
    AdminDailyRouteTimetableCandidatesResponse,
    AdminMembershipCodeBatchSummary,
    AdminMembershipCodeItem,
    AdminMembershipCodeListResponse,
    AdminPassiveAlertsResponse,
    AdminTrafficMetricKey,
    AdminTrafficResponse,
    AdminConfigFileActionResponse,
    AdminConfigFileItem,
    AdminConfigFilesResponse,
    AdminOfficialCirculationSearchResponse,
    AdminOfficialCirculationDeleteResponse,
    AdminTimetableHistoryCoverageMergeCandidate,
    AdminTimetableHistoryMergeCandidatesResponse,
    AdminTimetableHistoryCoverageMergeResponse,
    AdminServerMetricsResponse,
    AdminTaskOverviewResponse,
    AdminCreateTaskRequest,
    AdminCreateTaskResponse,
    AdminRevokeAllWebappTokensResponse,
    AdminAnomalyBulkDeleteResponse,
    AdminAnomalyDeleteRouteResponse,
    AdminConfigFileAction,
    AdminConfigFileTarget,
    AdminDailyRouteDeleteResponse,
    AdminOfficialCirculationMatchType
} from '~/types/admin';
import type {
    OAuthClientListResponse,
    OAuthClientMutationResponse,
    OAuthClientPublicItem
} from '~/types/auth';
import type { SponsorshipGroupCatalogItem } from '~/types/membership';
import type {
    DeleteAdminDailyRouteData,
    DeleteAdminOfficialCirculationData,
    DeleteAdminTimetableHistoryCoverageData,
    GetAdminAnomalyScanData,
    GetAdminConfigFilesData,
    GetAdminConfigFileData,
    GetAdminDailyRoutesData,
    GetAdminDailyRoutesTimetablesData,
    GetAdminMembershipCodesData,
    GetAdminOauthClientsData,
    GetAdminOfficialCirculationsData,
    GetAdminPassiveAlertsData,
    GetAdminServerMetricsData,
    GetAdminTasksData,
    GetAdminTimetableHistoryMergeCandidatesData,
    GetAdminTrafficData,
    PatchAdminOauthClientData,
    PostAdminAnomalyDeleteByTypeData,
    PostAdminAnomalyDeleteRouteData,
    PostAdminConfigFilesData,
    PostAdminDailyRoutesData,
    PostAdminMembershipCodesData,
    PostAdminOauthClientRevokeTokensData,
    PostAdminTasksData,
    PostAdminWebappTokensRevokeAllData,
    PutAdminConfigFileData
} from '#shared/generated/proto/opencrh/v2/admin_pb';
import type { OAuthClientPublicItem as OAuthClientPublicItemMessage } from '#shared/generated/proto/opencrh/v2/oauth_pb';
import {
    DeleteAdminDailyRoute,
    DeleteAdminOfficialCirculation,
    DeleteAdminTimetableHistoryCoverage,
    GetAdminAnomalyScan,
    GetAdminConfigFiles,
    GetAdminConfigFile,
    GetAdminDailyRoutes,
    GetAdminDailyRoutesTimetables,
    GetAdminMembershipCodes,
    GetAdminOauthClients,
    GetAdminOfficialCirculations,
    GetAdminPassiveAlerts,
    GetAdminServerMetrics,
    GetAdminTasks,
    GetAdminTimetableHistoryMergeCandidates,
    GetAdminTraffic,
    PatchAdminOauthClient,
    PostAdminAnomalyDeleteByType,
    PostAdminAnomalyDeleteRoute,
    PostAdminConfigFiles,
    PostAdminDailyRoutes,
    PostAdminMembershipCodes,
    PostAdminOauthClientRevokeTokens,
    PostAdminTasks,
    PostAdminWebappTokensRevokeAll,
    PutAdminConfigFile
} from '#shared/api/v2/registry/admin';
import { protoInt64ToNumber } from '~/utils/api/v2/mappers/numbers';
import { epochServiceDayToDateString } from '~/utils/api/v2/mappers/serviceDay';
import { formatProtoTrainCode } from '~/utils/api/v2/mappers/trainCode';
import { requestV2, type V2RequestInput } from '~/utils/api/v2/transport';
import { requireSuccess } from '~/utils/api/v2/domain/common';

function mapAnomalyType(
    value: number
): AdminAnomalyScanResponse['items'][number]['type'] {
    switch (value) {
        case 1:
            return 'train_multi_emu';
        case 2:
            return 'train_coupled_model_mismatch';
        case 3:
            return 'train_non_multiple_coupled';
        default:
            return 'emu_single_short_route';
    }
}

function toAnomalyType(
    value: AdminAnomalyScanResponse['items'][number]['type']
) {
    switch (value) {
        case 'train_multi_emu':
            return 1;
        case 'train_coupled_model_mismatch':
            return 2;
        case 'train_non_multiple_coupled':
            return 3;
        default:
            return 4;
    }
}

function mapAnomalyScan(
    data: GetAdminAnomalyScanData
): AdminAnomalyScanResponse {
    return {
        date: data.date,
        total: data.total,
        counts: data.counts.map(
            (item): AdminAnomalyTypeCount => ({
                type: mapAnomalyType(item.type),
                label: item.label,
                count: item.count
            })
        ),
        items: data.items.map(
            (item): AdminAnomalyItem => ({
                type: mapAnomalyType(item.type),
                subjectCode: item.subjectCode,
                title: item.title,
                summary: item.summary,
                trainCodes: item.trainCodes,
                emuCodes: item.emuCodes,
                durationSeconds: item.durationSeconds ?? null,
                routes: item.routes.map((route) => ({
                    id: String(route.id),
                    trainCode: route.trainCode,
                    emuCode: route.emuCode,
                    startStation: route.startStation,
                    endStation: route.endStation,
                    startAt: protoInt64ToNumber(route.startAt) ?? 0,
                    endAt: protoInt64ToNumber(route.endAt) ?? 0,
                    durationSeconds: route.durationSeconds,
                    status: route.status
                }))
            })
        )
    };
}

function mapAnomalyDeleteRoute(
    data: PostAdminAnomalyDeleteRouteData
): AdminAnomalyDeleteRouteResponse {
    return {
        date: data.date,
        routeId: String(data.routeId),
        wasToday: data.wasToday,
        deletedDailyRoute: data.deletedDailyRoute,
        clearedRuntimeTrainKey: data.clearedRuntimeTrainKey,
        clearedRuntimeEmuCodes: data.clearedRuntimeEmuCodes,
        clearedDetectionGroups: data.clearedDetectionGroups
    };
}

function mapAnomalyBulkDelete(
    data: PostAdminAnomalyDeleteByTypeData
): AdminAnomalyBulkDeleteResponse {
    return {
        date: data.date,
        type: mapAnomalyType(data.type),
        wasToday: false,
        matchedItems: data.matchedItems,
        matchedRoutes: data.matchedRoutes,
        deletedDailyRoutes: data.deletedDailyRoutes,
        skippedRoutes: data.skippedRoutes
    };
}

function mapConfigFileTarget(value: number): AdminConfigFileTarget {
    switch (value) {
        case 1:
            return 'config';
        case 2:
            return 'EMUList';
        case 3:
            return 'QRCode';
        case 4:
            return 'stationCoord';
        case 5:
            return 'trainStyleMapping';
        case 6:
            return 'qrcodeDetection';
        case 7:
            return 'supplementTrains';
        default:
            return 'config';
    }
}

function toConfigFileTarget(value: AdminConfigFileTarget): number {
    switch (value) {
        case 'EMUList':
            return 2;
        case 'QRCode':
            return 3;
        case 'stationCoord':
            return 4;
        case 'trainStyleMapping':
            return 5;
        case 'qrcodeDetection':
            return 6;
        case 'supplementTrains':
            return 7;
        default:
            return 1;
    }
}

function mapConfigFileAction(value: number): AdminConfigFileAction {
    return value === 2 ? 'refresh_remote' : 'reload_local';
}

function toConfigFileAction(value: AdminConfigFileAction): number {
    return value === 'refresh_remote' ? 2 : 1;
}

function mapConfigFileItem(item: {
    target: number;
    title: string;
    description: string;
    filePath: string;
    provider?: string | undefined;
    exists: boolean;
    modifiedAt?: bigint | number | undefined;
    editable: boolean;
    supportedActions: number[];
}) {
    return {
        target: mapConfigFileTarget(item.target),
        title: item.title,
        description: item.description,
        filePath: item.filePath,
        provider: item.provider ?? null,
        exists: item.exists,
        modifiedAt: protoInt64ToNumber(item.modifiedAt),
        editable: item.editable,
        supportedActions: item.supportedActions.map(mapConfigFileAction)
    };
}

function createEmptyConfigFileItem(
    target: AdminConfigFileTarget
): AdminConfigFileItem {
    return {
        target,
        title: '',
        description: '',
        filePath: '',
        provider: null,
        exists: false,
        modifiedAt: null,
        editable: false,
        supportedActions: []
    };
}

function mapConfigFiles(
    data: GetAdminConfigFilesData
): AdminConfigFilesResponse {
    return {
        asOf: protoInt64ToNumber(data.asOf) ?? 0,
        items: data.items.map(mapConfigFileItem)
    };
}

function mapConfigFileActionResponse(
    data: PostAdminConfigFilesData | PutAdminConfigFileData
): AdminConfigFileActionResponse {
    const item = data.item;
    if (!item) {
        return {
            target: 'config',
            action:
                'action' in data
                    ? mapConfigFileAction(data.action)
                    : 'reload_local',
            summary: data.summary,
            item: createEmptyConfigFileItem('config')
        };
    }

    return {
        target: mapConfigFileTarget(item.target),
        action:
            'action' in data
                ? mapConfigFileAction(data.action)
                : 'reload_local',
        summary: data.summary,
        item: mapConfigFileItem(item)
    };
}

function mapDailyRouteRecord(
    item: {
        id: number;
        serviceDay: number;
        trainCode?: { prefix: string; number: number } | undefined;
        emuId: number;
        timetableId?: number | undefined;
        startStation: string;
        endStation: string;
        startAt: bigint | number;
        endAt: bigint | number;
        status: number;
    },
    emuCodeMappings: Record<string, string>
) {
    return {
        id: String(item.id),
        serviceDate: epochServiceDayToDateString(item.serviceDay),
        trainCode: formatProtoTrainCode(item.trainCode),
        emuCode: emuCodeMappings[item.emuId] ?? String(item.emuId),
        timetableId: item.timetableId ?? null,
        startStation: item.startStation,
        endStation: item.endStation,
        startAt: protoInt64ToNumber(item.startAt) ?? 0,
        endAt: protoInt64ToNumber(item.endAt) ?? 0,
        status: item.status
    };
}

function mapDailyRoutes(
    data: GetAdminDailyRoutesData
): AdminDailyRouteSearchResponse {
    return {
        date: data.date,
        trainCode: data.trainCode,
        emuCode: data.emuCode,
        total: data.total,
        items: data.items.map((item) =>
            mapDailyRouteRecord(item, data.emuCodeMappings)
        )
    };
}

function mapDailyRouteCreate(
    data: PostAdminDailyRoutesData
): AdminDailyRouteCreateResponse {
    return {
        date: data.date,
        trainCode: data.trainCode,
        emuCode: data.emuCode,
        timetableId: data.timetableId ?? null,
        createdRecord:
            data.createdRecord === undefined
                ? null
                : mapDailyRouteRecord(data.createdRecord, data.emuCodeMappings),
        inserted: data.inserted
    };
}

function mapDailyRouteDelete(
    data: DeleteAdminDailyRouteData
): AdminDailyRouteDeleteResponse {
    return {
        date: data.date,
        routeId: String(data.routeId),
        wasToday: data.wasToday,
        deletedDailyRoute: data.deletedDailyRoute,
        clearedRuntimeTrainKey: data.clearedRuntimeTrainKey,
        clearedRuntimeEmuCodes: data.clearedRuntimeEmuCodes,
        clearedDetectionGroups: data.clearedDetectionGroups
    };
}

function mapTimetableCandidate(item: {
    timetableId?: number | undefined;
    serviceDayStart: number;
    serviceDayEndExclusive: number;
    startStation: string;
    endStation: string;
    startAt: bigint | number;
    endAt: bigint | number;
    resolution: number;
    isDefault: boolean;
}) {
    return {
        timetableId: item.timetableId ?? null,
        serviceDateStart: epochServiceDayToDateString(item.serviceDayStart),
        serviceDateEndExclusive: epochServiceDayToDateString(
            item.serviceDayEndExclusive
        ),
        startStation: item.startStation,
        endStation: item.endStation,
        startAt: protoInt64ToNumber(item.startAt) ?? 0,
        endAt: protoInt64ToNumber(item.endAt) ?? 0,
        resolution:
            item.resolution === 1
                ? ('exact' as const)
                : item.resolution === 2
                  ? ('latest_fallback' as const)
                  : ('unresolved' as const),
        isDefault: item.isDefault
    };
}

function mapDailyRouteTimetables(
    data: GetAdminDailyRoutesTimetablesData
): AdminDailyRouteTimetableCandidatesResponse {
    return {
        date: data.date,
        trainCode: data.trainCode,
        defaultTimetableId: data.defaultTimetableId ?? null,
        items: data.items.map(mapTimetableCandidate)
    };
}

function mapMembershipCodeBatch(
    item:
        | {
              batchId: string;
              groupId: string;
              groupName: string;
              durationDays: number;
              quantity: number;
              createdBy: string;
              createdAt: bigint | number;
          }
        | null
        | undefined
): AdminMembershipCodeBatchSummary {
    if (!item) {
        return {
            batchId: '',
            groupId: '',
            groupName: '',
            durationDays: 0,
            quantity: 0,
            createdBy: '',
            createdAt: 0
        };
    }
    return {
        batchId: item.batchId,
        groupId: item.groupId,
        groupName: item.groupName,
        durationDays: item.durationDays,
        quantity: item.quantity,
        createdBy: item.createdBy,
        createdAt: protoInt64ToNumber(item.createdAt) ?? 0
    };
}

function mapMembershipCodes(
    data: GetAdminMembershipCodesData
): AdminMembershipCodeListResponse {
    return {
        asOf: protoInt64ToNumber(data.asOf) ?? 0,
        total: data.total,
        usedCount: data.usedCount,
        unusedCount: data.unusedCount,
        limit: data.limit,
        nextCursor: data.nextCursor,
        catalog: data.catalog.map(mapCatalogGroup),
        items: data.items.map(
            (item): AdminMembershipCodeItem => ({
                ...mapMembershipCodeBatch(item.batch),
                code: item.code,
                status: item.status === 2 ? 'used' : 'unused',
                usedAt: protoInt64ToNumber(item.usedAt),
                usedBy: item.usedBy ?? null
            })
        )
    };
}

function mapCatalogGroup(group: {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    visible: boolean;
    assignable: boolean;
    sortOrder: number;
    quota?:
        | {
              tokenLimit?: number | undefined;
              refillAmount?: number | undefined;
          }
        | undefined;
    permissionGroups: Array<{
        id: string;
        name: string;
        scopes: string[];
    }>;
    subscriptionUrl?: string | undefined;
}): SponsorshipGroupCatalogItem {
    return {
        id: group.id,
        name: group.name,
        description: group.description,
        enabled: group.enabled,
        visible: group.visible,
        assignable: group.assignable,
        sortOrder: group.sortOrder,
        quota: {
            tokenLimit: group.quota?.tokenLimit ?? null,
            refillAmount: group.quota?.refillAmount ?? null
        },
        permissionGroups: group.permissionGroups.map((entry) => ({
            id: entry.id,
            name: entry.name,
            scopes: entry.scopes
        })),
        subscriptionUrl: group.subscriptionUrl ?? null
    };
}

function mapOAuthClient(
    item: OAuthClientPublicItemMessage
): OAuthClientPublicItem {
    const adminGrants = item.adminGrants;
    return {
        clientId: item.clientId,
        ownerUserId: item.ownerUserId,
        name: item.name,
        description: item.description ?? null,
        homepageUrl: item.homepageUrl ?? null,
        status: item.status === 1 ? 'active' : 'disabled',
        isTrusted: item.isTrusted,
        createdAt: protoInt64ToNumber(item.createdAt) ?? 0,
        updatedAt: protoInt64ToNumber(item.updatedAt) ?? 0,
        redirectUris: item.redirectUris.map((uri) => ({ value: uri.value })),
        scopeRequests: item.scopeRequests.map((scope) => ({
            scope: scope.scope,
            reviewStatus:
                scope.reviewStatus === 1
                    ? ('pending' as const)
                    : scope.reviewStatus === 2
                      ? ('approved' as const)
                      : ('rejected' as const),
            reviewedBy: scope.reviewedBy ?? null,
            reviewedAt: protoInt64ToNumber(scope.reviewedAt)
        })),
        adminGrants: {
            notificationSend: adminGrants?.notificationSend ?? false,
            notificationSendUpdatedBy:
                adminGrants?.notificationSendUpdatedBy ?? null,
            notificationSendUpdatedAt: protoInt64ToNumber(
                adminGrants?.notificationSendUpdatedAt
            )
        }
    };
}

function mapOauthClients(
    data: GetAdminOauthClientsData
): OAuthClientListResponse {
    return {
        items: data.items.map(mapOAuthClient),
        allowedScopes: []
    };
}

function mapOauthClientMutation(
    data: PatchAdminOauthClientData
): OAuthClientMutationResponse {
    return {
        client: mapOAuthClient(data.client!)
    };
}

function mapOfficialMatchType(
    value: number
): AdminOfficialCirculationMatchType {
    return value === 2 ? 'all_code' : 'internal_code';
}

function mapOfficialCirculations(
    data: GetAdminOfficialCirculationsData
): AdminOfficialCirculationSearchResponse {
    return {
        keyword: data.keyword,
        normalizedKeyword: data.normalizedKeyword,
        filePath: data.filePath,
        modifiedAt: protoInt64ToNumber(data.modifiedAt),
        total: data.total,
        items: data.items.map((item) => ({
            entryKey: item.entryKey,
            matchedBy: item.matchedBy.map(mapOfficialMatchType),
            matchedCodes: item.matchedCodes,
            refreshedAt: protoInt64ToNumber(item.refreshedAt) ?? 0,
            nodeCount: item.nodeCount,
            nodes: item.nodes.map((node) => ({
                internalCode: node.internalCode,
                allCodes: node.allCodes,
                startStation: node.startStation,
                endStation: node.endStation,
                startAt: protoInt64ToNumber(node.startAt) ?? 0,
                endAt: protoInt64ToNumber(node.endAt) ?? 0
            }))
        }))
    };
}

function mapOfficialCirculationDelete(
    data: DeleteAdminOfficialCirculationData
): AdminOfficialCirculationDeleteResponse {
    return {
        entryKey: data.entryKey,
        deletedKeys: data.deletedKeys,
        deletedKeyCount: data.deletedKeyCount,
        modifiedAt: protoInt64ToNumber(data.modifiedAt)
    };
}

function mapPassiveAlerts(
    data: GetAdminPassiveAlertsData
): AdminPassiveAlertsResponse {
    return {
        date: data.date,
        logFile: data.logFile ?? null,
        cursor: data.cursor,
        nextCursor: data.nextCursor,
        limit: data.limit,
        total: data.total,
        filteredTotal: data.filteredTotal,
        warnCount: data.warnCount,
        errorCount: data.errorCount,
        topLoggers: data.topLoggers.map((item) => ({
            logger: item.logger,
            count: item.count
        })),
        typeCounts: data.typeCounts.map((item) => ({
            type: item.type,
            count: item.count
        })),
        items: data.items.map((item) => ({
            id: item.id,
            timestamp: protoInt64ToNumber(item.timestamp) ?? 0,
            level: item.level === 2 ? ('ERROR' as const) : ('WARN' as const),
            logger: item.logger,
            message: item.message
        }))
    };
}

function mapServerMetrics(
    data: GetAdminServerMetricsData
): AdminServerMetricsResponse {
    return {
        startedAt: protoInt64ToNumber(data.startedAt) ?? 0,
        asOf: protoInt64ToNumber(data.asOf) ?? 0,
        lastSampleAt: protoInt64ToNumber(data.lastSampleAt),
        loadAverageSupported: data.loadAverageSupported,
        windows: data.windows.map((window) => ({
            key: window.key === 2 ? ('24h' as const) : ('4h' as const),
            label: window.label,
            bucketSeconds: window.bucketSeconds,
            bucketCount: window.bucketCount,
            coverageSeconds: window.coverageSeconds,
            isPartial: window.isPartial,
            latest: window.latest ? mapMetricsBucket(window.latest) : null,
            peaks: mapPeaks(window.peaks),
            topRoutes: {
                ssr: window.topRoutes?.ssr.map(mapMetricsTopRoute) ?? [],
                api: window.topRoutes?.api.map(mapMetricsTopRoute) ?? []
            },
            buckets: window.buckets.map(mapMetricsBucket)
        }))
    };
}

function mapMetricsPeak(
    peak:
        | { startAt: bigint | number; endAt: bigint | number; value: number }
        | undefined
) {
    if (!peak) {
        return null;
    }
    return {
        startAt: protoInt64ToNumber(peak.startAt) ?? 0,
        endAt: protoInt64ToNumber(peak.endAt) ?? 0,
        value: peak.value
    };
}

function mapMetricsBucket(bucket: {
    startAt: bigint | number;
    endAt: bigint | number;
    systemSampleCount: number;
    cpuPercent?: number | undefined;
    memoryUsedRatio?: number | undefined;
    memoryUsedBytes?: number | undefined;
    memoryTotalBytes?: number | undefined;
    load1m?: number | undefined;
    ssrRequestCount: number;
    ssrAvgDurationMs?: number | undefined;
    ssrP50DurationMs?: number | undefined;
    ssrP75DurationMs?: number | undefined;
    ssrP95DurationMs?: number | undefined;
    apiRequestCount: number;
    apiAvgDurationMs?: number | undefined;
    apiP50DurationMs?: number | undefined;
    apiP75DurationMs?: number | undefined;
    apiP95DurationMs?: number | undefined;
}) {
    return {
        startAt: protoInt64ToNumber(bucket.startAt) ?? 0,
        endAt: protoInt64ToNumber(bucket.endAt) ?? 0,
        systemSampleCount: bucket.systemSampleCount,
        cpuPercent: bucket.cpuPercent ?? null,
        memoryUsedRatio: bucket.memoryUsedRatio ?? null,
        memoryUsedBytes: bucket.memoryUsedBytes ?? null,
        memoryTotalBytes: bucket.memoryTotalBytes ?? null,
        load1m: bucket.load1m ?? null,
        ssrRequestCount: bucket.ssrRequestCount,
        ssrAvgDurationMs: bucket.ssrAvgDurationMs ?? null,
        ssrP50DurationMs: bucket.ssrP50DurationMs ?? null,
        ssrP75DurationMs: bucket.ssrP75DurationMs ?? null,
        ssrP95DurationMs: bucket.ssrP95DurationMs ?? null,
        apiRequestCount: bucket.apiRequestCount,
        apiAvgDurationMs: bucket.apiAvgDurationMs ?? null,
        apiP50DurationMs: bucket.apiP50DurationMs ?? null,
        apiP75DurationMs: bucket.apiP75DurationMs ?? null,
        apiP95DurationMs: bucket.apiP95DurationMs ?? null
    };
}

function mapMetricsTopRoute(route: {
    path: string;
    requestCount: number;
    avgDurationMs?: number | undefined;
    p50DurationMs?: number | undefined;
    p75DurationMs?: number | undefined;
    p95DurationMs?: number | undefined;
}) {
    return {
        path: route.path,
        requestCount: route.requestCount,
        avgDurationMs: route.avgDurationMs ?? null,
        p50DurationMs: route.p50DurationMs ?? null,
        p75DurationMs: route.p75DurationMs ?? null,
        p95DurationMs: route.p95DurationMs ?? null
    };
}

function mapPeaks(
    peaks: Record<
        string,
        { startAt: bigint | number; endAt: bigint | number; value: number }
    >
) {
    return {
        cpuPercentBucket: mapMetricsPeak(peaks.cpuPercentBucket),
        memoryUsedRatioBucket: mapMetricsPeak(peaks.memoryUsedRatioBucket),
        load1mBucket: mapMetricsPeak(peaks.load1mBucket),
        ssrAvgDurationMsBucket: mapMetricsPeak(peaks.ssrAvgDurationMsBucket),
        ssrP50DurationMsBucket: mapMetricsPeak(peaks.ssrP50DurationMsBucket),
        ssrP75DurationMsBucket: mapMetricsPeak(peaks.ssrP75DurationMsBucket),
        ssrP95DurationMsBucket: mapMetricsPeak(peaks.ssrP95DurationMsBucket),
        apiAvgDurationMsBucket: mapMetricsPeak(peaks.apiAvgDurationMsBucket),
        apiP50DurationMsBucket: mapMetricsPeak(peaks.apiP50DurationMsBucket),
        apiP75DurationMsBucket: mapMetricsPeak(peaks.apiP75DurationMsBucket),
        apiP95DurationMsBucket: mapMetricsPeak(peaks.apiP95DurationMsBucket)
    };
}

function mapTasks(data: GetAdminTasksData): AdminTaskOverviewResponse {
    return {
        asOf: protoInt64ToNumber(data.asOf) ?? 0,
        nextTaskId: protoInt64ToNumber(data.nextTaskId),
        remainingTotal: data.remainingTotal,
        remainingWithin10Minutes: data.remainingWithin10Minutes,
        remainingWithin30Minutes: data.remainingWithin30Minutes,
        remainingWithin1Hour: data.remainingWithin1Hour,
        couplingScanOptions: data.couplingScanOptions.map((item) => ({
            bureau: item.bureau,
            models: item.models
        }))
    };
}

function mapCreateTask(data: PostAdminTasksData): AdminCreateTaskResponse {
    return {
        type: data.type as AdminCreateTaskResponse['type'],
        createdCount: data.createdCount,
        createdTasks: data.createdTasks.map((task) => ({
            taskId: task.taskId,
            executor: task.executor,
            executionTime: protoInt64ToNumber(task.executionTime) ?? 0
        })),
        summary: data.summary,
        date: data.date ?? undefined,
        normalizedTrainCodes: data.normalizedTrainCodes
    };
}

function mapCoverageSummary(
    summary:
        | {
              coverageId: number;
              timetableId: number;
              serviceDayStart: number;
              serviceDayEndExclusive: number;
              startStation: string;
              endStation: string;
              stopCount: number;
          }
        | null
        | undefined
) {
    if (!summary) {
        return {
            coverageId: 0,
            timetableId: 0,
            serviceDateStart: '',
            serviceDateEndExclusive: '',
            startStation: '',
            endStation: '',
            stopCount: 0
        };
    }
    return {
        coverageId: summary.coverageId,
        timetableId: summary.timetableId,
        serviceDateStart: epochServiceDayToDateString(summary.serviceDayStart),
        serviceDateEndExclusive: epochServiceDayToDateString(
            summary.serviceDayEndExclusive
        ),
        startStation: summary.startStation,
        endStation: summary.endStation,
        stopCount: summary.stopCount
    };
}

function mapMergeCandidates(
    data: GetAdminTimetableHistoryMergeCandidatesData
): AdminTimetableHistoryMergeCandidatesResponse {
    return {
        trainCode: data.trainCode,
        total: data.total,
        items: data.items.map(
            (item): AdminTimetableHistoryCoverageMergeCandidate => ({
                coverageId: item.coverageId,
                previous: mapCoverageSummary(item.previous),
                middle: mapCoverageSummary(item.middle),
                next: mapCoverageSummary(item.next),
                mergedServiceDateStart: epochServiceDayToDateString(
                    item.mergedServiceDayStart
                ),
                mergedServiceDateEndExclusive: epochServiceDayToDateString(
                    item.mergedServiceDayEndExclusive
                )
            })
        )
    };
}

function mapCoverageMerge(
    data: DeleteAdminTimetableHistoryCoverageData
): AdminTimetableHistoryCoverageMergeResponse {
    return {
        trainCode: data.trainCode,
        deletedCoverageIds: data.deletedCoverageIds,
        previous: mapCoverageSummary(data.previous),
        middle: mapCoverageSummary(data.middle),
        next: mapCoverageSummary(data.next),
        merged: mapCoverageSummary(data.merged)
    };
}

function mapTrafficMetricKey(value: string): AdminTrafficMetricKey | null {
    switch (value) {
        case 'webRequests':
            return 'webRequests';
        case 'apiCalls':
            return 'apiCalls';
        case 'uniqueVisitors':
            return 'uniqueVisitors';
        case 'activeUsers':
            return 'activeUsers';
        default:
            return null;
    }
}

function mapTrafficMetricKeys(values: string[]): AdminTrafficMetricKey[] {
    return values
        .map(mapTrafficMetricKey)
        .filter((value): value is AdminTrafficMetricKey => value !== null);
}

function mapTraffic(data: GetAdminTrafficData): AdminTrafficResponse {
    return {
        startedAt: protoInt64ToNumber(data.startedAt) ?? 0,
        asOf: protoInt64ToNumber(data.asOf) ?? 0,
        windows: data.windows.map((window) => ({
            key:
                window.key === 1
                    ? ('3h' as const)
                    : window.key === 2
                      ? ('24h' as const)
                      : ('7d' as const),
            label: window.label,
            bucketSeconds: window.bucketSeconds,
            bucketCount: window.bucketCount,
            coverageSeconds: window.coverageSeconds,
            isPartial: window.isPartial,
            estimatedMetrics: mapTrafficMetricKeys(window.estimatedMetrics),
            totals: {
                webRequests: window.totals?.webRequests ?? 0,
                apiCalls: window.totals?.apiCalls ?? 0,
                uniqueVisitors: window.totals?.uniqueVisitors ?? 0,
                activeUsers: window.totals?.activeUsers ?? 0
            },
            peaks: mapTrafficPeaks(window.peaks),
            buckets: window.buckets.map((bucket) => ({
                startAt: protoInt64ToNumber(bucket.startAt) ?? 0,
                endAt: protoInt64ToNumber(bucket.endAt) ?? 0,
                webRequests: bucket.webRequests,
                apiCalls: bucket.apiCalls,
                uniqueVisitors: bucket.uniqueVisitors,
                activeUsers: bucket.activeUsers
            }))
        }))
    };
}

function mapTrafficPeaks(
    peaks: Record<
        string,
        { startAt: bigint | number; endAt: bigint | number; value: number }
    >
) {
    return {
        webRequests: 0,
        apiCalls: 0,
        uniqueVisitors: 0,
        activeUsers: 0,
        webRequestsBucket: mapMetricsPeak(peaks.webRequestsBucket),
        apiCallsBucket: mapMetricsPeak(peaks.apiCallsBucket),
        uniqueVisitorsBucket: mapMetricsPeak(peaks.uniqueVisitorsBucket),
        activeUsersBucket: mapMetricsPeak(peaks.activeUsersBucket)
    };
}

function mapRevokeWebappTokens(
    data: PostAdminWebappTokensRevokeAllData
): AdminRevokeAllWebappTokensResponse {
    return {
        issuer: data.issuer === 'webapp' ? 'webapp' : 'webapp',
        revokedCount: data.revokedCount,
        revokedAt: protoInt64ToNumber(data.revokedAt) ?? 0,
        revokedCurrentSession: data.revokedCurrentSession
    };
}

export async function fetchAdminAnomalyScan(
    input: V2RequestInput,
    signal?: AbortSignal
) {
    const result = await requestV2<
        GetAdminAnomalyScanData,
        AdminAnomalyScanResponse
    >(GetAdminAnomalyScan, input, mapAnomalyScan, {
        signal,
        retry: 0
    });
    return requireSuccess(GetAdminAnomalyScan, result);
}

export async function deleteAdminAnomalyRoute(date: string, routeId: number) {
    const result = await requestV2<
        PostAdminAnomalyDeleteRouteData,
        AdminAnomalyDeleteRouteResponse
    >(
        PostAdminAnomalyDeleteRoute,
        { body: { date, routeId } },
        mapAnomalyDeleteRoute
    );
    return requireSuccess(PostAdminAnomalyDeleteRoute, result);
}

export async function bulkDeleteAdminAnomaly(
    date: string,
    type: AdminAnomalyScanResponse['items'][number]['type']
) {
    const result = await requestV2<
        PostAdminAnomalyDeleteByTypeData,
        AdminAnomalyBulkDeleteResponse
    >(
        PostAdminAnomalyDeleteByType,
        { body: { date, type: toAnomalyType(type) } },
        mapAnomalyBulkDelete
    );
    return requireSuccess(PostAdminAnomalyDeleteByType, result);
}

export async function fetchAdminConfigFiles(
    input: V2RequestInput = {},
    signal?: AbortSignal
) {
    const result = await requestV2<
        GetAdminConfigFilesData,
        AdminConfigFilesResponse
    >(GetAdminConfigFiles, input, mapConfigFiles, {
        signal,
        retry: 0
    });
    return requireSuccess(GetAdminConfigFiles, result);
}

export async function createAdminConfigFile(
    target: AdminConfigFileTarget,
    action: AdminConfigFileAction
) {
    const result = await requestV2<
        PostAdminConfigFilesData,
        AdminConfigFileActionResponse
    >(
        PostAdminConfigFiles,
        {
            body: {
                target: toConfigFileTarget(target),
                action: toConfigFileAction(action)
            }
        },
        mapConfigFileActionResponse
    );
    return requireSuccess(PostAdminConfigFiles, result);
}

export async function fetchAdminConfigFile(
    target: AdminConfigFileTarget,
    signal?: AbortSignal
) {
    const result = await requestV2<
        GetAdminConfigFileData,
        {
            content: string;
            revision: string;
            filePath: string;
            modifiedAt: number;
        }
    >(
        GetAdminConfigFile,
        { params: { target } },
        (data) => ({
            content: data.content,
            revision: data.revision,
            filePath: data.filePath,
            modifiedAt: protoInt64ToNumber(data.modifiedAt) ?? 0
        }),
        { signal, retry: 0 }
    );
    return requireSuccess(GetAdminConfigFile, result);
}

export async function updateAdminConfigFile(
    target: AdminConfigFileTarget,
    content: string,
    expectedRevision: string
) {
    const result = await requestV2<
        PutAdminConfigFileData,
        {
            summary: string;
            revision: string;
            modifiedAt: number;
            item: ReturnType<typeof mapConfigFileItem>;
        }
    >(
        PutAdminConfigFile,
        {
            params: { target },
            body: {
                target: toConfigFileTarget(target),
                content,
                expectedRevision
            }
        },
        (data) => ({
            summary: data.summary,
            revision: data.revision,
            modifiedAt: protoInt64ToNumber(data.modifiedAt) ?? 0,
            item: data.item
                ? mapConfigFileItem(data.item)
                : createEmptyConfigFileItem(target)
        })
    );
    return requireSuccess(PutAdminConfigFile, result);
}

export async function fetchAdminDailyRoutes(
    input: V2RequestInput,
    signal?: AbortSignal
) {
    const result = await requestV2<
        GetAdminDailyRoutesData,
        AdminDailyRouteSearchResponse
    >(GetAdminDailyRoutes, input, mapDailyRoutes, {
        signal,
        retry: 0
    });
    return requireSuccess(GetAdminDailyRoutes, result);
}

export async function createAdminDailyRoute(input: {
    date: string;
    trainCode: string;
    emuCode: string;
    timetableId?: number;
    status: number;
}) {
    const result = await requestV2<
        PostAdminDailyRoutesData,
        AdminDailyRouteCreateResponse
    >(
        PostAdminDailyRoutes,
        {
            body: {
                date: input.date,
                trainCode: input.trainCode,
                emuCode: input.emuCode,
                ...(input.timetableId === undefined
                    ? {}
                    : { timetableId: input.timetableId }),
                status: input.status
            }
        },
        mapDailyRouteCreate
    );
    return requireSuccess(PostAdminDailyRoutes, result);
}

export async function deleteAdminDailyRoute(date: string, routeId: string) {
    const result = await requestV2<
        DeleteAdminDailyRouteData,
        AdminDailyRouteDeleteResponse
    >(
        DeleteAdminDailyRoute,
        { params: { id: routeId }, query: { date } },
        mapDailyRouteDelete
    );
    return requireSuccess(DeleteAdminDailyRoute, result);
}

export async function fetchAdminDailyRoutesTimetables(
    input: V2RequestInput,
    signal?: AbortSignal
) {
    const result = await requestV2<
        GetAdminDailyRoutesTimetablesData,
        AdminDailyRouteTimetableCandidatesResponse
    >(GetAdminDailyRoutesTimetables, input, mapDailyRouteTimetables, {
        signal,
        retry: 0
    });
    return requireSuccess(GetAdminDailyRoutesTimetables, result);
}

export async function fetchAdminMembershipCodes(
    input: V2RequestInput,
    signal?: AbortSignal
) {
    const result = await requestV2<
        GetAdminMembershipCodesData,
        AdminMembershipCodeListResponse
    >(GetAdminMembershipCodes, input, mapMembershipCodes, {
        signal,
        retry: 0
    });
    return requireSuccess(GetAdminMembershipCodes, result);
}

export async function createAdminMembershipCodeBatch(input: {
    groupId: string;
    quantity: number;
    durationDays: number;
}) {
    const result = await requestV2<
        PostAdminMembershipCodesData,
        { batch: AdminMembershipCodeBatchSummary }
    >(PostAdminMembershipCodes, { body: input }, (data) => ({
        batch: mapMembershipCodeBatch(data.batch)
    }));
    return requireSuccess(PostAdminMembershipCodes, result);
}

export async function fetchAdminOauthClients(
    input: V2RequestInput = {},
    signal?: AbortSignal
) {
    const result = await requestV2<
        GetAdminOauthClientsData,
        OAuthClientListResponse
    >(GetAdminOauthClients, input, mapOauthClients, {
        signal,
        retry: 0
    });
    return requireSuccess(GetAdminOauthClients, result);
}

export async function updateAdminOauthClient(input: {
    clientId: string;
    status: 'active' | 'disabled';
    isTrusted?: boolean;
    scopeReviews: Array<{
        scope: string;
        reviewStatus: 'pending' | 'approved' | 'rejected';
    }>;
    adminGrants: {
        notificationSend?: boolean;
    };
}) {
    const result = await requestV2<
        PatchAdminOauthClientData,
        OAuthClientMutationResponse
    >(
        PatchAdminOauthClient,
        {
            params: { clientId: input.clientId },
            body: {
                clientId: input.clientId,
                status: input.status === 'active' ? 1 : 2,
                ...(input.isTrusted === undefined
                    ? {}
                    : { isTrusted: input.isTrusted }),
                scopeReviews: input.scopeReviews.map((review) => ({
                    scope: review.scope,
                    reviewStatus:
                        review.reviewStatus === 'approved'
                            ? 2
                            : review.reviewStatus === 'rejected'
                              ? 3
                              : 1
                })),
                adminGrants: {
                    ...(input.adminGrants.notificationSend === undefined
                        ? {}
                        : {
                              notificationSend:
                                  input.adminGrants.notificationSend
                          })
                }
            }
        },
        mapOauthClientMutation
    );
    return requireSuccess(PatchAdminOauthClient, result);
}

export async function revokeAdminOauthClientTokens(clientId: string) {
    const result = await requestV2<
        PostAdminOauthClientRevokeTokensData,
        { revokedCount: number }
    >(
        PostAdminOauthClientRevokeTokens,
        { params: { clientId }, body: { clientId } },
        (data) => ({
            revokedCount: data.revokedCount
        })
    );
    return requireSuccess(PostAdminOauthClientRevokeTokens, result);
}

export async function fetchAdminOfficialCirculations(
    input: V2RequestInput,
    signal?: AbortSignal
) {
    const result = await requestV2<
        GetAdminOfficialCirculationsData,
        AdminOfficialCirculationSearchResponse
    >(GetAdminOfficialCirculations, input, mapOfficialCirculations, {
        signal,
        retry: 0
    });
    return requireSuccess(GetAdminOfficialCirculations, result);
}

export async function deleteAdminOfficialCirculation(entryKey: string) {
    const result = await requestV2<
        DeleteAdminOfficialCirculationData,
        AdminOfficialCirculationDeleteResponse
    >(
        DeleteAdminOfficialCirculation,
        { params: { entryKey } },
        mapOfficialCirculationDelete
    );
    return requireSuccess(DeleteAdminOfficialCirculation, result);
}

export async function fetchAdminPassiveAlerts(
    input: V2RequestInput,
    signal?: AbortSignal
) {
    const result = await requestV2<
        GetAdminPassiveAlertsData,
        AdminPassiveAlertsResponse
    >(GetAdminPassiveAlerts, input, mapPassiveAlerts, {
        signal,
        retry: 0
    });
    return requireSuccess(GetAdminPassiveAlerts, result);
}

export async function fetchAdminServerMetrics(
    input: V2RequestInput = {},
    signal?: AbortSignal
) {
    const result = await requestV2<
        GetAdminServerMetricsData,
        AdminServerMetricsResponse
    >(GetAdminServerMetrics, input, mapServerMetrics, {
        signal,
        retry: 0
    });
    return requireSuccess(GetAdminServerMetrics, result);
}

export async function fetchAdminTasks(
    input: V2RequestInput = {},
    signal?: AbortSignal
) {
    const result = await requestV2<
        GetAdminTasksData,
        AdminTaskOverviewResponse
    >(GetAdminTasks, input, mapTasks, {
        signal,
        retry: 0
    });
    return requireSuccess(GetAdminTasks, result);
}

function createAdminTaskRequestBody(
    task: AdminCreateTaskRequest
): MessageInitShape<typeof PostAdminTasks.requestSchema> {
    switch (task.type) {
        case 'regenerate_daily_export':
            return {
                task: {
                    case: 'regenerateDailyExport',
                    value: { date: task.payload.date }
                }
            };
        case 'refresh_route_info_now':
            return {
                task: {
                    case: 'refreshRouteInfoNow',
                    value: { trainCodes: task.payload.trainCodes }
                }
            };
        case 'refresh_train_circulation_now':
            return {
                task: {
                    case: 'refreshTrainCirculationNow',
                    value: { trainCode: task.payload.trainCode }
                }
            };
        case 'refresh_all_routes_and_requeue_probe_now':
            return {
                task: {
                    case: 'refreshAllRoutesAndRequeueProbeNow',
                    value: {}
                }
            };
        case 'detect_coupled_emu_group_now':
            return {
                task: {
                    case: 'detectCoupledEmuGroupNow',
                    value: {
                        bureau: task.payload.bureau,
                        model: task.payload.model
                    }
                }
            };
        case 'run_qrcode_detection_now':
            return {
                task: {
                    case: 'runQrcodeDetectionNow',
                    value: {}
                }
            };
        case 'dispatch_station_board_tasks_now':
            return {
                task: {
                    case: 'dispatchStationBoardTasksNow',
                    value: {}
                }
            };
        default:
            task satisfies never;
            throw new Error('Unsupported admin task type');
    }
}

export async function createAdminTask(task: AdminCreateTaskRequest) {
    const result = await requestV2<PostAdminTasksData, AdminCreateTaskResponse>(
        PostAdminTasks,
        { body: createAdminTaskRequestBody(task) },
        mapCreateTask
    );
    return requireSuccess(PostAdminTasks, result);
}

export async function fetchAdminTimetableHistoryMergeCandidates(
    trainCode: string,
    signal?: AbortSignal
) {
    const result = await requestV2<
        GetAdminTimetableHistoryMergeCandidatesData,
        AdminTimetableHistoryMergeCandidatesResponse
    >(
        GetAdminTimetableHistoryMergeCandidates,
        { query: { trainCode } },
        mapMergeCandidates,
        { signal, retry: 0 }
    );
    return requireSuccess(GetAdminTimetableHistoryMergeCandidates, result);
}

export async function deleteAdminTimetableHistoryCoverage(coverageId: number) {
    const result = await requestV2<
        DeleteAdminTimetableHistoryCoverageData,
        AdminTimetableHistoryCoverageMergeResponse
    >(
        DeleteAdminTimetableHistoryCoverage,
        { params: { coverageId: String(coverageId) } },
        mapCoverageMerge
    );
    return requireSuccess(DeleteAdminTimetableHistoryCoverage, result);
}

export async function fetchAdminTraffic(
    input: V2RequestInput = {},
    signal?: AbortSignal
) {
    const result = await requestV2<GetAdminTrafficData, AdminTrafficResponse>(
        GetAdminTraffic,
        input,
        mapTraffic,
        { signal, retry: 0 }
    );
    return requireSuccess(GetAdminTraffic, result);
}

export async function revokeAllAdminWebappTokens() {
    const result = await requestV2<
        PostAdminWebappTokensRevokeAllData,
        AdminRevokeAllWebappTokensResponse
    >(PostAdminWebappTokensRevokeAll, {}, mapRevokeWebappTokens);
    return requireSuccess(PostAdminWebappTokensRevokeAll, result);
}
