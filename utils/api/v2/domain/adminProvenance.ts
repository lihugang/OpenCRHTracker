import type {
    GetAdminTrainProvenanceCouplingScanData,
    GetAdminTrainProvenanceCouplingScanTasksData,
    GetAdminTrainProvenanceData,
    GetAdminTrainProvenanceQrcodeScanData,
    GetAdminTrainProvenanceQrcodeScanTasksData,
    GetAdminTrainProvenanceRequestStatsData,
    GetAdminTrainProvenanceStationBoardData,
    GetAdminTrainProvenanceStationBoardTasksData,
    GetAdminTrainProvenanceStationPlatformRefreshData
} from '#shared/generated/proto/opencrh/v2/admin_provenance_pb';
import {
    GetAdminTrainProvenance,
    GetAdminTrainProvenanceCouplingScan,
    GetAdminTrainProvenanceCouplingScanTasks,
    GetAdminTrainProvenanceQrcodeScan,
    GetAdminTrainProvenanceQrcodeScanTasks,
    GetAdminTrainProvenanceRequestStats,
    GetAdminTrainProvenanceStationBoard,
    GetAdminTrainProvenanceStationBoardTasks,
    GetAdminTrainProvenanceStationPlatformRefresh
} from '#shared/api/v2/registry/adminProvenance';
import type {
    AdminCouplingScanCandidate,
    AdminCouplingScanDetailResponse,
    AdminCouplingScanTaskListItem,
    AdminCouplingScanTaskListResponse,
    AdminCouplingScanTaskRunSummary,
    AdminQrcodeScanDetailResponse,
    AdminQrcodeScanTaskListResponse,
    AdminQrcodeScanTimeDetailTaskItem,
    AdminQrcodeScanTimeSummaryItem,
    AdminStationBoardDispatchDetailResponse,
    AdminStationBoardDispatchTaskListItem,
    AdminStationBoardSelectedStationItem,
    AdminStationBoardStationTaskItem,
    AdminStationBoardTaskListResponse,
    AdminStationPlatformRefreshDetailResponse,
    AdminTrainDataRequestHourBucket,
    AdminTrainDataRequestStatsResponse,
    AdminTrainDataRequestSummary,
    AdminTrainDataRequestType,
    AdminTrainDataRequestTypeSummary,
    AdminTrainProvenanceEvent,
    AdminTrainProvenanceResponse,
    AdminTrainProvenanceTaskRunStatus,
    AdminTrainRouteSnapshot
} from '~/types/admin';
import { protoInt64ToNumber } from '~/utils/api/v2/mappers/numbers';
import { epochServiceDayToDateString } from '~/utils/api/v2/mappers/serviceDay';
import { requestV2, type V2RequestInput } from '~/utils/api/v2/transport';
import { requireSuccess } from '~/utils/api/v2/domain/common';

function mapTaskRunStatus(value: number): AdminTrainProvenanceTaskRunStatus {
    switch (value) {
        case 1:
            return 'running';
        case 2:
            return 'success';
        case 3:
            return 'failed';
        case 4:
            return 'skipped';
        default:
            return 'success';
    }
}

function mapLatestStatus(value: number) {
    switch (value) {
        case 1:
            return 'unknown' as const;
        case 2:
            return 'pending' as const;
        case 3:
            return 'single' as const;
        case 4:
            return 'coupled' as const;
        default:
            return 'unknown' as const;
    }
}

function mapOutcomeStatus(value: number | undefined | null) {
    switch (value) {
        case 1:
            return 'success' as const;
        case 2:
            return 'partial' as const;
        case 3:
            return 'failed' as const;
        case 4:
            return 'skipped' as const;
        default:
            return null;
    }
}

function mapStruct(value: unknown): unknown {
    return value ?? null;
}

