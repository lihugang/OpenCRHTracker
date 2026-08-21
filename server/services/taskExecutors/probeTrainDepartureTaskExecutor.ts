import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import { clearRecentCoupledGroupDetection } from '~/server/services/probeDetectionState';
import {
    buildProbeAssetKey,
    getProbeEmuMultipleStateFromCode,
    getProbeEmuMultipleStateFromRecord,
    loadProbeAssets,
    type EmuListRecord,
    type ProbeEmuMultipleState
} from '~/server/services/probeAssetStore';
import {
    buildTrainKey,
    clearQueriedTrainKey,
    clearRunningEmuStateByTrainKey,
    ensureProbeStateForToday,
    getAssignedEmuState,
    hasQueriedTrainKey,
    listAssignedEmuCodesByTrainKey
} from '~/server/services/probeRuntimeState';
import {
    deleteProbeUntrustedRecordsByTrainCodeInRange,
    deleteProbeUntrustedRecordsByTrainCodeAndEmuCodeAtServiceDate,
    isProbeUntrustedRecord,
    markProbeUntrustedRecord
} from '~/server/services/probeUntrustedRecordStore';
import {
    deleteDailyRoutesByTrainCodeInRange,
    getCachedDailyRoutesByEmuCodeAtServiceDate,
    invalidateCachedDailyRoutesByEmuCodes,
    listConfirmedDailyRoutesByEmuCodeBefore,
    listDailyRoutesByEmuCodeInRange,
    listDailyRoutesByTrainCodeAndStartAt,
    listDailyRoutesByTrainCodesAndStartAt,
    listDailyRoutesByTrainCodeInRange,
    setCachedDailyRoutesByEmuCodeAtServiceDate,
    updateDailyRouteFormationStatusByEmuCode,
    updateDailyRouteFullStatusByEmuCode,
    type DailyEmuRouteRow
} from '~/server/services/emuRoutesStore';
import {
    EMU_ROUTE_STATUS_UNCONFIRMED_SINGLE,
    decodeEmuRouteStatus,
    isConfirmed,
    isConfirmedCoupled,
    mergeEmuRouteStatuses,
    withFormationStatus,
    type EmuRouteFormationPosition
} from '~/server/utils/emuRouteStatus';
import {
    collectStatusByEmuFromRows,
    collectStatusByEmuFromRowsWithConflicts,
    type EmuRouteStatusMergeConflict
} from '~/server/utils/emuRouteFormation';
import type { CarDetailFormationWarningKind } from '~/server/utils/emuRouteFormation';
import { reportFormationStatusWarnings } from '~/server/services/formationStatusWarnings';
import type { FormationWarningReportContext } from '~/server/services/formationStatusWarnings';
import type {
    FormationStatusWarning,
    FormationWarningKind,
    FormationWarningSource
} from '~/server/services/formationStatusResolver';
import { buildCoupledUnknownStatusByEmu } from '~/server/services/formationStatusResolver';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import { enqueueTask } from '~/server/services/taskQueue';
import { DETECT_COUPLED_EMU_GROUP_TASK_EXECUTOR } from '~/server/services/taskExecutors/detectCoupledEmuGroupTaskExecutor';
import {
    applyPendingCouplingProbeResult,
    applyResolvedProbeResult,
    queueCoupledDetectionTask
} from '~/server/services/taskExecutors/probeResolutionShared';
import type { ProbeTrackingMutation } from '~/server/services/probeTrackingMutations';
import { rescheduleTaskUntilScheduleReady } from '~/server/services/scheduleReadinessGuard';
import {
    markCurrentTrainProvenanceTaskSkipped,
    recordCurrentTrainProvenanceEventsForTrainCodes
} from '~/server/services/trainProvenanceRecorder';
import {
    getSafeTodayScheduleProbeTrainCodes,
    getTodayScheduleProbeGroupByTrainCode,
    type TodayScheduleProbeGroup
} from '~/server/services/todayScheduleCache';
import { getHistoricalRecentEmuCodesByTrainCode } from '~/server/services/historicalRecentTrainEmuIndexStore';
import fetchEMUInfoByRoute from '~/server/utils/12306/network/fetchEMUInfoByRoute';
import fetchEMUInfoBySeatCode, {
    type FetchSeatCodeFailureResult
} from '~/server/utils/12306/network/fetchEMUInfoBySeatCode';
import fetchRouteInfo from '~/server/utils/12306/network/fetchRouteInfo';
import parseEmuCode from '~/server/utils/12306/parseEmuCode';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import { formatShanghaiDateTime } from '~/server/utils/date/shanghaiDateTime';
import {
    serviceDayToShanghaiDayStartUnixSeconds,
    serviceDateToDay,
    unixSecondsToServiceDay,
    type ServiceDay
} from '~/server/utils/date/serviceDay';
import {
    trainCodeKey,
    formatTrainCode,
    formatTrainCodes,
    type TrainCodeParts
} from '~/server/utils/12306/trainCode';
import type { EmuId } from '~/server/libs/database/emu';
import {
    ensureExternalEmuId,
    formatExternalEmuCode,
    parseExternalTrainCodeOrThrow
} from '~/server/utils/internal/boundaries';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

export const PROBE_TRAIN_DEPARTURE_TASK_EXECUTOR = 'probe_train_departure';

const logger = getLogger('task-executor:probe-train-departure');
const MAX_REQUEUE_TRAIN_CODES = 8;

interface ProbeTrainDepartureTaskArgs {
    trainCode: TrainCodeParts;
    trainInternalCode: string | null;
    allCodes: TrainCodeParts[];
    startStation: string;
    endStation: string;
    startAt: number;
    endAt: number;
    retry: number;
}

interface CoupledDetectionTaskArgs {
    bureau: string;
    model: string;
}

interface KnownStatusGroup {
    emuIds: EmuId[];
    statusByEmu: Map<EmuId, number>;
    warnings: FormationStatusWarning[];
}

class DepartureRouteReadCache {
    getInRange(
        emuId: EmuId,
        startAt: number,
        endAtExclusive: number
    ): DailyEmuRouteRow[] {
        if (
            !Number.isInteger(startAt) ||
            !Number.isInteger(endAtExclusive) ||
            endAtExclusive <= startAt
        ) {
            return [];
        }

        const serviceDate = unixSecondsToServiceDay(startAt);
        const endServiceDate = unixSecondsToServiceDay(endAtExclusive - 1);
        if (serviceDate !== endServiceDate) {
            return listDailyRoutesByEmuCodeInRange(
                emuId,
                startAt,
                endAtExclusive
            );
        }

        return this.getByServiceDate(emuId, serviceDate).filter((row) =>
            row.start_at > 0
                ? row.start_at >= startAt && row.start_at < endAtExclusive
                : row.service_date === serviceDate
        );
    }

    getAtStartAt(emuId: EmuId, startAt: number): DailyEmuRouteRow[] {
        if (!Number.isInteger(startAt) || startAt < 0) {
            return [];
        }

        const serviceDate = unixSecondsToServiceDay(startAt);
        const rows = this.getByServiceDate(emuId, serviceDate);
        const resolvedRows = rows.filter((row) => row.start_at === startAt);
        if (resolvedRows.length > 0) {
            return resolvedRows;
        }

        return rows.filter(
            (row) => row.start_at === 0 && row.service_date === serviceDate
        );
    }

    invalidateEmuIds(emuIds: readonly EmuId[]): void {
        invalidateCachedDailyRoutesByEmuCodes(emuIds);
    }

    private getByServiceDate(
        emuId: EmuId,
        serviceDate: ServiceDay
    ): DailyEmuRouteRow[] {
        const cached = getCachedDailyRoutesByEmuCodeAtServiceDate(
            emuId,
            serviceDate
        );
        if (cached !== undefined) {
            return cached;
        }

        const dayStart = serviceDayToShanghaiDayStartUnixSeconds(serviceDate);
        const rows = listDailyRoutesByEmuCodeInRange(
            emuId,
            dayStart,
            dayStart + 24 * 60 * 60
        );
        setCachedDailyRoutesByEmuCodeAtServiceDate(emuId, serviceDate, rows);
        return rows;
    }
}

function toStatusAggregationWarnings(
    conflicts: EmuRouteStatusMergeConflict[]
): FormationStatusWarning[] {
    return conflicts.map((conflict) => ({
        source: 'status_aggregation',
        kind: 'status_row_conflict',
        emuId: conflict.emuId,
        oldStatus: conflict.statuses[0] ?? null,
        newStatus: conflict.mergedStatus,
        pictureName: '',
        repeat: '',
        reason: `conflicting confirmed formation statuses were merged: ${conflict.statuses.join('/')}`
    }));
}

interface ClearedOverlapState {
    deletedDailyRouteRows: number;
    clearedTrainKeys: string[];
    affectedEmuIds: EmuId[];
}

type RouteProbeResult = NonNullable<
    Awaited<ReturnType<typeof fetchEMUInfoByRoute>>
>;

interface SuccessfulRouteProbe {
    probedTrainCode: TrainCodeParts;
    routeProbeResult: RouteProbeResult;
}

type ConflictGroupRouteState = 'running' | 'not_running' | 'request_failed';

interface ConflictGroupValidationResult {
    group: TodayScheduleProbeGroup;
    state: ConflictGroupRouteState;
    runningTrainCode: TrainCodeParts | null;
    requestFailedTrainCodes: TrainCodeParts[];
    notRunningTrainCodes: TrainCodeParts[];
}

interface TrainProvenanceConflictCurrentGroupPayload {
    trainCodes: TrainCodeParts[];
    startAt: number;
    endAt: number;
    startStation: string;
    endStation: string;
}

interface TrainProvenanceConflictGroupPayload extends TrainProvenanceConflictCurrentGroupPayload {
    overlapStartAt: number;
    overlapEndAt: number;
    state: ConflictGroupRouteState;
}

interface ClearedNotRunningState extends ClearedOverlapState {
    downgradedRouteRows: number;
}

interface TodayTrainCodesValidationResult {
    state: 'running' | 'not_running' | 'request_failed';
    runningTrainCode: TrainCodeParts | null;
    requestFailedTrainCodes: TrainCodeParts[];
    notRunningTrainCodes: TrainCodeParts[];
}

interface SeatCodeVerificationResult {
    state: 'matched' | 'mismatch' | 'unavailable';
    reason:
        | 'matched_internal_code'
        | 'matched_train_code'
        | 'main_emu_code_invalid'
        | 'seat_code_missing'
        | 'seat_code_request_failed_network_error'
        | 'seat_code_request_failed_not_enabled'
        | 'seat_code_request_failed_other'
        | 'seat_route_not_current_day'
        | 'seat_internal_code_mismatch'
        | 'seat_train_code_mismatch';
    seatTrainCode: TrainCodeParts | null;
    seatInternalCode: string | null;
    seatStartAt: number;
    seatCodeFailureDetail?: FetchSeatCodeFailureResult | null;
}

type SeatCodeRouteUnavailableReason =
    | 'main_emu_code_invalid'
    | 'seat_code_missing'
    | 'seat_code_request_failed_network_error'
    | 'seat_code_request_failed_not_enabled'
    | 'seat_code_request_failed_other'
    | 'seat_route_not_current_day';

interface SeatCodeRouteFetchResult {
    state: 'available' | 'unavailable';
    reason?: SeatCodeRouteUnavailableReason;
    seatTrainCode: TrainCodeParts | null;
    seatInternalCode: string | null;
    seatStartAt: number;
    seatEndAt: number;
}

type SeatCodeArbitrationOutcome = 'handled' | 'winner' | 'unavailable';

interface ProbeEmuByTrainCodesResult {
    probe: SuccessfulRouteProbe | null;
    untrustedSkippedPairs: Array<{
        trainCode: TrainCodeParts;
        emuId: EmuId;
    }>;
}

function shouldRequeueUnavailableSeatVerification(
    reason: SeatCodeVerificationResult['reason']
): boolean {
    return (
        reason === 'seat_code_request_failed_network_error' ||
        reason === 'seat_code_request_failed_not_enabled' ||
        reason === 'seat_code_request_failed_other'
    );
}

let registered = false;

function parseTaskArgs(raw: unknown): ProbeTrainDepartureTaskArgs {
    const config = useConfig();
    const defaultRetry = config.spider.scheduleProbe.probe.defaultRetry;

    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new Error('task arguments must be an object');
    }

    const body = raw as {
        trainCode?: unknown;
        trainInternalCode?: unknown;
        allCodes?: unknown;
        startStation?: unknown;
        endStation?: unknown;
        startAt?: unknown;
        endAt?: unknown;
        retry?: unknown;
    };

    const trainCode =
        typeof body.trainCode === 'object' &&
        body.trainCode !== null &&
        typeof (body.trainCode as { prefix?: unknown }).prefix === 'string' &&
        typeof (body.trainCode as { number?: unknown }).number === 'number'
            ? (body.trainCode as TrainCodeParts)
            : null;
    if (trainCode === null) {
        throw new Error('task arguments trainCode must be a train code object');
    }

    const trainInternalCode =
        body.trainInternalCode === null || body.trainInternalCode === undefined
            ? null
            : String(body.trainInternalCode).trim();

    const allCodes = Array.isArray(body.allCodes)
        ? body.allCodes.filter(
              (item): item is TrainCodeParts =>
                  typeof item === 'object' &&
                  item !== null &&
                  typeof (item as { prefix?: unknown }).prefix === 'string' &&
                  typeof (item as { number?: unknown }).number === 'number'
          )
        : [];
    const startStation =
        typeof body.startStation === 'string' ? body.startStation.trim() : '';
    const endStation =
        typeof body.endStation === 'string' ? body.endStation.trim() : '';

    if (
        typeof body.startAt !== 'number' ||
        !Number.isInteger(body.startAt) ||
        body.startAt < 0
    ) {
        throw new Error(
            'task arguments startAt must be a non-negative integer'
        );
    }
    if (
        typeof body.endAt !== 'number' ||
        !Number.isInteger(body.endAt) ||
        body.endAt < 0
    ) {
        throw new Error('task arguments endAt must be a non-negative integer');
    }

    const retry =
        typeof body.retry === 'number' &&
        Number.isInteger(body.retry) &&
        body.retry >= 0
            ? body.retry
            : defaultRetry;

    return {
        trainCode,
        trainInternalCode,
        allCodes,
        startStation,
        endStation,
        startAt: body.startAt,
        endAt: body.endAt,
        retry
    };
}

