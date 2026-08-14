import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import { clearRecentCoupledGroupDetection } from '~/server/services/probeDetectionState';
import {
    buildProbeAssetKey,
    getProbeEmuMultipleStateFromRecord,
    loadProbeAssets,
    type EmuListRecord
} from '~/server/services/probeAssetStore';
import {
    buildRunningEmuGroupKey,
    buildTrainKey,
    clearQueriedTrainKey,
    clearRunningEmuStateByTrainKey,
    ensureProbeStateForToday,
    getAssignedEmuState,
    hasQueriedTrainKey,
    listAssignedEmuCodesByTrainKey,
    markQueriedTrainKey,
    markEmuCodesAssignedToday
} from '~/server/services/probeRuntimeState';
import {
    deleteProbeStatusByTrainCodeInRange,
    ensureProbeStatus,
    getLatestResolvedProbeStatusByEmuCodeBefore,
    getProbeStatusByEmuCodeValue,
    getProbeStatusByTrainCodeValue,
    listProbeStatusByEmuCode,
    listProbeStatusByEmuCodeInRange,
    listProbeStatusByTrainCode,
    listProbeStatusByTrainCodeInRange,
    updateProbeStatusByEmuCode,
    ProbeStatusValue,
    type ProbeStatusRow
} from '~/server/services/probeStatusStore';
import {
    deleteProbeUntrustedRecordsByTrainCodeAndEmuCodeAtServiceDate,
    isProbeUntrustedRecord,
    markProbeUntrustedRecord
} from '~/server/services/probeUntrustedRecordStore';
import {
    deleteDailyRoutesByTrainCodeInRange,
    insertDailyEmuRoute,
    listDailyRoutesByEmuCodeInRange,
    listDailyRoutesByTrainCodeInRange,
    type DailyEmuRouteRow
} from '~/server/services/emuRoutesStore';
import { persistProbeTrackingRows } from '~/server/services/probeTrackingMutations';
import { notifyLookupStatusChanges } from '~/server/services/eventNotificationService';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import { enqueueTask } from '~/server/services/taskQueue';
import { DETECT_COUPLED_EMU_GROUP_TASK_EXECUTOR } from '~/server/services/taskExecutors/detectCoupledEmuGroupTaskExecutor';
import {
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
    finalStatus: ProbeStatusValue;
}

