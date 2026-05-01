import {
    listDailyRoutesByTrainCodeInRange,
    type DailyEmuRouteRow
} from '~/server/services/emuRoutesStore';
import {
    listProbeStatusByTrainCodeInRange,
    ProbeStatusValue,
    type ProbeStatusRow
} from '~/server/services/probeStatusStore';
import {
    getTrainProvenanceRuntimeConfig,
    getTrainProvenanceTaskRunById,
    isTrainProvenanceEnabled,
    listCouplingScanCandidatesByTaskRunId,
    listTrainProvenanceDepartureStartAts,
    listTrainProvenanceEventsByDateAndTrainCode,
    type TrainProvenanceEventRecord
} from '~/server/services/trainProvenanceStore';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import getDayTimestampRange from '~/server/utils/date/getDayTimestampRange';
import type {
    AdminCouplingScanCandidate,
    AdminCouplingScanDetailResponse,
    AdminCouplingScanTaskRunSummary,
    AdminTrainProvenanceCouplingScanDetail,
    AdminTrainProvenanceConflictCurrentGroup,
    AdminTrainProvenanceConflictDetail,
    AdminTrainProvenanceConflictGroup,
    AdminTrainProvenanceConflictState,
    AdminTrainProvenanceDeparture,
    AdminTrainProvenanceEvent,
    AdminTrainProvenanceLatestStatus,
    AdminTrainProvenanceResponse
} from '~/types/admin';

function toLatestStatus(
    rows: ProbeStatusRow[]
): AdminTrainProvenanceLatestStatus {
    const highestStatus = rows.reduce<number>(
        (currentMax, row) => (row.status > currentMax ? row.status : currentMax),
        0
    );

    switch (highestStatus) {
        case ProbeStatusValue.PendingCouplingDetection:
            return 'pending';
        case ProbeStatusValue.SingleFormationResolved:
            return 'single';
        case ProbeStatusValue.CoupledFormationResolved:
            return 'coupled';
        default:
            return 'unknown';
    }
}

function toDeparture(
    startAt: number,
    routeRows: DailyEmuRouteRow[],
    probeRows: ProbeStatusRow[]
): AdminTrainProvenanceDeparture {
    const firstRouteRow = routeRows[0] ?? null;
    const emuCodes = Array.from(
        new Set([
            ...routeRows.map((row) => row.emu_code),
            ...probeRows.map((row) => row.emu_code)
        ])
    ).sort();

    return {
        startAt,
        endAt:
            routeRows.length > 0
                ? Math.max(...routeRows.map((row) => row.end_at))
                : null,
        startStation: firstRouteRow?.start_station_name ?? '',
        endStation: firstRouteRow?.end_station_name ?? '',
        latestStatus: toLatestStatus(probeRows),
        emuCodes
    };
}

function getPayloadObject(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null;
    }

    return value as Record<string, unknown>;
}

const conflictTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
});

function getOptionalString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}

function getOptionalInteger(value: unknown): number | null {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0
        ? value
        : null;
}

function getStringArray(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : [];
}

function isConflictState(
    value: unknown
): value is AdminTrainProvenanceConflictState {
    return (
        value === 'running' ||
        value === 'not_running' ||
        value === 'request_failed'
    );
}

function toConflictCurrentGroup(
    value: unknown
): AdminTrainProvenanceConflictCurrentGroup | null {
    const payload = getPayloadObject(value);
    if (!payload) {
        return null;
    }

    const trainCodes = getStringArray(payload.trainCodes);
    const startAt = getOptionalInteger(payload.startAt);
    const endAt = getOptionalInteger(payload.endAt);
    const startStation = getOptionalString(payload.startStation) ?? '';
    const endStation = getOptionalString(payload.endStation) ?? '';

    if (
        trainCodes.length === 0 &&
        startAt === null &&
        endAt === null &&
        startStation.length === 0 &&
        endStation.length === 0
    ) {
        return null;
    }

    return {
        trainCodes,
        startAt,
        endAt,
        startStation,
        endStation
    };
}

