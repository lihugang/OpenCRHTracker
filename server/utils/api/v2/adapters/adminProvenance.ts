import {
    getAdminTrainProvenance,
    getAdminTrainProvenanceCouplingScan,
    getAdminTrainProvenanceCouplingScanTasks,
    getAdminTrainProvenanceQrcodeScan,
    getAdminTrainProvenanceQrcodeScanTasks,
    getAdminTrainProvenanceRequestStats,
    getAdminTrainProvenanceStationBoard,
    getAdminTrainProvenanceStationBoardTasks,
    getAdminTrainProvenanceStationPlatformRefresh
} from '~/server/domain/admin/trainProvenance';
import {
    parseExternalServiceDate,
    parseExternalTrainCode
} from '~/server/utils/internal/boundaries';
import { serviceDateToDay } from '~/server/utils/date/serviceDay';
import ensure from '~/server/utils/api/executor/ensure';
import type { V2OperationContext } from '~/server/utils/api/v2/V2Types';
import {
    AdminStationBoardFetchResultStatus as ProtoStationBoardFetchResultStatus,
    AdminStationBoardStationTaskAction as ProtoStationBoardStationTaskAction,
    AdminStationPlatformRefreshEntryStatus as ProtoStationPlatformRefreshEntryStatus,
    AdminStationPlatformRefreshTrigger as ProtoStationPlatformRefreshTrigger,
    AdminTrainDataRequestType as ProtoTrainDataRequestType,
    AdminTrainProvenanceLatestStatus as ProtoTrainProvenanceLatestStatus,
    AdminTrainProvenanceOutcomeStatus as ProtoTrainProvenanceOutcomeStatus,
    AdminTrainProvenanceTaskRunStatus as ProtoTrainProvenanceTaskRunStatus
} from '#shared/generated/proto/opencrh/v2/admin_provenance_pb';
import type {
    AdminStationBoardFetchResultStatus,
    AdminStationBoardStationTaskAction,
    AdminStationBoardStationTaskItem,
    AdminStationPlatformRefreshEntry,
    AdminStationPlatformRefreshEntryStatus,
    AdminStationPlatformRefreshSummary,
    AdminStationPlatformRefreshTrigger,
    AdminTrainDataRequestHourBucket,
    AdminTrainDataRequestSummary,
    AdminTrainDataRequestType,
    AdminTrainDataRequestTypeSummary,
    AdminTrainProvenanceDeparture,
    AdminTrainProvenanceEvent,
    AdminTrainProvenanceLatestStatus,
    AdminTrainProvenanceOutcomeStatus,
    AdminTrainProvenanceTaskRunStatus
} from '~/types/admin';

const TASK_RUN_STATUS_TO_PROTO = {
    running: ProtoTrainProvenanceTaskRunStatus.RUNNING,
    success: ProtoTrainProvenanceTaskRunStatus.SUCCESS,
    failed: ProtoTrainProvenanceTaskRunStatus.FAILED,
    skipped: ProtoTrainProvenanceTaskRunStatus.SKIPPED
} satisfies Record<
    AdminTrainProvenanceTaskRunStatus,
    ProtoTrainProvenanceTaskRunStatus
>;

const LATEST_STATUS_TO_PROTO = {
    unknown: ProtoTrainProvenanceLatestStatus.UNKNOWN,
    pending: ProtoTrainProvenanceLatestStatus.PENDING,
    single: ProtoTrainProvenanceLatestStatus.SINGLE,
    coupled: ProtoTrainProvenanceLatestStatus.COUPLED
} satisfies Record<
    AdminTrainProvenanceLatestStatus,
    ProtoTrainProvenanceLatestStatus
>;

const OUTCOME_STATUS_TO_PROTO = {
    success: ProtoTrainProvenanceOutcomeStatus.SUCCESS,
    partial: ProtoTrainProvenanceOutcomeStatus.PARTIAL,
    failed: ProtoTrainProvenanceOutcomeStatus.FAILED,
    skipped: ProtoTrainProvenanceOutcomeStatus.SKIPPED
} satisfies Record<
    AdminTrainProvenanceOutcomeStatus,
    ProtoTrainProvenanceOutcomeStatus
>;

