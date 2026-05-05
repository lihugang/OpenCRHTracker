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
    deleteDailyRoutesByTrainCodeInRange,
    insertDailyEmuRoute,
    listDailyRoutesByEmuCodeInRange,
    listDailyRoutesByTrainCodeInRange,
    type DailyEmuRouteRow
} from '~/server/services/emuRoutesStore';
import { notifyLookupStatusChanges } from '~/server/services/eventNotificationService';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import { enqueueTask } from '~/server/services/taskQueue';
import { DETECT_COUPLED_EMU_GROUP_TASK_EXECUTOR } from '~/server/services/taskExecutors/detectCoupledEmuGroupTaskExecutor';
import {
    applyResolvedProbeResult,
    queueCoupledDetectionTask
} from '~/server/services/taskExecutors/probeResolutionShared';
import {
    markCurrentTrainProvenanceTaskSkipped,
    recordCurrentTrainProvenanceEventsForTrainCodes
} from '~/server/services/trainProvenanceRecorder';
import {
    getTodayScheduleProbeGroupByTrainCode,
    type TodayScheduleProbeGroup
} from '~/server/services/todayScheduleCache';
import { getHistoricalRecentEmuCodesByTrainCode } from '~/server/services/historicalRecentTrainEmuIndexStore';
import fetchEMUInfoByRoute from '~/server/utils/12306/network/fetchEMUInfoByRoute';
import fetchEMUInfoBySeatCode, {
    type FetchSeatCodeFailureResult
} from '~/server/utils/12306/network/fetchEMUInfoBySeatCode';
import fetchRouteInfo from '~/server/utils/12306/network/fetchRouteInfo';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import parseEmuCode from '~/server/utils/12306/parseEmuCode';
import uniqueNormalizedCodes from '~/server/utils/12306/uniqueNormalizedCodes';
import getCurrentDateString, {
    formatShanghaiDateString
} from '~/server/utils/date/getCurrentDateString';
import {
    formatShanghaiDateTime,
    getShanghaiDayStartUnixSeconds
} from '~/server/utils/date/shanghaiDateTime';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

export const PROBE_TRAIN_DEPARTURE_TASK_EXECUTOR = 'probe_train_departure';

const logger = getLogger('task-executor:probe-train-departure');
const MAX_REQUEUE_TRAIN_CODES = 8;

interface ProbeTrainDepartureTaskArgs {
    trainCode: string;
    trainInternalCode: string;
    allCodes: string[];
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
    emuCodes: string[];
    finalStatus: ProbeStatusValue;
}

interface ClearedOverlapState {
    deletedDailyRouteRows: number;
    deletedProbeStatusRows: number;
    clearedTrainKeys: string[];
    affectedEmuCodes: string[];
}

type RouteProbeResult = NonNullable<
    Awaited<ReturnType<typeof fetchEMUInfoByRoute>>
>;

interface SuccessfulRouteProbe {
    probedTrainCode: string;
    routeProbeResult: RouteProbeResult;
}

type ConflictGroupRouteState = 'running' | 'not_running' | 'request_failed';

interface ConflictGroupValidationResult {
    group: TodayScheduleProbeGroup;
    state: ConflictGroupRouteState;
    runningTrainCode: string;
    requestFailedTrainCodes: string[];
    notRunningTrainCodes: string[];
}

interface TrainProvenanceConflictCurrentGroupPayload {
    trainCodes: string[];
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
    runningTrainCode: string;
    requestFailedTrainCodes: string[];
    notRunningTrainCodes: string[];
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
    seatTrainCode: string;
    seatInternalCode: string;
    seatStartAt: number;
    seatCodeFailureDetail?: FetchSeatCodeFailureResult | null;
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
        typeof body.trainCode === 'string' ? normalizeCode(body.trainCode) : '';
    if (trainCode.length === 0) {
        throw new Error('task arguments trainCode must be a non-empty string');
    }

    const trainInternalCode =
        typeof body.trainInternalCode === 'string'
            ? normalizeCode(body.trainInternalCode)
            : '';