function mapRouteSnapshot(
    snapshot:
        | {
              serviceDay: number;
              trainCodes: string[];
              internalCode: string;
              startAt?: bigint | number | undefined;
              endAt?: bigint | number | undefined;
              startStation: string;
              endStation: string;
              cacheStatus: string;
              cacheNote: string;
          }
        | null
        | undefined
): AdminTrainRouteSnapshot | null {
    if (!snapshot) {
        return null;
    }
    return {
        serviceDate: epochServiceDayToDateString(snapshot.serviceDay),
        trainCodes: snapshot.trainCodes,
        internalCode: snapshot.internalCode,
        startAt: protoInt64ToNumber(snapshot.startAt),
        endAt: protoInt64ToNumber(snapshot.endAt),
        startStation: snapshot.startStation,
        endStation: snapshot.endStation,
        cacheStatus:
            snapshot.cacheStatus === 'hit'
                ? 'hit'
                : snapshot.cacheStatus === 'miss'
                  ? 'miss'
                  : 'not_applicable',
        cacheNote: snapshot.cacheNote
    };
}

function mapEvent(item: {
    id: number;
    taskRunId: number;
    schedulerTaskId: number;
    executor: string;
    taskStatus: number;
    outcomeStatus?: number | undefined;
    createdAt: bigint | number;
    trainCode: string;
    startAt?: bigint | number | undefined;
    emuCode: string;
    relatedTrainCode: string;
    relatedEmuCode: string;
    eventType: string;
    result: string;
    summary: string;
    linkedSchedulerTaskId?: number | undefined;
    linkedTaskRunId?: number | undefined;
    conflictDetail?: unknown;
    couplingScan?: unknown;
    scannedRoute?: unknown;
    historicalReuse?: unknown;
    coupledResolution?: unknown;
    trackingMutations?: unknown;
    stationPlatformRefresh?: unknown;
    payload?: unknown;
}): AdminTrainProvenanceEvent {
    return {
        id: item.id,
        taskRunId: item.taskRunId,
        schedulerTaskId: item.schedulerTaskId,
        executor: item.executor,
        taskStatus: mapTaskRunStatus(item.taskStatus),
        outcomeStatus: mapOutcomeStatus(item.outcomeStatus),
        createdAt: protoInt64ToNumber(item.createdAt) ?? 0,
        trainCode: item.trainCode,
        startAt: protoInt64ToNumber(item.startAt),
        emuCode: item.emuCode,
        relatedTrainCode: item.relatedTrainCode,
        relatedEmuCode: item.relatedEmuCode,
        eventType: item.eventType,
        result: item.result,
        summary: item.summary,
        linkedSchedulerTaskId: item.linkedSchedulerTaskId ?? null,
        linkedTaskRunId: item.linkedTaskRunId ?? null,
        conflictDetail:
            (mapStruct(
                item.conflictDetail
            ) as AdminTrainProvenanceEvent['conflictDetail']) ?? null,
        couplingScan:
            (mapStruct(
                item.couplingScan
            ) as AdminTrainProvenanceEvent['couplingScan']) ?? null,
        scannedRoute: mapRouteSnapshot(item.scannedRoute as never),
        historicalReuse:
            (mapStruct(
                item.historicalReuse
            ) as AdminTrainProvenanceEvent['historicalReuse']) ?? null,
        coupledResolution:
            (mapStruct(
                item.coupledResolution
            ) as AdminTrainProvenanceEvent['coupledResolution']) ?? null,
        trackingMutations:
            (mapStruct(
                item.trackingMutations
            ) as AdminTrainProvenanceEvent['trackingMutations']) ?? null,
        stationPlatformRefresh:
            (mapStruct(
                item.stationPlatformRefresh
            ) as AdminTrainProvenanceEvent['stationPlatformRefresh']) ?? null,
        payload: mapStruct(item.payload)
    };
}