const REQUEST_TYPE_TO_PROTO = {
    search_train_code: ProtoTrainDataRequestType.SEARCH_TRAIN_CODE,
    fetch_route_info: ProtoTrainDataRequestType.FETCH_ROUTE_INFO,
    fetch_emu_by_route: ProtoTrainDataRequestType.FETCH_EMU_BY_ROUTE,
    fetch_emu_by_seat_code:
        ProtoTrainDataRequestType.FETCH_EMU_BY_SEAT_CODE,
    fetch_all_stations: ProtoTrainDataRequestType.FETCH_ALL_STATIONS,
    fetch_station_board: ProtoTrainDataRequestType.FETCH_STATION_BOARD,
    fetch_station_exit_info:
        ProtoTrainDataRequestType.FETCH_STATION_EXIT_INFO,
    fetch_station_transport_info:
        ProtoTrainDataRequestType.FETCH_STATION_TRANSPORT_INFO
} satisfies Record<AdminTrainDataRequestType, ProtoTrainDataRequestType>;

const PLATFORM_REFRESH_TRIGGER_TO_PROTO = {
    route_refresh: ProtoStationPlatformRefreshTrigger.ROUTE_REFRESH,
    station_board: ProtoStationPlatformRefreshTrigger.STATION_BOARD,
    scheduled_task: ProtoStationPlatformRefreshTrigger.SCHEDULED_TASK
} satisfies Record<
    AdminStationPlatformRefreshTrigger,
    ProtoStationPlatformRefreshTrigger
>;

const PLATFORM_REFRESH_ENTRY_STATUS_TO_PROTO = {
    updated: ProtoStationPlatformRefreshEntryStatus.UPDATED,
    cache_hit: ProtoStationPlatformRefreshEntryStatus.CACHE_HIT,
    cache_fallback: ProtoStationPlatformRefreshEntryStatus.CACHE_FALLBACK,
    no_data: ProtoStationPlatformRefreshEntryStatus.NO_DATA,
    request_failed: ProtoStationPlatformRefreshEntryStatus.REQUEST_FAILED,
    persist_failed: ProtoStationPlatformRefreshEntryStatus.PERSIST_FAILED
} satisfies Record<
    AdminStationPlatformRefreshEntryStatus,
    ProtoStationPlatformRefreshEntryStatus
>;

const STATION_BOARD_ACTION_TO_PROTO = {
    created: ProtoStationBoardStationTaskAction.CREATED,
    reused: ProtoStationBoardStationTaskAction.REUSED,
    station_telecode_not_found:
        ProtoStationBoardStationTaskAction.STATION_TELECODE_NOT_FOUND,
    station_telecode_ambiguous:
        ProtoStationBoardStationTaskAction.STATION_TELECODE_AMBIGUOUS
} satisfies Record<
    AdminStationBoardStationTaskAction,
    ProtoStationBoardStationTaskAction
>;

const STATION_BOARD_RESULT_STATUS_TO_PROTO = {
    saved_entries: ProtoStationBoardFetchResultStatus.SAVED_ENTRIES,
    no_official_entries:
        ProtoStationBoardFetchResultStatus.NO_OFFICIAL_ENTRIES
} satisfies Record<
    AdminStationBoardFetchResultStatus,
    ProtoStationBoardFetchResultStatus
>;

function requireDate(ctx: V2OperationContext): string {
    const date =
        typeof ctx.query.date === 'string' ? ctx.query.date.trim() : '';
    ensure(/^\d{8}$/.test(date), 400, 'invalid_param', 'date 必须是 YYYYMMDD');
    return date;
}

function toServiceDayOrZero(serviceDate: string): number {
    return serviceDate.length === 0 ? 0 : serviceDateToDay(serviceDate);
}

interface V2RouteSnapshotLike {
    serviceDate: string;
    trainCodes: string[];
    internalCode: string;
    startAt: number | null;
    endAt: number | null;
    startStation: string;
    endStation: string;
    cacheStatus?: string;
    cacheNote?: string;
}

function toProtoRouteSnapshot(snapshot: V2RouteSnapshotLike | null) {
    if (snapshot === null) {
        return undefined;
    }

    return {
        serviceDay: toServiceDayOrZero(snapshot.serviceDate),
        trainCodes: snapshot.trainCodes,
        internalCode: snapshot.internalCode,
        ...(snapshot.startAt === null ? {} : { startAt: snapshot.startAt }),
        ...(snapshot.endAt === null ? {} : { endAt: snapshot.endAt }),
        startStation: snapshot.startStation,
        endStation: snapshot.endStation,
        cacheStatus: snapshot.cacheStatus ?? '',
        cacheNote: snapshot.cacheNote ?? ''
    };
}