    const allCodes = Array.isArray(body.allCodes)
        ? uniqueNormalizedCodes(
              body.allCodes.filter(
                  (item): item is string => typeof item === 'string'
              )
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
    trainCodes: string[],
    emuCodes: string[],
    startStation: string,
    endStation: string,
    startAt: number,
    endAt: number
): void {
    for (const trainCode of trainCodes) {
        for (const emuCode of emuCodes) {
            insertDailyEmuRoute(
                trainCode,
                emuCode,
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
    const allCodes = uniqueNormalizedCodes([args.trainCode, ...args.allCodes]);
    return {
        trainKey: buildTrainKey(
            args.trainCode,
            args.trainInternalCode,
            args.startAt
        ),
        trainCode: args.trainCode,
        trainInternalCode: args.trainInternalCode,
        allCodes,
        bureauCode: '',
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
        trainKey: buildTrainKey(row.train_code, '', row.start_at),
        trainCode: row.train_code,
        trainInternalCode: '',
        allCodes: [row.train_code],
        bureauCode: '',
        trainDepartment: '',
        passengerDepartment: '',
        startStation: row.start_station_name,
        endStation: row.end_station_name,
        startAt: row.start_at,
        endAt: row.end_at,
        updatedAt: null
    };
}

function getGroupTrainCodes(group: TodayScheduleProbeGroup): string[] {
    return uniqueNormalizedCodes([group.trainCode, ...group.allCodes]);
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
    return uniqueNormalizedCodes(group.allCodes).join(' / ');
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
    emuCodes: string[],
    assets: Awaited<ReturnType<typeof loadProbeAssets>>
): Array<{ bureau: string; model: string }> {
    const detectionGroups = new Map<
        string,
        { bureau: string; model: string }
    >();

    for (const emuCode of emuCodes) {
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
    mainEmuCode: string,
    currentGroup: TodayScheduleProbeGroup,
    dayStart: number,
    nextDayStart: number
): TodayScheduleProbeGroup[] {
    const overlappingGroups = new Map<string, TodayScheduleProbeGroup>();
    const existingRows = listDailyRoutesByEmuCodeInRange(
        mainEmuCode,
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
    emuCodes: string[],
    deletedTrainCodes: Set<string>,
    dayStart: number,
    nextDayStart: number
): number {
    let downgradedProbeStatusRows = 0;

    for (const emuCode of uniqueNormalizedCodes(emuCodes)) {
        const startAts = new Set<number>();
        for (const row of listProbeStatusByEmuCodeInRange(
            emuCode,
            dayStart,
            nextDayStart
        )) {
            if (deletedTrainCodes.has(normalizeCode(row.train_code))) {
                continue;
            }

            startAts.add(row.start_at);
        }

        for (const startAt of startAts) {
            downgradedProbeStatusRows += updateProbeStatusByEmuCode(
                emuCode,
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
    const affectedEmuCodes = new Set<string>();
    const clearedTrainKeys: string[] = [];
    let deletedDailyRouteRows = 0;
    let deletedProbeStatusRows = 0;

    for (const group of groups) {
        clearQueriedTrainKey(group.trainKey);
        clearRunningEmuStateByTrainKey(group.trainKey).forEach((emuCode) =>
            affectedEmuCodes.add(emuCode)
        );
        clearedTrainKeys.push(group.trainKey);

        for (const trainCode of uniqueNormalizedCodes(group.allCodes)) {
            listDailyRoutesByTrainCodeInRange(
                trainCode,
                dayStart,
                nextDayStart
            ).forEach((row) => affectedEmuCodes.add(row.emu_code));
            listProbeStatusByTrainCodeInRange(
                trainCode,
                dayStart,
                nextDayStart
            ).forEach((row) => affectedEmuCodes.add(row.emu_code));

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
        Array.from(affectedEmuCodes),
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
        affectedEmuCodes: Array.from(affectedEmuCodes)
    };
}

function clearNotRunningGroups(
    groups: TodayScheduleProbeGroup[],
    dayStart: number,
    nextDayStart: number,
    assets: Awaited<ReturnType<typeof loadProbeAssets>>,
    extraAffectedEmuCodesByTrainKey: Map<string, string[]> = new Map()
): ClearedNotRunningState {
    const affectedEmuCodes = new Set<string>();
    const deletedTrainCodes = new Set<string>();
    const clearedTrainKeys: string[] = [];
    let deletedDailyRouteRows = 0;
    let deletedProbeStatusRows = 0;

    for (const group of groups) {
        clearQueriedTrainKey(group.trainKey);
        clearRunningEmuStateByTrainKey(group.trainKey).forEach((emuCode) =>
            affectedEmuCodes.add(emuCode)
        );
        clearedTrainKeys.push(group.trainKey);

        for (const extraEmuCode of extraAffectedEmuCodesByTrainKey.get(
            group.trainKey
        ) ?? []) {
            const normalizedEmuCode = normalizeCode(extraEmuCode);
            if (normalizedEmuCode.length > 0) {
                affectedEmuCodes.add(normalizedEmuCode);
            }
        }

        for (const trainCode of getGroupTrainCodes(group)) {
            deletedTrainCodes.add(trainCode);
            listDailyRoutesByTrainCodeInRange(
                trainCode,
                dayStart,
                nextDayStart
            ).forEach((row) => affectedEmuCodes.add(row.emu_code));
            listProbeStatusByTrainCodeInRange(
                trainCode,
                dayStart,
                nextDayStart
            ).forEach((row) => affectedEmuCodes.add(row.emu_code));

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

    const normalizedAffectedEmuCodes = Array.from(affectedEmuCodes);
    const downgradedProbeStatusRows = downgradeAffectedProbeStatuses(
        normalizedAffectedEmuCodes,
        deletedTrainCodes,
        dayStart,
        nextDayStart
    );

    for (const detectionGroup of collectAffectedDetectionGroups(
        normalizedAffectedEmuCodes,
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
        affectedEmuCodes: normalizedAffectedEmuCodes,
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
    currentEmuCode: string,
    startAt: number
): KnownStatusGroup {
    const emuCodes = new Set<string>([currentEmuCode]);
    let finalStatus: ProbeStatusValue = rows.some(
        (row) => row.status === ProbeStatusValue.CoupledFormationResolved
    )
        ? ProbeStatusValue.CoupledFormationResolved
        : ProbeStatusValue.SingleFormationResolved;

    for (const row of rows) {
        emuCodes.add(row.emu_code);
    }

    if (finalStatus === ProbeStatusValue.CoupledFormationResolved) {
        for (const row of rows) {
            const relatedRows = listProbeStatusByTrainCode(
                row.train_code,
                startAt
            );
            for (const relatedRow of relatedRows) {
                emuCodes.add(relatedRow.emu_code);
            }
        }
    }

    return {
        emuCodes: Array.from(emuCodes),
        finalStatus
    };
}

function collectKnownStatusGroupForServiceDate(
    rows: ProbeStatusRow[],
    currentEmuCode: string,
    startAt: number,
    serviceDate: string
): KnownStatusGroup {
    const { dayStart, nextDayStart } = getCurrentDayWindow();
    const emuCodes = new Set<string>([currentEmuCode]);
    let finalStatus: ProbeStatusValue = rows.some(
        (row) => row.status === ProbeStatusValue.CoupledFormationResolved
    )
        ? ProbeStatusValue.CoupledFormationResolved
        : ProbeStatusValue.SingleFormationResolved;

    for (const row of rows) {
        emuCodes.add(row.emu_code);
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
                emuCodes.add(relatedRow.emu_code);
            }
        }
    }

    return {
        emuCodes: Array.from(emuCodes),
        finalStatus
    };
}

function getResolvedCurrentStatusRows(
    mainEmuCode: string,
    startAt: number
): ProbeStatusRow[] {
    const directRows = listProbeStatusByEmuCode(mainEmuCode, startAt);
    if (
        directRows.some(
            (row) =>
                row.status === ProbeStatusValue.SingleFormationResolved ||
                row.status === ProbeStatusValue.CoupledFormationResolved
        )
    ) {
        return directRows;
    }

    const assignedState = getAssignedEmuState(mainEmuCode);
    if (!assignedState || assignedState.startAt !== startAt) {
        return [];
    }

    const { dayStart, nextDayStart } = getCurrentDayWindow();
    const serviceDate = formatShanghaiDateString(startAt * 1000);
    return listProbeStatusByEmuCodeInRange(
        mainEmuCode,
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
    emuCodes: string[],
    dayStart: number,
    nextDayStart: number
): ProbeStatusRow[] {
    const rowsByKey = new Map<string, ProbeStatusRow>();

    for (const emuCode of uniqueNormalizedCodes(emuCodes)) {
        for (const row of listProbeStatusByEmuCodeInRange(
            emuCode,
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
                row.train_code,
                row.emu_code,
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
    allTrainCodes: string[],
    mainEmuCode: string,
    nowSeconds: number
): Promise<boolean> {
    if (args.trainInternalCode.length === 0) {
        return false;
    }

    const assignedEmuCodes = listAssignedEmuCodesByTrainKey(trainKey).filter(
        (emuCode) => emuCode !== mainEmuCode
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

    const mergedFromEmuCodes = uniqueNormalizedCodes(
        resolvedRows.map((row) => row.emu_code)
    ).filter((emuCode) => emuCode !== mainEmuCode);
    if (mergedFromEmuCodes.length === 0) {
        return false;
    }

    const mergedEmuCodes = uniqueNormalizedCodes([
        mainEmuCode,
        ...mergedFromEmuCodes
    ]);
    if (mergedEmuCodes.length <= 1) {
        return false;
    }

    const mergedFromTrainCodes = uniqueNormalizedCodes(
        resolvedRows.map((row) => row.train_code)
    );
    const mergedTrainCodes = uniqueNormalizedCodes([
        ...allTrainCodes,
        ...mergedFromTrainCodes
    ]);

    await applyResolvedResult(
        args,
        trainKey,
        mergedTrainCodes,
        mergedEmuCodes,
        ProbeStatusValue.CoupledFormationResolved,
        nowSeconds
    );
    recordCurrentTrainProvenanceEventsForTrainCodes(mergedTrainCodes, {
        serviceDate: formatShanghaiDateString(args.startAt * 1000),
        startAt: args.startAt,
        emuCode: mainEmuCode,
        eventType: 'resolved_from_status',
        result: 'coupled',
        payload: {
            source: 'internal_code_auto_merge',
            emuCodes: mergedEmuCodes,
            mergedFromEmuCodes,
            mergedFromTrainCodes
        }
    });
    logger.info(
        `resolved_internal_code_auto_merge trainCode=${args.trainCode} trainInternalCode=${args.trainInternalCode} mainEmuCode=${mainEmuCode} mergedEmuCodes=${mergedEmuCodes.join('/')} mergedTrainCodes=${mergedTrainCodes.join('/')} assignedEmuCodes=${assignedEmuCodes.join('/')}`
    );
    return true;
}

async function validateConflictGroupRunningState(
    group: TodayScheduleProbeGroup
): Promise<ConflictGroupValidationResult> {
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
    trainCodes: string[],
    mainEmuCode: string
): string[] {
    const normalizedMainEmuCode = normalizeCode(mainEmuCode);
    if (normalizedMainEmuCode.length === 0) {
        return [];
    }

    const matchedTrainCodes: string[] = [];
    for (const trainCode of uniqueNormalizedCodes(trainCodes)) {
        if (
            getHistoricalRecentEmuCodesByTrainCode(trainCode).includes(
                normalizedMainEmuCode
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
    trainCodes: string[]
): Promise<TodayTrainCodesValidationResult> {
    const requestFailedTrainCodes: string[] = [];
    const notRunningTrainCodes: string[] = [];

    for (const trainCode of uniqueNormalizedCodes(trainCodes)) {
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
        runningTrainCode: '',
        requestFailedTrainCodes,
        notRunningTrainCodes
    };
}

async function verifySeatCodeAgainstCurrentTask(
    assets: Awaited<ReturnType<typeof loadProbeAssets>>,
    trainInternalCode: string,
    trainCodes: string[],
    mainEmuCode: string
): Promise<SeatCodeVerificationResult> {
    const parsedMainEmuCode = parseEmuCode(mainEmuCode);
    if (!parsedMainEmuCode?.trainSetNo) {
        return {
            state: 'unavailable',
            reason: 'main_emu_code_invalid',
            seatTrainCode: '',
            seatInternalCode: '',
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
            seatTrainCode: '',
            seatInternalCode: '',
            seatStartAt: 0
        };
    }

    const seatCodeResult = await fetchEMUInfoBySeatCode(seatCode);
    if (seatCodeResult.status !== 'success') {
        return {
            state: 'unavailable',
            reason: toSeatCodeRequestFailedReason(seatCodeResult),
            seatTrainCode: '',
            seatInternalCode: '',
            seatStartAt: 0,
            seatCodeFailureDetail: seatCodeResult
        };
    }

    const seatTrainCode = normalizeCode(seatCodeResult.route.code);
    const seatInternalCode = normalizeCode(seatCodeResult.route.internalCode);
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

    const normalizedTrainInternalCode = normalizeCode(trainInternalCode);
    if (normalizedTrainInternalCode.length > 0) {
        return {
            state:
                seatInternalCode === normalizedTrainInternalCode
                    ? 'matched'
                    : 'mismatch',
            reason:
                seatInternalCode === normalizedTrainInternalCode
                    ? 'matched_internal_code'
                    : 'seat_internal_code_mismatch',
            seatTrainCode,
            seatInternalCode,
            seatStartAt
        };
    }

    const normalizedTrainCodes = uniqueNormalizedCodes(trainCodes);
    return {
        state: normalizedTrainCodes.includes(seatTrainCode)
            ? 'matched'
            : 'mismatch',
        reason: normalizedTrainCodes.includes(seatTrainCode)
            ? 'matched_train_code'
            : 'seat_train_code_mismatch',
        seatTrainCode,
        seatInternalCode,
        seatStartAt
    };
}

async function tryResolveOverlappingRoutes(
    args: ProbeTrainDepartureTaskArgs,
    mainEmuCode: string,
    assets: Awaited<ReturnType<typeof loadProbeAssets>>,
    nowSeconds: number
): Promise<boolean> {
    const { dayStart, nextDayStart } = getCurrentDayWindow();
    const currentGroup =
        getTodayScheduleProbeGroupByTrainCode(args.trainCode) ??
        buildFallbackGroupFromArgs(args);
    let overlappingGroups = collectOverlappingGroups(
        mainEmuCode,
        currentGroup,
        dayStart,
        nextDayStart
    );
    if (overlappingGroups.length === 0) {
        return false;
    }

    const validationResults: ConflictGroupValidationResult[] = [];
    for (const group of [currentGroup, ...overlappingGroups]) {
        validationResults.push(await validateConflictGroupRunningState(group));
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
        const extraAffectedEmuCodesByTrainKey = new Map<string, string[]>();
        if (hasGroupTrainKey(notRunningGroups, currentGroup.trainKey)) {
            extraAffectedEmuCodesByTrainKey.set(currentGroup.trainKey, [
                mainEmuCode
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
            `overlap_drop_not_running conflictEmuCode=${mainEmuCode} droppedGroups=${formatTrainCodeGroups(notRunningGroups)} notRunningTrainCodes=${uniqueNormalizedCodes(notRunningTrainCodes).join(',')} requestFailedTrainCodes=${uniqueNormalizedCodes(requestFailedTrainCodes).join(',')} affectedEmuCodes=${clearedNotRunningState.affectedEmuCodes.join(',')} deletedDailyRouteRows=${clearedNotRunningState.deletedDailyRouteRows} deletedProbeStatusRows=${clearedNotRunningState.deletedProbeStatusRows} downgradedProbeStatusRows=${clearedNotRunningState.downgradedProbeStatusRows}`
        );
        const allConflictGroups = [currentGroup, ...overlappingGroups];
        recordTrainProvenanceForEachGroup(notRunningGroups, (group) => ({
            serviceDate: getCurrentDateString(),
            emuCode: mainEmuCode,
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
                notRunningTrainCodes:
                    uniqueNormalizedCodes(notRunningTrainCodes),
                requestFailedTrainCodes: uniqueNormalizedCodes(
                    requestFailedTrainCodes
                ),
                affectedEmuCodes: clearedNotRunningState.affectedEmuCodes,
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
            mainEmuCode,
            currentGroup,
            dayStart,
            nextDayStart
        );
        if (overlappingGroups.length === 0) {
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
        `overlap_requeue conflictEmuCode=${mainEmuCode} conflictGroups=${formatTrainCodeGroups(overlappingGroups)} conflictTimeRanges=${formatOverlapTimeRanges(currentGroup, overlappingGroups)} notRunningTrainCodes=${uniqueNormalizedCodes(notRunningTrainCodes).join(',')} requestFailedTrainCodes=${uniqueNormalizedCodes(requestFailedTrainCodes).join(',')} requeuedGroups=${formatTrainCodeGroups(Array.from(impactedGroups.values()))} requeuedEmuCodes=${clearedState.affectedEmuCodes.join(',')} deletedDailyRouteRows=${clearedState.deletedDailyRouteRows} deletedProbeStatusRows=${clearedState.deletedProbeStatusRows} requeueTaskIds=${taskIds.join(',')}`
    );
    const impactedGroupItems = Array.from(impactedGroups.values());
    recordTrainProvenanceForEachGroup(impactedGroupItems, (group) => ({
        serviceDate: getCurrentDateString(),
        emuCode: mainEmuCode,
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
            notRunningTrainCodes: uniqueNormalizedCodes(notRunningTrainCodes),
            requestFailedTrainCodes: uniqueNormalizedCodes(
                requestFailedTrainCodes
            ),
            requeuedTrainKeys: impactedGroupItems.map(
                (candidate) => candidate.trainKey
            ),
            requeuedTaskIds: taskIds,
            affectedEmuCodes: clearedState.affectedEmuCodes,
            deletedDailyRouteRows: clearedState.deletedDailyRouteRows,
            deletedProbeStatusRows: clearedState.deletedProbeStatusRows
        }
    }));
    markCurrentTrainProvenanceTaskSkipped('overlap_requeued');
    return true;
}

function collectLookupStatusNotificationCandidates(
    allTrainCodes: string[],
    allEmuCodes: string[],
    startAt: number,
    status: ProbeStatusValue
) {
    return [
        ...uniqueNormalizedCodes(allTrainCodes).map((targetId) => ({
            targetType: 'train' as const,
            targetId,
            startAt,
            previousStatus: getProbeStatusByTrainCodeValue(targetId, startAt),
            nextStatus: status
        })),
        ...uniqueNormalizedCodes(allEmuCodes).map((targetId) => ({
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
    allTrainCodes: string[],
    allEmuCodes: string[],
    status: ProbeStatusValue,
    nowSeconds: number
): Promise<void> {
    await applyResolvedProbeResult({
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
    mainEmuCode: string,
    allTrainCodes: string[],
    nowSeconds: number
): Promise<boolean> {
    const latestResolvedRow = getLatestResolvedProbeStatusByEmuCodeBefore(
        mainEmuCode,
        args.startAt
    );
    if (!latestResolvedRow) {
        return false;
    }

    const historicalRows = listProbeStatusByEmuCode(
        mainEmuCode,
        latestResolvedRow.start_at
    );
    if (historicalRows.length === 0) {
        return false;
    }

    const knownGroup = collectKnownStatusGroup(
        historicalRows,
        mainEmuCode,
        latestResolvedRow.start_at
    );
    const historicalTrainCodes = uniqueNormalizedCodes(
        historicalRows.map((row) => row.train_code)
    );
    const allEmuCodes =
        knownGroup.emuCodes.length > 0 ? knownGroup.emuCodes : [mainEmuCode];
    if (
        latestResolvedRow.status ===
            ProbeStatusValue.CoupledFormationResolved &&
        (knownGroup.finalStatus !== ProbeStatusValue.CoupledFormationResolved ||
            allEmuCodes.length <= 1)
    ) {
        recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
            serviceDate: formatShanghaiDateString(args.startAt * 1000),
            startAt: args.startAt,
            emuCode: mainEmuCode,
            eventType: 'historical_reuse_rejected',
            result: 'incomplete_group',
            payload: {
                historicalStartAt: latestResolvedRow.start_at,
                historicalStatus: latestResolvedRow.status,
                knownFinalStatus: knownGroup.finalStatus,
                historicalTrainCodes,
                emuCodes: allEmuCodes
            }
        });
        logger.warn(
            `reuse_historical_status_incomplete trainCode=${args.trainCode} mainEmuCode=${mainEmuCode} historicalStartAt=${latestResolvedRow.start_at}`
        );
        return false;
    }

    await applyResolvedResult(
        args,
        trainKey,
        allTrainCodes,
        allEmuCodes,
        knownGroup.finalStatus,
        nowSeconds
    );
    logger.info(
        `reuse_historical_status trainCode=${args.trainCode} mainEmuCode=${mainEmuCode} historicalStartAt=${latestResolvedRow.start_at} status=${knownGroup.finalStatus} emuCodes=${allEmuCodes.length}`
    );
    recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
        serviceDate: formatShanghaiDateString(args.startAt * 1000),
        startAt: args.startAt,
        emuCode: mainEmuCode,
        eventType: 'historical_reuse_selected',
        result:
            knownGroup.finalStatus === ProbeStatusValue.CoupledFormationResolved
                ? 'coupled'
                : 'single',
        payload: {
            historicalStartAt: latestResolvedRow.start_at,
            historicalStatus: latestResolvedRow.status,
            historicalTrainCodes,
            emuCodes: allEmuCodes
        }
    });
    return true;
}

async function probeEmuByTrainCodes(
    candidateTrainCodes: string[]
): Promise<SuccessfulRouteProbe | null> {
    for (const candidateTrainCode of candidateTrainCodes) {
        const routeProbeResult = await fetchEMUInfoByRoute(candidateTrainCode);
        if (!routeProbeResult) {
            continue;
        }

        const mainEmuCode = normalizeCode(routeProbeResult.emu.code);
        if (mainEmuCode.length === 0) {
            logger.warn(
                `route_probe_empty_emu_code trainCode=${candidateTrainCode}`
            );
            continue;
        }

        const parsedMainEmuCode = parseEmuCode(mainEmuCode);
        if (!parsedMainEmuCode?.trainSetNo) {
            logger.warn(
                `route_probe_invalid_emu_code trainCode=${candidateTrainCode} mainEmuCode=${mainEmuCode}`
            );
            continue;
        }

        return {
            probedTrainCode: candidateTrainCode,
            routeProbeResult
        };
    }

    return null;
}

async function executeProbeTrainDepartureTaskInternal(
    rawArgs: unknown
): Promise<void> {
    ensureProbeStateForToday();
    const args = parseTaskArgs(rawArgs);
    const nowSeconds = getNowSeconds();
    const serviceDate = formatShanghaiDateString(args.startAt * 1000);

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
            `skip already_queried trainCode=${args.trainCode} trainInternalCode=${args.trainInternalCode} startAt=${args.startAt}`
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
            `skip_non_current_schedule trainCode=${args.trainCode} startAt=${args.startAt}`
        );
        return;
    }

    const allTrainCodes = uniqueNormalizedCodes([
        args.trainCode,
        ...args.allCodes
    ]);
    const successfulRouteProbe = await probeEmuByTrainCodes(allTrainCodes);
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
                `route_probe_failed_requeue trainCode=${args.trainCode} retry=${args.retry} nextRetry=${nextRetry} nextTaskId=${nextTaskId} attemptedTrainCodes=${allTrainCodes.join(',')}`
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
        logger.warn(
            `route_probe_failed_exhausted trainCode=${args.trainCode} retry=${args.retry} attemptedTrainCodes=${allTrainCodes.join(',')}`
        );
        return;
    }

    const { probedTrainCode, routeProbeResult } = successfulRouteProbe;
    const mainEmuCode = normalizeCode(routeProbeResult.emu.code);
    recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
        serviceDate,
        startAt: args.startAt,
        emuCode: mainEmuCode,
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
        collectHistoricalRecentMatchingTrainCodes(allTrainCodes, mainEmuCode);

    if (historicalRecentMatchingTrainCodes.length > 0) {
        const todayTrainCodesValidation =
            await validateTodayRunningForTrainCodes(allTrainCodes);
        if (todayTrainCodesValidation.state === 'not_running') {
            recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
                serviceDate,
                startAt: args.startAt,
                emuCode: mainEmuCode,
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
                `skip_historical_recent_same_assignment_not_running trainCode=${args.trainCode} probedTrainCode=${probedTrainCode} mainEmuCode=${mainEmuCode} historicalRecentMatchedTrainCodes=${historicalRecentMatchingTrainCodes.join(',')} checkedTrainCodes=${allTrainCodes.join(',')} notRunningTrainCodes=${todayTrainCodesValidation.notRunningTrainCodes.join(',')}`
            );
            return;
        }

        if (todayTrainCodesValidation.state === 'running') {
            const seatCodeVerification = await verifySeatCodeAgainstCurrentTask(
                assets,
                args.trainInternalCode,
                allTrainCodes,
                mainEmuCode
            );
            if (seatCodeVerification.state === 'matched') {
                recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
                    serviceDate,
                    startAt: args.startAt,
                    emuCode: mainEmuCode,
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
                    `seat_verify_pass trainCode=${args.trainCode} probedTrainCode=${probedTrainCode} mainEmuCode=${mainEmuCode} runningTrainCode=${todayTrainCodesValidation.runningTrainCode} reason=${seatCodeVerification.reason} seatTrainCode=${seatCodeVerification.seatTrainCode} seatInternalCode=${seatCodeVerification.seatInternalCode} seatStartAt=${seatCodeVerification.seatStartAt} historicalRecentMatchedTrainCodes=${historicalRecentMatchingTrainCodes.join(',')}`
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
                                emuCode: mainEmuCode,
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
                            `seat_verify_unavailable_requeue trainCode=${args.trainCode} probedTrainCode=${probedTrainCode} mainEmuCode=${mainEmuCode} runningTrainCode=${todayTrainCodesValidation.runningTrainCode} retry=${args.retry} nextRetry=${nextRetry} nextTaskId=${nextTaskId} delaySeconds=${overlapRetryDelaySeconds} reason=${seatCodeVerification.reason} historicalRecentMatchedTrainCodes=${historicalRecentMatchingTrainCodes.join(',')}`
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
                            emuCode: mainEmuCode,
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
                        `seat_verify_unavailable_exhausted trainCode=${args.trainCode} probedTrainCode=${probedTrainCode} mainEmuCode=${mainEmuCode} runningTrainCode=${todayTrainCodesValidation.runningTrainCode} retry=${args.retry} reason=${seatCodeVerification.reason} historicalRecentMatchedTrainCodes=${historicalRecentMatchingTrainCodes.join(',')}`
                    );
                    return;
                }

                recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
                    serviceDate,
                    startAt: args.startAt,
                    emuCode: mainEmuCode,
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
                    `seat_verify_unavailable_continue trainCode=${args.trainCode} probedTrainCode=${probedTrainCode} mainEmuCode=${mainEmuCode} runningTrainCode=${todayTrainCodesValidation.runningTrainCode} reason=${seatCodeVerification.reason} historicalRecentMatchedTrainCodes=${historicalRecentMatchingTrainCodes.join(',')}`
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
                    emuCode: mainEmuCode,
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
                    `seat_verify_mismatch_requeue trainCode=${args.trainCode} probedTrainCode=${probedTrainCode} mainEmuCode=${mainEmuCode} runningTrainCode=${todayTrainCodesValidation.runningTrainCode} retry=${args.retry} nextRetry=${nextRetry} nextTaskId=${nextTaskId} delaySeconds=${overlapRetryDelaySeconds} reason=${seatCodeVerification.reason} seatTrainCode=${seatCodeVerification.seatTrainCode} seatInternalCode=${seatCodeVerification.seatInternalCode} seatStartAt=${seatCodeVerification.seatStartAt} historicalRecentMatchedTrainCodes=${historicalRecentMatchingTrainCodes.join(',')}`
                );
                markCurrentTrainProvenanceTaskSkipped(
                    'seat_verification_mismatch_requeued'
                );
                return;
            } else {
                recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
                    serviceDate,
                    startAt: args.startAt,
                    emuCode: mainEmuCode,
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
                logger.warn(
                    `seat_verify_mismatch_exhausted trainCode=${args.trainCode} probedTrainCode=${probedTrainCode} mainEmuCode=${mainEmuCode} runningTrainCode=${todayTrainCodesValidation.runningTrainCode} retry=${args.retry} reason=${seatCodeVerification.reason} seatTrainCode=${seatCodeVerification.seatTrainCode} seatInternalCode=${seatCodeVerification.seatInternalCode} seatStartAt=${seatCodeVerification.seatStartAt} historicalRecentMatchedTrainCodes=${historicalRecentMatchingTrainCodes.join(',')}`
                );
                return;
            }
        }

        if (todayTrainCodesValidation.state === 'request_failed') {
            logger.info(
                `continue_historical_recent_same_assignment_request_failed trainCode=${args.trainCode} probedTrainCode=${probedTrainCode} mainEmuCode=${mainEmuCode} historicalRecentMatchedTrainCodes=${historicalRecentMatchingTrainCodes.join(',')} checkedTrainCodes=${allTrainCodes.join(',')} requestFailedTrainCodes=${todayTrainCodesValidation.requestFailedTrainCodes.join(',')} notRunningTrainCodes=${todayTrainCodesValidation.notRunningTrainCodes.join(',')}`
            );
        }
    }

    if (
        await tryResolveOverlappingRoutes(args, mainEmuCode, assets, nowSeconds)
    ) {
        return;
    }

    if (
        await tryAutoMergeResolvedInternalGroup(
            args,
            trainKey,
            allTrainCodes,
            mainEmuCode,
            nowSeconds
        )
    ) {
        return;
    }

    if (!mainRecord) {
        logger.warn(
            `main_emu_asset_not_found trainCode=${args.trainCode} mainEmuCode=${mainEmuCode}`
        );
        await applyResolvedResult(
            args,
            trainKey,
            allTrainCodes,
            [mainEmuCode],
            ProbeStatusValue.SingleFormationResolved,
            nowSeconds
        );
        recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
            serviceDate,
            startAt: args.startAt,
            emuCode: mainEmuCode,
            eventType: 'resolved_single',
            result: 'asset_missing',
            payload: {
                source: 'route_probe'
            }
        });
        return;
    }

    if (getProbeEmuMultipleStateFromRecord(mainRecord) === 'non_multiple') {
        await applyResolvedResult(
            args,
            trainKey,
            allTrainCodes,
            [mainEmuCode],
            ProbeStatusValue.SingleFormationResolved,
            nowSeconds
        );
        recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
            serviceDate,
            startAt: args.startAt,
            emuCode: mainEmuCode,
            eventType: 'resolved_single',
            result: 'non_multiple',
            payload: {
                source: 'asset_flag'
            }
        });
        logger.info(
            `resolved_single_non_multiple trainCode=${args.trainCode} probedTrainCode=${probedTrainCode} mainEmuCode=${mainEmuCode} attemptedTrainCodes=${allTrainCodes.length}`
        );
        return;
    }

    const existingRows = getResolvedCurrentStatusRows(
        mainEmuCode,
        args.startAt
    );
    if (existingRows.length > 0) {
        const knownGroup = collectKnownStatusGroup(
            existingRows,
            mainEmuCode,
            args.startAt
        );
        const effectiveKnownGroup = existingRows.every(
            (row) => row.start_at === args.startAt
        )
            ? knownGroup
            : collectKnownStatusGroupForServiceDate(
                  existingRows,
                  mainEmuCode,
                  args.startAt,
                  serviceDate
              );
        for (const emuCode of effectiveKnownGroup.emuCodes) {
            updateProbeStatusByEmuCode(
                emuCode,
                args.startAt,
                effectiveKnownGroup.finalStatus
            );
        }
        await applyResolvedResult(
            args,
            trainKey,
            allTrainCodes,
            effectiveKnownGroup.emuCodes.length > 0
                ? effectiveKnownGroup.emuCodes
                : [mainEmuCode],
            effectiveKnownGroup.finalStatus,
            nowSeconds
        );
        recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
            serviceDate,
            startAt: args.startAt,
            emuCode: mainEmuCode,
            eventType: 'resolved_from_status',
            result:
                effectiveKnownGroup.finalStatus ===
                ProbeStatusValue.CoupledFormationResolved
                    ? 'coupled'
                    : 'single',
            payload: {
                emuCodes: effectiveKnownGroup.emuCodes
            }
        });
        logger.info(
            `resolved_from_status trainCode=${args.trainCode} probedTrainCode=${probedTrainCode} mainEmuCode=${mainEmuCode} status=${effectiveKnownGroup.finalStatus} emuCodes=${effectiveKnownGroup.emuCodes.length} attemptedTrainCodes=${allTrainCodes.length}`
        );
        return;
    }

    if (
        await tryReuseHistoricalProbeStatus(
            args,
            trainKey,
            mainEmuCode,
            allTrainCodes,
            nowSeconds
        )
    ) {
        return;
    }

    for (const trainCode of allTrainCodes) {
        ensureProbeStatus(
            trainCode,
            mainEmuCode,
            args.startAt,
            ProbeStatusValue.PendingCouplingDetection
        );
    }
    persistDailyRoutes(
        allTrainCodes,
        [mainEmuCode],
        args.startStation,
        args.endStation,
        args.startAt,
        args.endAt
    );
    markEmuCodesAssignedToday(
        [mainEmuCode],
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
        emuCode: mainEmuCode,
        eventType: 'pending_coupling_detection',
        result: 'queued',
        linkedSchedulerTaskId: detectionTaskId,
        payload: {
            bureau: mainRecord.bureau,
            model: mainRecord.model,
            attemptedTrainCodes: allTrainCodes
        }
    });
    logger.info(
        `pending_coupling_detection trainCode=${args.trainCode} probedTrainCode=${probedTrainCode} mainEmuCode=${mainEmuCode} detectionTaskId=${detectionTaskId} attemptedTrainCodes=${allTrainCodes.length}`
    );
}

async function executeProbeTrainDepartureTask(rawArgs: unknown): Promise<void> {
    const parsedArgs = parseTaskArgs(rawArgs);
    await executeProbeTrainDepartureTaskInternal(parsedArgs);
}

export function registerProbeTrainDepartureTaskExecutor(): void {
    if (registered) {
        return;
    }

    registerTaskExecutor(PROBE_TRAIN_DEPARTURE_TASK_EXECUTOR, async (args) => {
        await executeProbeTrainDepartureTask(args);
    });
    registered = true;
    logger.info(`registered executor=${PROBE_TRAIN_DEPARTURE_TASK_EXECUTOR}`);
}
