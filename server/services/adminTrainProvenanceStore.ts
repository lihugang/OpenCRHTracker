import {
    listDailyRoutesByEmuCodeInRange,
    listDailyRoutesByTrainCodeInRange,
    type DailyEmuRouteRow
} from '~/server/services/emuRoutesStore';
import {
    listProbeStatusByEmuCode,
    listProbeStatusByTrainCodeInRange,
    ProbeStatusValue,
    type ProbeStatusRow
} from '~/server/services/probeStatusStore';
import {
    getTrainProvenanceRuntimeConfig,
    getTrainProvenanceTaskRunById,
    isTrainProvenanceEnabled,
    list12306RequestHourlyStatsInRange,
    listCouplingScanCandidatesByTaskRunId,
    listTrainProvenanceEventsByTaskRunId,
    listTrainProvenanceTaskRunsByDateAndExecutor,
    listTrainProvenanceDepartureStartAts,
    listTrainProvenanceEventsByDateAndTrainCode,
    type CouplingScanCandidateRecord,
    type TrainProvenanceEventRecord
} from '~/server/services/trainProvenanceStore';
import {
    getTodayScheduleCache,
    type TodayScheduleRoute
} from '~/server/services/todayScheduleCache';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import getDayTimestampRange from '~/server/utils/date/getDayTimestampRange';
import { formatShanghaiDateString } from '~/server/utils/date/getCurrentDateString';
import { getShanghaiDayStartUnixSeconds } from '~/server/utils/date/shanghaiDateTime';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import type {
    AdminCouplingScanCandidate,
    AdminCouplingScanDetailResponse,
    AdminCouplingScanTaskListItem,
    AdminCouplingScanTaskListResponse,
    AdminCouplingScanTaskRunSummary,
    AdminQrcodeScanDetailResponse,
    AdminQrcodeScanTaskListResponse,
    AdminQrcodeScanTaskRunSummary,
    AdminQrcodeScanTimeDetailTaskItem,
    AdminQrcodeScanTimeSummaryItem,
    AdminTrainDataRequestHourBucket,
    AdminTrainDataRequestStatsResponse,
    AdminTrainDataRequestSummary,
    AdminTrainDataRequestType,
    AdminTrainDataRequestTypeSummary,
    AdminTrainProvenanceCouplingScanDetail,
    AdminTrainProvenanceCoupledResolutionDetail,
    AdminTrainProvenanceConflictCurrentGroup,
    AdminTrainProvenanceConflictDetail,
    AdminTrainProvenanceConflictGroup,
    AdminTrainProvenanceConflictState,
    AdminTrainProvenanceDeparture,
    AdminTrainProvenanceEvent,
    AdminTrainProvenanceHistoricalReuseDetail,
    AdminTrainProvenanceLatestStatus,
    AdminTrainRouteSnapshot,
    AdminTrainProvenanceResponse
} from '~/types/admin';

const COUPLING_SCAN_TASK_EXECUTOR = 'detect_coupled_emu_group';
const QRCODE_SCAN_TASK_EXECUTOR = 'probe_qrcode_detection_emu';