function toProtoTimelineEvent(event: AdminTrainProvenanceEvent) {
    return {
        id: event.id,
        taskRunId: event.taskRunId,
        schedulerTaskId: event.schedulerTaskId,
        executor: event.executor,
        taskStatus: TASK_RUN_STATUS_TO_PROTO[event.taskStatus],
        ...(event.outcomeStatus === null
            ? {}
            : {
                  outcomeStatus:
                      OUTCOME_STATUS_TO_PROTO[event.outcomeStatus]
              }),
        createdAt: event.createdAt,
        trainCode: event.trainCode,
        ...(event.startAt === null ? {} : { startAt: event.startAt }),
        emuCode: event.emuCode,
        relatedTrainCode: event.relatedTrainCode,
        relatedEmuCode: event.relatedEmuCode,
        eventType: event.eventType,
        result: event.result,
        summary: event.summary,
        ...(event.linkedSchedulerTaskId === null
            ? {}
            : { linkedSchedulerTaskId: event.linkedSchedulerTaskId }),
        ...(event.linkedTaskRunId === null
            ? {}
            : { linkedTaskRunId: event.linkedTaskRunId }),
        ...(event.conflictDetail === null
            ? {}
            : { conflictDetail: event.conflictDetail }),
        ...(event.couplingScan === null
            ? {}
            : { couplingScan: event.couplingScan }),
        ...(event.scannedRoute === null
            ? {}
            : { scannedRoute: toProtoRouteSnapshot(event.scannedRoute) }),
        ...(event.historicalReuse === null
            ? {}
            : { historicalReuse: event.historicalReuse }),
        ...(event.coupledResolution === null
            ? {}
            : { coupledResolution: event.coupledResolution }),
        ...(event.trackingMutations === null
            ? {}
            : { trackingMutations: event.trackingMutations }),
        ...(event.stationPlatformRefresh === null
            ? {}
            : { stationPlatformRefresh: event.stationPlatformRefresh }),
        ...(event.payload === null || event.payload === undefined
            ? {}
            : { payload: event.payload })
    };
}

function toProtoTaskRunSummary<
    T extends {
        serviceDate: string;
        status: AdminTrainProvenanceTaskRunStatus;
        finishedAt?: number | null;
        taskArgs?: unknown;
    }
>(summary: T) {
    const { serviceDate, status, finishedAt, taskArgs, ...rest } = summary;
    return {
        ...rest,
        status: TASK_RUN_STATUS_TO_PROTO[status],
        ...(finishedAt === null || finishedAt === undefined
            ? {}
            : { finishedAt }),
        serviceDay: toServiceDayOrZero(serviceDate),
        ...(taskArgs === null || taskArgs === undefined ? {} : { taskArgs })
    };
}

function toProtoCouplingCandidate<
    T extends {
        serviceDate: string;
        scannedRoute?: V2RouteSnapshotLike | null;
        matchedRoute?: V2RouteSnapshotLike | null;
        occupiedRoutes?: V2RouteSnapshotLike[];
        scannedStartAt?: number | null;
        matchedStartAt?: number | null;
        detail?: unknown;
    }
>(candidate: T) {
    const {
        serviceDate,
        scannedRoute,
        matchedRoute,
        occupiedRoutes,
        scannedStartAt,
        matchedStartAt,
        detail,
        ...rest
    } = candidate;
    return {
        ...rest,
        serviceDay: toServiceDayOrZero(serviceDate),
        ...(scannedStartAt === null || scannedStartAt === undefined
            ? {}
            : { scannedStartAt }),
        ...(matchedStartAt === null || matchedStartAt === undefined
            ? {}
            : { matchedStartAt }),
        ...(scannedRoute === undefined || scannedRoute === null
            ? {}
            : { scannedRoute: toProtoRouteSnapshot(scannedRoute) }),
        ...(matchedRoute === undefined || matchedRoute === null
            ? {}
            : { matchedRoute: toProtoRouteSnapshot(matchedRoute) }),
        occupiedRoutes: (occupiedRoutes ?? []).map(
            (route) => toProtoRouteSnapshot(route) ?? {}
        ),
        ...(detail === null || detail === undefined ? {} : { detail })
    };
}