function toConflictGroup(
    value: unknown
): AdminTrainProvenanceConflictGroup | null {
    const payload = getPayloadObject(value);
    if (!payload) {
        return null;
    }

    const currentGroup = toConflictCurrentGroup(payload);
    const state = isConflictState(payload.state) ? payload.state : null;
    if (!currentGroup || state === null) {
        return null;
    }

    return {
        ...currentGroup,
        overlapStartAt: getOptionalInteger(payload.overlapStartAt),
        overlapEndAt: getOptionalInteger(payload.overlapEndAt),
        state
    };
}

function extractConflictDetail(
    event: TrainProvenanceEventRecord
): AdminTrainProvenanceConflictDetail | null {
    if (
        event.eventType !== 'overlap_requeued' &&
        event.eventType !== 'overlap_dropped'
    ) {
        return null;
    }

    const payload = getPayloadObject(event.payload);
    if (!payload) {
        return null;
    }

    const currentGroup = toConflictCurrentGroup(payload.currentGroup);
    const conflictGroups = Array.isArray(payload.conflictGroups)
        ? payload.conflictGroups
              .map((item) => toConflictGroup(item))
              .filter(
                  (
                      item
                  ): item is AdminTrainProvenanceConflictGroup => item !== null
              )
        : [];

    if (!currentGroup && conflictGroups.length === 0) {
        return null;
    }

    return {
        mode:
            event.eventType === 'overlap_requeued' ? 'requeued' : 'dropped',
        currentGroup,
        conflictGroups
    };
}

function formatConflictTimeRange(
    startAt: number | null,
    endAt: number | null
): string {
    if (startAt === null || endAt === null) {
        return '--';
    }

    return `${conflictTimeFormatter.format(new Date(startAt * 1000))}-${conflictTimeFormatter.format(new Date(endAt * 1000))}`;
}

function formatConflictTrainCodes(trainCodes: string[]): string {
    return trainCodes.length > 0 ? trainCodes.join(' / ') : '--';
}

function formatConflictSummary(
    conflictGroups: AdminTrainProvenanceConflictGroup[]
): string {
    if (conflictGroups.length === 0) {
        return '';
    }

    const labels = conflictGroups.map((group) =>
        formatConflictTrainCodes(group.trainCodes)
    );
    const trainText =
        labels.length <= 2
            ? labels.join(' / ')
            : `${labels.slice(0, 2).join(' / ')} 等 ${labels.length} 组交路`;

    if (conflictGroups.length === 1) {
        const overlapTimeText = formatConflictTimeRange(
            conflictGroups[0]!.overlapStartAt,
            conflictGroups[0]!.overlapEndAt
        );
        if (overlapTimeText !== '--') {
            return `与 ${trainText} 冲突，重叠 ${overlapTimeText}`;
        }
    }

    return `与 ${trainText} 冲突`;
}

function isPendingCouplingScanEventType(eventType: string): boolean {
    return eventType === 'pending_coupling_detection';
}

function formatSeatCodeFailureReasonText(detail: unknown): string {
    const payload = getPayloadObject(detail);
    const reason = getOptionalString(payload?.reason) ?? '';
    const errorCode = getOptionalString(payload?.errorCode) ?? '';
    const errorMsg = getOptionalString(payload?.errorMsg) ?? '';
    const extraDetail = getOptionalString(payload?.detail) ?? '';

    if (reason === 'network_error') {
        return '畅行码查询失败：网络错误';
    }

    if (reason === 'seat_code_not_enabled') {
        return errorMsg.length > 0
            ? `畅行码未启用：${errorMsg}`
            : '畅行码未启用';
    }

    const parts = [errorCode, errorMsg, extraDetail].filter(
        (item) => item.length > 0
    );
    if (parts.length > 0) {
        return `畅行码查询失败：其他错误（${parts.join(' / ')}）`;
    }

    return '畅行码查询失败：其他错误';
}