function isCurrentScheduleTask(startAt: number): boolean {
    const currentDate = getCurrentDateString();
    const dayStart = getShanghaiDayStartUnixSeconds(currentDate);
    const nextDayStart = dayStart + 24 * 60 * 60;
    return startAt >= dayStart && startAt < nextDayStart;
}

function getCurrentDayWindow(): {
    dayStart: number;
    nextDayStart: number;
} {
    const currentDate = getCurrentDateString();
    const dayStart = getShanghaiDayStartUnixSeconds(currentDate);
    return {
        dayStart,
        nextDayStart: dayStart + 24 * 60 * 60
    };
}

function buildFallbackGroupFromArgs(
    args: ProbeTrainDepartureTaskArgs
): TodayScheduleProbeGroup {
    const seenAllCodes = new Set<string>([trainCodeKey(args.trainCode)]);
    const allCodes: TrainCodeParts[] = [args.trainCode];
    for (const trainCode of args.allCodes) {
        const key = trainCodeKey(trainCode);
        if (seenAllCodes.has(key)) {
            continue;
        }
        seenAllCodes.add(key);
        allCodes.push(trainCode);
    }
    return {
        trainKey: buildTrainKey(
            args.trainCode,
            args.trainInternalCode,
            args.startAt
        ),
        trainCode: args.trainCode,
        trainInternalCode: args.trainInternalCode ?? '',
        allCodes,
        bureauCode: '',
        trainStyle: '',
        trainDepartment: '',
        passengerDepartment: '',
        startStation: args.startStation,
        endStation: args.endStation,
        startAt: args.startAt,
        endAt: args.endAt,
        updatedAt: null
    };
}

function buildFallbackGroupFromRouteRow(
    row: DailyEmuRouteRow
): TodayScheduleProbeGroup {
    return {
        trainKey: buildTrainKey(row.train_code, null, row.start_at),
        trainCode: row.train_code,
        trainInternalCode: '',
        allCodes: [row.train_code],
        bureauCode: '',
        trainStyle: '',
        trainDepartment: '',
        passengerDepartment: '',
        startStation: row.start_station_name,
        endStation: row.end_station_name,
        startAt: row.start_at,
        endAt: row.end_at,
        updatedAt: null
    };
}

function getGroupTrainCodes(group: TodayScheduleProbeGroup): TrainCodeParts[] {
    return getSafeTodayScheduleProbeTrainCodes(group);
}