function toProtoDeparture(departure: AdminTrainProvenanceDeparture) {
    return {
        startAt: departure.startAt,
        ...(departure.endAt === null ? {} : { endAt: departure.endAt }),
        startStation: departure.startStation,
        endStation: departure.endStation,
        latestStatus: LATEST_STATUS_TO_PROTO[departure.latestStatus],
        emuCodes: departure.emuCodes,
        dailyRouteRows: departure.dailyRouteRows.map((row) => ({
            id: row.id,
            trainCode: row.trainCode,
            emuCode: row.emuCode,
            serviceDay: serviceDateToDay(row.serviceDate),
            ...(row.timetableId === null
                ? {}
                : { timetableId: row.timetableId }),
            startStation: row.startStation,
            endStation: row.endStation,
            startAt: row.startAt,
            endAt: row.endAt,
            isTimetableResolved: row.isTimetableResolved,
            status: row.status
        }))
    };
}

function toProtoStationBoardStationTask(
    item: AdminStationBoardStationTaskItem
) {
    return {
        key: item.key,
        stationName: item.stationName,
        stationTelecode: item.stationTelecode,
        displayName: item.displayName,
        action: STATION_BOARD_ACTION_TO_PROTO[item.action],
        ...(item.schedulerTaskId === null
            ? {}
            : { schedulerTaskId: item.schedulerTaskId }),
        ...(item.taskRunId === null ? {} : { taskRunId: item.taskRunId }),
        ...(item.taskStatus === null
            ? {}
            : { taskStatus: TASK_RUN_STATUS_TO_PROTO[item.taskStatus] }),
        ...(item.startedAt === null ? {} : { startedAt: item.startedAt }),
        ...(item.finishedAt === null ? {} : { finishedAt: item.finishedAt }),
        ...(item.resultStatus === null
            ? {}
            : {
                  resultStatus:
                      STATION_BOARD_RESULT_STATUS_TO_PROTO[item.resultStatus]
              }),
        rowCount: item.rowCount,
        parsedEntryCount: item.parsedEntryCount,
        savedEntryCount: item.savedEntryCount,
        consumedQueueEntryCount: item.consumedQueueEntryCount,
        rows: item.rows,
        ambiguousTelecodes: item.ambiguousTelecodes
    };
}

function toProtoPlatformRefreshSummary(
    summary: AdminStationPlatformRefreshSummary
) {
    return {
        resultId: summary.resultId,
        trigger: PLATFORM_REFRESH_TRIGGER_TO_PROTO[summary.trigger],
        status: OUTCOME_STATUS_TO_PROTO[summary.status],
        candidateCount: summary.candidateCount,
        updatedCount: summary.updatedCount,
        cacheHitCount: summary.cacheHitCount,
        cacheFallbackCount: summary.cacheFallbackCount,
        noDataCount: summary.noDataCount,
        failedCount: summary.failedCount
    };
}

function toProtoPlatformRefreshEntry(entry: AdminStationPlatformRefreshEntry) {
    return {
        id: entry.id,
        stationOrder: entry.stationOrder,
        lookupType: entry.lookupType,
        stationName: entry.stationName,
        stationTelecode: entry.stationTelecode,
        stationNo: entry.stationNo,
        trainDate: entry.trainDate,
        stationTrainCodes: entry.stationTrainCodes,
        attemptedTrainCodes: entry.attemptedTrainCodes,
        status: PLATFORM_REFRESH_ENTRY_STATUS_TO_PROTO[entry.status],
        ...(entry.platformNo === null ? {} : { platformNo: entry.platformNo }),
        ...(entry.wicket === null ? {} : { wicket: entry.wicket }),
        ...(entry.fetchedAt === null ? {} : { fetchedAt: entry.fetchedAt }),
        errorMessage: entry.errorMessage
    };
}

function toProtoRequestMetrics(summary: AdminTrainDataRequestSummary) {
    return {
        total: summary.total,
        success: summary.success,
        failure: summary.failure,
        ...(summary.successRate === null
            ? {}
            : { successRate: summary.successRate })
    };
}

function toProtoRequestComparison(summary: AdminTrainDataRequestSummary) {
    return {
        compareTotal: summary.compareTotal,
        compareSuccess: summary.compareSuccess,
        compareFailure: summary.compareFailure,
        totalDelta: summary.totalDelta,
        successDelta: summary.successDelta,
        failureDelta: summary.failureDelta,
        ...(summary.totalChangeRatio === null
            ? {}
            : { totalChangeRatio: summary.totalChangeRatio }),
        ...(summary.successChangeRatio === null
            ? {}
            : { successChangeRatio: summary.successChangeRatio }),
        ...(summary.failureChangeRatio === null
            ? {}
            : { failureChangeRatio: summary.failureChangeRatio })
    };
}