function formatCouplingScanCandidateReason(
    reason: string,
    detail: unknown
): string {
    switch (reason) {
        case 'already_assigned':
            return '该车组今日已被占用';
        case 'seat_code_missing':
            return '未配置畅行码';
        case 'seat_code_request_failed':
        case 'seat_code_request_failed_network_error':
        case 'seat_code_request_failed_not_enabled':
        case 'seat_code_request_failed_other':
            return formatSeatCodeFailureReasonText(detail);
        case 'route_not_tracked':
            return '扫描到的车次不在当前追踪范围';
        case 'tracked_group_matched':
            return '已匹配到当前追踪车次';
        default:
            return reason.trim() || '--';
    }
}

function isResolvedCouplingScanEventType(eventType: string): boolean {
    return (
        eventType === 'coupling_group_resolved_single' ||
        eventType === 'coupling_group_resolved_coupled'
    );
}

function buildPendingCouplingScanSummary(
    detail: AdminTrainProvenanceCouplingScanDetail | null
): string {
    if (!detail) {
        return '已排入重联扫描队列';
    }

    if (detail.resultSchedulerTaskId !== null) {
        if (
            detail.queuedSchedulerTaskId !== null &&
            detail.queuedSchedulerTaskId === detail.resultSchedulerTaskId
        ) {
            return `已排入重联扫描队列，任务 #${detail.resultSchedulerTaskId} 已完成`;
        }

        return `已排入重联扫描队列，实际完成任务 #${detail.resultSchedulerTaskId}`;
    }

    return '已排入重联扫描队列';
}

function formatEventSummary(
    event: TrainProvenanceEventRecord,
    conflictDetail: AdminTrainProvenanceConflictDetail | null
): string {
    const payload = getPayloadObject(event.payload);
    const linkedTaskText =
        event.linkedSchedulerTaskId !== null
            ? `，扫描任务 #${event.linkedSchedulerTaskId}`
            : '';

    switch (event.eventType) {
        case 'probe_task_dispatched':
            return `已创建探测任务${linkedTaskText}`;
        case 'probe_task_skipped':
            return `探测任务已跳过：${event.result || 'skip'}`;
        case 'route_probe_succeeded':
            return `已通过 ${event.relatedTrainCode || event.trainCode} 查询到车组 ${event.emuCode || '--'}`;
        case 'route_probe_request_failed':
            return event.result === 'requeued'
                ? `12306 探测失败，已重新排队`
                : `12306 探测失败，重试已耗尽`;
        case 'overlap_requeued':
            if (conflictDetail && conflictDetail.conflictGroups.length > 0) {
                return `${formatConflictSummary(conflictDetail.conflictGroups)}，当前任务已重排`;
            }
            return '检测到交路重叠，已清理并重新排队';
        case 'overlap_dropped':
            if (conflictDetail && conflictDetail.conflictGroups.length > 0) {
                return `${formatConflictSummary(conflictDetail.conflictGroups)}，当前扫描已跳过`;
            }
            return '冲突交路未运行，已清理冲突记录';
        case 'historical_reuse_selected':
            return event.result === 'coupled'
                ? '复用了历史重联结果'
                : '复用了历史单组结果';
        case 'historical_reuse_rejected':
            return '历史结果不完整，未复用';
        case 'historical_recent_assignment_skipped':
            return '同车组历史命中，但当日未在运行，已跳过';
        case 'seat_verification_passed':
            return '席位码校验通过';
        case 'seat_verification_unavailable':
            return '席位码校验不可用，继续当前判断';
        case 'seat_verification_mismatch_requeued':
            return `席位码校验不一致，已重新排队`;
        case 'seat_verification_mismatch_exhausted':
            return '席位码校验不一致，重试已耗尽';
        case 'resolved_single':
            return '已判定为单组';
        case 'resolved_from_status':
            return event.result === 'coupled'
                ? '复用了当日已有重联状态'
                : '复用了当日已有单组状态';
        case 'pending_coupling_detection':
            return `已进入重联扫描${linkedTaskText}`;
        case 'coupling_group_resolved_single':
            return '重联扫描结束，判定为单组';
        case 'coupling_group_resolved_coupled':
            return event.result === 'upgraded_from_single'
                ? '重联扫描结束，结果升级为重联'
                : '重联扫描结束，判定为重联';
        case 'route_refresh_succeeded':
            return event.result === 'changed'
                ? 'route info 刷新成功并更新了交路'
                : 'route info 刷新成功，无交路变化';
        case 'route_refresh_failed':
            return `route info 刷新失败：${event.result || 'request_failed'}`;
        case 'coupling_scan_started':
            return `重联扫描开始`;
        case 'coupling_scan_completed':
            return `重联扫描完成`;
        default:
            if (payload && typeof payload.reason === 'string') {
                return `${event.eventType}: ${payload.reason}`;
            }
            return event.eventType;
    }
}