function filterSafeProbeTaskTrainCodes(
    args: ProbeTrainDepartureTaskArgs
): TrainCodeParts[] {
    const scheduleGroup = getTodayScheduleProbeGroupByTrainCode(args.trainCode);
    if (!scheduleGroup) {
        return [args.trainCode];
    }

    const allowedCodes = new Set(
        getSafeTodayScheduleProbeTrainCodes(scheduleGroup).map(trainCodeKey)
    );
    const seen = new Set<string>();
    const result: TrainCodeParts[] = [];
    for (const trainCode of [args.trainCode, ...args.allCodes]) {
        const key = trainCodeKey(trainCode);
        if (seen.has(key) || !allowedCodes.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(trainCode);
    }
    return result;
}

function isRouteTimeOverlapping(
    startAt: number,
    endAt: number,
    anotherStartAt: number,
    anotherEndAt: number
): boolean {
    return startAt < anotherEndAt && anotherStartAt < endAt;
}

function buildRequeueTaskArgs(
    group: TodayScheduleProbeGroup,
    retry: number
): ProbeTrainDepartureTaskArgs {
    return {
        trainCode: group.trainCode,
        trainInternalCode: group.trainInternalCode,
        allCodes: group.allCodes.slice(0, MAX_REQUEUE_TRAIN_CODES),
        startStation: group.startStation,
        endStation: group.endStation,
        startAt: group.startAt,
        endAt: group.endAt,
        retry
    };
}

function formatTrainCodeGroup(group: TodayScheduleProbeGroup): string {
    const seen = new Set<string>();
    const codes: string[] = [];
    for (const trainCode of group.allCodes) {
        const key = trainCodeKey(trainCode);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        codes.push(formatTrainCode(trainCode));
    }
    return codes.join(' / ');
}

function formatTrainCodeGroups(groups: TodayScheduleProbeGroup[]): string {
    return groups.map((group) => formatTrainCodeGroup(group)).join('；');
}

function formatOverlapTimeRange(
    currentGroup: TodayScheduleProbeGroup,
    anotherGroup: TodayScheduleProbeGroup
): string {
    const overlapStart = Math.max(currentGroup.startAt, anotherGroup.startAt);
    const overlapEnd = Math.min(currentGroup.endAt, anotherGroup.endAt);
    return `${formatShanghaiDateTime(overlapStart)} ~ ${formatShanghaiDateTime(overlapEnd)}`;
}

function formatOverlapTimeRanges(
    currentGroup: TodayScheduleProbeGroup,
    groups: TodayScheduleProbeGroup[]
): string {
    return groups
        .map((group) => formatOverlapTimeRange(currentGroup, group))
        .join('；');
}

function buildTrainProvenanceConflictCurrentGroupPayload(
    group: TodayScheduleProbeGroup
): TrainProvenanceConflictCurrentGroupPayload {
    return {
        trainCodes: getGroupTrainCodes(group),
        startAt: group.startAt,
        endAt: group.endAt,
        startStation: group.startStation,
        endStation: group.endStation
    };
}

function buildTrainProvenanceConflictGroupPayload(
    currentGroup: TodayScheduleProbeGroup,
    conflictGroup: TodayScheduleProbeGroup,
    state: ConflictGroupRouteState
): TrainProvenanceConflictGroupPayload {
    return {
        ...buildTrainProvenanceConflictCurrentGroupPayload(conflictGroup),
        overlapStartAt: Math.max(currentGroup.startAt, conflictGroup.startAt),
        overlapEndAt: Math.min(currentGroup.endAt, conflictGroup.endAt),
        state
    };
}

function buildConflictStateByTrainKey(
    validationResults: ConflictGroupValidationResult[]
): Map<string, ConflictGroupRouteState> {
    return new Map(
        validationResults.map((result) => [result.group.trainKey, result.state])
    );
}

function hasGroupTrainKey(
    groups: TodayScheduleProbeGroup[],
    trainKey: string
): boolean {
    return groups.some((group) => group.trainKey === trainKey);
}

function areAllGroupsRunning(
    groups: TodayScheduleProbeGroup[],
    validationResults: ConflictGroupValidationResult[]
): boolean {
    const validationStatesByTrainKey = new Map(
        validationResults.map((result) => [result.group.trainKey, result.state])
    );

    return groups.every(
        (group) => validationStatesByTrainKey.get(group.trainKey) === 'running'
    );
}

function collectAffectedDetectionGroups(
    emuIds: EmuId[],
    assets: Awaited<ReturnType<typeof loadProbeAssets>>
): Array<{ bureau: string; model: string }> {
    const detectionGroups = new Map<
        string,
        { bureau: string; model: string }
    >();

    for (const emuId of emuIds) {
        const emuCode = formatExternalEmuCode(emuId);
        const parsedEmuCode = parseEmuCode(emuCode);
        if (!parsedEmuCode?.trainSetNo) {
            continue;
        }

        const record = assets.emuByModelAndTrainSetNo.get(
            buildProbeAssetKey(parsedEmuCode.model, parsedEmuCode.trainSetNo)
        );
        if (!record) {
            continue;
        }

        const detectionKey = `${record.bureau}#${record.model}`;
        if (!detectionGroups.has(detectionKey)) {
            detectionGroups.set(detectionKey, {
                bureau: record.bureau,
                model: record.model
            });
        }
    }

    return Array.from(detectionGroups.values());
}

function collectOverlappingGroups(
    mainEmuId: EmuId,
    currentGroup: TodayScheduleProbeGroup,
    dayStart: number,
    nextDayStart: number,
    routeReadCache: DepartureRouteReadCache
): TodayScheduleProbeGroup[] {
    const overlappingGroups = new Map<string, TodayScheduleProbeGroup>();
    const existingRows = routeReadCache.getInRange(
        mainEmuId,
        dayStart,
        nextDayStart
    );

    for (const row of existingRows) {
        if (
            !isRouteTimeOverlapping(
                currentGroup.startAt,
                currentGroup.endAt,
                row.start_at,
                row.end_at
            )
        ) {
            continue;
        }

        const overlappingGroup =
            getTodayScheduleProbeGroupByTrainCode(row.train_code) ??
            buildFallbackGroupFromRouteRow(row);
        if (overlappingGroup.trainKey === currentGroup.trainKey) {
            continue;
        }

        overlappingGroups.set(overlappingGroup.trainKey, overlappingGroup);
    }

    return Array.from(overlappingGroups.values());
}

function downgradeAffectedRouteStatuses(
    emuIds: EmuId[],
    deletedTrainCodes: Set<string>,
    dayStart: number,
    nextDayStart: number
): number {
    let downgradedRouteRows = 0;

    const seenEmuIds = new Set<number>();
    for (const emuId of emuIds) {
        const emuIdNumber = Number(emuId);
        if (seenEmuIds.has(emuIdNumber)) {
            continue;
        }
        seenEmuIds.add(emuIdNumber);
        const startAts = new Set<number>();
        for (const row of listDailyRoutesByEmuCodeInRange(
            emuId,
            dayStart,
            nextDayStart
        )) {
            if (deletedTrainCodes.has(trainCodeKey(row.train_code))) {
                continue;
            }

            startAts.add(row.start_at);
        }

        for (const startAt of startAts) {
            downgradedRouteRows += updateDailyRouteFormationStatusByEmuCode(
                emuId,
                startAt,
                EMU_ROUTE_STATUS_UNCONFIRMED_SINGLE
            );
        }
    }

    return downgradedRouteRows;
}

function clearOverlappingGroups(
    groups: TodayScheduleProbeGroup[],
    dayStart: number,
    nextDayStart: number,
    assets: Awaited<ReturnType<typeof loadProbeAssets>>
): ClearedOverlapState {
    const affectedEmuIds = new Set<number>();
    const clearedTrainKeys: string[] = [];
    let deletedDailyRouteRows = 0;

    for (const group of groups) {
        clearQueriedTrainKey(group.trainKey);
        clearRunningEmuStateByTrainKey(group.trainKey).forEach((emuId) =>
            affectedEmuIds.add(Number(emuId))
        );
        clearedTrainKeys.push(group.trainKey);

        const seenTrainCodes = new Set<string>();
        const groupTrainCodes = group.allCodes.filter((trainCode) => {
            const key = trainCodeKey(trainCode);
            if (seenTrainCodes.has(key)) {
                return false;
            }
            seenTrainCodes.add(key);
            return true;
        });
        for (const trainCode of groupTrainCodes) {
            listDailyRoutesByTrainCodeInRange(
                trainCode,
                dayStart,
                nextDayStart
            ).forEach((row) => affectedEmuIds.add(Number(row.emu_id)));

            deletedDailyRouteRows += deleteDailyRoutesByTrainCodeInRange(
                trainCode,
                dayStart,
                nextDayStart
            );
            deleteProbeUntrustedRecordsByTrainCodeInRange(
                trainCode,
                dayStart,
                nextDayStart
            );
        }
    }

    for (const detectionGroup of collectAffectedDetectionGroups(
        Array.from(affectedEmuIds, (emuId) => emuId as EmuId),
        assets
    )) {
        clearRecentCoupledGroupDetection(
            detectionGroup.bureau,
            detectionGroup.model
        );
    }

    return {
        deletedDailyRouteRows,
        clearedTrainKeys,
        affectedEmuIds: Array.from(affectedEmuIds, (emuId) => emuId as EmuId)
    };
}

function clearNotRunningGroups(
    groups: TodayScheduleProbeGroup[],
    dayStart: number,
    nextDayStart: number,
    assets: Awaited<ReturnType<typeof loadProbeAssets>>,
    extraAffectedEmuCodesByTrainKey: Map<string, EmuId[]> = new Map()
): ClearedNotRunningState {
    const affectedEmuIds = new Set<number>();
    const deletedTrainCodes = new Set<string>();
    const clearedTrainKeys: string[] = [];
    let deletedDailyRouteRows = 0;

    for (const group of groups) {
        clearQueriedTrainKey(group.trainKey);
        clearRunningEmuStateByTrainKey(group.trainKey).forEach((emuId) =>
            affectedEmuIds.add(Number(emuId))
        );
        clearedTrainKeys.push(group.trainKey);

        for (const extraEmuId of extraAffectedEmuCodesByTrainKey.get(
            group.trainKey
        ) ?? []) {
            affectedEmuIds.add(Number(extraEmuId));
        }

        for (const trainCode of getGroupTrainCodes(group)) {
            deletedTrainCodes.add(trainCodeKey(trainCode));
            listDailyRoutesByTrainCodeInRange(
                trainCode,
                dayStart,
                nextDayStart
            ).forEach((row) => affectedEmuIds.add(Number(row.emu_id)));

            deletedDailyRouteRows += deleteDailyRoutesByTrainCodeInRange(
                trainCode,
                dayStart,
                nextDayStart
            );
            deleteProbeUntrustedRecordsByTrainCodeInRange(
                trainCode,
                dayStart,
                nextDayStart
            );
        }
    }

    const normalizedAffectedEmuIds = Array.from(
        affectedEmuIds,
        (emuId) => emuId as EmuId
    );
    const downgradedRouteRows = downgradeAffectedRouteStatuses(
        normalizedAffectedEmuIds,
        deletedTrainCodes,
        dayStart,
        nextDayStart
    );

    for (const detectionGroup of collectAffectedDetectionGroups(
        normalizedAffectedEmuIds,
        assets
    )) {
        clearRecentCoupledGroupDetection(
            detectionGroup.bureau,
            detectionGroup.model
        );
    }

    return {
        deletedDailyRouteRows,
        clearedTrainKeys,
        affectedEmuIds: normalizedAffectedEmuIds,
        downgradedRouteRows
    };
}

function requeueOverlappingGroups(
    groups: TodayScheduleProbeGroup[],
    nowSeconds: number,
    retry: number
): number[] {
    const overlapRetryDelaySeconds =
        useConfig().spider.scheduleProbe.probe.overlapRetryDelaySeconds;

    return groups.map((group) =>
        enqueueTask(
            PROBE_TRAIN_DEPARTURE_TASK_EXECUTOR,
            buildRequeueTaskArgs(group, retry),
            nowSeconds + overlapRetryDelaySeconds
        )
    );
}

function requeueCurrentProbeTaskWithOverlapDelay(
    args: ProbeTrainDepartureTaskArgs,
    nowSeconds: number,
    retry: number
): number {
    const overlapRetryDelaySeconds =
        useConfig().spider.scheduleProbe.probe.overlapRetryDelaySeconds;
    return enqueueTask(
        PROBE_TRAIN_DEPARTURE_TASK_EXECUTOR,
        { ...args, retry },
        nowSeconds + overlapRetryDelaySeconds
    );
}

function collectKnownStatusGroup(
    rows: DailyEmuRouteRow[],
    currentEmuId: EmuId,
    startAt: number
): KnownStatusGroup {
    const emuIds = new Set<number>([Number(currentEmuId)]);
    const relatedRows: DailyEmuRouteRow[] = [];

    for (const row of rows) {
        emuIds.add(Number(row.emu_id));
    }

    if (rows.length > 0) {
        const trainCodesByKey = new Map<string, TrainCodeParts>();
        for (const row of rows) {
            trainCodesByKey.set(trainCodeKey(row.train_code), row.train_code);
        }
        const serviceDate = unixSecondsToServiceDay(startAt);
        relatedRows.push(
            ...listDailyRoutesByTrainCodesAndStartAt(
                Array.from(trainCodesByKey.values()),
                startAt
            ).filter(
                (candidate) =>
                    candidate.start_at === startAt ||
                    (candidate.start_at === 0 &&
                        candidate.service_date === serviceDate)
            )
        );
    }

    for (const relatedRow of relatedRows) {
        emuIds.add(Number(relatedRow.emu_id));
    }

    const collected = collectStatusByEmuFromRowsWithConflicts([
        ...rows,
        ...relatedRows
    ]);
    const statusByEmu = collected.statusByEmu;
    if (!statusByEmu.has(currentEmuId)) {
        statusByEmu.set(currentEmuId, EMU_ROUTE_STATUS_UNCONFIRMED_SINGLE);
    }

    return {
        emuIds: Array.from(emuIds, (emuId) => emuId as EmuId),
        statusByEmu,
        warnings: toStatusAggregationWarnings(collected.conflicts)
    };
}

function collectKnownStatusGroupForServiceDate(
    rows: DailyEmuRouteRow[],
    currentEmuId: EmuId,
    startAt: number,
    serviceDate: ServiceDay
): KnownStatusGroup {
    const emuIds = new Set<number>([Number(currentEmuId)]);
    const relatedRows: DailyEmuRouteRow[] = [];

    for (const row of rows) {
        emuIds.add(Number(row.emu_id));
    }

    if (rows.length > 0) {
        const trainCodesByKey = new Map<string, TrainCodeParts>();
        for (const row of rows) {
            trainCodesByKey.set(trainCodeKey(row.train_code), row.train_code);
        }
        relatedRows.push(
            ...listDailyRoutesByTrainCodesAndStartAt(
                Array.from(trainCodesByKey.values()),
                startAt
            ).filter(
                (candidate) =>
                    candidate.start_at === startAt ||
                    (candidate.start_at === 0 &&
                        candidate.service_date === serviceDate)
            )
        );
    }

    for (const relatedRow of relatedRows) {
        emuIds.add(Number(relatedRow.emu_id));
    }

    const collected = collectStatusByEmuFromRowsWithConflicts([
        ...rows,
        ...relatedRows
    ]);
    const statusByEmu = collected.statusByEmu;
    if (!statusByEmu.has(currentEmuId)) {
        statusByEmu.set(currentEmuId, EMU_ROUTE_STATUS_UNCONFIRMED_SINGLE);
    }

    return {
        emuIds: Array.from(emuIds, (emuId) => emuId as EmuId),
        statusByEmu,
        warnings: toStatusAggregationWarnings(collected.conflicts)
    };
}

function getResolvedCurrentStatusRows(
    mainEmuId: EmuId,
    startAt: number,
    routeReadCache: DepartureRouteReadCache
): DailyEmuRouteRow[] {
    const directRows = routeReadCache.getAtStartAt(mainEmuId, startAt);
    if (directRows.some((row) => isConfirmed(row.status))) {
        return directRows;
    }

    const assignedState = getAssignedEmuState(mainEmuId);
    if (!assignedState || assignedState.startAt !== startAt) {
        return [];
    }

    const { dayStart, nextDayStart } = getCurrentDayWindow();
    const serviceDate = unixSecondsToServiceDay(startAt);
    return routeReadCache
        .getInRange(mainEmuId, dayStart, nextDayStart)
        .filter(
            (row) =>
                isConfirmed(row.status) &&
                (row.start_at === startAt ||
                    (row.start_at === 0 && row.service_date === serviceDate))
        );
}

function collectResolvedRowsForAssignedEmuCodes(
    emuIds: EmuId[],
    trainCodes: TrainCodeParts[],
    startAt: number,
    dayStart: number,
    nextDayStart: number,
    routeReadCache: DepartureRouteReadCache
): DailyEmuRouteRow[] {
    const rowsByKey = new Map<string, DailyEmuRouteRow>();
    const allowedTrainCodeKeys = new Set(trainCodes.map(trainCodeKey));

    const seenEmuIds = new Set<number>();
    for (const emuId of emuIds) {
        const emuIdNumber = Number(emuId);
        if (seenEmuIds.has(emuIdNumber)) {
            continue;
        }
        seenEmuIds.add(emuIdNumber);
        for (const row of routeReadCache.getInRange(
            emuId,
            dayStart,
            nextDayStart
        )) {
            if (
                !isConfirmed(row.status) ||
                !allowedTrainCodeKeys.has(trainCodeKey(row.train_code)) ||
                row.start_at !== startAt
            ) {
                continue;
            }

            const rowKey = [
                trainCodeKey(row.train_code),
                Number(row.emu_id),
                row.service_date,
                row.timetable_id ?? 'null'
            ].join('#');
            if (!rowsByKey.has(rowKey)) {
                rowsByKey.set(rowKey, row);
            }
        }
    }

    return Array.from(rowsByKey.values());
}

async function tryAutoMergeResolvedInternalGroup(
    args: ProbeTrainDepartureTaskArgs,
    trainKey: string,
    allTrainCodes: TrainCodeParts[],
    mainEmuId: EmuId,
    nowSeconds: number,
    routeReadCache: DepartureRouteReadCache,
    options: InternalGroupAutoMergeOptions = {}
): Promise<InternalGroupAutoMergeResult | null> {
    if (!args.trainInternalCode) {
        return null;
    }

    const assignedEmuCodes = listAssignedEmuCodesByTrainKey(trainKey).filter(
        (emuId) => Number(emuId) !== Number(mainEmuId)
    );
    if (assignedEmuCodes.length === 0) {
        return null;
    }

    const { dayStart, nextDayStart } = getCurrentDayWindow();
    const resolvedRows = collectResolvedRowsForAssignedEmuCodes(
        assignedEmuCodes,
        allTrainCodes,
        args.startAt,
        dayStart,
        nextDayStart,
        routeReadCache
    );
    if (resolvedRows.length === 0) {
        return null;
    }

    const seenMergedEmuIds = new Set<number>();
    const mergedFromEmuIds: EmuId[] = [];
    for (const row of resolvedRows) {
        const emuId = row.emu_id;
        if (Number(emuId) === Number(mainEmuId)) {
            continue;
        }
        if (seenMergedEmuIds.has(Number(emuId))) {
            continue;
        }
        seenMergedEmuIds.add(Number(emuId));
        mergedFromEmuIds.push(emuId);
    }
    if (mergedFromEmuIds.length === 0) {
        return null;
    }

    const mergedEmuIds = [mainEmuId, ...mergedFromEmuIds];
    if (mergedEmuIds.length <= 1) {
        return null;
    }

    const seenMergedTrainKeys = new Set<string>();
    const mergedFromTrainCodes: TrainCodeParts[] = [];
    for (const row of resolvedRows) {
        const key = trainCodeKey(row.train_code);
        if (seenMergedTrainKeys.has(key)) {
            continue;
        }
        seenMergedTrainKeys.add(key);
        mergedFromTrainCodes.push(row.train_code);
    }
    const mergedTrainCodes = [...allTrainCodes];

    const existingStatusByEmu = new Map<EmuId, number>();
    const statusAggregationWarnings: FormationStatusWarning[] = [];
    for (const emuId of mergedEmuIds) {
        const collected = collectStatusByEmuFromRowsWithConflicts(
            routeReadCache.getAtStartAt(emuId, args.startAt)
        );
        existingStatusByEmu.set(
            emuId,
            collected.statusByEmu.get(emuId) ??
                EMU_ROUTE_STATUS_UNCONFIRMED_SINGLE
        );
        statusAggregationWarnings.push(
            ...toStatusAggregationWarnings(collected.conflicts)
        );
    }
    const statusByEmu = buildCoupledUnknownStatusByEmu(
        mergedEmuIds,
        existingStatusByEmu
    );
    for (const [emuId, status] of options.statusOverrides ?? []) {
        statusByEmu.set(emuId, status);
    }
    const warnings = [
        ...statusAggregationWarnings,
        ...(options.coupledIIAnchorEmuId
            ? applyCoupledIIAnchor(
                  statusByEmu,
                  mergedEmuIds,
                  options.coupledIIAnchorEmuId,
                  options.pictureName ?? ''
              )
            : [])
    ];
    const multipleStateByEmu = await resolveMultipleStateByEmu(
        mergedEmuIds,
        options.multipleStateByEmu
    );
    warnings.push(
        ...collectCoupledModelConflictWarnings(
            mergedEmuIds,
            statusByEmu,
            multipleStateByEmu,
            options.coupledIIAnchorEmuId
        )
    );

    const trackingMutations = await applyResolvedResult(
        args,
        trainKey,
        mergedTrainCodes,
        mergedEmuIds,
        statusByEmu,
        nowSeconds
    );
    recordCurrentTrainProvenanceEventsForTrainCodes(mergedTrainCodes, {
        serviceDate: unixSecondsToServiceDay(args.startAt),
        startAt: args.startAt,
        emuId: mainEmuId,
        eventType: 'resolved_from_status',
        result: 'coupled',
        payload: {
            source: 'internal_code_auto_merge',
            emuIds: mergedEmuIds,
            mergedFromEmuIds: mergedFromEmuIds,
            mergedFromTrainCodes,
            trackingMutations
        }
    });
    logger.info(
        `resolved_internal_code_auto_merge trainCode=${formatTrainCode(args.trainCode)} trainInternalCode=${args.trainInternalCode ?? ''} mainEmuCode=${formatExternalEmuCode(mainEmuId)} mergedEmuCodes=${mergedEmuIds.map(formatExternalEmuCode).join('/')} mergedTrainCodes=${mergedTrainCodes.map(formatTrainCode).join('/')} assignedEmuCodes=${assignedEmuCodes.map(formatExternalEmuCode).join('/')}`
    );
    return {
        emuIds: mergedEmuIds,
        statusByEmu,
        trackingMutations,
        warnings
    };
}

async function validateConflictGroupRunningState(
    group: TodayScheduleProbeGroup,
    mainEmuId: EmuId
): Promise<ConflictGroupValidationResult> {
    const serviceDate = serviceDateToDay(getCurrentDateString());
    const untrustedTrainCodes = getGroupTrainCodes(group).filter((trainCode) =>
        isProbeUntrustedRecord(trainCode, mainEmuId, serviceDate)
    );
    if (untrustedTrainCodes.length > 0) {
        return {
            group,
            state: 'not_running',
            runningTrainCode: null,
            requestFailedTrainCodes: [],
            notRunningTrainCodes: untrustedTrainCodes
        };
    }

    const todayValidation = await validateTodayRunningForTrainCodes(
        getGroupTrainCodes(group)
    );
    return {
        group,
        state: todayValidation.state,
        runningTrainCode: todayValidation.runningTrainCode,
        requestFailedTrainCodes: todayValidation.requestFailedTrainCodes,
        notRunningTrainCodes: todayValidation.notRunningTrainCodes
    };
}

function collectHistoricalRecentMatchingTrainCodes(
    trainCodes: TrainCodeParts[],
    mainEmuId: EmuId
): TrainCodeParts[] {
    const matchedTrainCodes: TrainCodeParts[] = [];
    const seen = new Set<string>();
    for (const trainCode of trainCodes) {
        const key = trainCodeKey(trainCode);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        if (
            getHistoricalRecentEmuCodesByTrainCode(trainCode).some(
                (emuId) => Number(emuId) === Number(mainEmuId)
            )
        ) {
            matchedTrainCodes.push(trainCode);
        }
    }

    return matchedTrainCodes;
}

function toSeatCodeRequestFailedReason(
    failure: FetchSeatCodeFailureResult
):
    | 'seat_code_request_failed_network_error'
    | 'seat_code_request_failed_not_enabled'
    | 'seat_code_request_failed_other' {
    switch (failure.reason) {
        case 'network_error':
            return 'seat_code_request_failed_network_error';
        case 'seat_code_not_enabled':
            return 'seat_code_request_failed_not_enabled';
        default:
            return 'seat_code_request_failed_other';
    }
}

async function validateTodayRunningForTrainCodes(
    trainCodes: TrainCodeParts[]
): Promise<TodayTrainCodesValidationResult> {
    const requestFailedTrainCodes: TrainCodeParts[] = [];
    const notRunningTrainCodes: TrainCodeParts[] = [];

    const seen = new Set<string>();
    for (const trainCode of trainCodes) {
        const key = trainCodeKey(trainCode);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        const routeResult = await fetchRouteInfo(trainCode);
        if (routeResult.status === 'running') {
            return {
                state: 'running',
                runningTrainCode: trainCode,
                requestFailedTrainCodes,
                notRunningTrainCodes
            };
        }

        if (routeResult.status === 'request_failed') {
            requestFailedTrainCodes.push(trainCode);
            continue;
        }

        notRunningTrainCodes.push(trainCode);
    }

    return {
        state:
            requestFailedTrainCodes.length > 0
                ? 'request_failed'
                : 'not_running',
        runningTrainCode: null,
        requestFailedTrainCodes,
        notRunningTrainCodes
    };
}

async function verifySeatCodeAgainstCurrentTask(
    assets: Awaited<ReturnType<typeof loadProbeAssets>>,
    trainInternalCode: string | null,
    trainCodes: TrainCodeParts[],
    mainEmuId: EmuId
): Promise<SeatCodeVerificationResult> {
    const mainEmuCode = formatExternalEmuCode(mainEmuId);
    const parsedMainEmuCode = parseEmuCode(mainEmuCode);
    if (!parsedMainEmuCode?.trainSetNo) {
        return {
            state: 'unavailable',
            reason: 'main_emu_code_invalid',
            seatTrainCode: null,
            seatInternalCode: null,
            seatStartAt: 0
        };
    }

    const seatCode = assets.qrcodeByModelAndTrainSetNo.get(
        buildProbeAssetKey(
            parsedMainEmuCode.model,
            parsedMainEmuCode.trainSetNo
        )
    );
    if (!seatCode) {
        return {
            state: 'unavailable',
            reason: 'seat_code_missing',
            seatTrainCode: null,
            seatInternalCode: null,
            seatStartAt: 0
        };
    }

    const seatCodeResult = await fetchEMUInfoBySeatCode(seatCode);
    if (seatCodeResult.status !== 'success') {
        return {
            state: 'unavailable',
            reason: toSeatCodeRequestFailedReason(seatCodeResult),
            seatTrainCode: null,
            seatInternalCode: null,
            seatStartAt: 0,
            seatCodeFailureDetail: seatCodeResult
        };
    }

    const seatTrainCode = seatCodeResult.route.code;
    const seatInternalCode = seatCodeResult.route.internalCode;
    const seatStartAt = seatCodeResult.route.startAt;
    if (!isCurrentScheduleTask(seatStartAt)) {
        return {
            state: 'mismatch',
            reason: 'seat_route_not_current_day',
            seatTrainCode,
            seatInternalCode,
            seatStartAt
        };
    }

    const trainInternalCodeKey = trainInternalCode
        ? normalizeCode(trainInternalCode)
        : null;
    const seatInternalCodeKey = seatInternalCode
        ? normalizeCode(seatInternalCode)
        : null;
    if (trainInternalCodeKey) {
        return {
            state:
                seatInternalCodeKey === trainInternalCodeKey
                    ? 'matched'
                    : 'mismatch',
            reason:
                seatInternalCodeKey === trainInternalCodeKey
                    ? 'matched_internal_code'
                    : 'seat_internal_code_mismatch',
            seatTrainCode,
            seatInternalCode,
            seatStartAt
        };
    }

    const normalizedTrainCodeKeys = new Set(trainCodes.map(trainCodeKey));
    const seatTrainCodeKey = trainCodeKey(seatTrainCode);
    return {
        state: normalizedTrainCodeKeys.has(seatTrainCodeKey)
            ? 'matched'
            : 'mismatch',
        reason: normalizedTrainCodeKeys.has(seatTrainCodeKey)
            ? 'matched_train_code'
            : 'seat_train_code_mismatch',
        seatTrainCode,
        seatInternalCode,
        seatStartAt
    };
}

async function fetchSeatCodeRouteForEmu(
    assets: Awaited<ReturnType<typeof loadProbeAssets>>,
    mainEmuId: EmuId
): Promise<SeatCodeRouteFetchResult> {
    const mainEmuCode = formatExternalEmuCode(mainEmuId);
    const parsedMainEmuCode = parseEmuCode(mainEmuCode);
    if (!parsedMainEmuCode?.trainSetNo) {
        return {
            state: 'unavailable',
            reason: 'main_emu_code_invalid',
            seatTrainCode: null,
            seatInternalCode: null,
            seatStartAt: 0,
            seatEndAt: 0
        };
    }

    const seatCode = assets.qrcodeByModelAndTrainSetNo.get(
        buildProbeAssetKey(
            parsedMainEmuCode.model,
            parsedMainEmuCode.trainSetNo
        )
    );
    if (!seatCode) {
        return {
            state: 'unavailable',
            reason: 'seat_code_missing',
            seatTrainCode: null,
            seatInternalCode: null,
            seatStartAt: 0,
            seatEndAt: 0
        };
    }

    const seatCodeResult = await fetchEMUInfoBySeatCode(seatCode);
    if (seatCodeResult.status !== 'success') {
        return {
            state: 'unavailable',
            reason: toSeatCodeRequestFailedReason(seatCodeResult),
            seatTrainCode: null,
            seatInternalCode: null,
            seatStartAt: 0,
            seatEndAt: 0
        };
    }

    const route = seatCodeResult.route;
    if (!isCurrentScheduleTask(route.startAt)) {
        return {
            state: 'unavailable',
            reason: 'seat_route_not_current_day',
            seatTrainCode: route.code,
            seatInternalCode: route.internalCode,
            seatStartAt: route.startAt,
            seatEndAt: route.endAt
        };
    }

    return {
        state: 'available',
        seatTrainCode: route.code,
        seatInternalCode: route.internalCode,
        seatStartAt: route.startAt,
        seatEndAt: route.endAt
    };
}

function resolveSeatCodeWinnerGroup(
    groups: TodayScheduleProbeGroup[],
    seatTrainCode: TrainCodeParts,
    seatInternalCode: string | null,
    seatStartAt: number,
    seatEndAt: number
): TodayScheduleProbeGroup | null {
    const seatInternalCodeKey = seatInternalCode
        ? normalizeCode(seatInternalCode)
        : '';
    if (seatInternalCodeKey.length > 0) {
        const matched = groups.filter(
            (group) =>
                group.trainInternalCode !== null &&
                normalizeCode(group.trainInternalCode) === seatInternalCodeKey
        );
        if (matched.length === 1) {
            return matched[0] ?? null;
        }
        if (matched.length > 1) {
            return null;
        }
    }

    const seatTrainCodeKey = trainCodeKey(seatTrainCode);
    if (seatTrainCodeKey.length > 0) {
        const matched = groups.filter((group) =>
            group.allCodes.some(
                (trainCode) => trainCodeKey(trainCode) === seatTrainCodeKey
            )
        );
        if (matched.length === 1) {
            return matched[0] ?? null;
        }
        if (matched.length > 1) {
            return null;
        }
    }

    if (seatStartAt > 0 && seatEndAt > 0) {
        const matched = groups.filter((group) =>
            isRouteTimeOverlapping(
                group.startAt,
                group.endAt,
                seatStartAt,
                seatEndAt
            )
        );
        if (matched.length === 1) {
            return matched[0] ?? null;
        }
    }

    return null;
}

async function tryArbitrateOverlappingRoutesWithSeatCode(
    args: ProbeTrainDepartureTaskArgs,
    mainEmuId: EmuId,
    currentGroup: TodayScheduleProbeGroup,
    overlappingGroups: TodayScheduleProbeGroup[],
    assets: Awaited<ReturnType<typeof loadProbeAssets>>,
    nowSeconds: number,
    validationResults: ConflictGroupValidationResult[]
): Promise<SeatCodeArbitrationOutcome> {
    const conflictGroups = [currentGroup, ...overlappingGroups];
    const conflictStateByTrainKey =
        buildConflictStateByTrainKey(validationResults);

    const seatRoute = await fetchSeatCodeRouteForEmu(assets, mainEmuId);
    if (seatRoute.state === 'unavailable') {
        const reason = seatRoute.reason ?? 'seat_code_unavailable';
        recordTrainProvenanceForEachGroup(conflictGroups, (group) => ({
            serviceDate: serviceDateToDay(getCurrentDateString()),
            emuId: mainEmuId,
            eventType: 'seat_conflict_unavailable',
            result: reason,
            payload: {
                currentGroup:
                    buildTrainProvenanceConflictCurrentGroupPayload(group),
                conflictGroups: conflictGroups
                    .filter(
                        (candidate) => candidate.trainKey !== group.trainKey
                    )
                    .map((candidate) =>
                        buildTrainProvenanceConflictGroupPayload(
                            group,
                            candidate,
                            conflictStateByTrainKey.get(candidate.trainKey) ??
                                'running'
                        )
                    ),
                reason
            }
        }));
        logger.warn(
            `seat_conflict_unavailable conflictEmuCode=${formatExternalEmuCode(mainEmuId)} conflictGroups=${formatTrainCodeGroups(conflictGroups)} reason=${reason}`
        );
        return 'unavailable';
    }

    if (!seatRoute.seatTrainCode) {
        return 'unavailable';
    }
    const winnerGroup = resolveSeatCodeWinnerGroup(
        conflictGroups,
        seatRoute.seatTrainCode,
        seatRoute.seatInternalCode,
        seatRoute.seatStartAt,
        seatRoute.seatEndAt
    );
    if (!winnerGroup) {
        recordTrainProvenanceForEachGroup(conflictGroups, (group) => ({
            serviceDate: serviceDateToDay(getCurrentDateString()),
            emuId: mainEmuId,
            eventType: 'seat_conflict_unavailable',
            result: 'ambiguous',
            payload: {
                currentGroup:
                    buildTrainProvenanceConflictCurrentGroupPayload(group),
                conflictGroups: conflictGroups
                    .filter(
                        (candidate) => candidate.trainKey !== group.trainKey
                    )
                    .map((candidate) =>
                        buildTrainProvenanceConflictGroupPayload(
                            group,
                            candidate,
                            conflictStateByTrainKey.get(candidate.trainKey) ??
                                'running'
                        )
                    ),
                reason: 'ambiguous',
                seatTrainCode: seatRoute.seatTrainCode,
                seatInternalCode: seatRoute.seatInternalCode,
                seatStartAt: seatRoute.seatStartAt,
                seatEndAt: seatRoute.seatEndAt
            }
        }));
        logger.warn(
            `seat_conflict_ambiguous conflictEmuCode=${formatExternalEmuCode(mainEmuId)} conflictGroups=${formatTrainCodeGroups(conflictGroups)} seatTrainCode=${seatRoute.seatTrainCode ? formatTrainCode(seatRoute.seatTrainCode) : ''} seatInternalCode=${seatRoute.seatInternalCode ?? ''}`
        );
        return 'unavailable';
    }

    const loserGroups = conflictGroups.filter(
        (group) => group.trainKey !== winnerGroup.trainKey
    );
    const serviceDate = serviceDateToDay(getCurrentDateString());
    const seatDetail = `seatTrainCode=${seatRoute.seatTrainCode ? formatTrainCode(seatRoute.seatTrainCode) : ''} seatInternalCode=${seatRoute.seatInternalCode ?? ''} winnerTrainKey=${winnerGroup.trainKey}`;

    for (const loserGroup of loserGroups) {
        clearQueriedTrainKey(loserGroup.trainKey);
        clearRunningEmuStateByTrainKey(loserGroup.trainKey);
        for (const trainCode of getGroupTrainCodes(loserGroup)) {
            markProbeUntrustedRecord(
                trainCode,
                mainEmuId,
                serviceDate,
                'seat_code_conflict_disproved',
                seatDetail
            );
        }
    }

    for (const trainCode of getGroupTrainCodes(winnerGroup)) {
        deleteProbeUntrustedRecordsByTrainCodeAndEmuCodeAtServiceDate(
            trainCode,
            mainEmuId,
            serviceDate
        );
    }

    const requeuedTaskIds =
        loserGroups.length > 0
            ? requeueOverlappingGroups(
                  loserGroups,
                  nowSeconds,
                  useConfig().spider.scheduleProbe.probe.defaultRetry
              )
            : [];

    recordTrainProvenanceForEachGroup(conflictGroups, (group) => ({
        serviceDate,
        emuId: mainEmuId,
        eventType: 'seat_conflict_resolved',
        result: group.trainKey === winnerGroup.trainKey ? 'winner' : 'loser',
        payload: {
            currentGroup:
                buildTrainProvenanceConflictCurrentGroupPayload(group),
            conflictGroups: conflictGroups
                .filter((candidate) => candidate.trainKey !== group.trainKey)
                .map((candidate) =>
                    buildTrainProvenanceConflictGroupPayload(
                        group,
                        candidate,
                        conflictStateByTrainKey.get(candidate.trainKey) ??
                            'running'
                    )
                ),
            winnerTrainKey: winnerGroup.trainKey,
            loserTrainKeys: loserGroups.map((candidate) => candidate.trainKey),
            seatTrainCode: seatRoute.seatTrainCode,
            seatInternalCode: seatRoute.seatInternalCode,
            seatStartAt: seatRoute.seatStartAt,
            seatEndAt: seatRoute.seatEndAt,
            requeuedTrainKeys: loserGroups.map(
                (candidate) => candidate.trainKey
            ),
            requeuedTaskIds
        }
    }));

    logger.info(
        `seat_conflict_resolved conflictEmuCode=${formatExternalEmuCode(mainEmuId)} winnerGroup=${formatTrainCodeGroup(winnerGroup)} loserGroups=${formatTrainCodeGroups(loserGroups)} seatTrainCode=${seatRoute.seatTrainCode ? formatTrainCode(seatRoute.seatTrainCode) : ''} seatInternalCode=${seatRoute.seatInternalCode ?? ''} requeuedTaskIds=${requeuedTaskIds.join(',')}`
    );

    if (currentGroup.trainKey !== winnerGroup.trainKey) {
        markCurrentTrainProvenanceTaskSkipped('overlap_requeued_untrusted');
        return 'handled';
    }

    return 'winner';
}

async function tryResolveOverlappingRoutes(
    args: ProbeTrainDepartureTaskArgs,
    mainEmuId: EmuId,
    assets: Awaited<ReturnType<typeof loadProbeAssets>>,
    nowSeconds: number,
    routeReadCache: DepartureRouteReadCache
): Promise<boolean> {
    const { dayStart, nextDayStart } = getCurrentDayWindow();
    const currentGroup =
        getTodayScheduleProbeGroupByTrainCode(args.trainCode) ??
        buildFallbackGroupFromArgs(args);
    let overlappingGroups = collectOverlappingGroups(
        mainEmuId,
        currentGroup,
        dayStart,
        nextDayStart,
        routeReadCache
    );
    if (overlappingGroups.length === 0) {
        return false;
    }

    const validationResults: ConflictGroupValidationResult[] = [];
    for (const group of [currentGroup, ...overlappingGroups]) {
        validationResults.push(
            await validateConflictGroupRunningState(group, mainEmuId)
        );
    }

    const notRunningGroups = validationResults
        .filter((result) => result.state === 'not_running')
        .map((result) => result.group);
    const notRunningTrainCodes = validationResults.flatMap(
        (result) => result.notRunningTrainCodes
    );
    const requestFailedTrainCodes = validationResults.flatMap(
        (result) => result.requestFailedTrainCodes
    );
    const conflictStateByTrainKey =
        buildConflictStateByTrainKey(validationResults);

    if (notRunningGroups.length > 0) {
        const extraAffectedEmuCodesByTrainKey = new Map<string, EmuId[]>();
        if (hasGroupTrainKey(notRunningGroups, currentGroup.trainKey)) {
            extraAffectedEmuCodesByTrainKey.set(currentGroup.trainKey, [
                mainEmuId
            ]);
        }

        const clearedNotRunningState = clearNotRunningGroups(
            notRunningGroups,
            dayStart,
            nextDayStart,
            assets,
            extraAffectedEmuCodesByTrainKey
        );
        routeReadCache.invalidateEmuIds(clearedNotRunningState.affectedEmuIds);
        logger.info(
            `overlap_drop_not_running conflictEmuCode=${formatExternalEmuCode(mainEmuId)} droppedGroups=${formatTrainCodeGroups(notRunningGroups)} notRunningTrainCodes=${notRunningTrainCodes.map(formatTrainCode).join(',')} requestFailedTrainCodes=${requestFailedTrainCodes.map(formatTrainCode).join(',')} affectedEmuCodes=${clearedNotRunningState.affectedEmuIds.map(formatExternalEmuCode).join(',')} deletedDailyRouteRows=${clearedNotRunningState.deletedDailyRouteRows} downgradedRouteRows=${clearedNotRunningState.downgradedRouteRows}`
        );
        const allConflictGroups = [currentGroup, ...overlappingGroups];
        recordTrainProvenanceForEachGroup(notRunningGroups, (group) => ({
            serviceDate: serviceDateToDay(getCurrentDateString()),
            emuId: mainEmuId,
            eventType: 'overlap_dropped',
            result: 'not_running',
            payload: {
                currentGroup:
                    buildTrainProvenanceConflictCurrentGroupPayload(group),
                conflictGroups: allConflictGroups
                    .filter(
                        (candidate) => candidate.trainKey !== group.trainKey
                    )
                    .map((candidate) =>
                        buildTrainProvenanceConflictGroupPayload(
                            group,
                            candidate,
                            conflictStateByTrainKey.get(candidate.trainKey) ??
                                'running'
                        )
                    ),
                droppedTrainKeys: notRunningGroups.map(
                    (candidate) => candidate.trainKey
                ),
                notRunningTrainCodes: notRunningTrainCodes,
                requestFailedTrainCodes,
                affectedEmuIds: clearedNotRunningState.affectedEmuIds,
                deletedDailyRouteRows:
                    clearedNotRunningState.deletedDailyRouteRows,
                downgradedRouteRows: clearedNotRunningState.downgradedRouteRows
            }
        }));

        if (hasGroupTrainKey(notRunningGroups, currentGroup.trainKey)) {
            markCurrentTrainProvenanceTaskSkipped('overlap_not_running');
            return true;
        }

        overlappingGroups = collectOverlappingGroups(
            mainEmuId,
            currentGroup,
            dayStart,
            nextDayStart,
            routeReadCache
        );
        if (overlappingGroups.length === 0) {
            return false;
        }
    }

    if (
        areAllGroupsRunning(
            [currentGroup, ...overlappingGroups],
            validationResults
        )
    ) {
        const arbitrationOutcome =
            await tryArbitrateOverlappingRoutesWithSeatCode(
                args,
                mainEmuId,
                currentGroup,
                overlappingGroups,
                assets,
                nowSeconds,
                validationResults
            );
        if (arbitrationOutcome === 'handled') {
            return true;
        }
        if (arbitrationOutcome === 'winner') {
            return false;
        }
    }

    const impactedGroups = new Map<string, TodayScheduleProbeGroup>([
        [currentGroup.trainKey, currentGroup]
    ]);
    for (const group of overlappingGroups) {
        impactedGroups.set(group.trainKey, group);
    }

    const clearedState = clearOverlappingGroups(
        Array.from(impactedGroups.values()),
        dayStart,
        nextDayStart,
        assets
    );
    routeReadCache.invalidateEmuIds(clearedState.affectedEmuIds);
    const taskIds = requeueOverlappingGroups(
        Array.from(impactedGroups.values()),
        nowSeconds,
        useConfig().spider.scheduleProbe.probe.defaultRetry
    );

    const overlapRequeueLog = areAllGroupsRunning(
        Array.from(impactedGroups.values()),
        validationResults
    )
        ? logger.error.bind(logger)
        : logger.info.bind(logger);
    overlapRequeueLog(
        `overlap_requeue conflictEmuCode=${formatExternalEmuCode(mainEmuId)} conflictGroups=${formatTrainCodeGroups(overlappingGroups)} conflictTimeRanges=${formatOverlapTimeRanges(currentGroup, overlappingGroups)} notRunningTrainCodes=${notRunningTrainCodes.map(formatTrainCode).join(',')} requestFailedTrainCodes=${requestFailedTrainCodes.map(formatTrainCode).join(',')} requeuedGroups=${formatTrainCodeGroups(Array.from(impactedGroups.values()))} requeuedEmuCodes=${clearedState.affectedEmuIds.map(formatExternalEmuCode).join(',')} deletedDailyRouteRows=${clearedState.deletedDailyRouteRows} requeueTaskIds=${taskIds.join(',')}`
    );
    const impactedGroupItems = Array.from(impactedGroups.values());
    recordTrainProvenanceForEachGroup(impactedGroupItems, (group) => ({
        serviceDate: serviceDateToDay(getCurrentDateString()),
        emuId: mainEmuId,
        eventType: 'overlap_requeued',
        result: 'requeued',
        payload: {
            currentGroup:
                buildTrainProvenanceConflictCurrentGroupPayload(group),
            conflictGroups: impactedGroupItems
                .filter((candidate) => candidate.trainKey !== group.trainKey)
                .map((candidate) =>
                    buildTrainProvenanceConflictGroupPayload(
                        group,
                        candidate,
                        conflictStateByTrainKey.get(candidate.trainKey) ??
                            'running'
                    )
                ),
            conflictGroupTrainKeys: overlappingGroups.map(
                (candidate) => candidate.trainKey
            ),
            conflictTimeRanges: formatOverlapTimeRanges(
                currentGroup,
                overlappingGroups
            ),
            notRunningTrainCodes,
            requestFailedTrainCodes,
            requeuedTrainKeys: impactedGroupItems.map(
                (candidate) => candidate.trainKey
            ),
            requeuedTaskIds: taskIds,
            affectedEmuIds: clearedState.affectedEmuIds,
            deletedDailyRouteRows: clearedState.deletedDailyRouteRows
        }
    }));
    markCurrentTrainProvenanceTaskSkipped('overlap_requeued');
    return true;
}

function recordTrainProvenanceForEachGroup(
    groups: TodayScheduleProbeGroup[],
    buildInput: (
        group: TodayScheduleProbeGroup
    ) => Omit<
        Parameters<typeof recordCurrentTrainProvenanceEventsForTrainCodes>[1],
        'startAt'
    >
) {
    for (const group of groups) {
        recordCurrentTrainProvenanceEventsForTrainCodes(
            getGroupTrainCodes(group),
            {
                ...buildInput(group),
                startAt: group.startAt
            }
        );
    }
}

async function applyResolvedResult(
    args: ProbeTrainDepartureTaskArgs,
    trainKey: string,
    allTrainCodes: TrainCodeParts[],
    allEmuCodes: EmuId[],
    statusByEmu: Map<EmuId, number>,
    nowSeconds: number,
    beforePersist?: () => void
): Promise<ProbeTrackingMutation[]> {
    return applyResolvedProbeResult({
        trainCode: args.trainCode,
        trainInternalCode: args.trainInternalCode,
        allTrainCodes,
        allEmuCodes,
        startStation: args.startStation,
        endStation: args.endStation,
        startAt: args.startAt,
        endAt: args.endAt,
        trainKey,
        statusByEmu,
        nowSeconds,
        beforePersist
    });
}

function buildFormationWarningContext(
    args: ProbeTrainDepartureTaskArgs,
    serviceDate: ServiceDay,
    trainCodes: TrainCodeParts[],
    mainEmuId: EmuId
): FormationWarningReportContext {
    return {
        trainInternalCode: args.trainInternalCode,
        startAt: args.startAt,
        serviceDate,
        trainCodes,
        mainEmuId
    };
}

function toFormationWarningKind(
    warningKind: CarDetailFormationWarningKind | null
): FormationWarningKind | null {
    switch (warningKind) {
        case 'coach_pic_list_missing':
        case 'picture_name_missing':
        case 'picture_name_invalid':
            return warningKind;
        default:
            return null;
    }
}

interface FormationInheritanceCandidate {
    latestResolvedRow: DailyEmuRouteRow;
    gapSeconds: number;
}

interface FormationStatusResolutionContext {
    currentRows: DailyEmuRouteRow[];
    inheritanceCandidate: FormationInheritanceCandidate | null;
    historicalRows: DailyEmuRouteRow[];
}

interface HistoricalRouteStatusReuseResult {
    emuIds: EmuId[];
    statusByEmu: Map<EmuId, number>;
    trackingMutations: ProbeTrackingMutation[];
    warnings: FormationStatusWarning[];
}

interface InternalGroupAutoMergeResult {
    emuIds: EmuId[];
    statusByEmu: Map<EmuId, number>;
    trackingMutations: ProbeTrackingMutation[];
    warnings: FormationStatusWarning[];
}

interface InternalGroupAutoMergeOptions {
    statusOverrides?: ReadonlyMap<EmuId, number>;
    coupledIIAnchorEmuId?: EmuId;
    pictureName?: string;
    multipleStateByEmu?: ReadonlyMap<EmuId, ProbeEmuMultipleState>;
}

interface HistoricalRouteStatusReuseOptions {
    inheritanceCandidate?: FormationInheritanceCandidate;
    historicalRows?: DailyEmuRouteRow[];
    statusOverrides?: ReadonlyMap<EmuId, number>;
    coupledIIAnchorEmuId?: EmuId;
    pictureName?: string;
    requireRelatedEmu?: boolean;
    multipleStateByEmu?: ReadonlyMap<EmuId, ProbeEmuMultipleState>;
}

async function resolveMultipleStateByEmu(
    emuIds: EmuId[],
    existing?: ReadonlyMap<EmuId, ProbeEmuMultipleState>
): Promise<Map<EmuId, ProbeEmuMultipleState>> {
    const resolved = new Map(existing ?? []);
    const missingEmuIds = emuIds.filter((emuId) => !resolved.has(emuId));
    if (missingEmuIds.length === 0) {
        return resolved;
    }

    const assets = await loadProbeAssets();
    for (const emuId of missingEmuIds) {
        resolved.set(
            emuId,
            getProbeEmuMultipleStateFromCode(
                assets,
                formatExternalEmuCode(emuId)
            )
        );
    }
    return resolved;
}

function collectCoupledModelConflictWarnings(
    emuIds: EmuId[],
    statusByEmu: ReadonlyMap<EmuId, number>,
    multipleStateByEmu: ReadonlyMap<EmuId, ProbeEmuMultipleState>,
    excludedEmuId?: EmuId
): FormationStatusWarning[] {
    const warnings: FormationStatusWarning[] = [];
    for (const emuId of emuIds) {
        if (
            Number(emuId) === Number(excludedEmuId) ||
            multipleStateByEmu.get(emuId) !== 'non_multiple'
        ) {
            continue;
        }

        const status =
            statusByEmu.get(emuId) ?? EMU_ROUTE_STATUS_UNCONFIRMED_SINGLE;
        warnings.push({
            source: 'model',
            kind: 'model_coupled_group_conflict',
            emuId,
            oldStatus: status,
            newStatus: status,
            pictureName: '',
            repeat: '',
            reason: 'model is non_multiple but the emu belongs to a coupled group; group facts win'
        });
    }
    return warnings;
}

function resolveInheritanceCandidate(
    args: ProbeTrainDepartureTaskArgs,
    mainEmuId: EmuId
): FormationInheritanceCandidate | null {
    const statusBindingWindowSeconds =
        useConfig().spider.scheduleProbe.coupling.statusBindingWindowSeconds;
    // An overnight assignment can end inside the window while belonging to the
    // previous service date because its timetable started before midnight.
    const serviceDateLookbackSeconds = Math.max(
        statusBindingWindowSeconds,
        24 * 60 * 60
    );
    const minServiceDate = unixSecondsToServiceDay(
        args.startAt - serviceDateLookbackSeconds
    );
    const candidateRows = listConfirmedDailyRoutesByEmuCodeBefore(
        mainEmuId,
        args.startAt,
        minServiceDate
    );
    for (const previousRow of candidateRows) {
        const gapSeconds = args.startAt - previousRow.end_at;
        if (gapSeconds <= 0 || gapSeconds > statusBindingWindowSeconds) {
            continue;
        }

        return {
            latestResolvedRow: previousRow,
            gapSeconds
        };
    }

    return null;
}

function resolveFormationStatusContext(
    args: ProbeTrainDepartureTaskArgs,
    emuId: EmuId,
    routeReadCache: DepartureRouteReadCache
): FormationStatusResolutionContext {
    const inheritanceCandidate = resolveInheritanceCandidate(args, emuId);
    return {
        currentRows: routeReadCache.getAtStartAt(emuId, args.startAt),
        inheritanceCandidate,
        historicalRows: inheritanceCandidate
            ? routeReadCache.getAtStartAt(
                  emuId,
                  inheritanceCandidate.latestResolvedRow.start_at
              )
            : []
    };
}

function getFormationObservationBaseStatus(
    context: FormationStatusResolutionContext
): number {
    const currentStatuses = context.currentRows.map((row) => row.status);
    const currentStatus =
        currentStatuses.length > 0
            ? mergeEmuRouteStatuses(currentStatuses)
            : null;

    const inheritanceCandidate = context.inheritanceCandidate;
    if (!inheritanceCandidate) {
        return currentStatus ?? EMU_ROUTE_STATUS_UNCONFIRMED_SINGLE;
    }

    const historicalStatuses = context.historicalRows.map((row) => row.status);
    const historicalStatus =
        historicalStatuses.length > 0
            ? mergeEmuRouteStatuses(historicalStatuses)
            : inheritanceCandidate.latestResolvedRow.status;
    return currentStatus === null
        ? historicalStatus
        : mergeEmuRouteStatuses([historicalStatus, currentStatus]);
}

function collectPositionConflictWarnings(input: {
    mainEmuId: EmuId;
    newStatus: number;
    newPosition: EmuRouteFormationPosition;
    source: FormationWarningSource;
    pictureName: string;
    repeat: string;
    context: FormationStatusResolutionContext;
}): FormationStatusWarning[] {
    const warnings: FormationStatusWarning[] = [];
    const seenOldStatuses = new Set<number>();
    const pushIfConflict = (oldStatus: number) => {
        const decoded = decodeEmuRouteStatus(oldStatus);
        if (
            !decoded?.confirmed ||
            decoded.formationPosition === 'unknown' ||
            decoded.formationPosition === input.newPosition ||
            seenOldStatuses.has(oldStatus)
        ) {
            return;
        }
        seenOldStatuses.add(oldStatus);
        warnings.push({
            source: input.source,
            kind: 'position_conflict',
            emuId: input.mainEmuId,
            oldStatus,
            newStatus: input.newStatus,
            pictureName: input.pictureName,
            repeat: input.repeat,
            reason: `new explicit formation position ${input.newPosition} overrides previous ${decoded.formationPosition}`
        });
    };

    for (const row of input.context.currentRows) {
        pushIfConflict(row.status);
    }

    const inheritanceCandidate = input.context.inheritanceCandidate;
    if (inheritanceCandidate) {
        pushIfConflict(inheritanceCandidate.latestResolvedRow.status);
    }

    return warnings;
}

function applyCoupledIIAnchor(
    statusByEmu: Map<EmuId, number>,
    emuIds: EmuId[],
    anchorEmuId: EmuId,
    pictureName: string
): FormationStatusWarning[] {
    const warnings: FormationStatusWarning[] = [];
    for (const emuId of emuIds) {
        if (Number(emuId) === Number(anchorEmuId)) {
            continue;
        }

        const oldStatus =
            statusByEmu.get(emuId) ?? EMU_ROUTE_STATUS_UNCONFIRMED_SINGLE;
        const nextStatus = withFormationStatus(oldStatus, {
            confirmed: true,
            formationPosition: 'I'
        });
        if (nextStatus === null) {
            throw new Error(`invalid_emu_route_status ${oldStatus}`);
        }
        const oldDecoded = decodeEmuRouteStatus(oldStatus);
        if (
            oldDecoded?.confirmed &&
            oldDecoded.formationPosition !== 'unknown' &&
            oldDecoded.formationPosition !== 'I'
        ) {
            warnings.push({
                source: 'getCarDetail',
                kind: 'position_conflict',
                emuId,
                oldStatus,
                newStatus: nextStatus,
                pictureName,
                repeat: '',
                reason: `current coupled II anchor assigns the paired emu to I, overriding previous ${oldDecoded.formationPosition}`
            });
        }
        statusByEmu.set(emuId, nextStatus);
    }
    return warnings;
}

async function tryReuseHistoricalRouteStatus(
    args: ProbeTrainDepartureTaskArgs,
    trainKey: string,
    mainEmuId: EmuId,
    allTrainCodes: TrainCodeParts[],
    nowSeconds: number,
    routeReadCache: DepartureRouteReadCache,
    options: HistoricalRouteStatusReuseOptions = {}
): Promise<HistoricalRouteStatusReuseResult | null> {
    const inheritanceCandidate =
        options.inheritanceCandidate ??
        resolveInheritanceCandidate(args, mainEmuId);
    if (!inheritanceCandidate) {
        return null;
    }
    const { latestResolvedRow, gapSeconds } = inheritanceCandidate;

    const historicalRows =
        options.historicalRows ??
        routeReadCache.getAtStartAt(mainEmuId, latestResolvedRow.start_at);
    if (historicalRows.length === 0) {
        return null;
    }

    const knownGroup = collectKnownStatusGroup(
        historicalRows,
        mainEmuId,
        latestResolvedRow.start_at
    );
    const seenHistoricalTrainKeys = new Set<string>();
    const historicalTrainCodes: TrainCodeParts[] = [];
    for (const row of historicalRows) {
        const key = trainCodeKey(row.train_code);
        if (seenHistoricalTrainKeys.has(key)) {
            continue;
        }
        seenHistoricalTrainKeys.add(key);
        historicalTrainCodes.push(row.train_code);
    }
    const historicalMainStatus =
        knownGroup.statusByEmu.get(mainEmuId) ?? latestResolvedRow.status;
    const historicalIsCoupled = isConfirmedCoupled(historicalMainStatus);
    const allEmuCodes = historicalIsCoupled
        ? knownGroup.emuIds.length > 0
            ? knownGroup.emuIds
            : [mainEmuId]
        : [mainEmuId];
    if (options.requireRelatedEmu && allEmuCodes.length <= 1) {
        return null;
    }
    if (historicalIsCoupled && allEmuCodes.length <= 1) {
        recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
            serviceDate: unixSecondsToServiceDay(args.startAt),
            startAt: args.startAt,
            emuId: mainEmuId,
            eventType: 'historical_reuse_rejected',
            result: 'incomplete_group',
            payload: {
                historicalStartAt: latestResolvedRow.start_at,
                historicalEndAt: latestResolvedRow.end_at,
                gapSeconds,
                historicalStatus: historicalMainStatus,
                knownStatuses: Array.from(
                    knownGroup.statusByEmu.entries(),
                    ([emuId, status]) => ({ emuId, status })
                ),
                historicalTrainCodes,
                emuIds: allEmuCodes
            }
        });
        logger.warn(
            `reuse_historical_status_incomplete trainCode=${formatTrainCode(args.trainCode)} mainEmuCode=${formatExternalEmuCode(mainEmuId)} historicalStartAt=${latestResolvedRow.start_at}`
        );
        return null;
    }

    const statusByEmu = historicalIsCoupled
        ? new Map(knownGroup.statusByEmu)
        : new Map([[mainEmuId, historicalMainStatus]]);
    if (!statusByEmu.has(mainEmuId)) {
        statusByEmu.set(mainEmuId, latestResolvedRow.status);
    }
    for (const [emuId, status] of options.statusOverrides ?? []) {
        statusByEmu.set(emuId, status);
    }

    const warnings = [
        ...knownGroup.warnings,
        ...(options.coupledIIAnchorEmuId
            ? applyCoupledIIAnchor(
                  statusByEmu,
                  allEmuCodes,
                  options.coupledIIAnchorEmuId,
                  options.pictureName ?? ''
              )
            : [])
    ];
    const multipleStateByEmu = await resolveMultipleStateByEmu(
        allEmuCodes,
        options.multipleStateByEmu
    );
    warnings.push(
        ...collectCoupledModelConflictWarnings(
            allEmuCodes,
            statusByEmu,
            multipleStateByEmu,
            options.coupledIIAnchorEmuId
        )
    );

    const trackingMutations = await applyResolvedResult(
        args,
        trainKey,
        allTrainCodes,
        allEmuCodes,
        statusByEmu,
        nowSeconds
    );
    const hasConfirmedCoupled = Array.from(statusByEmu.values()).some(
        (status) => isConfirmedCoupled(status)
    );
    logger.info(
        `reuse_historical_status trainCode=${formatTrainCode(args.trainCode)} mainEmuCode=${formatExternalEmuCode(mainEmuId)} historicalStartAt=${latestResolvedRow.start_at} historicalEndAt=${latestResolvedRow.end_at} gapSeconds=${gapSeconds} statuses=${Array.from(statusByEmu.values()).join('/')} emuCodes=${allEmuCodes.length}`
    );
    recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
        serviceDate: unixSecondsToServiceDay(args.startAt),
        startAt: args.startAt,
        emuId: mainEmuId,
        eventType: 'historical_reuse_selected',
        result: hasConfirmedCoupled ? 'coupled' : 'single',
        payload: {
            historicalStartAt: latestResolvedRow.start_at,
            historicalEndAt: latestResolvedRow.end_at,
            gapSeconds,
            historicalStatus: historicalMainStatus,
            statusByEmu: Array.from(
                statusByEmu.entries(),
                ([emuId, status]) => ({ emuId, status })
            ),
            historicalTrainCodes,
            emuIds: allEmuCodes,
            trackingMutations
        }
    });
    return {
        emuIds: allEmuCodes,
        statusByEmu,
        trackingMutations,
        warnings
    };
}