interface ClearedOverlapState {
    deletedDailyRouteRows: number;
    deletedProbeStatusRows: number;
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
    downgradedProbeStatusRows: number;
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

function persistDailyRoutes(
    trainCodes: TrainCodeParts[],
    emuIds: EmuId[],
    startStation: string,
    endStation: string,
    startAt: number,
    endAt: number
): void {
    for (const trainCode of trainCodes) {
        for (const emuId of emuIds) {
            insertDailyEmuRoute(
                trainCode,
                emuId,
                startStation,
                endStation,
                startAt,
                endAt
            );
        }
    }
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
    nextDayStart: number
): TodayScheduleProbeGroup[] {
    const overlappingGroups = new Map<string, TodayScheduleProbeGroup>();
    const existingRows = listDailyRoutesByEmuCodeInRange(
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

function downgradeAffectedProbeStatuses(
    emuIds: EmuId[],
    deletedTrainCodes: Set<string>,
    dayStart: number,
    nextDayStart: number
): number {
    let downgradedProbeStatusRows = 0;

    const seenEmuIds = new Set<number>();
    for (const emuId of emuIds) {
        const emuIdNumber = Number(emuId);
        if (seenEmuIds.has(emuIdNumber)) {
            continue;
        }
        seenEmuIds.add(emuIdNumber);
        const startAts = new Set<number>();
        for (const row of listProbeStatusByEmuCodeInRange(
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
            downgradedProbeStatusRows += updateProbeStatusByEmuCode(
                emuId,
                startAt,
                ProbeStatusValue.PendingCouplingDetection
            );
        }
    }

    return downgradedProbeStatusRows;
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
    let deletedProbeStatusRows = 0;

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
            listProbeStatusByTrainCodeInRange(
                trainCode,
                dayStart,
                nextDayStart
            ).forEach((row) => affectedEmuIds.add(Number(row.emu_id)));

            deletedDailyRouteRows += deleteDailyRoutesByTrainCodeInRange(
                trainCode,
                dayStart,
                nextDayStart
            );
            deletedProbeStatusRows += deleteProbeStatusByTrainCodeInRange(
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
        deletedProbeStatusRows,
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
    let deletedProbeStatusRows = 0;

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
            listProbeStatusByTrainCodeInRange(
                trainCode,
                dayStart,
                nextDayStart
            ).forEach((row) => affectedEmuIds.add(Number(row.emu_id)));

            deletedDailyRouteRows += deleteDailyRoutesByTrainCodeInRange(
                trainCode,
                dayStart,
                nextDayStart
            );
            deletedProbeStatusRows += deleteProbeStatusByTrainCodeInRange(
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
    const downgradedProbeStatusRows = downgradeAffectedProbeStatuses(
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
        deletedProbeStatusRows,
        clearedTrainKeys,
        affectedEmuIds: normalizedAffectedEmuIds,
        downgradedProbeStatusRows
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
    rows: ProbeStatusRow[],
    currentEmuId: EmuId,
    startAt: number
): KnownStatusGroup {
    const emuIds = new Set<number>([Number(currentEmuId)]);
    let finalStatus: ProbeStatusValue = rows.some(
        (row) => row.status === ProbeStatusValue.CoupledFormationResolved
    )
        ? ProbeStatusValue.CoupledFormationResolved
        : ProbeStatusValue.SingleFormationResolved;

    for (const row of rows) {
        emuIds.add(Number(row.emu_id));
    }

    if (finalStatus === ProbeStatusValue.CoupledFormationResolved) {
        for (const row of rows) {
            const relatedRows = listProbeStatusByTrainCode(
                row.train_code,
                startAt
            );
            for (const relatedRow of relatedRows) {
                emuIds.add(Number(relatedRow.emu_id));
            }
        }
    }

    return {
        emuIds: Array.from(emuIds, (emuId) => emuId as EmuId),
        finalStatus
    };
}

function collectKnownStatusGroupForServiceDate(
    rows: ProbeStatusRow[],
    currentEmuId: EmuId,
    startAt: number,
    serviceDate: ServiceDay
): KnownStatusGroup {
    const { dayStart, nextDayStart } = getCurrentDayWindow();
    const emuIds = new Set<number>([Number(currentEmuId)]);
    let finalStatus: ProbeStatusValue = rows.some(
        (row) => row.status === ProbeStatusValue.CoupledFormationResolved
    )
        ? ProbeStatusValue.CoupledFormationResolved
        : ProbeStatusValue.SingleFormationResolved;

    for (const row of rows) {
        emuIds.add(Number(row.emu_id));
    }

    if (finalStatus === ProbeStatusValue.CoupledFormationResolved) {
        for (const row of rows) {
            const relatedRows = listProbeStatusByTrainCodeInRange(
                row.train_code,
                dayStart,
                nextDayStart
            ).filter(
                (candidate) =>
                    candidate.start_at === startAt ||
                    (candidate.start_at === 0 &&
                        candidate.service_date === serviceDate)
            );
            for (const relatedRow of relatedRows) {
                emuIds.add(Number(relatedRow.emu_id));
            }
        }
    }

    return {
        emuIds: Array.from(emuIds, (emuId) => emuId as EmuId),
        finalStatus
    };
}

function getResolvedCurrentStatusRows(
    mainEmuId: EmuId,
    startAt: number
): ProbeStatusRow[] {
    const directRows = listProbeStatusByEmuCode(mainEmuId, startAt);
    if (
        directRows.some(
            (row) =>
                row.status === ProbeStatusValue.SingleFormationResolved ||
                row.status === ProbeStatusValue.CoupledFormationResolved
        )
    ) {
        return directRows;
    }

    const assignedState = getAssignedEmuState(mainEmuId);
    if (!assignedState || assignedState.startAt !== startAt) {
        return [];
    }

    const { dayStart, nextDayStart } = getCurrentDayWindow();
    const serviceDate = unixSecondsToServiceDay(startAt);
    return listProbeStatusByEmuCodeInRange(
        mainEmuId,
        dayStart,
        nextDayStart
    ).filter(
        (row) =>
            (row.status === ProbeStatusValue.SingleFormationResolved ||
                row.status === ProbeStatusValue.CoupledFormationResolved) &&
            (row.start_at === startAt ||
                (row.start_at === 0 && row.service_date === serviceDate))
    );
}

function collectResolvedRowsForAssignedEmuCodes(
    emuIds: EmuId[],
    dayStart: number,
    nextDayStart: number
): ProbeStatusRow[] {
    const rowsByKey = new Map<string, ProbeStatusRow>();

    const seenEmuIds = new Set<number>();
    for (const emuId of emuIds) {
        const emuIdNumber = Number(emuId);
        if (seenEmuIds.has(emuIdNumber)) {
            continue;
        }
        seenEmuIds.add(emuIdNumber);
        for (const row of listProbeStatusByEmuCodeInRange(
            emuId,
            dayStart,
            nextDayStart
        )) {
            if (
                row.status !== ProbeStatusValue.SingleFormationResolved &&
                row.status !== ProbeStatusValue.CoupledFormationResolved
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
    nowSeconds: number
): Promise<boolean> {
    if (!args.trainInternalCode) {
        return false;
    }

    const assignedEmuCodes = listAssignedEmuCodesByTrainKey(trainKey).filter(
        (emuId) => Number(emuId) !== Number(mainEmuId)
    );
    if (assignedEmuCodes.length === 0) {
        return false;
    }

    const { dayStart, nextDayStart } = getCurrentDayWindow();
    const resolvedRows = collectResolvedRowsForAssignedEmuCodes(
        assignedEmuCodes,
        dayStart,
        nextDayStart
    );
    if (resolvedRows.length === 0) {
        return false;
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
        return false;
    }

    const mergedEmuIds = [mainEmuId, ...mergedFromEmuIds];
    if (mergedEmuIds.length <= 1) {
        return false;
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
    const mergedTrainCodes: TrainCodeParts[] = [...allTrainCodes];
    for (const trainCode of mergedFromTrainCodes) {
        const key = trainCodeKey(trainCode);
        if (mergedTrainCodes.some((item) => trainCodeKey(item) === key)) {
            continue;
        }
        mergedTrainCodes.push(trainCode);
    }

    const trackingMutations = await applyResolvedResult(
        args,
        trainKey,
        mergedTrainCodes,
        mergedEmuIds,
        ProbeStatusValue.CoupledFormationResolved,
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
    return true;
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
    nowSeconds: number
): Promise<boolean> {
    const { dayStart, nextDayStart } = getCurrentDayWindow();
    const currentGroup =
        getTodayScheduleProbeGroupByTrainCode(args.trainCode) ??
        buildFallbackGroupFromArgs(args);
    let overlappingGroups = collectOverlappingGroups(
        mainEmuId,
        currentGroup,
        dayStart,
        nextDayStart
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
        logger.info(
            `overlap_drop_not_running conflictEmuCode=${formatExternalEmuCode(mainEmuId)} droppedGroups=${formatTrainCodeGroups(notRunningGroups)} notRunningTrainCodes=${notRunningTrainCodes.map(formatTrainCode).join(',')} requestFailedTrainCodes=${requestFailedTrainCodes.map(formatTrainCode).join(',')} affectedEmuCodes=${clearedNotRunningState.affectedEmuIds.map(formatExternalEmuCode).join(',')} deletedDailyRouteRows=${clearedNotRunningState.deletedDailyRouteRows} deletedProbeStatusRows=${clearedNotRunningState.deletedProbeStatusRows} downgradedProbeStatusRows=${clearedNotRunningState.downgradedProbeStatusRows}`
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
                deletedProbeStatusRows:
                    clearedNotRunningState.deletedProbeStatusRows,
                downgradedProbeStatusRows:
                    clearedNotRunningState.downgradedProbeStatusRows
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
            nextDayStart
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
        `overlap_requeue conflictEmuCode=${formatExternalEmuCode(mainEmuId)} conflictGroups=${formatTrainCodeGroups(overlappingGroups)} conflictTimeRanges=${formatOverlapTimeRanges(currentGroup, overlappingGroups)} notRunningTrainCodes=${notRunningTrainCodes.map(formatTrainCode).join(',')} requestFailedTrainCodes=${requestFailedTrainCodes.map(formatTrainCode).join(',')} requeuedGroups=${formatTrainCodeGroups(Array.from(impactedGroups.values()))} requeuedEmuCodes=${clearedState.affectedEmuIds.map(formatExternalEmuCode).join(',')} deletedDailyRouteRows=${clearedState.deletedDailyRouteRows} deletedProbeStatusRows=${clearedState.deletedProbeStatusRows} requeueTaskIds=${taskIds.join(',')}`
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
            deletedDailyRouteRows: clearedState.deletedDailyRouteRows,
            deletedProbeStatusRows: clearedState.deletedProbeStatusRows
        }
    }));
    markCurrentTrainProvenanceTaskSkipped('overlap_requeued');
    return true;
}

function collectLookupStatusNotificationCandidates(
    allTrainCodes: TrainCodeParts[],
    allEmuCodes: EmuId[],
    startAt: number,
    status: ProbeStatusValue
) {
    const seenTrainKeys = new Set<string>();
    const uniqueTrainCodes = allTrainCodes.filter((trainCode) => {
        const key = trainCodeKey(trainCode);
        if (seenTrainKeys.has(key)) {
            return false;
        }
        seenTrainKeys.add(key);
        return true;
    });
    const seenEmuIds = new Set<number>();
    const uniqueEmuIds = allEmuCodes.filter((emuId) => {
        const key = Number(emuId);
        if (seenEmuIds.has(key)) {
            return false;
        }
        seenEmuIds.add(key);
        return true;
    });
    return [
        ...uniqueTrainCodes.map((targetId) => ({
            targetType: 'train' as const,
            targetId,
            startAt,
            previousStatus: getProbeStatusByTrainCodeValue(targetId, startAt),
            nextStatus: status
        })),
        ...uniqueEmuIds.map((targetId) => ({
            targetType: 'emu' as const,
            targetId,
            startAt,
            previousStatus: getProbeStatusByEmuCodeValue(targetId, startAt),
            nextStatus: status
        }))
    ];
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
    status: ProbeStatusValue,
    nowSeconds: number
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
        status,
        nowSeconds
    });
}

async function tryReuseHistoricalProbeStatus(
    args: ProbeTrainDepartureTaskArgs,
    trainKey: string,
    mainEmuId: EmuId,
    allTrainCodes: TrainCodeParts[],
    nowSeconds: number
): Promise<boolean> {
    const latestResolvedRow = getLatestResolvedProbeStatusByEmuCodeBefore(
        mainEmuId,
        args.startAt
    );
    if (!latestResolvedRow) {
        return false;
    }

    const historicalRows = listProbeStatusByEmuCode(
        mainEmuId,
        latestResolvedRow.start_at
    );
    if (historicalRows.length === 0) {
        return false;
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
    const allEmuCodes =
        knownGroup.emuIds.length > 0 ? knownGroup.emuIds : [mainEmuId];
    if (
        latestResolvedRow.status ===
            ProbeStatusValue.CoupledFormationResolved &&
        (knownGroup.finalStatus !== ProbeStatusValue.CoupledFormationResolved ||
            allEmuCodes.length <= 1)
    ) {
        recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
            serviceDate: unixSecondsToServiceDay(args.startAt),
            startAt: args.startAt,
            emuId: mainEmuId,
            eventType: 'historical_reuse_rejected',
            result: 'incomplete_group',
            payload: {
                historicalStartAt: latestResolvedRow.start_at,
                historicalStatus: latestResolvedRow.status,
                knownFinalStatus: knownGroup.finalStatus,
                historicalTrainCodes,
                emuIds: allEmuCodes
            }
        });
        logger.warn(
            `reuse_historical_status_incomplete trainCode=${formatTrainCode(args.trainCode)} mainEmuCode=${formatExternalEmuCode(mainEmuId)} historicalStartAt=${latestResolvedRow.start_at}`
        );
        return false;
    }

    const trackingMutations = await applyResolvedResult(
        args,
        trainKey,
        allTrainCodes,
        allEmuCodes,
        knownGroup.finalStatus,
        nowSeconds
    );
    logger.info(
        `reuse_historical_status trainCode=${formatTrainCode(args.trainCode)} mainEmuCode=${formatExternalEmuCode(mainEmuId)} historicalStartAt=${latestResolvedRow.start_at} status=${knownGroup.finalStatus} emuCodes=${allEmuCodes.length}`
    );
    recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
        serviceDate: unixSecondsToServiceDay(args.startAt),
        startAt: args.startAt,
        emuId: mainEmuId,
        eventType: 'historical_reuse_selected',
        result:
            knownGroup.finalStatus === ProbeStatusValue.CoupledFormationResolved
                ? 'coupled'
                : 'single',
        payload: {
            historicalStartAt: latestResolvedRow.start_at,
            historicalStatus: latestResolvedRow.status,
            historicalTrainCodes,
            emuIds: allEmuCodes,
            trackingMutations
        }
    });
    return true;
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
            attemptedTrainCodes: allTrainCodes
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

    if (
        await tryResolveOverlappingRoutes(args, mainEmuId, assets, nowSeconds)
    ) {
        return;
    }

    if (
        await tryAutoMergeResolvedInternalGroup(
            args,
            trainKey,
            allTrainCodes,
            mainEmuId,
            nowSeconds
        )
    ) {
        return;
    }

    if (!mainRecord) {
        logger.warn(
            `main_emu_asset_not_found trainCode=${formatTrainCode(args.trainCode)} mainEmuCode=${mainEmuCode}`
        );
        const trackingMutations = await applyResolvedResult(
            args,
            trainKey,
            allTrainCodes,
            [mainEmuId],
            ProbeStatusValue.SingleFormationResolved,
            nowSeconds
        );
        recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
            serviceDate,
            startAt: args.startAt,
            emuId: mainEmuId,
            eventType: 'resolved_single',
            result: 'asset_missing',
            payload: {
                source: 'route_probe',
                trackingMutations
            }
        });
        return;
    }

    if (getProbeEmuMultipleStateFromRecord(mainRecord) === 'non_multiple') {
        const trackingMutations = await applyResolvedResult(
            args,
            trainKey,
            allTrainCodes,
            [mainEmuId],
            ProbeStatusValue.SingleFormationResolved,
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

    const existingRows = getResolvedCurrentStatusRows(mainEmuId, args.startAt);
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
        for (const emuCode of effectiveKnownGroup.emuIds) {
            updateProbeStatusByEmuCode(
                emuCode,
                args.startAt,
                effectiveKnownGroup.finalStatus
            );
        }
        const trackingMutations = await applyResolvedResult(
            args,
            trainKey,
            allTrainCodes,
            effectiveKnownGroup.emuIds.length > 0
                ? effectiveKnownGroup.emuIds
                : [mainEmuId],
            effectiveKnownGroup.finalStatus,
            nowSeconds
        );
        recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
            serviceDate,
            startAt: args.startAt,
            emuId: mainEmuId,
            eventType: 'resolved_from_status',
            result:
                effectiveKnownGroup.finalStatus ===
                ProbeStatusValue.CoupledFormationResolved
                    ? 'coupled'
                    : 'single',
            payload: {
                emuIds: effectiveKnownGroup.emuIds,
                trackingMutations
            }
        });
        logger.info(
            `resolved_from_status trainCode=${formatTrainCode(args.trainCode)} probedTrainCode=${formatTrainCode(probedTrainCode)} mainEmuCode=${mainEmuCode} status=${effectiveKnownGroup.finalStatus} emuCodes=${effectiveKnownGroup.emuIds.length} attemptedTrainCodes=${allTrainCodes.length}`
        );
        return;
    }

    if (
        await tryReuseHistoricalProbeStatus(
            args,
            trainKey,
            mainEmuId,
            allTrainCodes,
            nowSeconds
        )
    ) {
        return;
    }

    const trackingMutations = persistProbeTrackingRows({
        trainCodes: allTrainCodes,
        emuIds: [mainEmuId],
        startStation: args.startStation,
        endStation: args.endStation,
        startAt: args.startAt,
        endAt: args.endAt,
        status: ProbeStatusValue.PendingCouplingDetection
    });
    markEmuCodesAssignedToday(
        [mainEmuId],
        trainKey,
        buildRunningEmuGroupKey(
            args.trainCode,
            args.trainInternalCode,
            args.startAt
        ),
        args.startAt,
        nowSeconds
    );
    markQueriedTrainKey(trainKey);

    const detectionTaskId = queueCoupledDetectionTask(mainRecord);
    recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
        serviceDate,
        startAt: args.startAt,
        emuId: mainEmuId,
        eventType: 'pending_coupling_detection',
        result: 'queued',
        linkedSchedulerTaskId: detectionTaskId,
        payload: {
            bureau: mainRecord.bureau,
            model: mainRecord.model,
            attemptedTrainCodes: allTrainCodes,
            trackingMutations
        }
    });
    logger.info(
        `pending_coupling_detection trainCode=${formatTrainCode(args.trainCode)} probedTrainCode=${formatTrainCode(probedTrainCode)} mainEmuCode=${mainEmuCode} detectionTaskId=${detectionTaskId} attemptedTrainCodes=${allTrainCodes.length}`
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