function toProtoRequestTypeSummary(summary: AdminTrainDataRequestTypeSummary) {
    return {
        type: REQUEST_TYPE_TO_PROTO[summary.type],
        metrics: toProtoRequestMetrics(summary),
        comparison: toProtoRequestComparison(summary)
    };
}

function toProtoRequestHourBucket(bucket: AdminTrainDataRequestHourBucket) {
    return {
        hour: bucket.hour,
        startAt: bucket.startAt,
        endAt: bucket.endAt,
        metrics: toProtoRequestMetrics(bucket),
        comparison: toProtoRequestComparison(bucket),
        types: bucket.types.map(toProtoRequestTypeSummary)
    };
}

export async function getAdminTrainProvenanceV2Adapter(
    ctx: V2OperationContext
) {
    const trainCode =
        typeof ctx.query.trainCode === 'string'
            ? ctx.query.trainCode.trim()
            : '';
    ensure(trainCode.length > 0, 400, 'invalid_param', 'trainCode 不能为空');
    const parsedTrainCode = parseExternalTrainCode(trainCode);
    ensure(
        parsedTrainCode !== null,
        400,
        'invalid_param',
        'trainCode 必须是有效车次'
    );
    const rawStartAt =
        typeof ctx.query.startAt === 'string' ? ctx.query.startAt.trim() : '';
    const startAt =
        rawStartAt.length === 0 ? null : Number.parseInt(rawStartAt, 10);
    ensure(
        startAt === null || (Number.isInteger(startAt) && startAt > 0),
        400,
        'invalid_param',
        'startAt 必须是正整数时间戳'
    );
    const result = getAdminTrainProvenance({
        serviceDay: parseExternalServiceDate(requireDate(ctx)),
        trainCode: parsedTrainCode,
        startAt
    });
    return {
        enabled: result.enabled,
        retentionDays: result.retentionDays,
        date: result.date,
        trainCode: result.trainCode,
        ...(result.selectedStartAt === null
            ? {}
            : { selectedStartAt: result.selectedStartAt }),
        timeline: result.timeline.map(toProtoTimelineEvent),
        departures: result.departures.map(toProtoDeparture)
    };
}

export async function getAdminTrainProvenanceCouplingScanV2Adapter(
    ctx: V2OperationContext
) {
    const rawTaskRunId =
        typeof ctx.query.taskRunId === 'string'
            ? ctx.query.taskRunId.trim()
            : '';
    const taskRunId = Number.parseInt(rawTaskRunId, 10);
    ensure(
        Number.isInteger(taskRunId) && taskRunId > 0,
        400,
        'invalid_param',
        'taskRunId 必须是正整数'
    );
    const result = getAdminTrainProvenanceCouplingScan(taskRunId);
    return {
        enabled: result.enabled,
        ...(result.taskRun === null
            ? {}
            : { taskRun: toProtoTaskRunSummary(result.taskRun) }),
        candidates: result.candidates.map(toProtoCouplingCandidate)
    };
}

export async function getAdminTrainProvenanceCouplingScanTasksV2Adapter(
    ctx: V2OperationContext
) {
    const result = getAdminTrainProvenanceCouplingScanTasks(
        parseExternalServiceDate(requireDate(ctx))
    );
    return {
        enabled: result.enabled,
        retentionDays: result.retentionDays,
        date: result.date,
        items: result.items.map(toProtoTaskRunSummary)
    };
}

export async function getAdminTrainProvenanceQrcodeScanV2Adapter(
    ctx: V2OperationContext
) {
    const detectedAt =
        typeof ctx.query.detectedAt === 'string'
            ? ctx.query.detectedAt.trim()
            : '';
    ensure(detectedAt.length > 0, 400, 'invalid_param', 'detectedAt 不能为空');
    const result = getAdminTrainProvenanceQrcodeScan(
        parseExternalServiceDate(requireDate(ctx)),
        detectedAt
    );
    return {
        enabled: result.enabled,
        date: result.date,
        detectedAt: result.detectedAt,
        ...(result.summary === null ? {} : { summary: result.summary }),
        tasks: result.tasks.map((task) => ({
            taskRun: toProtoTaskRunSummary(task.taskRun),
            timeline: task.timeline.map(toProtoTimelineEvent)
        }))
    };
}