async function probeEmuByTrainCodes(
    candidateTrainCodes: TrainCodeParts[]
): Promise<ProbeEmuByTrainCodesResult> {
    const serviceDate = serviceDateToDay(getCurrentDateString());
    const untrustedSkippedPairs: ProbeEmuByTrainCodesResult['untrustedSkippedPairs'] =
        [];

    for (const candidateTrainCode of candidateTrainCodes) {
        const routeProbeResult = await fetchEMUInfoByRoute(candidateTrainCode);
        if (!routeProbeResult) {
            continue;
        }

        const mainEmuId = routeProbeResult.emu.code;
        const mainEmuCode = formatExternalEmuCode(mainEmuId);
        if (mainEmuCode.length === 0) {
            logger.warn(
                `route_probe_empty_emu_code trainCode=${formatTrainCode(candidateTrainCode)}`
            );
            continue;
        }

        const parsedMainEmuCode = parseEmuCode(mainEmuCode);
        if (!parsedMainEmuCode?.trainSetNo) {
            logger.warn(
                `route_probe_invalid_emu_code trainCode=${formatTrainCode(candidateTrainCode)} mainEmuCode=${mainEmuCode}`
            );
            continue;
        }

        if (
            isProbeUntrustedRecord(candidateTrainCode, mainEmuId, serviceDate)
        ) {
            logger.info(
                `route_probe_untrusted_skipped trainCode=${formatTrainCode(candidateTrainCode)} emuCode=${mainEmuCode} serviceDate=${serviceDate}`
            );
            untrustedSkippedPairs.push({
                trainCode: candidateTrainCode,
                emuId: mainEmuId
            });
            continue;
        }

        return {
            probe: {
                probedTrainCode: candidateTrainCode,
                routeProbeResult
            },
            untrustedSkippedPairs
        };
    }

    return {
        probe: null,
        untrustedSkippedPairs
    };
}