function toTimelineEvent(
    event: TrainProvenanceEventRecord
): AdminTrainProvenanceEvent {
    const conflictDetail = extractConflictDetail(event);

    return {
        id: event.id,
        taskRunId: event.taskRunId,
        schedulerTaskId: event.schedulerTaskId,
        executor: event.executor,
        taskStatus: event.taskStatus,
        createdAt: event.createdAt,
        trainCode: event.trainCode,
        startAt: event.startAt,
        emuCode: event.emuCode,
        relatedTrainCode: event.relatedTrainCode,
        relatedEmuCode: event.relatedEmuCode,
        eventType: event.eventType,
        result: event.result,
        summary: formatEventSummary(event, conflictDetail),
        linkedSchedulerTaskId: event.linkedSchedulerTaskId,
        linkedTaskRunId: event.linkedTaskRunId,
        conflictDetail,
        couplingScan: null,
        payload: event.payload
    };
}

function findResolvedCouplingScanEvent(
    timeline: AdminTrainProvenanceEvent[],
    startIndex: number
): AdminTrainProvenanceEvent | null {
    for (let index = startIndex + 1; index < timeline.length; index += 1) {
        const event = timeline[index]!;
        if (isResolvedCouplingScanEventType(event.eventType)) {
            return event;
        }
    }

    return null;
}

function enrichCouplingScanTimeline(
    timeline: AdminTrainProvenanceEvent[]
): AdminTrainProvenanceEvent[] {
    return timeline.map((event, index) => {
        if (isResolvedCouplingScanEventType(event.eventType)) {
            return {
                ...event,
                couplingScan: {
                    state: 'resolved',
                    queuedSchedulerTaskId: null,
                    queuedTaskRunId: null,
                    resultSchedulerTaskId: event.schedulerTaskId,
                    resultTaskRunId: event.taskRunId,
                    canOpenDetail: true
                }
            };
        }

        if (!isPendingCouplingScanEventType(event.eventType)) {
            return event;
        }

        const resolvedEvent = findResolvedCouplingScanEvent(timeline, index);
        const couplingScan: AdminTrainProvenanceCouplingScanDetail = {
            state: 'queued',
            queuedSchedulerTaskId: event.linkedSchedulerTaskId,
            queuedTaskRunId: event.linkedTaskRunId,
            resultSchedulerTaskId: resolvedEvent?.schedulerTaskId ?? null,
            resultTaskRunId: resolvedEvent?.taskRunId ?? null,
            canOpenDetail:
                typeof resolvedEvent?.taskRunId === 'number' &&
                resolvedEvent.taskRunId > 0
        };

        return {
            ...event,
            summary: buildPendingCouplingScanSummary(couplingScan),
            couplingScan
        };
    });
}