function mapProvenance(
    data: GetAdminTrainProvenanceData
): AdminTrainProvenanceResponse {
    return {
        enabled: data.enabled,
        retentionDays: data.retentionDays,
        date: data.date,
        trainCode: data.trainCode,
        selectedStartAt: protoInt64ToNumber(data.selectedStartAt),
        departures: data.departures.map((departure) => ({
            startAt: protoInt64ToNumber(departure.startAt) ?? 0,
            endAt: protoInt64ToNumber(departure.endAt),
            startStation: departure.startStation,
            endStation: departure.endStation,
            latestStatus: mapLatestStatus(departure.latestStatus),
            emuCodes: departure.emuCodes,
            dailyRouteRows: departure.dailyRouteRows.map((row) => ({
                id: row.id,
                trainCode: row.trainCode,
                emuCode: row.emuCode,
                serviceDate: epochServiceDayToDateString(row.serviceDay),
                timetableId: row.timetableId ?? null,
                startStation: row.startStation,
                endStation: row.endStation,
                startAt: protoInt64ToNumber(row.startAt) ?? 0,
                endAt: protoInt64ToNumber(row.endAt) ?? 0,
                status: row.status,
                isTimetableResolved: row.isTimetableResolved
            }))
        })),
        timeline: data.timeline.map(mapEvent)
    };
}

function mapCouplingScanTaskRun(item: {
    id: number;
    schedulerTaskId: number;
    executor: string;
    status: number;
    startedAt: bigint | number;
    finishedAt?: bigint | number | undefined;
    serviceDay: number;
    taskArgs?: unknown;
}): AdminCouplingScanTaskRunSummary {
    return {
        id: item.id,
        schedulerTaskId: item.schedulerTaskId,
        executor: item.executor,
        status: mapTaskRunStatus(item.status),
        startedAt: protoInt64ToNumber(item.startedAt) ?? 0,
        finishedAt: protoInt64ToNumber(item.finishedAt),
        serviceDate: epochServiceDayToDateString(item.serviceDay),
        taskArgs: mapStruct(item.taskArgs)
    };
}

function mapCouplingScanTasks(
    data: GetAdminTrainProvenanceCouplingScanTasksData
): AdminCouplingScanTaskListResponse {
    return {
        enabled: data.enabled,
        retentionDays: data.retentionDays,
        date: data.date,
        items: data.items.map(
            (item): AdminCouplingScanTaskListItem => ({
                taskRunId: item.taskRunId,
                schedulerTaskId: item.schedulerTaskId,
                executor: item.executor,
                status: mapTaskRunStatus(item.status),
                startedAt: protoInt64ToNumber(item.startedAt) ?? 0,
                finishedAt: protoInt64ToNumber(item.finishedAt),
                serviceDate: epochServiceDayToDateString(item.serviceDay),
                bureau: item.bureau,
                model: item.model,
                taskArgs: mapStruct(item.taskArgs)
            })
        )
    };
}

function mapCouplingScanCandidate(item: {
    id: number;
    candidateOrder: number;
    serviceDay: number;
    candidateEmuCode: string;
    status: string;
    reason: string;
    scannedTrainCode: string;
    scannedInternalCode: string;
    scannedStartAt?: bigint | number | undefined;
    matchedTrainCode: string;
    matchedStartAt?: bigint | number | undefined;
    trainRepeat: string;
    scannedRoute?: unknown;
    matchedRoute?: unknown;
    occupiedRoutes: unknown[];
    detail?: unknown;
    createdAt: bigint | number;
}): AdminCouplingScanCandidate {
    return {
        id: item.id,
        candidateOrder: item.candidateOrder,
        serviceDate: epochServiceDayToDateString(item.serviceDay),
        candidateEmuCode: item.candidateEmuCode,
        status: item.status,
        reason: item.reason,
        scannedTrainCode: item.scannedTrainCode,
        scannedInternalCode: item.scannedInternalCode,
        scannedStartAt: protoInt64ToNumber(item.scannedStartAt),
        matchedTrainCode: item.matchedTrainCode,
        matchedStartAt: protoInt64ToNumber(item.matchedStartAt),
        trainRepeat: item.trainRepeat,
        scannedRoute: mapRouteSnapshot(item.scannedRoute as never),
        matchedRoute: mapRouteSnapshot(item.matchedRoute as never),
        occupiedRoutes: item.occupiedRoutes
            .map((route) => mapRouteSnapshot(route as never))
            .filter(
                (route): route is AdminTrainRouteSnapshot => route !== null
            ),
        detail: mapStruct(item.detail),
        createdAt: protoInt64ToNumber(item.createdAt) ?? 0
    };
}