async function executeProbeTrainDepartureTaskInternal(
    args: ProbeTrainDepartureTaskArgs
): Promise<void> {
    ensureProbeStateForToday();
    const nowSeconds = getNowSeconds();
    const serviceDate = unixSecondsToServiceDay(args.startAt);

    const readiness = rescheduleTaskUntilScheduleReady(
        PROBE_TRAIN_DEPARTURE_TASK_EXECUTOR,
        args
    );
    if (!readiness.ready) {
        markCurrentTrainProvenanceTaskSkipped('schedule_refresh_pending');
        recordCurrentTrainProvenanceEventsForTrainCodes(
            [args.trainCode, ...args.allCodes],
            {
                serviceDate,
                startAt: args.startAt,
                eventType: 'probe_task_skipped',
                result: 'schedule_refresh_pending',
                linkedSchedulerTaskId: readiness.rescheduledTaskId,
                payload: {
                    readiness: readiness.state,
                    rescheduleAction: readiness.action,
                    nextExecutionTime: readiness.nextExecutionTime,
                    removedTaskIds: readiness.removedTaskIds,
                    reusedExecutionTime: readiness.reusedExecutionTime
                }
            }
        );
        logger.info(
            `schedule_refresh_pending_reschedule executor=${PROBE_TRAIN_DEPARTURE_TASK_EXECUTOR} trainCode=${formatTrainCode(args.trainCode)} reason=${readiness.state.reason} nextExecutionTime=${readiness.nextExecutionTime ?? 'null'} taskId=${readiness.rescheduledTaskId ?? 'null'} action=${readiness.action ?? 'null'}`
        );
        return;
    }

    const trainKey = buildTrainKey(
        args.trainCode,
        args.trainInternalCode,
        args.startAt
    );
    if (hasQueriedTrainKey(trainKey)) {
        markCurrentTrainProvenanceTaskSkipped('already_queried');
        recordCurrentTrainProvenanceEventsForTrainCodes(
            [args.trainCode, ...args.allCodes],
            {
                serviceDate,
                startAt: args.startAt,
                eventType: 'probe_task_skipped',
                result: 'already_queried',
                payload: {
                    trainKey
                }
            }
        );
        logger.info(
            `skip already_queried trainCode=${formatTrainCode(args.trainCode)} trainInternalCode=${args.trainInternalCode ?? ''} startAt=${args.startAt}`
        );
        return;
    }

    if (!isCurrentScheduleTask(args.startAt)) {
        markCurrentTrainProvenanceTaskSkipped('non_current_schedule');
        recordCurrentTrainProvenanceEventsForTrainCodes(
            [args.trainCode, ...args.allCodes],
            {
                serviceDate,
                startAt: args.startAt,
                eventType: 'probe_task_skipped',
                result: 'non_current_schedule'
            }
        );
        logger.info(
            `skip_non_current_schedule trainCode=${formatTrainCode(args.trainCode)} startAt=${args.startAt}`
        );
        return;
    }

    const allTrainCodes = filterSafeProbeTaskTrainCodes(args);
    const routeProbeOutcome = await probeEmuByTrainCodes(allTrainCodes);
    const successfulRouteProbe = routeProbeOutcome.probe;
    if (routeProbeOutcome.untrustedSkippedPairs.length > 0) {
        for (const pair of routeProbeOutcome.untrustedSkippedPairs) {
            recordCurrentTrainProvenanceEventsForTrainCodes([pair.trainCode], {
                serviceDate,
                startAt: args.startAt,
                emuId: pair.emuId,
                eventType: 'route_probe_untrusted_skipped',
                result: 'untrusted',
                payload: {
                    untrustedEmuCode: formatExternalEmuCode(pair.emuId)
                }
            });
        }
    }
    if (!successfulRouteProbe) {
        if (args.retry > 0) {
            const nextRetry = args.retry - 1;
            const nextTaskId = enqueueTask(
                PROBE_TRAIN_DEPARTURE_TASK_EXECUTOR,
                { ...args, retry: nextRetry },
                nowSeconds
            );
            recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
                serviceDate,
                startAt: args.startAt,
                eventType: 'route_probe_request_failed',
                result: 'requeued',
                linkedSchedulerTaskId: nextTaskId,
                payload: {
                    attemptedTrainCodes: allTrainCodes,
                    retry: args.retry,
                    nextRetry
                }
            });
            markCurrentTrainProvenanceTaskSkipped('route_probe_requeued');
            logger.debug(
                `route_probe_failed_requeue trainCode=${formatTrainCode(args.trainCode)} retry=${args.retry} nextRetry=${nextRetry} nextTaskId=${nextTaskId} attemptedTrainCodes=${formatTrainCodes(allTrainCodes).join(',')}`
            );
            return;
        }

        recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
            serviceDate,
            startAt: args.startAt,
            eventType: 'route_probe_request_failed',
            result: 'exhausted',
            payload: {
                attemptedTrainCodes: allTrainCodes,
                retry: args.retry
            }
        });
        markCurrentTrainProvenanceTaskSkipped('route_probe_exhausted');
        return;
    }

    const { probedTrainCode, routeProbeResult } = successfulRouteProbe;
    const mainEmuId = routeProbeResult.emu.code;
    const mainEmuCode = formatExternalEmuCode(mainEmuId);
    recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
        serviceDate,
        startAt: args.startAt,
        emuId: mainEmuId,
        relatedTrainCode: probedTrainCode,
        eventType: 'route_probe_succeeded',
        result: 'running',
        payload: {
            probedTrainCode,
            attemptedTrainCodes: allTrainCodes,
            pictureName:
                routeProbeResult.formation?.observation.pictureName ?? '',
            formationPosition:
                routeProbeResult.formation?.observation.position ?? 'unknown'
        }
    });
    const parsedMainEmuCode = parseEmuCode(mainEmuCode);
    const currentTrainSetNo = parsedMainEmuCode!.trainSetNo;
    const assets = await loadProbeAssets();
    const mainRecord = assets.emuByModelAndTrainSetNo.get(
        buildProbeAssetKey(parsedMainEmuCode!.model, currentTrainSetNo)
    );
    const historicalRecentMatchingTrainCodes =
        collectHistoricalRecentMatchingTrainCodes(allTrainCodes, mainEmuId);

    if (historicalRecentMatchingTrainCodes.length > 0) {
        const todayTrainCodesValidation =
            await validateTodayRunningForTrainCodes(allTrainCodes);
        if (todayTrainCodesValidation.state === 'not_running') {
            recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
                serviceDate,
                startAt: args.startAt,
                emuId: mainEmuId,
                eventType: 'historical_recent_assignment_skipped',
                result: 'not_running',
                payload: {
                    matchedTrainCodes: historicalRecentMatchingTrainCodes,
                    checkedTrainCodes: allTrainCodes,
                    notRunningTrainCodes:
                        todayTrainCodesValidation.notRunningTrainCodes
                }
            });
            markCurrentTrainProvenanceTaskSkipped(
                'historical_recent_not_running'
            );
            logger.info(
                `skip_historical_recent_same_assignment_not_running trainCode=${formatTrainCode(args.trainCode)} probedTrainCode=${formatTrainCode(probedTrainCode)} mainEmuCode=${mainEmuCode} historicalRecentMatchedTrainCodes=${historicalRecentMatchingTrainCodes.map(formatTrainCode).join(',')} checkedTrainCodes=${formatTrainCodes(allTrainCodes).join(',')} notRunningTrainCodes=${todayTrainCodesValidation.notRunningTrainCodes.map(formatTrainCode).join(',')}`
            );
            return;
        }

        if (todayTrainCodesValidation.state === 'running') {
            const seatCodeVerification = await verifySeatCodeAgainstCurrentTask(
                assets,
                args.trainInternalCode,
                allTrainCodes,
                mainEmuId
            );
            if (seatCodeVerification.state === 'matched') {
                recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
                    serviceDate,
                    startAt: args.startAt,
                    emuId: mainEmuId,
                    relatedTrainCode:
                        todayTrainCodesValidation.runningTrainCode,
                    eventType: 'seat_verification_passed',
                    result: seatCodeVerification.reason,
                    payload: {
                        matchedTrainCodes: historicalRecentMatchingTrainCodes,
                        seatTrainCode: seatCodeVerification.seatTrainCode,
                        seatInternalCode: seatCodeVerification.seatInternalCode,
                        seatStartAt: seatCodeVerification.seatStartAt
                    }
                });
                logger.info(
                    `seat_verify_pass trainCode=${formatTrainCode(args.trainCode)} probedTrainCode=${formatTrainCode(probedTrainCode)} mainEmuCode=${mainEmuCode} runningTrainCode=${todayTrainCodesValidation.runningTrainCode ? formatTrainCode(todayTrainCodesValidation.runningTrainCode) : ''} reason=${seatCodeVerification.reason} seatTrainCode=${seatCodeVerification.seatTrainCode ? formatTrainCode(seatCodeVerification.seatTrainCode) : ''} seatInternalCode=${seatCodeVerification.seatInternalCode ?? ''} seatStartAt=${seatCodeVerification.seatStartAt} historicalRecentMatchedTrainCodes=${historicalRecentMatchingTrainCodes.map(formatTrainCode).join(',')}`
                );
            } else if (seatCodeVerification.state === 'unavailable') {
                if (
                    shouldRequeueUnavailableSeatVerification(
                        seatCodeVerification.reason
                    )
                ) {
                    if (args.retry > 0) {
                        const nextRetry = args.retry - 1;
                        const overlapRetryDelaySeconds =
                            useConfig().spider.scheduleProbe.probe
                                .overlapRetryDelaySeconds;
                        const nextTaskId =
                            requeueCurrentProbeTaskWithOverlapDelay(
                                args,
                                nowSeconds,
                                nextRetry
                            );
                        recordCurrentTrainProvenanceEventsForTrainCodes(
                            allTrainCodes,
                            {
                                serviceDate,
                                startAt: args.startAt,
                                emuId: mainEmuId,
                                relatedTrainCode:
                                    todayTrainCodesValidation.runningTrainCode,
                                eventType:
                                    'seat_verification_unavailable_requeued',
                                result: seatCodeVerification.reason,
                                linkedSchedulerTaskId: nextTaskId,
                                payload: {
                                    retry: args.retry,
                                    nextRetry,
                                    matchedTrainCodes:
                                        historicalRecentMatchingTrainCodes,
                                    seatCodeFailure:
                                        seatCodeVerification.seatCodeFailureDetail ??
                                        null
                                }
                            }
                        );
                        logger.info(
                            `seat_verify_unavailable_requeue trainCode=${formatTrainCode(args.trainCode)} probedTrainCode=${formatTrainCode(probedTrainCode)} mainEmuCode=${mainEmuCode} runningTrainCode=${todayTrainCodesValidation.runningTrainCode ? formatTrainCode(todayTrainCodesValidation.runningTrainCode) : ''} retry=${args.retry} nextRetry=${nextRetry} nextTaskId=${nextTaskId} delaySeconds=${overlapRetryDelaySeconds} reason=${seatCodeVerification.reason} historicalRecentMatchedTrainCodes=${historicalRecentMatchingTrainCodes.map(formatTrainCode).join(',')}`
                        );
                        markCurrentTrainProvenanceTaskSkipped(
                            'seat_verification_unavailable_requeued'
                        );
                        return;
                    }

                    recordCurrentTrainProvenanceEventsForTrainCodes(
                        allTrainCodes,
                        {
                            serviceDate,
                            startAt: args.startAt,
                            emuId: mainEmuId,
                            relatedTrainCode:
                                todayTrainCodesValidation.runningTrainCode,
                            eventType:
                                'seat_verification_unavailable_exhausted',
                            result: seatCodeVerification.reason,
                            payload: {
                                retry: args.retry,
                                matchedTrainCodes:
                                    historicalRecentMatchingTrainCodes,
                                seatCodeFailure:
                                    seatCodeVerification.seatCodeFailureDetail ??
                                    null
                            }
                        }
                    );
                    markCurrentTrainProvenanceTaskSkipped(
                        'seat_verification_unavailable_exhausted'
                    );
                    logger.warn(
                        `seat_verify_unavailable_exhausted trainCode=${formatTrainCode(args.trainCode)} probedTrainCode=${formatTrainCode(probedTrainCode)} mainEmuCode=${mainEmuCode} runningTrainCode=${todayTrainCodesValidation.runningTrainCode ? formatTrainCode(todayTrainCodesValidation.runningTrainCode) : ''} retry=${args.retry} reason=${seatCodeVerification.reason} historicalRecentMatchedTrainCodes=${historicalRecentMatchingTrainCodes.map(formatTrainCode).join(',')}`
                    );
                    return;
                }

                recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
                    serviceDate,
                    startAt: args.startAt,
                    emuId: mainEmuId,
                    relatedTrainCode:
                        todayTrainCodesValidation.runningTrainCode,
                    eventType: 'seat_verification_unavailable',
                    result: seatCodeVerification.reason,
                    payload: {
                        matchedTrainCodes: historicalRecentMatchingTrainCodes,
                        seatCodeFailure:
                            seatCodeVerification.seatCodeFailureDetail ?? null
                    }
                });
                logger.info(
                    `seat_verify_unavailable_continue trainCode=${formatTrainCode(args.trainCode)} probedTrainCode=${formatTrainCode(probedTrainCode)} mainEmuCode=${mainEmuCode} runningTrainCode=${todayTrainCodesValidation.runningTrainCode ? formatTrainCode(todayTrainCodesValidation.runningTrainCode) : ''} reason=${seatCodeVerification.reason} historicalRecentMatchedTrainCodes=${historicalRecentMatchingTrainCodes.map(formatTrainCode).join(',')}`
                );
            } else if (args.retry > 0) {
                const nextRetry = args.retry - 1;
                const overlapRetryDelaySeconds =
                    useConfig().spider.scheduleProbe.probe
                        .overlapRetryDelaySeconds;
                const nextTaskId = requeueCurrentProbeTaskWithOverlapDelay(
                    args,
                    nowSeconds,
                    nextRetry
                );
                recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
                    serviceDate,
                    startAt: args.startAt,
                    emuId: mainEmuId,
                    relatedTrainCode:
                        todayTrainCodesValidation.runningTrainCode,
                    eventType: 'seat_verification_mismatch_requeued',
                    result: seatCodeVerification.reason,
                    linkedSchedulerTaskId: nextTaskId,
                    payload: {
                        retry: args.retry,
                        nextRetry,
                        matchedTrainCodes: historicalRecentMatchingTrainCodes,
                        seatTrainCode: seatCodeVerification.seatTrainCode,
                        seatInternalCode: seatCodeVerification.seatInternalCode,
                        seatStartAt: seatCodeVerification.seatStartAt
                    }
                });
                logger.debug(
                    `seat_verify_mismatch_requeue trainCode=${formatTrainCode(args.trainCode)} probedTrainCode=${formatTrainCode(probedTrainCode)} mainEmuCode=${mainEmuCode} runningTrainCode=${todayTrainCodesValidation.runningTrainCode ? formatTrainCode(todayTrainCodesValidation.runningTrainCode) : ''} retry=${args.retry} nextRetry=${nextRetry} nextTaskId=${nextTaskId} delaySeconds=${overlapRetryDelaySeconds} reason=${seatCodeVerification.reason} seatTrainCode=${seatCodeVerification.seatTrainCode ? formatTrainCode(seatCodeVerification.seatTrainCode) : ''} seatInternalCode=${seatCodeVerification.seatInternalCode ?? ''} seatStartAt=${seatCodeVerification.seatStartAt} historicalRecentMatchedTrainCodes=${historicalRecentMatchingTrainCodes.map(formatTrainCode).join(',')}`
                );
                markCurrentTrainProvenanceTaskSkipped(
                    'seat_verification_mismatch_requeued'
                );
                return;
            } else {
                recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
                    serviceDate,
                    startAt: args.startAt,
                    emuId: mainEmuId,
                    relatedTrainCode:
                        todayTrainCodesValidation.runningTrainCode,
                    eventType: 'seat_verification_mismatch_exhausted',
                    result: seatCodeVerification.reason,
                    payload: {
                        retry: args.retry,
                        matchedTrainCodes: historicalRecentMatchingTrainCodes,
                        seatTrainCode: seatCodeVerification.seatTrainCode,
                        seatInternalCode: seatCodeVerification.seatInternalCode,
                        seatStartAt: seatCodeVerification.seatStartAt
                    }
                });
                markCurrentTrainProvenanceTaskSkipped(
                    'seat_verification_mismatch_exhausted'
                );
                return;
            }
        }

        if (todayTrainCodesValidation.state === 'request_failed') {
            logger.info(
                `continue_historical_recent_same_assignment_request_failed trainCode=${formatTrainCode(args.trainCode)} probedTrainCode=${formatTrainCode(probedTrainCode)} mainEmuCode=${mainEmuCode} historicalRecentMatchedTrainCodes=${historicalRecentMatchingTrainCodes.map(formatTrainCode).join(',')} checkedTrainCodes=${formatTrainCodes(allTrainCodes).join(',')} requestFailedTrainCodes=${todayTrainCodesValidation.requestFailedTrainCodes.map(formatTrainCode).join(',')} notRunningTrainCodes=${todayTrainCodesValidation.notRunningTrainCodes.map(formatTrainCode).join(',')}`
            );
        }
    }

    const routeReadCache = new DepartureRouteReadCache();
    if (
        await tryResolveOverlappingRoutes(
            args,
            mainEmuId,
            assets,
            nowSeconds,
            routeReadCache
        )
    ) {
        return;
    }

    const formationObservation =
        routeProbeResult.formation?.observation ?? null;
    if (formationObservation) {
        const formationWarnings: FormationStatusWarning[] = [];
        const observationWarningKind = toFormationWarningKind(
            formationObservation.warningKind
        );
        if (observationWarningKind) {
            formationWarnings.push({
                source: 'getCarDetail',
                kind: observationWarningKind,
                emuId: mainEmuId,
                oldStatus: null,
                newStatus: null,
                pictureName: formationObservation.pictureName,
                repeat: '',
                reason: 'getCarDetail coach picture observation is unavailable'
            });
        }
        if (formationObservation.position === 'II') {
            const formationStatusContext = resolveFormationStatusContext(
                args,
                mainEmuId,
                routeReadCache
            );
            const existingStatus = getFormationObservationBaseStatus(
                formationStatusContext
            );
            const nextStatus = withFormationStatus(existingStatus, {
                confirmed: true,
                formationPosition: 'II'
            });
            if (nextStatus === null) {
                throw new Error(`invalid_emu_route_status ${existingStatus}`);
            }
            if (
                mainRecord &&
                getProbeEmuMultipleStateFromRecord(mainRecord) ===
                    'non_multiple'
            ) {
                formationWarnings.push({
                    source: 'model',
                    kind: 'model_get_car_detail_conflict',
                    emuId: mainEmuId,
                    oldStatus: existingStatus,
                    newStatus: nextStatus,
                    pictureName: formationObservation.pictureName,
                    repeat: '',
                    reason: 'model is non_multiple but getCarDetail confirmed coupled II; getCarDetail wins'
                });
            }
            formationWarnings.push(
                ...collectPositionConflictWarnings({
                    mainEmuId,
                    newStatus: nextStatus,
                    newPosition: 'II',
                    source: 'getCarDetail',
                    pictureName: formationObservation.pictureName,
                    repeat: '',
                    context: formationStatusContext
                })
            );
            const historicalReuse = formationStatusContext.inheritanceCandidate
                ? await tryReuseHistoricalRouteStatus(
                      args,
                      trainKey,
                      mainEmuId,
                      allTrainCodes,
                      nowSeconds,
                      routeReadCache,
                      {
                          inheritanceCandidate:
                              formationStatusContext.inheritanceCandidate,
                          historicalRows: formationStatusContext.historicalRows,
                          statusOverrides: new Map([[mainEmuId, nextStatus]]),
                          coupledIIAnchorEmuId: mainEmuId,
                          pictureName: formationObservation.pictureName,
                          requireRelatedEmu: true
                      }
                  )
                : null;
            const autoMerge = historicalReuse
                ? null
                : await tryAutoMergeResolvedInternalGroup(
                      args,
                      trainKey,
                      allTrainCodes,
                      mainEmuId,
                      nowSeconds,
                      routeReadCache,
                      {
                          statusOverrides: new Map([[mainEmuId, nextStatus]]),
                          coupledIIAnchorEmuId: mainEmuId,
                          pictureName: formationObservation.pictureName
                      }
                  );
            formationWarnings.push(
                ...(historicalReuse?.warnings ?? autoMerge?.warnings ?? [])
            );
            if (formationWarnings.length > 0) {
                reportFormationStatusWarnings(
                    formationWarnings,
                    buildFormationWarningContext(
                        args,
                        serviceDate,
                        allTrainCodes,
                        mainEmuId
                    )
                );
            }
            const trackingMutations =
                historicalReuse?.trackingMutations ??
                autoMerge?.trackingMutations ??
                (await applyResolvedResult(
                    args,
                    trainKey,
                    allTrainCodes,
                    [mainEmuId],
                    new Map([[mainEmuId, nextStatus]]),
                    nowSeconds
                ));
            const resolvedEmuIds = historicalReuse?.emuIds ??
                autoMerge?.emuIds ?? [mainEmuId];
            const detectionTaskId = mainRecord
                ? queueCoupledDetectionTask(mainRecord)
                : null;
            recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
                serviceDate,
                startAt: args.startAt,
                emuId: mainEmuId,
                relatedTrainCode: probedTrainCode,
                eventType: 'formation_position_detected',
                result: 'coupled_ii',
                payload: {
                    source: 'getCarDetail',
                    pictureName: formationObservation.pictureName,
                    probedTrainCode,
                    emuIds: resolvedEmuIds,
                    statusByEmu: Array.from(
                        (
                            historicalReuse?.statusByEmu ??
                            autoMerge?.statusByEmu ??
                            new Map([[mainEmuId, nextStatus]])
                        ).entries(),
                        ([emuId, status]) => ({ emuId, status })
                    ),
                    oldStatus: existingStatus,
                    newStatus: nextStatus,
                    trackingMutations,
                    detectionTaskId
                }
            });
            logger.info(
                `formation_position_detected trainCode=${formatTrainCode(args.trainCode)} probedTrainCode=${formatTrainCode(probedTrainCode)} mainEmuCode=${mainEmuCode} pictureName=${formationObservation.pictureName} status=${nextStatus} detectionTaskId=${detectionTaskId ?? 'null'}`
            );
            return;
        }
        if (formationWarnings.length > 0) {
            reportFormationStatusWarnings(
                formationWarnings,
                buildFormationWarningContext(
                    args,
                    serviceDate,
                    allTrainCodes,
                    mainEmuId
                )
            );
        }
    }

    const autoMergeResult = await tryAutoMergeResolvedInternalGroup(
        args,
        trainKey,
        allTrainCodes,
        mainEmuId,
        nowSeconds,
        routeReadCache
    );
    if (autoMergeResult) {
        if (autoMergeResult.warnings.length > 0) {
            reportFormationStatusWarnings(
                autoMergeResult.warnings,
                buildFormationWarningContext(
                    args,
                    serviceDate,
                    allTrainCodes,
                    mainEmuId
                )
            );
        }
        return;
    }

    if (!mainRecord) {
        logger.warn(
            `main_emu_asset_not_found trainCode=${formatTrainCode(args.trainCode)} mainEmuCode=${mainEmuCode}`
        );
        recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
            serviceDate,
            startAt: args.startAt,
            emuId: mainEmuId,
            eventType: 'main_emu_asset_not_found',
            result: 'continue_pending',
            payload: {
                attemptedTrainCodes: allTrainCodes
            }
        });
    }

    const existingRows = getResolvedCurrentStatusRows(
        mainEmuId,
        args.startAt,
        routeReadCache
    );
    if (existingRows.length > 0) {
        const knownGroup = collectKnownStatusGroup(
            existingRows,
            mainEmuId,
            args.startAt
        );
        const effectiveKnownGroup = existingRows.every(
            (row) => row.start_at === args.startAt
        )
            ? knownGroup
            : collectKnownStatusGroupForServiceDate(
                  existingRows,
                  mainEmuId,
                  args.startAt,
                  serviceDate
              );
        const statusByEmu = new Map(effectiveKnownGroup.statusByEmu);
        for (const emuCode of effectiveKnownGroup.emuIds) {
            if (!statusByEmu.has(emuCode)) {
                statusByEmu.set(emuCode, EMU_ROUTE_STATUS_UNCONFIRMED_SINGLE);
            }
        }
        if (effectiveKnownGroup.warnings.length > 0) {
            reportFormationStatusWarnings(
                effectiveKnownGroup.warnings,
                buildFormationWarningContext(
                    args,
                    serviceDate,
                    allTrainCodes,
                    mainEmuId
                )
            );
        }
        const trackingMutations = await applyResolvedResult(
            args,
            trainKey,
            allTrainCodes,
            effectiveKnownGroup.emuIds.length > 0
                ? effectiveKnownGroup.emuIds
                : [mainEmuId],
            statusByEmu,
            nowSeconds,
            () => {
                for (const emuCode of effectiveKnownGroup.emuIds) {
                    const emuStatus = statusByEmu.get(emuCode);
                    if (emuStatus === undefined) {
                        continue;
                    }
                    updateDailyRouteFullStatusByEmuCode(
                        emuCode,
                        args.startAt,
                        emuStatus
                    );
                }
            }
        );
        const hasConfirmedCoupled = Array.from(statusByEmu.values()).some(
            (status) => isConfirmedCoupled(status)
        );
        recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
            serviceDate,
            startAt: args.startAt,
            emuId: mainEmuId,
            eventType: 'resolved_from_status',
            result: hasConfirmedCoupled ? 'coupled' : 'single',
            payload: {
                emuIds: effectiveKnownGroup.emuIds,
                statusByEmu: Array.from(
                    statusByEmu.entries(),
                    ([emuId, status]) => ({ emuId, status })
                ),
                trackingMutations
            }
        });
        logger.info(
            `resolved_from_status trainCode=${formatTrainCode(args.trainCode)} probedTrainCode=${formatTrainCode(probedTrainCode)} mainEmuCode=${mainEmuCode} statuses=${Array.from(statusByEmu.values()).join('/')} emuCodes=${effectiveKnownGroup.emuIds.length} attemptedTrainCodes=${allTrainCodes.length}`
        );
        return;
    }

    if (
        mainRecord &&
        getProbeEmuMultipleStateFromRecord(mainRecord) === 'non_multiple'
    ) {
        const formationStatusContext = resolveFormationStatusContext(
            args,
            mainEmuId,
            routeReadCache
        );
        const existingStatus = getFormationObservationBaseStatus(
            formationStatusContext
        );
        const confirmedSingleStatus = withFormationStatus(existingStatus, {
            confirmed: true,
            formationPosition: 'single'
        });
        if (confirmedSingleStatus === null) {
            throw new Error(`invalid_emu_route_status ${existingStatus}`);
        }
        const conflictWarnings = collectPositionConflictWarnings({
            mainEmuId,
            newStatus: confirmedSingleStatus,
            newPosition: 'single',
            source: 'model',
            pictureName: '',
            repeat: '',
            context: formationStatusContext
        });
        if (conflictWarnings.length > 0) {
            reportFormationStatusWarnings(
                conflictWarnings,
                buildFormationWarningContext(
                    args,
                    serviceDate,
                    allTrainCodes,
                    mainEmuId
                )
            );
        }
        const trackingMutations = await applyResolvedResult(
            args,
            trainKey,
            allTrainCodes,
            [mainEmuId],
            new Map([[mainEmuId, confirmedSingleStatus]]),
            nowSeconds
        );
        recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
            serviceDate,
            startAt: args.startAt,
            emuId: mainEmuId,
            eventType: 'resolved_single',
            result: 'non_multiple',
            payload: {
                source: 'asset_flag',
                trackingMutations
            }
        });
        logger.info(
            `resolved_single_non_multiple trainCode=${formatTrainCode(args.trainCode)} probedTrainCode=${formatTrainCode(probedTrainCode)} mainEmuCode=${mainEmuCode} attemptedTrainCodes=${allTrainCodes.length}`
        );
        return;
    }

    const historicalReuseResult = await tryReuseHistoricalRouteStatus(
        args,
        trainKey,
        mainEmuId,
        allTrainCodes,
        nowSeconds,
        routeReadCache
    );
    if (historicalReuseResult) {
        if (historicalReuseResult.warnings.length > 0) {
            reportFormationStatusWarnings(
                historicalReuseResult.warnings,
                buildFormationWarningContext(
                    args,
                    serviceDate,
                    allTrainCodes,
                    mainEmuId
                )
            );
        }
        return;
    }

    const trackingMutations = await applyPendingCouplingProbeResult({
        trainCode: args.trainCode,
        trainInternalCode: args.trainInternalCode,
        allTrainCodes,
        allEmuCodes: [mainEmuId],
        startStation: args.startStation,
        endStation: args.endStation,
        startAt: args.startAt,
        endAt: args.endAt,
        trainKey,
        nowSeconds
    });

    const detectionTaskId = mainRecord
        ? queueCoupledDetectionTask(mainRecord)
        : null;
    recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
        serviceDate,
        startAt: args.startAt,
        emuId: mainEmuId,
        eventType: 'pending_coupling_detection',
        result: mainRecord ? 'queued' : 'asset_missing_no_detection',
        linkedSchedulerTaskId: detectionTaskId ?? undefined,
        payload: {
            bureau: mainRecord?.bureau ?? '',
            model: mainRecord?.model ?? '',
            attemptedTrainCodes: allTrainCodes,
            trackingMutations
        }
    });
    logger.info(
        `pending_coupling_detection trainCode=${formatTrainCode(args.trainCode)} probedTrainCode=${formatTrainCode(probedTrainCode)} mainEmuCode=${mainEmuCode} detectionTaskId=${detectionTaskId ?? 'null'} attemptedTrainCodes=${allTrainCodes.length}`
    );
}

export function registerProbeTrainDepartureTaskExecutor(): void {
    if (registered) {
        return;
    }

    registerTaskExecutor(PROBE_TRAIN_DEPARTURE_TASK_EXECUTOR, {
        parse: parseTaskArgs,
        execute: executeProbeTrainDepartureTaskInternal
    });
    registered = true;
    logger.info(`registered executor=${PROBE_TRAIN_DEPARTURE_TASK_EXECUTOR}`);
}