export async function getAdminTrainProvenanceQrcodeScanTasksV2Adapter(
    ctx: V2OperationContext
) {
    return getAdminTrainProvenanceQrcodeScanTasks(
        parseExternalServiceDate(requireDate(ctx))
    );
}

export async function getAdminTrainProvenanceRequestStatsV2Adapter(
    ctx: V2OperationContext
) {
    const result = getAdminTrainProvenanceRequestStats(
        parseExternalServiceDate(requireDate(ctx))
    );
    return {
        enabled: result.enabled,
        retentionDays: result.retentionDays,
        date: result.date,
        compareDate: result.compareDate,
        asOf: result.asOf,
        totals: toProtoRequestMetrics(result.totals),
        comparison: toProtoRequestComparison(result.totals),
        types: result.types.map(toProtoRequestTypeSummary),
        hours: result.hours.map(toProtoRequestHourBucket)
    };
}

export async function getAdminTrainProvenanceStationBoardV2Adapter(
    ctx: V2OperationContext
) {
    const rawTaskRunId =
        typeof ctx.query.taskRunId === 'string'
            ? ctx.query.taskRunId.trim()
            : '';
    const taskRunId = Number.parseInt(rawTaskRunId, 10);
    ensure(
        Number.isInteger(taskRunId) && taskRunId > 0,
        400,
        'invalid_param',
        'taskRunId 必须是正整数'
    );
    const result = getAdminTrainProvenanceStationBoard(taskRunId);
    return {
        enabled: result.enabled,
        taskRunId: result.taskRunId,
        ...(result.schedulerTaskId === null
            ? {}
            : { schedulerTaskId: result.schedulerTaskId }),
        serviceDay: toServiceDayOrZero(result.serviceDate),
        ...(result.status === null
            ? {}
            : { status: TASK_RUN_STATUS_TO_PROTO[result.status] }),
        ...(result.startedAt === null ? {} : { startedAt: result.startedAt }),
        ...(result.finishedAt === null
            ? {}
            : { finishedAt: result.finishedAt }),
        candidateGroupCount: result.candidateGroupCount,
        selectedStations: result.selectedStations,
        selectedStationItems: result.selectedStationItems,
        createdTaskCount: result.createdTaskCount,
        reusedTaskCount: result.reusedTaskCount,
        skippedNotFoundCount: result.skippedNotFoundCount,
        skippedAmbiguousCount: result.skippedAmbiguousCount,
        stations: result.stations.map(toProtoStationBoardStationTask)
    };
}

export async function getAdminTrainProvenanceStationBoardTasksV2Adapter(
    ctx: V2OperationContext
) {
    const result = getAdminTrainProvenanceStationBoardTasks(
        parseExternalServiceDate(requireDate(ctx))
    );
    return {
        enabled: result.enabled,
        retentionDays: result.retentionDays,
        date: result.date,
        items: result.items.map(toProtoTaskRunSummary)
    };
}

export async function getAdminTrainProvenanceStationPlatformRefreshV2Adapter(
    ctx: V2OperationContext
) {
    const rawResultId =
        typeof ctx.query.resultId === 'string' ? ctx.query.resultId.trim() : '';
    const resultId = Number.parseInt(rawResultId, 10);
    ensure(
        Number.isInteger(resultId) && resultId > 0,
        400,
        'invalid_param',
        'resultId 必须是正整数'
    );
    const result = getAdminTrainProvenanceStationPlatformRefresh(resultId);
    return {
        enabled: result.enabled,
        ...(result.result === null
            ? {}
            : {
                  result: {
                      summary: toProtoPlatformRefreshSummary(result.result),
                      taskRunId: result.result.taskRunId,
                      serviceDay: toServiceDayOrZero(result.result.serviceDate),
                      ...(result.result.startAt === null
                          ? {}
                          : { startAt: result.result.startAt }),
                      primaryTrainCode: result.result.primaryTrainCode,
                      trainCodes: result.result.trainCodes,
                      errorMessage: result.result.errorMessage,
                      createdAt: result.result.createdAt
                  }
              }),
        entries: result.entries.map(toProtoPlatformRefreshEntry)
    };
}
