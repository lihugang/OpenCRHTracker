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
import type {
    AdminTrainDataRequestHourBucket,
    AdminTrainDataRequestSummary,
    AdminTrainDataRequestTypeSummary
} from '~/types/admin';

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

function toProtoTimelineEvent<
    T extends { scannedRoute?: V2RouteSnapshotLike | null }
>(event: T) {
    return {
        ...event,
        ...(event.scannedRoute === undefined || event.scannedRoute === null
            ? {}
            : { scannedRoute: toProtoRouteSnapshot(event.scannedRoute) })
    };
}

function toProtoTaskRunSummary<T extends { serviceDate: string }>(summary: T) {
    return {
        ...summary,
        serviceDay: toServiceDayOrZero(summary.serviceDate)
    };
}

function toProtoCouplingCandidate<
    T extends {
        serviceDate: string;
        scannedRoute?: V2RouteSnapshotLike | null;
        matchedRoute?: V2RouteSnapshotLike | null;
        occupiedRoutes?: V2RouteSnapshotLike[];
    }
>(candidate: T) {
    return {
        ...candidate,
        serviceDay: toServiceDayOrZero(candidate.serviceDate),
        ...(candidate.scannedRoute === undefined ||
        candidate.scannedRoute === null
            ? {}
            : { scannedRoute: toProtoRouteSnapshot(candidate.scannedRoute) }),
        ...(candidate.matchedRoute === undefined ||
        candidate.matchedRoute === null
            ? {}
            : { matchedRoute: toProtoRouteSnapshot(candidate.matchedRoute) }),
        occupiedRoutes: (candidate.occupiedRoutes ?? []).map(
            (route) => toProtoRouteSnapshot(route) ?? {}
        )
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
        type: summary.type,
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
        ...result,
        timeline: result.timeline.map(toProtoTimelineEvent),
        departures: result.departures.map((departure) => ({
            ...departure,
            dailyRouteRows: departure.dailyRouteRows.map((row) => ({
                ...row,
                serviceDay: serviceDateToDay(row.serviceDate),
                ...(row.timetableId === null
                    ? {}
                    : { timetableId: row.timetableId })
            }))
        }))
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
        ...result,
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
        ...result,
        items: result.items.map((item) => ({
            ...item,
            serviceDay: toServiceDayOrZero(item.serviceDate)
        }))
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
        ...result,
        tasks: result.tasks.map((task) => ({
            ...task,
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
        ...result,
        serviceDay: toServiceDayOrZero(result.serviceDate)
    };
}

export async function getAdminTrainProvenanceStationBoardTasksV2Adapter(
    ctx: V2OperationContext
) {
    const result = getAdminTrainProvenanceStationBoardTasks(
        parseExternalServiceDate(requireDate(ctx))
    );
    return {
        ...result,
        items: result.items.map((item) => ({
            ...item,
            serviceDay: toServiceDayOrZero(item.serviceDate)
        }))
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
        ...result,
        ...(result.result === null
            ? {}
            : {
                  result: {
                      ...result.result,
                      serviceDay: toServiceDayOrZero(result.result.serviceDate)
                  }
              })
    };
}