function toLatestStatus(
    rows: ProbeStatusRow[]
): AdminTrainProvenanceLatestStatus {
    const highestStatus = rows.reduce<number>(
        (currentMax, row) =>
            row.status > currentMax ? row.status : currentMax,
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
    probeRows: ProbeStatusRow[],
    fallbackRoute: AdminTrainRouteSnapshot | null,
    fallbackEmuCodes: string[]
): AdminTrainProvenanceDeparture {
    const firstRouteRow = routeRows[0] ?? null;
    const emuCodes = Array.from(
        new Set([
            ...routeRows.map((row) => row.emu_code),
            ...probeRows.map((row) => row.emu_code),
            ...fallbackEmuCodes
        ])
    ).sort();

    return {
        startAt,
        endAt:
            routeRows.length > 0
                ? Math.max(...routeRows.map((row) => row.end_at))
                : (fallbackRoute?.endAt ?? null),
        startStation:
            firstRouteRow?.start_station_name ||
            fallbackRoute?.startStation ||
            '',
        endStation:
            firstRouteRow?.end_station_name || fallbackRoute?.endStation || '',
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

function normalizeTrainCodeList(trainCodes: string[]): string[] {
    return Array.from(
        new Set(
            trainCodes
                .map((trainCode) => normalizeCode(trainCode))
                .filter((trainCode) => trainCode.length > 0)
        )
    ).sort();
}

function formatServiceDateFromStartAt(startAt: number | null): string {
    return startAt !== null && startAt > 0
        ? formatShanghaiDateString(startAt * 1000)
        : '';
}

function buildTrainRouteSnapshot(input: {
    serviceDate?: string;
    trainCodes?: string[];
    internalCode?: string;
    startAt?: number | null;
    endAt?: number | null;
    startStation?: string;
    endStation?: string;
    cacheStatus?: AdminTrainRouteSnapshot['cacheStatus'];
    cacheNote?: string;
}): AdminTrainRouteSnapshot | null {
    const trainCodes = normalizeTrainCodeList(input.trainCodes ?? []);
    const startAt = getOptionalInteger(input.startAt);
    const endAt = getOptionalInteger(input.endAt);
    const startStation = (input.startStation ?? '').trim();
    const endStation = (input.endStation ?? '').trim();
    const internalCode = normalizeCode(input.internalCode ?? '');
    const serviceDate = /^\d{8}$/.test(input.serviceDate ?? '')
        ? (input.serviceDate as string)
        : formatServiceDateFromStartAt(startAt);

    if (
        trainCodes.length === 0 &&
        internalCode.length === 0 &&
        startAt === null &&
        endAt === null &&
        startStation.length === 0 &&
        endStation.length === 0 &&
        serviceDate.length === 0
    ) {
        return null;
    }

    return {
        serviceDate,
        trainCodes,
        internalCode,
        startAt,
        endAt,
        startStation,
        endStation,
        cacheStatus: input.cacheStatus ?? 'not_applicable',
        cacheNote: (input.cacheNote ?? '').trim()
    };
}

function getTodayScheduleRouteByTrainCodes(
    trainCodes: string[]
): TodayScheduleRoute | null {
    const todayScheduleRoutes = getTodayScheduleCache();
    for (const trainCode of normalizeTrainCodeList(trainCodes)) {
        const route = todayScheduleRoutes.get(trainCode);
        if (route) {
            return route;
        }
    }

    return null;
}

function fillRouteStationsFromTodayCache(
    snapshot: AdminTrainRouteSnapshot | null
): AdminTrainRouteSnapshot | null {
    if (!snapshot) {
        return null;
    }

    if (snapshot.startStation.length > 0 && snapshot.endStation.length > 0) {
        return snapshot;
    }

    const todayRoute = getTodayScheduleRouteByTrainCodes(snapshot.trainCodes);
    if (!todayRoute) {
        return {
            ...snapshot,
            cacheStatus: 'miss',
            cacheNote: '未查询到时刻表相关内容'
        };
    }

    return {
        ...snapshot,
        startStation: snapshot.startStation || todayRoute.startStation,
        endStation: snapshot.endStation || todayRoute.endStation,
        cacheStatus: 'hit',
        cacheNote: snapshot.cacheNote || '时刻表查询成功'
    };
}

function buildGroupedRouteSnapshots(
    rows: DailyEmuRouteRow[]
): AdminTrainRouteSnapshot[] {
    const groups = new Map<
        string,
        {
            trainCodes: Set<string>;
            startAt: number;
            endAt: number;
            startStation: string;
            endStation: string;
        }
    >();

    for (const row of rows) {
        const key = [
            row.start_at,
            row.end_at,
            row.start_station_name,
            row.end_station_name
        ].join('#');
        const currentGroup = groups.get(key) ?? {
            trainCodes: new Set<string>(),
            startAt: row.start_at,
            endAt: row.end_at,
            startStation: row.start_station_name,
            endStation: row.end_station_name
        };
        currentGroup.trainCodes.add(row.train_code);
        groups.set(key, currentGroup);
    }

    return Array.from(groups.values())
        .map((group) =>
            buildTrainRouteSnapshot({
                serviceDate: formatServiceDateFromStartAt(group.startAt),
                trainCodes: Array.from(group.trainCodes),
                startAt: group.startAt,
                endAt: group.endAt,
                startStation: group.startStation,
                endStation: group.endStation
            })
        )
        .filter(
            (snapshot): snapshot is AdminTrainRouteSnapshot => snapshot !== null
        )
        .sort((left, right) => {
            const leftStartAt = left.startAt ?? Number.MAX_SAFE_INTEGER;
            const rightStartAt = right.startAt ?? Number.MAX_SAFE_INTEGER;
            return leftStartAt - rightStartAt;
        });
}

function listRouteRowsByTrainCodesAtStart(
    trainCodes: string[],
    startAt: number
): DailyEmuRouteRow[] {
    if (!Number.isInteger(startAt) || startAt <= 0) {
        return [];
    }

    const rowsById = new Map<number, DailyEmuRouteRow>();
    for (const trainCode of normalizeTrainCodeList(trainCodes)) {
        const rows = listDailyRoutesByTrainCodeInRange(
            trainCode,
            startAt,
            startAt + 1
        );
        for (const row of rows) {
            rowsById.set(row.id, row);
        }
    }

    return Array.from(rowsById.values());
}

function resolveExactRouteSnapshot(
    trainCodes: string[],
    startAt: number | null,
    serviceDate = '',
    internalCode = ''
): AdminTrainRouteSnapshot | null {
    const normalizedTrainCodes = normalizeTrainCodeList(trainCodes);
    const normalizedStartAt = getOptionalInteger(startAt);
    if (normalizedTrainCodes.length === 0 && normalizedStartAt === null) {
        return null;
    }

    if (normalizedStartAt !== null) {
        const routeRows = listRouteRowsByTrainCodesAtStart(
            normalizedTrainCodes,
            normalizedStartAt
        );
        const groupedSnapshots = buildGroupedRouteSnapshots(routeRows);
        if (groupedSnapshots.length > 0) {
            return {
                ...groupedSnapshots[0]!,
                internalCode: normalizeCode(internalCode)
            };
        }
    }

    return buildTrainRouteSnapshot({
        serviceDate,
        trainCodes: normalizedTrainCodes,
        internalCode,
        startAt: normalizedStartAt,
        endAt: null,
        startStation: '',
        endStation: ''
    });
}

interface SeatCodeRoutePayload {
    code: string;
    internalCode: string;
    startDay: string;
    endDay: string;
    startAt: number | null;
    endAt: number | null;
    trainRepeat: string;
}

function toSeatCodeRoutePayload(value: unknown): SeatCodeRoutePayload | null {
    const payload = getPayloadObject(value);
    if (!payload) {
        return null;
    }

    const code = normalizeCode(getOptionalString(payload.code) ?? '');
    const internalCode = normalizeCode(
        getOptionalString(payload.internalCode) ?? ''
    );
    const startAt = getOptionalInteger(payload.startAt);
    const endAt = getOptionalInteger(payload.endAt);
    const startDayRaw = getOptionalString(payload.startDay) ?? '';
    const endDayRaw = getOptionalString(payload.endDay) ?? '';
    const startDay =
        /^\d{8}$/.test(startDayRaw) && startDayRaw.length > 0
            ? startDayRaw
            : formatServiceDateFromStartAt(startAt);
    const endDay =
        /^\d{8}$/.test(endDayRaw) && endDayRaw.length > 0
            ? endDayRaw
            : formatServiceDateFromStartAt(endAt);

    if (
        code.length === 0 &&
        internalCode.length === 0 &&
        startAt === null &&
        endAt === null &&
        startDay.length === 0 &&
        endDay.length === 0
    ) {
        return null;
    }

    return {
        code,
        internalCode,
        startDay,
        endDay,
        startAt,
        endAt,
        trainRepeat: (getOptionalString(payload.trainRepeat) ?? '').trim()
    };
}

function getDetailRouteEndAt(detail: unknown): number | null {
    const payload = getPayloadObject(detail);
    return getOptionalInteger(payload?.routeEndAt);
}

function extractCouplingScanTaskArgs(taskArgs: unknown): {
    bureau: string;
    model: string;
} {
    const payload = getPayloadObject(taskArgs);

    return {
        bureau: (getOptionalString(payload?.bureau) ?? '').trim(),
        model: normalizeCode(getOptionalString(payload?.model) ?? '')
    };
}

function extractQrcodeScanTaskArgs(taskArgs: unknown): {
    detectedAt: string;
    emuCode: string;
    manualNow: boolean;
} {
    const payload = getPayloadObject(taskArgs);

    return {
        detectedAt: (getOptionalString(payload?.detectedAt) ?? '').trim(),
        emuCode: normalizeCode(getOptionalString(payload?.emuCode) ?? ''),
        manualNow: payload?.manualNow === true
    };
}

function toQrcodeScanTaskRunSummary(
    taskRun: ReturnType<typeof getTrainProvenanceTaskRunById>
): AdminQrcodeScanTaskRunSummary | null {
    if (!taskRun) {
        return null;
    }

    const taskArgs = extractQrcodeScanTaskArgs(taskRun.taskArgs);

    return {
        id: taskRun.id,
        schedulerTaskId: taskRun.schedulerTaskId,
        executor: taskRun.executor,
        status: taskRun.status,
        startedAt: taskRun.startedAt,
        finishedAt: taskRun.finishedAt,
        serviceDate: taskRun.serviceDate,
        detectedAt: taskArgs.detectedAt,
        emuCode: taskArgs.emuCode,
        manualNow: taskArgs.manualNow,
        taskArgs: taskRun.taskArgs
    };
}

function hasPendingCouplingDetectionEvent(
    events: TrainProvenanceEventRecord[]
): boolean {
    return events.some(
        (event) => event.eventType === 'pending_coupling_detection'
    );
}

function buildQrcodeScanTimeSummaryItem(
    detectedAt: string,
    taskRuns: ReturnType<typeof listTrainProvenanceTaskRunsByDateAndExecutor>
): AdminQrcodeScanTimeSummaryItem {
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let pendingCouplingCount = 0;

    for (const taskRun of taskRuns) {
        switch (taskRun.status) {
            case 'success':
                successCount += 1;
                break;
            case 'failed':
                failedCount += 1;
                break;
            case 'skipped':
                skippedCount += 1;
                break;
            default:
                break;
        }

        if (
            hasPendingCouplingDetectionEvent(
                listTrainProvenanceEventsByTaskRunId(taskRun.id)
            )
        ) {
            pendingCouplingCount += 1;
        }
    }

    return {
        detectedAt,
        total: taskRuns.length,
        successCount,
        failedCount,
        skippedCount,
        pendingCouplingCount
    };
}

function extractHistoricalReuseDetail(
    event: TrainProvenanceEventRecord
): AdminTrainProvenanceHistoricalReuseDetail | null {
    if (event.eventType !== 'historical_reuse_selected') {
        return null;
    }

    const payload = getPayloadObject(event.payload);
    const historicalStartAt = getOptionalInteger(payload?.historicalStartAt);
    const emuCodes = getStringArray(payload?.emuCodes).map((emuCode) =>
        normalizeCode(emuCode)
    );
    const payloadTrainCodes = getStringArray(payload?.historicalTrainCodes);
    const routeRows =
        historicalStartAt === null
            ? []
            : listProbeStatusByEmuCode(event.emuCode, historicalStartAt);
    const historicalTrainCodes = normalizeTrainCodeList([
        ...payloadTrainCodes,
        ...routeRows.map((row) => row.train_code)
    ]);
    const historicalRoute = fillRouteStationsFromTodayCache(
        resolveExactRouteSnapshot(
            historicalTrainCodes,
            historicalStartAt,
            formatServiceDateFromStartAt(historicalStartAt)
        )
    );

    return {
        historicalRoute,
        resultStatus: event.result === 'coupled' ? 'coupled' : 'single',
        emuCodes: normalizeTrainCodeList(emuCodes)
    };
}

function extractCoupledResolutionDetail(
    event: TrainProvenanceEventRecord
): AdminTrainProvenanceCoupledResolutionDetail | null {
    if (event.eventType !== 'coupling_group_resolved_coupled') {
        return null;
    }

    const payload = getPayloadObject(event.payload);
    const emuCodes = normalizeTrainCodeList(getStringArray(payload?.emuCodes));
    const route =
        fillRouteStationsFromTodayCache(
            buildTrainRouteSnapshot({
                serviceDate: formatServiceDateFromStartAt(event.startAt),
                trainCodes: getTodayScheduleRouteByTrainCodes([event.trainCode])
                    ?.allCodes ?? [event.trainCode],
                startAt: event.startAt,
                endAt: getOptionalInteger(payload?.endAt),
                startStation: getOptionalString(payload?.startStation) ?? '',
                endStation: getOptionalString(payload?.endStation) ?? ''
            })
        ) ?? null;

    return {
        route,
        emuCodes,
        upgradedFromSingle: event.result === 'upgraded_from_single'
    };
}

function formatRouteTrainCodes(
    snapshot: AdminTrainRouteSnapshot | null
): string {
    return snapshot && snapshot.trainCodes.length > 0
        ? snapshot.trainCodes.join(' / ')
        : '--';
}

function formatEmuCodes(emuCodes: string[]): string {
    const normalizedCodes = normalizeTrainCodeList(emuCodes);
    return normalizedCodes.length > 0 ? normalizedCodes.join(' / ') : '--';
}

function resolveScannedRoute(
    candidate: CouplingScanCandidateRecord
): AdminTrainRouteSnapshot | null {
    const detailPayload = getPayloadObject(candidate.detail);
    const routePayload =
        toSeatCodeRoutePayload(detailPayload?.route) ??
        toSeatCodeRoutePayload(candidate.detail);
    const baseSnapshot =
        buildTrainRouteSnapshot({
            serviceDate: routePayload?.startDay || candidate.serviceDate,
            trainCodes: [
                routePayload?.code || candidate.scannedTrainCode
            ].filter((trainCode) => trainCode.length > 0),
            internalCode:
                routePayload?.internalCode || candidate.scannedInternalCode,
            startAt: routePayload?.startAt ?? candidate.scannedStartAt,
            endAt: routePayload?.endAt ?? getDetailRouteEndAt(candidate.detail),
            startStation: '',
            endStation: ''
        }) ?? null;

    return fillRouteStationsFromTodayCache(baseSnapshot);
}

function resolveMatchedRoute(
    candidate: CouplingScanCandidateRecord
): AdminTrainRouteSnapshot | null {
    if (
        candidate.matchedTrainCode.length === 0 &&
        candidate.matchedStartAt === null
    ) {
        return null;
    }

    return fillRouteStationsFromTodayCache(
        resolveExactRouteSnapshot(
            [candidate.matchedTrainCode],
            candidate.matchedStartAt,
            formatServiceDateFromStartAt(candidate.matchedStartAt)
        )
    );
}

function resolveDirectHitEventRoute(
    event: TrainProvenanceEventRecord
): AdminTrainRouteSnapshot | null {
    if (event.eventType !== 'coupling_scan_candidate_direct_hit') {
        return null;
    }

    const payload = getPayloadObject(event.payload);
    const routePayload =
        toSeatCodeRoutePayload(payload?.scannedRoute) ??
        toSeatCodeRoutePayload(payload?.route);
    const trainCodes = normalizeTrainCodeList(
        getStringArray(payload?.directHitTrainCodes)
    );
    const snapshot =
        buildTrainRouteSnapshot({
            serviceDate:
                routePayload?.startDay ||
                formatServiceDateFromStartAt(event.startAt),
            trainCodes:
                trainCodes.length > 0
                    ? trainCodes
                    : [
                          routePayload?.code ||
                              event.relatedTrainCode ||
                              event.trainCode
                      ].filter((trainCode) => trainCode.length > 0),
            internalCode: routePayload?.internalCode ?? '',
            startAt: event.startAt ?? routePayload?.startAt ?? null,
            endAt: routePayload?.endAt ?? null,
            startStation: '',
            endStation: ''
        }) ?? null;

    return fillRouteStationsFromTodayCache(snapshot);
}

function resolveEventScannedRoute(
    event: TrainProvenanceEventRecord
): AdminTrainRouteSnapshot | null {
    if (event.eventType === 'coupling_scan_candidate_direct_hit') {
        return resolveDirectHitEventRoute(event);
    }

    if (
        event.eventType !== 'seat_verification_passed' &&
        event.eventType !== 'seat_verification_unavailable' &&
        event.eventType !== 'seat_verification_unavailable_requeued' &&
        event.eventType !== 'seat_verification_unavailable_exhausted' &&
        event.eventType !== 'seat_verification_mismatch_requeued' &&
        event.eventType !== 'seat_verification_mismatch_exhausted' &&
        event.eventType !== 'qrcode_detection_succeeded' &&
        event.eventType !== 'qrcode_detection_request_failed'
    ) {
        return null;
    }

    const payload = getPayloadObject(event.payload);
    const seatCodeFailure = getPayloadObject(payload?.seatCodeFailure);
    const routePayload =
        toSeatCodeRoutePayload(payload?.scannedRoute) ??
        toSeatCodeRoutePayload(payload?.route) ??
        toSeatCodeRoutePayload(seatCodeFailure?.route);
    const payloadTrainCodes = getStringArray(payload?.directHitTrainCodes);
    const fallbackTrainCode =
        getOptionalString(payload?.seatTrainCode) ??
        routePayload?.code ??
        event.relatedTrainCode ??
        event.trainCode;
    const fallbackInternalCode =
        getOptionalString(payload?.seatInternalCode) ??
        getOptionalString(payload?.trainInternalCode) ??
        routePayload?.internalCode ??
        '';
    const fallbackStartAt =
        getOptionalInteger(payload?.seatStartAt) ??
        routePayload?.startAt ??
        event.startAt;
    const fallbackEndAt = routePayload?.endAt ?? null;

    const snapshot =
        buildTrainRouteSnapshot({
            serviceDate:
                routePayload?.startDay ??
                event.serviceDate ??
                formatServiceDateFromStartAt(fallbackStartAt),
            trainCodes:
                payloadTrainCodes.length > 0
                    ? payloadTrainCodes
                    : [fallbackTrainCode].filter(
                          (trainCode) => trainCode.length > 0
                      ),
            internalCode: fallbackInternalCode,
            startAt: fallbackStartAt,
            endAt: fallbackEndAt,
            startStation: '',
            endStation: ''
        }) ?? null;

    return fillRouteStationsFromTodayCache(snapshot);
}

function buildDepartureFallback(events: TrainProvenanceEventRecord[]): {
    route: AdminTrainRouteSnapshot | null;
    emuCodes: string[];
} {
    const directHitEvents = events.filter(
        (event) => event.eventType === 'coupling_scan_candidate_direct_hit'
    );
    const route =
        directHitEvents.length > 0
            ? resolveDirectHitEventRoute(directHitEvents[0]!)
            : null;
    const emuCodes = normalizeTrainCodeList(
        directHitEvents
            .map((event) => event.emuCode)
            .filter((emuCode) => emuCode.length > 0)
    );

    return {
        route,
        emuCodes
    };
}

function resolveOccupiedRoutes(
    candidate: CouplingScanCandidateRecord
): AdminTrainRouteSnapshot[] {
    if (candidate.reason !== 'already_assigned') {
        return [];
    }

    const occupiedDayRange = getDayTimestampRange(candidate.serviceDate);
    const routeRows = listDailyRoutesByEmuCodeInRange(
        candidate.candidateEmuCode,
        occupiedDayRange.startAt,
        occupiedDayRange.endAt + 1
    );
    const occupiedSnapshots = buildGroupedRouteSnapshots(routeRows);
    if (occupiedSnapshots.length > 0) {
        return occupiedSnapshots;
    }

    const detailPayload = getPayloadObject(candidate.detail);
    const hintedTrainCodes = getStringArray(detailPayload?.trainCodes);
    const hintedStartAts = Array.isArray(detailPayload?.startAts)
        ? detailPayload.startAts
              .map((startAt) => getOptionalInteger(startAt))
              .filter((startAt): startAt is number => startAt !== null)
        : [];

    if (hintedTrainCodes.length === 0 && hintedStartAts.length === 0) {
        return [];
    }

    return hintedStartAts
        .map((startAt) =>
            fillRouteStationsFromTodayCache(
                resolveExactRouteSnapshot(
                    hintedTrainCodes,
                    startAt,
                    formatServiceDateFromStartAt(startAt)
                )
            )
        )
        .filter(
            (snapshot): snapshot is AdminTrainRouteSnapshot => snapshot !== null
        );
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
                  (item): item is AdminTrainProvenanceConflictGroup =>
                      item !== null
              )
        : [];

    if (!currentGroup && conflictGroups.length === 0) {
        return null;
    }

    return {
        mode: event.eventType === 'overlap_requeued' ? 'requeued' : 'dropped',
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

function formatSeatCodeFailureRouteText(detail: unknown): string {
    const payload = getPayloadObject(detail);
    const routePayload = toSeatCodeRoutePayload(payload?.route);
    const route =
        fillRouteStationsFromTodayCache(
            buildTrainRouteSnapshot({
                serviceDate: routePayload?.startDay ?? '',
                trainCodes: [routePayload?.code ?? ''].filter(
                    (trainCode) => trainCode.length > 0
                ),
                internalCode: routePayload?.internalCode ?? '',
                startAt: routePayload?.startAt ?? null,
                endAt: routePayload?.endAt ?? null,
                startStation: '',
                endStation: ''
            })
        ) ?? null;

    if (!route) {
        return '';
    }

    const parts: string[] = [];
    const trainText = formatRouteTrainCodes(route);
    if (trainText !== '--') {
        parts.push(`扫描到 ${trainText}`);
    }

    if (route.startStation.length > 0 || route.endStation.length > 0) {
        parts.push(`${route.startStation || '--'}-${route.endStation || '--'}`);
    }

    const timeText = formatConflictTimeRange(route.startAt, route.endAt);
    if (timeText !== '--') {
        parts.push(timeText);
    }

    return parts.join('，');
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

    if (extraDetail === 'seat route startDay is not current day') {
        const routeText = formatSeatCodeFailureRouteText(detail);
        return routeText.length > 0
            ? `列车发车日期不是当前日期：${routeText}`
            : '列车发车日期不是当前日期';
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
            return '扫描到的车次未发车';
        case 'route_not_tracked_single_pending':
            return '扫描到未追踪车次，当前保持待重联确认';
        case 'route_not_tracked_single_non_multiple_resolved':
            return '扫描到未追踪车次，且车型不可重联，已直接确认为单组';
        case 'tracked_group_matched':
            return '已匹配到当前车次';
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
        return '已进入重联扫描队列';
    }

    if (detail.resultSchedulerTaskId !== null) {
        if (
            detail.queuedSchedulerTaskId !== null &&
            detail.queuedSchedulerTaskId === detail.resultSchedulerTaskId
        ) {
            return `已进入重联扫描队列，任务 #${detail.resultSchedulerTaskId} 已完成`;
        }

        return `已进入重联扫描队列，实际完成任务 #${detail.resultSchedulerTaskId}`;
    }

    return '已进入重联扫描队列';
}

function formatDirectHitEventSummary(
    event: TrainProvenanceEventRecord
): string {
    const payload = getPayloadObject(event.payload);
    const scannedRoute =
        toSeatCodeRoutePayload(payload?.scannedRoute) ??
        toSeatCodeRoutePayload(payload?.route);
    const scannedTrainCode =
        scannedRoute?.code || event.relatedTrainCode || event.trainCode;

    return event.result === 'matched'
        ? `其他车组重联扫描，包含当前车次`
        : `其他车组重联扫描，未包含当前车次`;
}

function formatEventSummary(
    event: TrainProvenanceEventRecord,
    conflictDetail: AdminTrainProvenanceConflictDetail | null,
    historicalReuse: AdminTrainProvenanceHistoricalReuseDetail | null,
    coupledResolution: AdminTrainProvenanceCoupledResolutionDetail | null
): string {
    const payload = getPayloadObject(event.payload);
    const linkedTaskText =
        event.linkedSchedulerTaskId !== null
            ? `扫描任务[#${event.linkedSchedulerTaskId}] `
            : '';

    switch (event.eventType) {
        case 'probe_task_dispatched':
            return `${linkedTaskText}，已创建发车探测任务，${new Date(1000 * (event.startAt ?? 0)).toLocaleString('zh-CN')}`;
        case 'probe_task_skipped':
            return `发车探测任务已跳过：${event.result || 'skip'}`;
        case 'route_probe_succeeded':
            return `发车探测任务：${event.relatedTrainCode || event.trainCode} 查询到车组 ${event.emuCode || '--'}`;
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
            if (historicalReuse?.historicalRoute) {
                const resultLabel =
                    historicalReuse.resultStatus === 'coupled'
                        ? '重联结果'
                        : '单组结果';
                return `复用了历史 ${formatRouteTrainCodes(historicalReuse.historicalRoute)} 的${resultLabel}（${formatEmuCodes(historicalReuse.emuCodes)}）`;
            }
            return event.result === 'coupled'
                ? '复用了历史重联结果'
                : '复用了历史单组结果';
        case 'historical_reuse_rejected':
            return '历史结果不完整，未复用';
        case 'historical_recent_assignment_skipped':
            return '同车组历史命中，但当日未在运行，已跳过';
        case 'seat_verification_passed':
            return '畅行码校验通过';
        case 'seat_verification_unavailable':
            return '畅行码校验不可用，继续当前判断';
        case 'seat_verification_unavailable_requeued':
            return `畅行码校验不可用，已重新排队`;
        case 'seat_verification_unavailable_exhausted':
            return '畅行码校验不可用，重试已耗尽';
        case 'seat_verification_mismatch_requeued':
            return `畅行码校验不一致，已重新排队`;
        case 'seat_verification_mismatch_exhausted':
            return '畅行码校验不一致，重试已耗尽';
        case 'qrcode_detection_dispatch_completed':
            return `畅行码批量扫描任务生成完毕，{linkedTaskText}`;
        case 'qrcode_detection_skipped':
            return `畅行码批量扫描任务被跳过: ${event.result || '已跳过'}`;
        case 'qrcode_detection_request_failed': {
            const seatCodeFailure = payload?.seatCodeFailure;
            return formatSeatCodeFailureReasonText(seatCodeFailure);
        }
        case 'qrcode_detection_succeeded':
            return event.result === 'tracked_route'
                ? '畅行码批量扫描命中已追踪车次'
                : '畅行码批量扫描命中未追踪车次';
        case 'resolved_single':
            return '已判定为单组';
        case 'resolved_from_status':
            if (
                event.result === 'single' &&
                payload?.source === 'coupling_scan_untracked' &&
                payload?.nonMultiple === true
            ) {
                return '重联扫描命中未追踪车次，且车型不可重联，已直接确认为单组';
            }
            return event.result === 'coupled'
                ? '复用了当日已有重联状态'
                : '复用了当日已有单组状态';
        case 'pending_coupling_detection':
            if (
                event.result === 'untracked_single' &&
                payload?.source === 'coupling_scan_untracked'
            ) {
                return '重联扫描命中未追踪车次，当前保持待重联确认';
            }
            return `已进入重联扫描${linkedTaskText}`;
        case 'coupling_group_resolved_single':
            return '重联扫描结束，判定为单组';
        case 'coupling_group_resolved_coupled':
            if (coupledResolution && coupledResolution.emuCodes.length > 0) {
                return event.result === 'upgraded_from_single'
                    ? `重联扫描结束，结果升级为 ${formatEmuCodes(coupledResolution.emuCodes)} 重联`
                    : `重联扫描结束，判定为 ${formatEmuCodes(coupledResolution.emuCodes)} 重联`;
            }
            return event.result === 'upgraded_from_single'
                ? '重联扫描结束，结果升级为重联'
                : '重联扫描结束，判定为重联';
        case 'route_refresh_succeeded':
            return event.result === 'changed'
                ? '线路信息刷新成功并更新了时刻表'
                : '线路信息刷新成功，无时刻表变化';
        case 'route_refresh_failed':
            return `线路信息刷新失败：${event.result || 'request_failed'}`;
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
    const scannedRoute = resolveEventScannedRoute(event);
    const historicalReuse = extractHistoricalReuseDetail(event);
    const coupledResolution = extractCoupledResolutionDetail(event);
    const couplingScan =
        event.eventType === 'coupling_scan_candidate_direct_hit'
            ? {
                  state: 'resolved' as const,
                  queuedSchedulerTaskId: null,
                  queuedTaskRunId: null,
                  resultSchedulerTaskId: event.schedulerTaskId,
                  resultTaskRunId: event.taskRunId,
                  canOpenDetail: true
              }
            : null;
    const summary =
        event.eventType === 'coupling_scan_candidate_direct_hit'
            ? formatDirectHitEventSummary(event)
            : formatEventSummary(
                  event,
                  conflictDetail,
                  historicalReuse,
                  coupledResolution
              );

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
        summary,
        linkedSchedulerTaskId: event.linkedSchedulerTaskId,
        linkedTaskRunId: event.linkedTaskRunId,
        conflictDetail,
        couplingScan,
        scannedRoute,
        historicalReuse,
        coupledResolution,
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

const REQUEST_STAT_DAY_SECONDS = 24 * 60 * 60;
const REQUEST_STAT_HOUR_SECONDS = 60 * 60;
const ADMIN_TRAIN_DATA_REQUEST_TYPES: AdminTrainDataRequestType[] = [
    'search_train_code',
    'fetch_route_info',
    'fetch_emu_by_route',
    'fetch_emu_by_seat_code'
];

interface RequestMetricAccumulator {
    total: number;
    success: number;
    failure: number;
}

interface RequestMetricsAccumulator extends RequestMetricAccumulator {
    byType: Map<AdminTrainDataRequestType, RequestMetricAccumulator>;
}

function createRequestMetricAccumulator(): RequestMetricAccumulator {
    return {
        total: 0,
        success: 0,
        failure: 0
    };
}

function createRequestMetricsAccumulator(): RequestMetricsAccumulator {
    return {
        ...createRequestMetricAccumulator(),
        byType: new Map(
            ADMIN_TRAIN_DATA_REQUEST_TYPES.map((requestType) => [
                requestType,
                createRequestMetricAccumulator()
            ])
        )
    };
}

function addRequestCount(
    target: RequestMetricsAccumulator,
    requestType: AdminTrainDataRequestType,
    isSuccess: boolean,
    requestCount: number
) {
    if (requestCount <= 0) {
        return;
    }

    target.total += requestCount;
    if (isSuccess) {
        target.success += requestCount;
    } else {
        target.failure += requestCount;
    }

    const typeBucket = target.byType.get(requestType);
    if (!typeBucket) {
        return;
    }

    typeBucket.total += requestCount;
    if (isSuccess) {
        typeBucket.success += requestCount;
    } else {
        typeBucket.failure += requestCount;
    }
}

function toSuccessRate(total: number, success: number): number | null {
    return total > 0 ? success / total : null;
}

function toChangeRatio(
    currentValue: number,
    compareValue: number
): number | null {
    if (compareValue <= 0) {
        return null;
    }

    return (currentValue - compareValue) / compareValue;
}

function buildRequestSummary(
    current: RequestMetricAccumulator,
    compare: RequestMetricAccumulator
): AdminTrainDataRequestSummary {
    return {
        total: current.total,
        success: current.success,
        failure: current.failure,
        successRate: toSuccessRate(current.total, current.success),
        compareTotal: compare.total,
        compareSuccess: compare.success,
        compareFailure: compare.failure,
        totalDelta: current.total - compare.total,
        successDelta: current.success - compare.success,
        failureDelta: current.failure - compare.failure,
        totalChangeRatio: toChangeRatio(current.total, compare.total),
        successChangeRatio: toChangeRatio(current.success, compare.success),
        failureChangeRatio: toChangeRatio(current.failure, compare.failure)
    };
}

function buildRequestTypeSummaries(
    current: RequestMetricsAccumulator,
    compare: RequestMetricsAccumulator
): AdminTrainDataRequestTypeSummary[] {
    return ADMIN_TRAIN_DATA_REQUEST_TYPES.map((requestType) => {
        const currentMetric = current.byType.get(requestType)!;
        const compareMetric = compare.byType.get(requestType)!;

        return {
            type: requestType,
            ...buildRequestSummary(currentMetric, compareMetric)
        };
    });
}

export function getAdminTrainRequestStats(
    date: string
): AdminTrainDataRequestStatsResponse {
    const runtimeConfig = getTrainProvenanceRuntimeConfig();
    const compareDate = /^\d{8}$/.test(date)
        ? formatShanghaiDateString(
              (getShanghaiDayStartUnixSeconds(date) -
                  REQUEST_STAT_DAY_SECONDS) *
                  1000
          )
        : '';

    if (!isTrainProvenanceEnabled()) {
        return {
            enabled: false,
            retentionDays: runtimeConfig.retentionDays,
            date,
            compareDate,
            asOf: getNowSeconds(),
            totals: buildRequestSummary(
                createRequestMetricAccumulator(),
                createRequestMetricAccumulator()
            ),
            types: [],
            hours: []
        };
    }

    if (!/^\d{8}$/.test(date)) {
        return {
            enabled: true,
            retentionDays: runtimeConfig.retentionDays,
            date,
            compareDate,
            asOf: getNowSeconds(),
            totals: buildRequestSummary(
                createRequestMetricAccumulator(),
                createRequestMetricAccumulator()
            ),
            types: [],
            hours: []
        };
    }

    const currentDayStart = getShanghaiDayStartUnixSeconds(date);
    const compareDayStart = currentDayStart - REQUEST_STAT_DAY_SECONDS;
    const queryEndAt = currentDayStart + REQUEST_STAT_DAY_SECONDS;
    const rows = list12306RequestHourlyStatsInRange(
        compareDayStart,
        queryEndAt
    );
    const currentHours = Array.from({ length: 24 }, () =>
        createRequestMetricsAccumulator()
    );
    const compareHours = Array.from({ length: 24 }, () =>
        createRequestMetricsAccumulator()
    );
    const currentTotals = createRequestMetricsAccumulator();
    const compareTotals = createRequestMetricsAccumulator();

    for (const row of rows) {
        const isCurrentDay = row.serviceDate === date;
        const isCompareDay = row.serviceDate === compareDate;
        if (!isCurrentDay && !isCompareDay) {
            continue;
        }

        const dayStart = isCurrentDay ? currentDayStart : compareDayStart;
        const hourIndex = Math.floor(
            (row.bucketStart - dayStart) / REQUEST_STAT_HOUR_SECONDS
        );
        if (hourIndex < 0 || hourIndex >= 24) {
            continue;
        }

        const hourTarget = isCurrentDay
            ? currentHours[hourIndex]!
            : compareHours[hourIndex]!;
        const totalTarget = isCurrentDay ? currentTotals : compareTotals;

        addRequestCount(
            hourTarget,
            row.requestType,
            row.isSuccess,
            row.requestCount
        );
        addRequestCount(
            totalTarget,
            row.requestType,
            row.isSuccess,
            row.requestCount
        );
    }

    const hours: AdminTrainDataRequestHourBucket[] = currentHours.map(
        (currentHour, hourIndex) => ({
            hour: hourIndex,
            startAt: currentDayStart + hourIndex * REQUEST_STAT_HOUR_SECONDS,
            endAt:
                currentDayStart + (hourIndex + 1) * REQUEST_STAT_HOUR_SECONDS,
            ...buildRequestSummary(currentHour, compareHours[hourIndex]!),
            types: buildRequestTypeSummaries(
                currentHour,
                compareHours[hourIndex]!
            )
        })
    );

    return {
        enabled: true,
        retentionDays: runtimeConfig.retentionDays,
        date,
        compareDate,
        asOf: getNowSeconds(),
        totals: buildRequestSummary(currentTotals, compareTotals),
        types: buildRequestTypeSummaries(currentTotals, compareTotals),
        hours
    };
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
    const allTimelineRecords = listTrainProvenanceEventsByDateAndTrainCode(
        date,
        normalizedTrainCode,
        null
    );
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
    const timelineRecordsByStartAt = new Map<
        number,
        TrainProvenanceEventRecord[]
    >();

    for (const event of allTimelineRecords) {
        if (event.startAt === null) {
            continue;
        }

        const currentEvents = timelineRecordsByStartAt.get(event.startAt) ?? [];
        currentEvents.push(event);
        timelineRecordsByStartAt.set(event.startAt, currentEvents);
    }

    const departures = departureStartAts.map((candidateStartAt) => {
        const fallback = buildDepartureFallback(
            timelineRecordsByStartAt.get(candidateStartAt) ?? []
        );

        return toDeparture(
            candidateStartAt,
            routeRows.filter((row) => row.start_at === candidateStartAt),
            probeRows.filter((row) => row.start_at === candidateStartAt),
            fallback.route,
            fallback.emuCodes
        );
    });
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
                  allTimelineRecords
                      .filter((event) => event.startAt === selectedStartAt)
                      .map(toTimelineEvent)
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
            serviceDate: candidate.serviceDate,
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
            scannedRoute: resolveScannedRoute(candidate),
            matchedRoute: resolveMatchedRoute(candidate),
            occupiedRoutes: resolveOccupiedRoutes(candidate),
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

export function getAdminCouplingScanTaskList(
    date: string
): AdminCouplingScanTaskListResponse {
    const runtimeConfig = getTrainProvenanceRuntimeConfig();

    if (!isTrainProvenanceEnabled()) {
        return {
            enabled: false,
            retentionDays: runtimeConfig.retentionDays,
            date,
            items: []
        };
    }

    if (!/^\d{8}$/.test(date)) {
        return {
            enabled: true,
            retentionDays: runtimeConfig.retentionDays,
            date,
            items: []
        };
    }

    const items: AdminCouplingScanTaskListItem[] =
        listTrainProvenanceTaskRunsByDateAndExecutor(
            date,
            COUPLING_SCAN_TASK_EXECUTOR
        )
            .filter((taskRun) => taskRun.status !== 'skipped')
            .map((taskRun) => {
                const taskArgs = extractCouplingScanTaskArgs(taskRun.taskArgs);

                return {
                    taskRunId: taskRun.id,
                    schedulerTaskId: taskRun.schedulerTaskId,
                    executor: taskRun.executor,
                    status: taskRun.status,
                    startedAt: taskRun.startedAt,
                    finishedAt: taskRun.finishedAt,
                    serviceDate: taskRun.serviceDate,
                    bureau: taskArgs.bureau,
                    model: taskArgs.model,
                    taskArgs: taskRun.taskArgs
                };
            });

    return {
        enabled: true,
        retentionDays: runtimeConfig.retentionDays,
        date,
        items
    };
}

export function getAdminQrcodeScanTaskList(
    date: string
): AdminQrcodeScanTaskListResponse {
    const runtimeConfig = getTrainProvenanceRuntimeConfig();

    if (!isTrainProvenanceEnabled()) {
        return {
            enabled: false,
            retentionDays: runtimeConfig.retentionDays,
            date,
            items: []
        };
    }

    if (!/^\d{8}$/.test(date)) {
        return {
            enabled: true,
            retentionDays: runtimeConfig.retentionDays,
            date,
            items: []
        };
    }

    const groupedTaskRuns = new Map<
        string,
        ReturnType<typeof listTrainProvenanceTaskRunsByDateAndExecutor>
    >();

    for (const taskRun of listTrainProvenanceTaskRunsByDateAndExecutor(
        date,
        QRCODE_SCAN_TASK_EXECUTOR
    )) {
        const taskArgs = extractQrcodeScanTaskArgs(taskRun.taskArgs);
        const detectedAt = taskArgs.detectedAt;
        if (!/^\d{4}$/.test(detectedAt)) {
            continue;
        }

        const currentGroup = groupedTaskRuns.get(detectedAt) ?? [];
        currentGroup.push(taskRun);
        groupedTaskRuns.set(detectedAt, currentGroup);
    }

    const items: AdminQrcodeScanTimeSummaryItem[] = Array.from(
        groupedTaskRuns.entries(),
        ([detectedAt, taskRuns]) =>
            buildQrcodeScanTimeSummaryItem(detectedAt, taskRuns)
    ).sort((left, right) => left.detectedAt.localeCompare(right.detectedAt));

    return {
        enabled: true,
        retentionDays: runtimeConfig.retentionDays,
        date,
        items
    };
}

export function getAdminQrcodeScanDetail(
    date: string,
    detectedAt: string
): AdminQrcodeScanDetailResponse {
    if (!isTrainProvenanceEnabled()) {
        return {
            enabled: false,
            date,
            detectedAt,
            summary: null,
            tasks: []
        };
    }

    if (!/^\d{8}$/.test(date) || !/^\d{4}$/.test(detectedAt)) {
        return {
            enabled: true,
            date,
            detectedAt,
            summary: null,
            tasks: []
        };
    }

    const matchingTaskRuns = listTrainProvenanceTaskRunsByDateAndExecutor(
        date,
        QRCODE_SCAN_TASK_EXECUTOR
    ).filter((taskRun) => {
        const taskArgs = extractQrcodeScanTaskArgs(taskRun.taskArgs);
        return taskArgs.detectedAt === detectedAt;
    });

    const tasks: AdminQrcodeScanTimeDetailTaskItem[] = matchingTaskRuns
        .map((taskRun) => {
            const taskRunSummary = toQrcodeScanTaskRunSummary(taskRun);
            if (!taskRunSummary) {
                return null;
            }

            return {
                taskRun: taskRunSummary,
                timeline: listTrainProvenanceEventsByTaskRunId(taskRun.id).map(
                    toTimelineEvent
                )
            };
        })
        .filter(
            (item): item is AdminQrcodeScanTimeDetailTaskItem => item !== null
        );

    return {
        enabled: true,
        date,
        detectedAt,
        summary: buildQrcodeScanTimeSummaryItem(detectedAt, matchingTaskRuns),
        tasks
    };
}