function mapCouplingScan(
    data: GetAdminTrainProvenanceCouplingScanData
): AdminCouplingScanDetailResponse {
    return {
        enabled: data.enabled,
        taskRun: data.taskRun ? mapCouplingScanTaskRun(data.taskRun) : null,
        candidates: data.candidates.map(mapCouplingScanCandidate)
    };
}

function mapQrcodeSummary(item: {
    detectedAt: string;
    total: number;
    successCount: number;
    failedCount: number;
    skippedCount: number;
    pendingCouplingCount: number;
}): AdminQrcodeScanTimeSummaryItem {
    return {
        detectedAt: item.detectedAt,
        total: item.total,
        successCount: item.successCount,
        failedCount: item.failedCount,
        skippedCount: item.skippedCount,
        pendingCouplingCount: item.pendingCouplingCount
    };
}

function mapQrcodeTasks(
    data: GetAdminTrainProvenanceQrcodeScanTasksData
): AdminQrcodeScanTaskListResponse {
    return {
        enabled: data.enabled,
        retentionDays: data.retentionDays,
        date: data.date,
        items: data.items.map(mapQrcodeSummary)
    };
}

function mapQrcodeDetail(
    data: GetAdminTrainProvenanceQrcodeScanData
): AdminQrcodeScanDetailResponse {
    return {
        enabled: data.enabled,
        date: data.date,
        detectedAt: data.detectedAt,
        summary: data.summary ? mapQrcodeSummary(data.summary) : null,
        tasks: data.tasks.map((item): AdminQrcodeScanTimeDetailTaskItem => {
            const taskRun = item.taskRun;
            return {
                taskRun: {
                    id: taskRun?.id ?? 0,
                    schedulerTaskId: taskRun?.schedulerTaskId ?? 0,
                    executor: taskRun?.executor ?? '',
                    status: mapTaskRunStatus(taskRun?.status ?? 0),
                    startedAt: protoInt64ToNumber(taskRun?.startedAt) ?? 0,
                    finishedAt: protoInt64ToNumber(taskRun?.finishedAt),
                    serviceDate: taskRun
                        ? epochServiceDayToDateString(taskRun.serviceDay)
                        : '',
                    detectedAt: taskRun?.detectedAt ?? '',
                    emuCode: taskRun?.emuCode ?? '',
                    manualNow: taskRun?.manualNow ?? false,
                    taskArgs: mapStruct(taskRun?.taskArgs)
                },
                timeline: item.timeline.map(mapEvent)
            };
        })
    };
}

function mapRequestMetrics(item: {
    total: number;
    success: number;
    failure: number;
    successRate?: number | undefined;
}): AdminTrainDataRequestSummary {
    return {
        total: item.total,
        success: item.success,
        failure: item.failure,
        successRate: item.successRate ?? null,
        compareTotal: 0,
        compareSuccess: 0,
        compareFailure: 0,
        totalDelta: 0,
        successDelta: 0,
        failureDelta: 0,
        totalChangeRatio: null,
        successChangeRatio: null,
        failureChangeRatio: null
    };
}

function mapRequestType(value: number): AdminTrainDataRequestType {
    switch (value) {
        case 1:
            return 'search_train_code';
        case 2:
            return 'fetch_route_info';
        case 3:
            return 'fetch_emu_by_route';
        case 4:
            return 'fetch_emu_by_seat_code';
        case 5:
            return 'fetch_all_stations';
        case 6:
            return 'fetch_station_board';
        case 7:
            return 'fetch_station_exit_info';
        case 8:
            return 'fetch_station_transport_info';
        default:
            return 'search_train_code';
    }
}