export function getAdminTrainProvenance(
    date: string,
    trainCode: string,
    startAt: number | null
): AdminTrainProvenanceResponse {
    const normalizedTrainCode = normalizeCode(trainCode);
    const runtimeConfig = getTrainProvenanceRuntimeConfig();

    if (!isTrainProvenanceEnabled()) {
        return {
            enabled: false,
            retentionDays: runtimeConfig.retentionDays,
            date,
            trainCode: normalizedTrainCode,
            selectedStartAt: null,
            departures: [],
            timeline: []
        };
    }

    if (!/^\d{8}$/.test(date) || normalizedTrainCode.length === 0) {
        return {
            enabled: true,
            retentionDays: runtimeConfig.retentionDays,
            date,
            trainCode: normalizedTrainCode,
            selectedStartAt: null,
            departures: [],
            timeline: []
        };
    }

    const dayRange = getDayTimestampRange(date);
    const departureStartAts = listTrainProvenanceDepartureStartAts(
        date,
        normalizedTrainCode
    );
    const routeRows = listDailyRoutesByTrainCodeInRange(
        normalizedTrainCode,
        dayRange.startAt,
        dayRange.endAt + 1
    );
    const probeRows = listProbeStatusByTrainCodeInRange(
        normalizedTrainCode,
        dayRange.startAt,
        dayRange.endAt + 1
    );

    const departures = departureStartAts.map((candidateStartAt) =>
        toDeparture(
            candidateStartAt,
            routeRows.filter((row) => row.start_at === candidateStartAt),
            probeRows.filter((row) => row.start_at === candidateStartAt)
        )
    );
    const selectedStartAt =
        startAt !== null && departureStartAts.includes(startAt)
            ? startAt
            : departures.length === 1
              ? departures[0]!.startAt
              : null;
    const timeline =
        selectedStartAt === null
            ? []
            : enrichCouplingScanTimeline(
                  listTrainProvenanceEventsByDateAndTrainCode(
                      date,
                      normalizedTrainCode,
                      selectedStartAt
                  ).map(toTimelineEvent)
              );

    return {
        enabled: true,
        retentionDays: runtimeConfig.retentionDays,
        date,
        trainCode: normalizedTrainCode,
        selectedStartAt,
        departures,
        timeline
    };
}

export function getAdminCouplingScanDetail(
    taskRunId: number
): AdminCouplingScanDetailResponse {
    if (!isTrainProvenanceEnabled()) {
        return {
            enabled: false,
            taskRun: null,
            candidates: []
        };
    }

    const taskRun = getTrainProvenanceTaskRunById(taskRunId);
    const candidates = listCouplingScanCandidatesByTaskRunId(taskRunId);

    const taskRunSummary: AdminCouplingScanTaskRunSummary | null = taskRun
        ? {
              id: taskRun.id,
              schedulerTaskId: taskRun.schedulerTaskId,
              executor: taskRun.executor,
              status: taskRun.status,
              startedAt: taskRun.startedAt,
              finishedAt: taskRun.finishedAt,
              serviceDate: taskRun.serviceDate,
              taskArgs: taskRun.taskArgs
          }
        : null;

    const candidateItems: AdminCouplingScanCandidate[] = candidates.map(
        (candidate) => ({
            id: candidate.id,
            candidateOrder: candidate.candidateOrder,
            candidateEmuCode: candidate.candidateEmuCode,
            status: candidate.status,
            reason: formatCouplingScanCandidateReason(
                candidate.reason,
                candidate.detail
            ),
            scannedTrainCode: candidate.scannedTrainCode,
            scannedInternalCode: candidate.scannedInternalCode,
            scannedStartAt: candidate.scannedStartAt,
            matchedTrainCode: candidate.matchedTrainCode,
            matchedStartAt: candidate.matchedStartAt,
            trainRepeat: candidate.trainRepeat,
            detail: candidate.detail,
            createdAt: candidate.createdAt
        })
    );

    return {
        enabled: true,
        taskRun: taskRunSummary,
        candidates: candidateItems
    };
}