function mapRequestTypeSummary(item: {
    type: number;
    metrics?:
        | {
              total: number;
              success: number;
              failure: number;
              successRate?: number | undefined;
          }
        | undefined;
    comparison?:
        | {
              compareTotal: number;
              compareSuccess: number;
              compareFailure: number;
              totalDelta: number;
              successDelta: number;
              failureDelta: number;
              totalChangeRatio?: number | undefined;
              successChangeRatio?: number | undefined;
              failureChangeRatio?: number | undefined;
          }
        | undefined;
}): AdminTrainDataRequestTypeSummary {
    const metrics = item.metrics;
    const comparison = item.comparison;
    return {
        type: mapRequestType(item.type),
        ...mapRequestMetrics(metrics ?? { total: 0, success: 0, failure: 0 }),
        compareTotal: comparison?.compareTotal ?? 0,
        compareSuccess: comparison?.compareSuccess ?? 0,
        compareFailure: comparison?.compareFailure ?? 0,
        totalDelta: comparison?.totalDelta ?? 0,
        successDelta: comparison?.successDelta ?? 0,
        failureDelta: comparison?.failureDelta ?? 0,
        totalChangeRatio: comparison?.totalChangeRatio ?? null,
        successChangeRatio: comparison?.successChangeRatio ?? null,
        failureChangeRatio: comparison?.failureChangeRatio ?? null
    };
}

function mapRequestStats(
    data: GetAdminTrainProvenanceRequestStatsData
): AdminTrainDataRequestStatsResponse {
    return {
        enabled: data.enabled,
        retentionDays: data.retentionDays,
        date: data.date,
        compareDate: data.compareDate,
        asOf: protoInt64ToNumber(data.asOf) ?? 0,
        totals: {
            ...mapRequestMetrics(
                data.totals ?? { total: 0, success: 0, failure: 0 }
            ),
            compareTotal: data.comparison?.compareTotal ?? 0,
            compareSuccess: data.comparison?.compareSuccess ?? 0,
            compareFailure: data.comparison?.compareFailure ?? 0,
            totalDelta: data.comparison?.totalDelta ?? 0,
            successDelta: data.comparison?.successDelta ?? 0,
            failureDelta: data.comparison?.failureDelta ?? 0,
            totalChangeRatio: data.comparison?.totalChangeRatio ?? null,
            successChangeRatio: data.comparison?.successChangeRatio ?? null,
            failureChangeRatio: data.comparison?.failureChangeRatio ?? null
        },
        types: data.types.map(mapRequestTypeSummary),
        hours: data.hours.map(
            (hour): AdminTrainDataRequestHourBucket => ({
                hour: hour.hour,
                startAt: protoInt64ToNumber(hour.startAt) ?? 0,
                endAt: protoInt64ToNumber(hour.endAt) ?? 0,
                ...mapRequestMetrics(
                    hour.metrics ?? { total: 0, success: 0, failure: 0 }
                ),
                compareTotal: hour.comparison?.compareTotal ?? 0,
                compareSuccess: hour.comparison?.compareSuccess ?? 0,
                compareFailure: hour.comparison?.compareFailure ?? 0,
                totalDelta: hour.comparison?.totalDelta ?? 0,
                successDelta: hour.comparison?.successDelta ?? 0,
                failureDelta: hour.comparison?.failureDelta ?? 0,
                totalChangeRatio: hour.comparison?.totalChangeRatio ?? null,
                successChangeRatio: hour.comparison?.successChangeRatio ?? null,
                failureChangeRatio: hour.comparison?.failureChangeRatio ?? null,
                types: hour.types.map(mapRequestTypeSummary)
            })
        )
    };
}

function mapSelectedStationItem(item: {
    key: string;
    stationName: string;
    stationTelecode: string;
    displayName: string;
}): AdminStationBoardSelectedStationItem {
    return {
        key: item.key,
        stationName: item.stationName,
        stationTelecode: item.stationTelecode,
        displayName: item.displayName
    };
}

function mapStationBoardRow(row: {
    trainNo: string;
    stationTrainCode: string;
    circulationTrain: string;
    startStationName: string;
    endStationName: string;
    saveStatus: string;
    saveReasonCode: string;
    saveReasonText: string;
}) {
    return {
        trainNo: row.trainNo,
        stationTrainCode: row.stationTrainCode,
        circulationTrain: row.circulationTrain,
        startStationName: row.startStationName,
        endStationName: row.endStationName,
        saveStatus:
            row.saveStatus === 'saved'
                ? ('saved' as const)
                : row.saveStatus === 'not_saved'
                  ? ('not_saved' as const)
                  : ('unknown_legacy' as const),
        saveReasonCode: row.saveReasonCode,
        saveReasonText: row.saveReasonText
    };
}

function mapStationTask(item: {
    key: string;
    stationName: string;
    stationTelecode: string;
    displayName: string;
    action: number;
    schedulerTaskId?: number | undefined;
    taskRunId?: number | undefined;
    taskStatus?: number | undefined;
    startedAt?: bigint | number | undefined;
    finishedAt?: bigint | number | undefined;
    resultStatus?: number | undefined;
    rowCount: number;
    parsedEntryCount: number;
    savedEntryCount: number;
    consumedQueueEntryCount: number;
    rows: Array<{
        trainNo: string;
        stationTrainCode: string;
        circulationTrain: string;
        startStationName: string;
        endStationName: string;
        saveStatus: string;
        saveReasonCode: string;
        saveReasonText: string;
    }>;
    ambiguousTelecodes: string[];
}): AdminStationBoardStationTaskItem {
    return {
        key: item.key,
        stationName: item.stationName,
        stationTelecode: item.stationTelecode,
        displayName: item.displayName,
        action:
            item.action === 1
                ? 'created'
                : item.action === 2
                  ? 'reused'
                  : item.action === 3
                    ? 'station_telecode_not_found'
                    : 'station_telecode_ambiguous',
        schedulerTaskId: item.schedulerTaskId ?? null,
        taskRunId: item.taskRunId ?? null,
        taskStatus:
            item.taskStatus === undefined
                ? null
                : mapTaskRunStatus(item.taskStatus),
        startedAt: protoInt64ToNumber(item.startedAt),
        finishedAt: protoInt64ToNumber(item.finishedAt),
        resultStatus:
            item.resultStatus === undefined
                ? null
                : item.resultStatus === 1
                  ? 'saved_entries'
                  : 'no_official_entries',
        rowCount: item.rowCount,
        parsedEntryCount: item.parsedEntryCount,
        savedEntryCount: item.savedEntryCount,
        consumedQueueEntryCount: item.consumedQueueEntryCount,
        rows: item.rows.map(mapStationBoardRow),
        ambiguousTelecodes: item.ambiguousTelecodes
    };
}

function mapStationBoard(
    data: GetAdminTrainProvenanceStationBoardData
): AdminStationBoardDispatchDetailResponse {
    return {
        enabled: data.enabled,
        taskRunId: data.taskRunId,
        schedulerTaskId: data.schedulerTaskId ?? null,
        serviceDate: epochServiceDayToDateString(data.serviceDay),
        status:
            data.status === undefined ? null : mapTaskRunStatus(data.status),
        startedAt: protoInt64ToNumber(data.startedAt),
        finishedAt: protoInt64ToNumber(data.finishedAt),
        candidateGroupCount: data.candidateGroupCount,
        selectedStations: data.selectedStations,
        selectedStationItems: data.selectedStationItems.map(
            mapSelectedStationItem
        ),
        createdTaskCount: data.createdTaskCount,
        reusedTaskCount: data.reusedTaskCount,
        skippedNotFoundCount: data.skippedNotFoundCount,
        skippedAmbiguousCount: data.skippedAmbiguousCount,
        stations: data.stations.map(mapStationTask)
    };
}

function mapStationBoardTasks(
    data: GetAdminTrainProvenanceStationBoardTasksData
): AdminStationBoardTaskListResponse {
    return {
        enabled: data.enabled,
        retentionDays: data.retentionDays,
        date: data.date,
        items: data.items.map(
            (item): AdminStationBoardDispatchTaskListItem => ({
                taskRunId: item.taskRunId,
                schedulerTaskId: item.schedulerTaskId,
                executor: item.executor,
                status: mapTaskRunStatus(item.status),
                startedAt: protoInt64ToNumber(item.startedAt) ?? 0,
                finishedAt: protoInt64ToNumber(item.finishedAt),
                serviceDate: epochServiceDayToDateString(item.serviceDay),
                candidateGroupCount: item.candidateGroupCount,
                selectedStationCount: item.selectedStationCount,
                createdTaskCount: item.createdTaskCount,
                reusedTaskCount: item.reusedTaskCount,
                skippedNotFoundCount: item.skippedNotFoundCount,
                skippedAmbiguousCount: item.skippedAmbiguousCount,
                selectedStations: item.selectedStations,
                selectedStationItems: item.selectedStationItems.map(
                    mapSelectedStationItem
                ),
                taskArgs: mapStruct(item.taskArgs)
            })
        )
    };
}

function mapPlatformRefresh(
    data: GetAdminTrainProvenanceStationPlatformRefreshData
): AdminStationPlatformRefreshDetailResponse {
    type ResultItem = NonNullable<
        AdminStationPlatformRefreshDetailResponse['result']
    >;
    const result = data.result;
    const summary = result?.summary;
    return {
        enabled: data.enabled,
        result: result
            ? {
                  resultId: summary?.resultId ?? 0,
                  trigger:
                      summary?.trigger === 1
                          ? ('route_refresh' as const)
                          : summary?.trigger === 3
                            ? ('scheduled_task' as const)
                            : ('station_board' as const),
                  status: mapOutcomeStatus(
                      summary?.status
                  ) as ResultItem['status'],
                  candidateCount: summary?.candidateCount ?? 0,
                  updatedCount: summary?.updatedCount ?? 0,
                  cacheHitCount: summary?.cacheHitCount ?? 0,
                  cacheFallbackCount: summary?.cacheFallbackCount ?? 0,
                  noDataCount: summary?.noDataCount ?? 0,
                  failedCount: summary?.failedCount ?? 0,
                  taskRunId: result.taskRunId,
                  serviceDate: epochServiceDayToDateString(result.serviceDay),
                  startAt: protoInt64ToNumber(result.startAt),
                  primaryTrainCode: result.primaryTrainCode,
                  trainCodes: result.trainCodes,
                  errorMessage: result.errorMessage,
                  createdAt: protoInt64ToNumber(result.createdAt) ?? 0
              }
            : null,
        entries: data.entries.map((entry) => ({
            id: entry.id,
            stationOrder: entry.stationOrder,
            lookupType: entry.lookupType,
            stationName: entry.stationName,
            stationTelecode: entry.stationTelecode,
            stationNo: entry.stationNo,
            trainDate: entry.trainDate,
            stationTrainCodes: entry.stationTrainCodes,
            attemptedTrainCodes: entry.attemptedTrainCodes,
            status:
                entry.status === 1
                    ? 'updated'
                    : entry.status === 2
                      ? 'cache_hit'
                      : entry.status === 3
                        ? 'cache_fallback'
                        : entry.status === 4
                          ? 'no_data'
                          : entry.status === 5
                            ? 'request_failed'
                            : 'persist_failed',
            platformNo: entry.platformNo ?? null,
            wicket: entry.wicket ?? null,
            fetchedAt: protoInt64ToNumber(entry.fetchedAt),
            errorMessage: entry.errorMessage
        }))
    };
}

export async function fetchAdminTrainProvenance(
    input: V2RequestInput,
    signal?: AbortSignal
) {
    const result = await requestV2<
        GetAdminTrainProvenanceData,
        AdminTrainProvenanceResponse
    >(GetAdminTrainProvenance, input, mapProvenance, {
        signal,
        retry: 0
    });
    return requireSuccess(GetAdminTrainProvenance, result);
}

export async function fetchAdminTrainProvenanceCouplingScan(
    input: V2RequestInput,
    signal?: AbortSignal
) {
    const result = await requestV2<
        GetAdminTrainProvenanceCouplingScanData,
        AdminCouplingScanDetailResponse
    >(GetAdminTrainProvenanceCouplingScan, input, mapCouplingScan, {
        signal,
        retry: 0
    });
    return requireSuccess(GetAdminTrainProvenanceCouplingScan, result);
}

export async function fetchAdminTrainProvenanceCouplingScanTasks(
    input: V2RequestInput,
    signal?: AbortSignal
) {
    const result = await requestV2<
        GetAdminTrainProvenanceCouplingScanTasksData,
        AdminCouplingScanTaskListResponse
    >(GetAdminTrainProvenanceCouplingScanTasks, input, mapCouplingScanTasks, {
        signal,
        retry: 0
    });
    return requireSuccess(GetAdminTrainProvenanceCouplingScanTasks, result);
}

export async function fetchAdminTrainProvenanceQrcodeScan(
    input: V2RequestInput,
    signal?: AbortSignal
) {
    const result = await requestV2<
        GetAdminTrainProvenanceQrcodeScanData,
        AdminQrcodeScanDetailResponse
    >(GetAdminTrainProvenanceQrcodeScan, input, mapQrcodeDetail, {
        signal,
        retry: 0
    });
    return requireSuccess(GetAdminTrainProvenanceQrcodeScan, result);
}

export async function fetchAdminTrainProvenanceQrcodeScanTasks(
    input: V2RequestInput,
    signal?: AbortSignal
) {
    const result = await requestV2<
        GetAdminTrainProvenanceQrcodeScanTasksData,
        AdminQrcodeScanTaskListResponse
    >(GetAdminTrainProvenanceQrcodeScanTasks, input, mapQrcodeTasks, {
        signal,
        retry: 0
    });
    return requireSuccess(GetAdminTrainProvenanceQrcodeScanTasks, result);
}

export async function fetchAdminTrainProvenanceRequestStats(
    input: V2RequestInput,
    signal?: AbortSignal
) {
    const result = await requestV2<
        GetAdminTrainProvenanceRequestStatsData,
        AdminTrainDataRequestStatsResponse
    >(GetAdminTrainProvenanceRequestStats, input, mapRequestStats, {
        signal,
        retry: 0
    });
    return requireSuccess(GetAdminTrainProvenanceRequestStats, result);
}

export async function fetchAdminTrainProvenanceStationBoard(
    input: V2RequestInput,
    signal?: AbortSignal
) {
    const result = await requestV2<
        GetAdminTrainProvenanceStationBoardData,
        AdminStationBoardDispatchDetailResponse
    >(GetAdminTrainProvenanceStationBoard, input, mapStationBoard, {
        signal,
        retry: 0
    });
    return requireSuccess(GetAdminTrainProvenanceStationBoard, result);
}

export async function fetchAdminTrainProvenanceStationBoardTasks(
    input: V2RequestInput,
    signal?: AbortSignal
) {
    const result = await requestV2<
        GetAdminTrainProvenanceStationBoardTasksData,
        AdminStationBoardTaskListResponse
    >(GetAdminTrainProvenanceStationBoardTasks, input, mapStationBoardTasks, {
        signal,
        retry: 0
    });
    return requireSuccess(GetAdminTrainProvenanceStationBoardTasks, result);
}

export async function fetchAdminTrainProvenanceStationPlatformRefresh(
    input: V2RequestInput,
    signal?: AbortSignal
) {
    const result = await requestV2<
        GetAdminTrainProvenanceStationPlatformRefreshData,
        AdminStationPlatformRefreshDetailResponse
    >(
        GetAdminTrainProvenanceStationPlatformRefresh,
        input,
        mapPlatformRefresh,
        { signal, retry: 0 }
    );
    return requireSuccess(
        GetAdminTrainProvenanceStationPlatformRefresh,
        result
    );
}
