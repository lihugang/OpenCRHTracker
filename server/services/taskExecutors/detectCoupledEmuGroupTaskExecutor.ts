import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import {
    hasRecentCoupledGroupDetection,
    markCoupledGroupDetected
} from '~/server/services/probeDetectionState';
import {
    buildRunningEmuGroupKey,
    buildTrainKey,
    clearAssignedEmuCodeByGroupKey,
    ensureProbeStateForToday,
    isEmuAssignedToday,
    listAssignedEmuCodesByGroupKey,
    markEmuCodesAssignedToday
} from '~/server/services/probeRuntimeState';
import {
    buildProbeAssetKey,
    getProbeEmuMultipleStateFromCode,
    loadProbeAssets,
    type EmuListRecord
} from '~/server/services/probeAssetStore';
import {
    deleteProbeStatusByTrainCodeAndEmuCodeAtStartAt,
    ensureProbeStatus,
    getProbeStatusByEmuCodeValue,
    getProbeStatusByTrainCodeValue,
    listProbeStatusByEmuCodeInRange,
    listProbeStatusByTrainCode,
    ProbeStatusValue,
    type ProbeStatusRow
} from '~/server/services/probeStatusStore';
import {
    deleteDailyRouteByTrainCodeAndEmuCodeAtStartAt,
    insertDailyEmuRoute
} from '~/server/services/emuRoutesStore';
import { notifyLookupStatusChanges } from '~/server/services/eventNotificationService';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import { rescheduleTaskUntilScheduleReady } from '~/server/services/scheduleReadinessGuard';
import {
    markCurrentTrainProvenanceTaskSkipped,
    recordCurrentCouplingScanCandidate,
    recordCurrentTrainProvenanceEvent,
    recordCurrentTrainProvenanceEventsForTrainCodes
} from '~/server/services/trainProvenanceRecorder';
import {
    getTodayScheduleCache,
    getSafeTodayScheduleProbeTrainCodes,
    getTodayScheduleProbeGroupByTrainCode,
    getTodayScheduleProbeGroupByTrainInternalCode,
    type TodayScheduleProbeGroup,
    type TodayScheduleRoute
} from '~/server/services/todayScheduleCache';
import { asEmuId, type EmuId } from '~/server/libs/database/emu';
import fetchEMUInfoBySeatCode, {
    type FetchSeatCodeFailureResult
} from '~/server/utils/12306/network/fetchEMUInfoBySeatCode';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import {
    trainCodeKey,
    type TrainCodeParts
} from '~/server/utils/12306/trainCode';
import { serviceDayToShanghaiDayStartUnixSeconds } from '~/server/utils/date/serviceDay';
import {
    unixSecondsToServiceDay,
    type ServiceDay
} from '~/server/utils/date/serviceDay';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import {
    ensureExternalEmuId,
    formatExternalEmuCode,
    formatExternalTrainCode,
    parseExternalTrainCodeOrThrow
} from '~/server/utils/internal/boundaries';

export const DETECT_COUPLED_EMU_GROUP_TASK_EXECUTOR =
    'detect_coupled_emu_group';

const logger = getLogger('task-executor:detect-coupled-emu-group');

interface DetectCoupledEmuGroupTaskArgs {
    bureau: string;
    model: string;
}

interface TrackedTrainGroup {
    group: TodayScheduleProbeGroup;
    trainCodes: TrainCodeParts[];
    rows: ProbeStatusRow[];
    knownEmuCodes: Set<EmuId>;
    finalStatus: ProbeStatusValue;
}

interface MatchedEmuScanRecord {
    emuId: EmuId;
    trainRepeat: string;
}

interface DirectHitTrainTarget {
    trainCodes: TrainCodeParts[];
    startAt: number;
    serviceDate: ServiceDay;
    scheduleGroup: TodayScheduleProbeGroup | null;
}

interface UntrackedResolvedGroup {
    trainCode: TrainCodeParts;
    trainInternalCode: string;
    startAt: number;
    endAt: number;
    emuTrainRepeatByCode: Map<EmuId, string>;
    candidates: Array<{
        candidateOrder: number;
        candidateEmuId: EmuId;
        trainRepeat: string;
    }>;
}

interface PersistedUntrackedGroupSummary {
    groupCount: number;
    singleCount: number;
    coupledCount: number;
}

interface AssignedCandidateScanState {
    shouldSkip: boolean;
    detail: {
        assignmentState: 'active' | 'expired' | 'unknown';
        trackedGroups: Array<{
            trainKey: string;
            trainCodes: TrainCodeParts[];
            startAt: number;
            endAt: number;
        }>;
        unresolvedTrainCodes: TrainCodeParts[];
        endAts: number[];
        nowSeconds: number;
    };
}

let registered = false;

function parseTaskArgs(raw: unknown): DetectCoupledEmuGroupTaskArgs {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new Error('task arguments must be an object');
    }

    const body = raw as {
        bureau?: unknown;
        model?: unknown;
    };
    const bureau = typeof body.bureau === 'string' ? body.bureau.trim() : '';
    const model =
        typeof body.model === 'string' ? normalizeCode(body.model) : '';
    if (bureau.length === 0 || model.length === 0) {
        throw new Error(
            'task arguments bureau or depot, and model must be non-empty'
        );
    }

    return {
        bureau,
        model
    };
}

function buildBureauAndModelKey(bureau: string, model: string): string {
    return `${bureau.trim()}#${normalizeCode(model)}`;
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

function getCurrentDayWindow(): {
    dayStart: number;
    nextDayStart: number;
} {
    const today = unixSecondsToServiceDay(getNowSeconds());
    const dayStart = serviceDayToShanghaiDayStartUnixSeconds(today);
    return {
        dayStart,
        nextDayStart: dayStart + 24 * 60 * 60
    };
}

function buildCandidateEmuCode(candidate: EmuListRecord): EmuId {
    return ensureExternalEmuId(`${candidate.model}-${candidate.trainSetNo}`);
}

function persistDailyRoutes(
    trainCodes: TrainCodeParts[],
    emuCodes: EmuId[],
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

function resolveScheduleRoute(
    trainCodes: TrainCodeParts[],
    scheduleRoutesByTrainCode: Map<string, TodayScheduleRoute>
): TodayScheduleRoute | null {
    for (const trainCode of trainCodes) {
        const route = scheduleRoutesByTrainCode.get(trainCodeKey(trainCode));
        if (route) {
            return route;
        }
    }

    return null;
}

function buildTrainStartKey(
    trainCode: TrainCodeParts,
    startAt: number
): string {
    return `${trainCodeKey(trainCode)}@${startAt}`;
}

function persistBackfilledCoupledRoutes(
    emuCodes: EmuId[],
    scheduleRoutesByTrainCode: Map<string, TodayScheduleRoute>
): void {
    if (emuCodes.length <= 1) {
        return;
    }

    const today = unixSecondsToServiceDay(getNowSeconds());
    const dayStart = serviceDayToShanghaiDayStartUnixSeconds(today);
    const nextDayStart = dayStart + 24 * 60 * 60;
    const candidateRows = new Map<
        string,
        { trainCode: TrainCodeParts; startAt: number }
    >();

    for (const emuCode of emuCodes) {
        const rows = listProbeStatusByEmuCodeInRange(
            emuCode,
            dayStart,
            nextDayStart
        );
        for (const row of rows) {
            const key = buildTrainStartKey(row.train_code, row.start_at);
            if (!candidateRows.has(key)) {
                candidateRows.set(key, {
                    trainCode: row.train_code,
                    startAt: row.start_at
                });
            }
        }
    }

    for (const candidate of candidateRows.values()) {
        const existingRows = listProbeStatusByTrainCode(
            candidate.trainCode,
            candidate.startAt
        );
        const scheduleRoute = scheduleRoutesByTrainCode.get(
            trainCodeKey(candidate.trainCode)
        );

        if (!scheduleRoute) {
            logger.warn(
                `backfill_schedule_cache_missing trainCode=${formatExternalTrainCode(candidate.trainCode)} startAt=${candidate.startAt}`
            );
        } else if (scheduleRoute.startAt !== candidate.startAt) {
            logger.warn(
                `backfill_schedule_cache_start_mismatch trainCode=${formatExternalTrainCode(candidate.trainCode)} scheduleStartAt=${scheduleRoute.startAt} probeStartAt=${candidate.startAt}`
            );
        }

        const startStation = scheduleRoute?.startStation ?? '';
        const endStation = scheduleRoute?.endStation ?? '';
        const endAt = scheduleRoute?.endAt ?? candidate.startAt;
        for (const emuCode of emuCodes) {
            if (
                existingRows.some((row) => row.emu_id === emuCode) &&
                existingRows.some(
                    (row) =>
                        row.emu_id === emuCode &&
                        row.status === ProbeStatusValue.CoupledFormationResolved
                )
            ) {
                continue;
            }

            ensureProbeStatus(
                candidate.trainCode,
                emuCode,
                candidate.startAt,
                ProbeStatusValue.CoupledFormationResolved
            );
            insertDailyEmuRoute(
                candidate.trainCode,
                emuCode,
                startStation,
                endStation,
                candidate.startAt,
                endAt
            );
        }
    }
}

function getTrackedGroupStatus(rows: ProbeStatusRow[]): ProbeStatusValue {
    if (
        rows.some(
            (row) => row.status === ProbeStatusValue.CoupledFormationResolved
        )
    ) {
        return ProbeStatusValue.CoupledFormationResolved;
    }

    if (
        rows.some(
            (row) => row.status === ProbeStatusValue.SingleFormationResolved
        )
    ) {
        return ProbeStatusValue.SingleFormationResolved;
    }

    return ProbeStatusValue.PendingCouplingDetection;
}

function resolveTrackedGroupByTrainCode(
    trainCode: TrainCodeParts,
    cache: Map<string, TrackedTrainGroup | null>
): TrackedTrainGroup | null {
    const cached = cache.get(trainCodeKey(trainCode));
    if (cached !== undefined) {
        return cached;
    }

    const group = getTodayScheduleProbeGroupByTrainCode(trainCode);
    if (!group) {
        cache.set(trainCodeKey(trainCode), null);
        return null;
    }

    const trainCodes = getSafeTodayScheduleProbeTrainCodes(group);
    const rowsByKey = new Map<string, ProbeStatusRow>();
    for (const code of trainCodes) {
        const rows = listProbeStatusByTrainCode(code, group.startAt);
        for (const row of rows) {
            rowsByKey.set(
                `${trainCodeKey(row.train_code)}#${formatExternalEmuCode(row.emu_id)}#${row.start_at}`,
                row
            );
        }
    }

    if (rowsByKey.size === 0) {
        for (const code of trainCodes) {
            cache.set(trainCodeKey(code), null);
        }
        return null;
    }

    const rows = Array.from(rowsByKey.values());
    const trackedGroup: TrackedTrainGroup = {
        group,
        trainCodes,
        rows,
        knownEmuCodes: new Set(rows.map((row) => row.emu_id)),
        finalStatus: getTrackedGroupStatus(rows)
    };

    for (const code of trainCodes) {
        cache.set(trainCodeKey(code), trackedGroup);
    }

    return trackedGroup;
}

function collectTrackedGroupHintsByEmuCode(
    emuId: EmuId,
    dayStart: number,
    nextDayStart: number,
    cache: Map<string, TrackedTrainGroup | null>
): {
    trainCodes: TrainCodeParts[];
    groupKeys: string[];
    startAts: number[];
} {
    const rows = listProbeStatusByEmuCodeInRange(emuId, dayStart, nextDayStart);
    const trainCodes = new Set<TrainCodeParts>();
    const groupKeys = new Set<string>();
    const startAts = new Set<number>();

    for (const row of rows) {
        startAts.add(row.start_at);
        const trackedGroup = resolveTrackedGroupByTrainCode(
            row.train_code,
            cache
        );
        if (trackedGroup) {
            for (const trainCode of trackedGroup.trainCodes) {
                trainCodes.add(trainCode);
            }
            groupKeys.add(trackedGroup.group.trainKey);
            startAts.add(trackedGroup.group.startAt);
            continue;
        }

        trainCodes.add(row.train_code);
    }

    return {
        trainCodes: Array.from(trainCodes).filter(
            (trainCode, index, all) =>
                all.findIndex(
                    (candidate) =>
                        trainCodeKey(candidate) === trainCodeKey(trainCode)
                ) === index
        ),
        groupKeys: Array.from(groupKeys),
        startAts: Array.from(startAts).sort((left, right) => left - right)
    };
}

function resolveAssignedCandidateScanState(
    emuId: EmuId,
    dayStart: number,
    nextDayStart: number,
    nowSeconds: number,
    cache: Map<string, TrackedTrainGroup | null>
): AssignedCandidateScanState {
    const rows = listProbeStatusByEmuCodeInRange(emuId, dayStart, nextDayStart);
    const trackedGroupsByKey = new Map<string, TrackedTrainGroup>();
    const unresolvedTrainCodes = new Set<TrainCodeParts>();

    for (const row of rows) {
        const trackedGroup = resolveTrackedGroupByTrainCode(
            row.train_code,
            cache
        );
        if (!trackedGroup) {
            unresolvedTrainCodes.add(row.train_code);
            continue;
        }

        trackedGroupsByKey.set(trackedGroup.group.trainKey, trackedGroup);
    }

    const trackedGroups = Array.from(trackedGroupsByKey.values());
    const activeGroups = trackedGroups.filter(
        (trackedGroup) => trackedGroup.group.endAt >= nowSeconds
    );
    const assignmentState =
        trackedGroups.length === 0
            ? 'unknown'
            : activeGroups.length > 0
              ? 'active'
              : 'expired';

    return {
        shouldSkip: assignmentState !== 'expired',
        detail: {
            assignmentState,
            trackedGroups: trackedGroups.map((trackedGroup) => ({
                trainKey: trackedGroup.group.trainKey,
                trainCodes: trackedGroup.trainCodes,
                startAt: trackedGroup.group.startAt,
                endAt: trackedGroup.group.endAt
            })),
            unresolvedTrainCodes: Array.from(unresolvedTrainCodes).filter(
                (trainCode, index, all) =>
                    all.findIndex(
                        (candidate) =>
                            trainCodeKey(candidate) === trainCodeKey(trainCode)
                    ) === index
            ),
            endAts: trackedGroups
                .map((trackedGroup) => trackedGroup.group.endAt)
                .sort((left, right) => left - right),
            nowSeconds
        }
    };
}

function collectPendingTrackedGroups(
    candidates: EmuListRecord[],
    dayStart: number,
    nextDayStart: number,
    cache: Map<string, TrackedTrainGroup | null>
): Map<string, TrackedTrainGroup> {
    const pendingGroups = new Map<string, TrackedTrainGroup>();

    for (const candidate of candidates) {
        const emuId = buildCandidateEmuCode(candidate);
        const rows = listProbeStatusByEmuCodeInRange(
            emuId,
            dayStart,
            nextDayStart
        );
        for (const row of rows) {
            if (row.status !== ProbeStatusValue.PendingCouplingDetection) {
                continue;
            }

            const trackedGroup = resolveTrackedGroupByTrainCode(
                row.train_code,
                cache
            );
            if (
                !trackedGroup ||
                trackedGroup.finalStatus !==
                    ProbeStatusValue.PendingCouplingDetection
            ) {
                continue;
            }

            pendingGroups.set(trackedGroup.group.trainKey, trackedGroup);
        }
    }

    return pendingGroups;
}

function resolveDirectHitTrainTarget(
    scannedTrainInternalCode: string,
    scannedTrainCode: TrainCodeParts,
    fallbackStartAt: number
): DirectHitTrainTarget | null {
    const normalizedTrainInternalCode = normalizeCode(scannedTrainInternalCode);
    if (normalizedTrainInternalCode.length > 0) {
        const internalCodeGroup = getTodayScheduleProbeGroupByTrainInternalCode(
            normalizedTrainInternalCode
        );
        if (internalCodeGroup) {
            return {
                trainCodes: [
                    internalCodeGroup.trainCode,
                    ...getSafeTodayScheduleProbeTrainCodes(internalCodeGroup)
                ].filter(
                    (code, index, codes) =>
                        codes.findIndex(
                            (candidate) =>
                                trainCodeKey(candidate) === trainCodeKey(code)
                        ) === index
                ),
                startAt: internalCodeGroup.startAt,
                serviceDate: unixSecondsToServiceDay(internalCodeGroup.startAt),
                scheduleGroup: internalCodeGroup
            };
        }
    }

    const scheduleGroup =
        getTodayScheduleProbeGroupByTrainCode(scannedTrainCode);
    if (scheduleGroup) {
        return {
            trainCodes: [
                scheduleGroup.trainCode,
                ...getSafeTodayScheduleProbeTrainCodes(scheduleGroup)
            ].filter(
                (code, index, codes) =>
                    codes.findIndex(
                        (candidate) =>
                            trainCodeKey(candidate) === trainCodeKey(code)
                    ) === index
            ),
            startAt: scheduleGroup.startAt,
            serviceDate: unixSecondsToServiceDay(scheduleGroup.startAt),
            scheduleGroup
        };
    }

    return {
        trainCodes: [scannedTrainCode],
        startAt: fallbackStartAt,
        serviceDate: unixSecondsToServiceDay(fallbackStartAt),
        scheduleGroup: null
    };
}

function recordDirectHitTrainProvenanceEvent(input: {
    bureau: string;
    model: string;
    candidateOrder: number;
    candidateEmuId: EmuId;
    scannedEmuId: EmuId;
    scannedTrainCode: TrainCodeParts;
    scannedTrainInternalCode: string;
    scannedStartAt: number;
    scannedEndAt: number;
    trainRepeat: string;
    trackedGroup: TrackedTrainGroup | null;
}): void {
    const target = resolveDirectHitTrainTarget(
        input.scannedTrainInternalCode,
        input.scannedTrainCode,
        input.scannedStartAt
    );
    if (!target || target.trainCodes.length === 0) {
        return;
    }

    recordCurrentTrainProvenanceEventsForTrainCodes(target.trainCodes, {
        serviceDate: target.serviceDate,
        startAt: target.startAt,
        emuId: input.scannedEmuId,
        relatedTrainCode: input.scannedTrainCode,
        relatedEmuId: input.candidateEmuId,
        eventType: 'coupling_scan_candidate_direct_hit',
        result: input.trackedGroup ? 'matched' : 'unmatched',
        payload: {
            bureau: input.bureau,
            model: input.model,
            candidateOrder: input.candidateOrder,
            candidateEmuId: input.candidateEmuId,
            directHitTrainCodes: target.trainCodes,
            scannedRoute: {
                code: input.scannedTrainCode,
                internalCode: input.scannedTrainInternalCode,
                startDay: unixSecondsToServiceDay(input.scannedStartAt),
                endDay: unixSecondsToServiceDay(input.scannedEndAt),
                startAt: input.scannedStartAt,
                endAt: input.scannedEndAt,
                trainRepeat: input.trainRepeat
            },
            scheduleGroup: target.scheduleGroup
                ? {
                      trainCode: target.scheduleGroup.trainCode,
                      trainInternalCode: target.scheduleGroup.trainInternalCode,
                      allCodes: target.scheduleGroup.allCodes,
                      startAt: target.scheduleGroup.startAt,
                      endAt: target.scheduleGroup.endAt,
                      startStation: target.scheduleGroup.startStation,
                      endStation: target.scheduleGroup.endStation
                  }
                : null,
            trackedGroup: input.trackedGroup
                ? {
                      trainCode: input.trackedGroup.group.trainCode,
                      trainInternalCode:
                          input.trackedGroup.group.trainInternalCode,
                      allCodes: input.trackedGroup.group.allCodes,
                      startAt: input.trackedGroup.group.startAt,
                      endAt: input.trackedGroup.group.endAt,
                      startStation: input.trackedGroup.group.startStation,
                      endStation: input.trackedGroup.group.endStation
                  }
                : null
        }
    });
}

async function scanUnassignedCandidates(
    bureau: string,
    model: string,
    candidates: EmuListRecord[],
    cache: Map<string, TrackedTrainGroup | null>,
    dayStart: number,
    nextDayStart: number,
    nowSeconds: number
): Promise<{
    matchedGroups: Map<string, TrackedTrainGroup>;
    matchedEmuScanRecordsByTrainKey: Map<string, Map<EmuId, string>>;
    untrackedGroups: Map<string, UntrackedResolvedGroup>;
    skippedAssignedCount: number;
    scannedCount: number;
    warningCount: number;
}> {
    const assets = await loadProbeAssets();
    const matchedGroups = new Map<string, TrackedTrainGroup>();
    const matchedEmuScanRecordsByTrainKey = new Map<
        string,
        Map<EmuId, string>
    >();
    const untrackedGroups = new Map<string, UntrackedResolvedGroup>();
    let skippedAssignedCount = 0;
    let scannedCount = 0;
    let warningCount = 0;

    for (const [index, candidate] of candidates.entries()) {
        const candidateOrder = index + 1;
        const candidateEmuId = buildCandidateEmuCode(candidate);
        const currentServiceDate = unixSecondsToServiceDay(getNowSeconds());

        if (isEmuAssignedToday(candidateEmuId)) {
            const assignedScanState = resolveAssignedCandidateScanState(
                candidateEmuId,
                dayStart,
                nextDayStart,
                nowSeconds,
                cache
            );
            if (assignedScanState.shouldSkip) {
                skippedAssignedCount += 1;
                recordCurrentCouplingScanCandidate({
                    candidateOrder,
                    serviceDate: currentServiceDate,
                    bureau,
                    model,
                    candidateEmuId,
                    status: 'skipped',
                    reason: 'already_assigned',
                    detail: assignedScanState.detail
                });
                continue;
            }

            recordCurrentCouplingScanCandidate({
                candidateOrder,
                serviceDate: currentServiceDate,
                bureau,
                model,
                candidateEmuId,
                status: 'pending',
                reason: 'already_assigned_expired',
                detail: assignedScanState.detail
            });
        }

        const seatCode = assets.qrcodeByModelAndTrainSetNo.get(
            buildProbeAssetKey(candidate.model, candidate.trainSetNo)
        );
        if (!seatCode) {
            recordCurrentCouplingScanCandidate({
                candidateOrder,
                serviceDate: currentServiceDate,
                bureau,
                model,
                candidateEmuId,
                status: 'skipped',
                reason: 'seat_code_missing'
            });
            continue;
        }

        const seatCodeResult = await fetchEMUInfoBySeatCode(seatCode);
        if (seatCodeResult.status !== 'success') {
            recordCurrentCouplingScanCandidate({
                candidateOrder,
                serviceDate: currentServiceDate,
                bureau,
                model,
                candidateEmuId,
                status: 'request_failed',
                reason: toSeatCodeRequestFailedReason(seatCodeResult),
                detail: seatCodeResult
            });
            continue;
        }

        scannedCount += 1;
        const scannedEmuId = seatCodeResult.emu.code;
        const scannedTrainCode = seatCodeResult.route.code;
        const scannedTrainInternalCode = normalizeCode(
            seatCodeResult.route.internalCode
        );
        const trackedGroup = resolveTrackedGroupByTrainCode(
            scannedTrainCode,
            cache
        );
        recordDirectHitTrainProvenanceEvent({
            bureau,
            model,
            candidateOrder,
            candidateEmuId,
            scannedEmuId,
            scannedTrainCode,
            scannedTrainInternalCode,
            scannedStartAt: seatCodeResult.route.startAt,
            scannedEndAt: seatCodeResult.route.endAt,
            trainRepeat: seatCodeResult.route.trainRepeat,
            trackedGroup
        });
        if (!trackedGroup) {
            const untrackedGroupKey = buildRunningEmuGroupKey(
                scannedTrainCode,
                scannedTrainInternalCode,
                seatCodeResult.route.startAt
            );
            const untrackedGroup = untrackedGroups.get(untrackedGroupKey) ?? {
                trainCode: scannedTrainCode,
                trainInternalCode: scannedTrainInternalCode,
                startAt: seatCodeResult.route.startAt,
                endAt: seatCodeResult.route.endAt,
                emuTrainRepeatByCode: new Map<EmuId, string>(),
                candidates: []
            };
            untrackedGroup.emuTrainRepeatByCode.set(
                scannedEmuId,
                seatCodeResult.route.trainRepeat
            );
            untrackedGroup.candidates.push({
                candidateOrder,
                candidateEmuId,
                trainRepeat: seatCodeResult.route.trainRepeat
            });
            untrackedGroups.set(untrackedGroupKey, untrackedGroup);
            warningCount += 1;
            recordCurrentCouplingScanCandidate({
                candidateOrder,
                serviceDate: currentServiceDate,
                bureau,
                model,
                candidateEmuId,
                status: 'unmatched',
                reason: 'route_not_tracked',
                scannedTrainCode,
                scannedInternalCode: scannedTrainInternalCode,
                scannedStartAt: seatCodeResult.route.startAt,
                detail: {
                    route: {
                        code: scannedTrainCode,
                        internalCode: scannedTrainInternalCode,
                        startDay: unixSecondsToServiceDay(
                            seatCodeResult.route.startAt
                        ),
                        endDay: unixSecondsToServiceDay(
                            seatCodeResult.route.endAt
                        ),
                        startAt: seatCodeResult.route.startAt,
                        endAt: seatCodeResult.route.endAt,
                        trainRepeat: seatCodeResult.route.trainRepeat
                    }
                }
            });
            logger.debug(
                `scan_unmatched_current_group bureau=${bureau} model=${model} emuCode=${formatExternalEmuCode(scannedEmuId)} trainCode=${formatExternalTrainCode(scannedTrainCode)} trainInternalCode=${scannedTrainInternalCode} startAt=${seatCodeResult.route.startAt} endAt=${seatCodeResult.route.endAt}`
            );
            continue;
        }

        recordCurrentCouplingScanCandidate({
            candidateOrder,
            serviceDate: unixSecondsToServiceDay(trackedGroup.group.startAt),
            bureau,
            model,
            candidateEmuId,
            status: 'matched',
            reason: 'tracked_group_matched',
            scannedTrainCode,
            scannedInternalCode: normalizeCode(
                seatCodeResult.route.internalCode
            ),
            scannedStartAt: seatCodeResult.route.startAt,
            matchedTrainCode: trackedGroup.group.trainCode,
            matchedStartAt: trackedGroup.group.startAt,
            trainRepeat: seatCodeResult.route.trainRepeat
        });
        matchedGroups.set(trackedGroup.group.trainKey, trackedGroup);
        const matchedEmuScanRecords =
            matchedEmuScanRecordsByTrainKey.get(trackedGroup.group.trainKey) ??
            new Map<EmuId, string>();
        matchedEmuScanRecords.set(
            scannedEmuId,
            seatCodeResult.route.trainRepeat
        );
        matchedEmuScanRecordsByTrainKey.set(
            trackedGroup.group.trainKey,
            matchedEmuScanRecords
        );
    }

    return {
        matchedGroups,
        matchedEmuScanRecordsByTrainKey,
        untrackedGroups,
        skippedAssignedCount,
        scannedCount,
        warningCount
    };
}

function collectMatchedEmuScanRecords(
    matchedEmuScans: Map<EmuId, string> | undefined
): MatchedEmuScanRecord[] {
    if (!matchedEmuScans) {
        return [];
    }

    return Array.from(matchedEmuScans.entries(), ([emuId, trainRepeat]) => ({
        emuId,
        trainRepeat
    }));
}

function collectResolvedEmuCodes(
    emuTrainRepeatByCode: Map<EmuId, string>
): EmuId[] {
    const originalEmuIds = Array.from(emuTrainRepeatByCode.keys());
    if (originalEmuIds.length <= 2) {
        return originalEmuIds;
    }

    const trainRepeatZeroEmuIds = new Set(
        Array.from(emuTrainRepeatByCode.entries())
            .filter(([, trainRepeat]) => trainRepeat === '0')
            .map(([emuId]) => emuId)
    );
    if (trainRepeatZeroEmuIds.size === 0) {
        return originalEmuIds;
    }

    const filteredEmuIds = originalEmuIds.filter(
        (emuId) => !trainRepeatZeroEmuIds.has(emuId)
    );
    return filteredEmuIds.length > 0 ? filteredEmuIds : originalEmuIds;
}

function uniqueEmuIds(emuIds: readonly EmuId[]): EmuId[] {
    return Array.from(
        new Map(emuIds.map((emuId) => [Number(emuId), emuId])).values()
    );
}

function uniqueTrainCodeValues(
    trainCodes: readonly TrainCodeParts[]
): TrainCodeParts[] {
    const seen = new Set<string>();
    const result: TrainCodeParts[] = [];
    for (const trainCode of trainCodes) {
        const key = trainCodeKey(trainCode);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(trainCode);
    }
    return result;
}

async function persistResolvedUntrackedGroups(
    groups: Map<string, UntrackedResolvedGroup>,
    nowSeconds: number
): Promise<PersistedUntrackedGroupSummary> {
    let groupCount = 0;
    let singleCount = 0;
    let coupledCount = 0;
    const probeAssets = await loadProbeAssets();

    for (const group of groups.values()) {
        const emuCodes = uniqueEmuIds(
            collectResolvedEmuCodes(group.emuTrainRepeatByCode)
        );
        if (emuCodes.length === 0) {
            continue;
        }

        const multipleState =
            emuCodes.length === 1
                ? getProbeEmuMultipleStateFromCode(
                      probeAssets,
                      formatExternalEmuCode(emuCodes[0]!)
                  )
                : 'multiple';
        const finalStatus =
            emuCodes.length > 1
                ? ProbeStatusValue.CoupledFormationResolved
                : multipleState === 'non_multiple'
                  ? ProbeStatusValue.SingleFormationResolved
                  : ProbeStatusValue.PendingCouplingDetection;
        const trainKey = buildTrainKey(
            group.trainCode,
            group.trainInternalCode,
            group.startAt
        );
        const groupKey = buildRunningEmuGroupKey(
            group.trainCode,
            group.trainInternalCode,
            group.startAt
        );

        for (const emuCode of emuCodes) {
            ensureProbeStatus(
                group.trainCode,
                emuCode,
                group.startAt,
                finalStatus
            );
        }
        persistDailyRoutes(
            [group.trainCode],
            emuCodes,
            '',
            '',
            group.startAt,
            group.endAt
        );
        markEmuCodesAssignedToday(
            emuCodes,
            trainKey,
            groupKey,
            group.startAt,
            nowSeconds
        );

        groupCount += 1;
        if (finalStatus === ProbeStatusValue.CoupledFormationResolved) {
            coupledCount += 1;
        } else {
            singleCount += 1;
        }

        for (const candidate of group.candidates) {
            recordCurrentCouplingScanCandidate({
                candidateOrder: candidate.candidateOrder,
                serviceDate: unixSecondsToServiceDay(group.startAt),
                candidateEmuId: candidate.candidateEmuId,
                status:
                    finalStatus === ProbeStatusValue.CoupledFormationResolved
                        ? 'resolved'
                        : 'pending',
                reason:
                    finalStatus === ProbeStatusValue.CoupledFormationResolved
                        ? 'route_not_tracked_coupled_persisted'
                        : finalStatus ===
                            ProbeStatusValue.SingleFormationResolved
                          ? 'route_not_tracked_single_non_multiple_resolved'
                          : 'route_not_tracked_single_pending',
                scannedTrainCode: group.trainCode,
                scannedInternalCode: group.trainInternalCode,
                scannedStartAt: group.startAt,
                trainRepeat: candidate.trainRepeat,
                detail: {
                    persistedStatus: finalStatus,
                    persistedEmuIds: emuCodes,
                    persistedStartAt: group.startAt,
                    persistedEndAt: group.endAt
                }
            });
        }

        recordCurrentTrainProvenanceEventsForTrainCodes([group.trainCode], {
            serviceDate: unixSecondsToServiceDay(group.startAt),
            startAt: group.startAt,
            emuId: emuCodes[0]!,
            eventType:
                finalStatus === ProbeStatusValue.PendingCouplingDetection
                    ? 'pending_coupling_detection'
                    : 'resolved_from_status',
            result:
                finalStatus === ProbeStatusValue.CoupledFormationResolved
                    ? 'coupled'
                    : finalStatus === ProbeStatusValue.SingleFormationResolved
                      ? 'single'
                      : 'untracked_single',
            payload: {
                source: 'coupling_scan_untracked',
                emuIds: emuCodes,
                nonMultiple: multipleState === 'non_multiple'
            }
        });
        logger.info(
            `persist_untracked_group trainCode=${formatExternalTrainCode(group.trainCode)} trainInternalCode=${group.trainInternalCode} startAt=${group.startAt} endAt=${group.endAt} status=${finalStatus} emuCodes=${emuCodes.map(formatExternalEmuCode).join('/')}`
        );
    }

    return {
        groupCount,
        singleCount,
        coupledCount
    };
}

function cleanupPrunedTrackedGroupRows(
    trackedGroup: TrackedTrainGroup,
    groupKey: string,
    removedEmuCodes: EmuId[]
): {
    deletedProbeStatusRows: number;
    deletedDailyRouteRows: number;
    clearedAssignedEmuCodes: number;
} {
    let deletedProbeStatusRows = 0;
    let deletedDailyRouteRows = 0;
    let clearedAssignedEmuCodes = 0;

    for (const emuCode of removedEmuCodes) {
        trackedGroup.knownEmuCodes.delete(emuCode);

        if (clearAssignedEmuCodeByGroupKey(groupKey, emuCode)) {
            clearedAssignedEmuCodes += 1;
        }

        for (const trainCode of trackedGroup.trainCodes) {
            deletedProbeStatusRows +=
                deleteProbeStatusByTrainCodeAndEmuCodeAtStartAt(
                    trainCode,
                    emuCode,
                    trackedGroup.group.startAt
                );
            deletedDailyRouteRows +=
                deleteDailyRouteByTrainCodeAndEmuCodeAtStartAt(
                    trainCode,
                    emuCode,
                    trackedGroup.group.startAt
                );
        }
    }

    return {
        deletedProbeStatusRows,
        deletedDailyRouteRows,
        clearedAssignedEmuCodes
    };
}

async function persistResolvedTrackedGroup(
    trackedGroup: TrackedTrainGroup,
    matchedEmuScanRecords: MatchedEmuScanRecord[],
    scheduleRoutesByTrainCode: Map<string, TodayScheduleRoute>,
    nowSeconds: number
): Promise<void> {
    const { group, trainCodes } = trackedGroup;
    const groupKey = buildRunningEmuGroupKey(
        group.trainCode,
        group.trainInternalCode,
        group.startAt
    );
    const originalEmuCodes = uniqueEmuIds([
        ...Array.from(trackedGroup.knownEmuCodes),
        ...listAssignedEmuCodesByGroupKey(groupKey),
        ...matchedEmuScanRecords.map((record) => record.emuId)
    ]);
    if (trainCodes.length === 0 || originalEmuCodes.length === 0) {
        return;
    }

    let emuCodes = originalEmuCodes;
    if (originalEmuCodes.length > 2) {
        const trainRepeatZeroEmuCodes = new Set(
            matchedEmuScanRecords
                .filter((record) => record.trainRepeat === '0')
                .map((record) => record.emuId)
        );
        const removedEmuCodes = originalEmuCodes.filter((emuCode) =>
            trainRepeatZeroEmuCodes.has(emuCode)
        );

        if (removedEmuCodes.length > 0) {
            const cleanupState = cleanupPrunedTrackedGroupRows(
                trackedGroup,
                groupKey,
                removedEmuCodes
            );
            emuCodes = originalEmuCodes.filter(
                (emuCode) => !trainRepeatZeroEmuCodes.has(emuCode)
            );
            logger.warn(
                `over_limit_prune_train_repeat_zero trainCodes=${trainCodes.map(formatExternalTrainCode).join('/')} originalEmuCodes=${originalEmuCodes.map(formatExternalEmuCode).join('/')} removedEmuCodes=${removedEmuCodes.map(formatExternalEmuCode).join('/')} remainingEmuCodes=${emuCodes.map(formatExternalEmuCode).join('/')} startAt=${group.startAt} groupKey=${groupKey} deletedProbeStatusRows=${cleanupState.deletedProbeStatusRows} deletedDailyRouteRows=${cleanupState.deletedDailyRouteRows} clearedAssignedEmuCodes=${cleanupState.clearedAssignedEmuCodes}`
            );
        }

        if (emuCodes.length > 2) {
            logger.warn(
                `over_limit_after_prune_continue trainCodes=${trainCodes.map(formatExternalTrainCode).join('/')} originalEmuCodes=${originalEmuCodes.map(formatExternalEmuCode).join('/')} remainingEmuCodes=${emuCodes.map(formatExternalEmuCode).join('/')} startAt=${group.startAt} groupKey=${groupKey}`
            );
        }
    }

    if (emuCodes.length === 0) {
        logger.warn(
            `all_emu_codes_pruned trainCodes=${trainCodes.map(formatExternalTrainCode).join('/')} originalEmuCodes=${originalEmuCodes.map(formatExternalEmuCode).join('/')} startAt=${group.startAt} groupKey=${groupKey}`
        );
        return;
    }

    const previousStatus = trackedGroup.finalStatus;
    const finalStatus =
        previousStatus === ProbeStatusValue.CoupledFormationResolved ||
        emuCodes.length > 1
            ? ProbeStatusValue.CoupledFormationResolved
            : ProbeStatusValue.SingleFormationResolved;
    const scheduleRoute = resolveScheduleRoute(
        trainCodes,
        scheduleRoutesByTrainCode
    );
    const startStation =
        scheduleRoute?.startStation ?? group.startStation ?? '';
    const endStation = scheduleRoute?.endStation ?? group.endStation ?? '';
    const endAt = scheduleRoute?.endAt ?? group.endAt;
    const notificationCandidates = [
        ...uniqueTrainCodeValues(trainCodes).map((targetId) => ({
            targetType: 'train' as const,
            targetId,
            startAt: group.startAt,
            previousStatus: getProbeStatusByTrainCodeValue(
                targetId,
                group.startAt
            ),
            nextStatus: finalStatus
        })),
        ...uniqueEmuIds(emuCodes).map((targetId) => ({
            targetType: 'emu' as const,
            targetId,
            startAt: group.startAt,
            previousStatus: getProbeStatusByEmuCodeValue(
                targetId,
                group.startAt
            ),
            nextStatus: finalStatus
        }))
    ];

    for (const trainCode of trainCodes) {
        for (const emuCode of emuCodes) {
            ensureProbeStatus(trainCode, emuCode, group.startAt, finalStatus);
        }
    }

    persistDailyRoutes(
        trainCodes,
        emuCodes,
        startStation,
        endStation,
        group.startAt,
        endAt
    );

    if (finalStatus === ProbeStatusValue.CoupledFormationResolved) {
        if (previousStatus === ProbeStatusValue.SingleFormationResolved) {
            logger.warn(
                `single_group_upgraded_to_coupled trainCodes=${trainCodes.map(formatExternalTrainCode).join('/')} emuCodes=${emuCodes.map(formatExternalEmuCode).join('/')} startAt=${group.startAt} groupKey=${groupKey}`
            );
        } else {
            logger.info(
                `coupled_group_detected trainCodes=${trainCodes.map(formatExternalTrainCode).join('/')} emuCodes=${emuCodes.map(formatExternalEmuCode).join('/')} startAt=${group.startAt} groupKey=${groupKey}`
            );
        }
        persistBackfilledCoupledRoutes(emuCodes, scheduleRoutesByTrainCode);
        recordCurrentTrainProvenanceEventsForTrainCodes(trainCodes, {
            serviceDate: unixSecondsToServiceDay(group.startAt),
            startAt: group.startAt,
            emuId: emuCodes[0]!,
            eventType: 'coupling_group_resolved_coupled',
            result:
                previousStatus === ProbeStatusValue.SingleFormationResolved
                    ? 'upgraded_from_single'
                    : 'matched',
            payload: {
                emuIds: emuCodes,
                startStation,
                endStation,
                endAt,
                matchedEmuScanRecords
            }
        });
    } else if (previousStatus === ProbeStatusValue.PendingCouplingDetection) {
        logger.info(
            `pending_group_resolved_single trainCodes=${trainCodes.map(formatExternalTrainCode).join('/')} emuCodes=${emuCodes.map(formatExternalEmuCode).join('/')} startAt=${group.startAt} groupKey=${groupKey}`
        );
        recordCurrentTrainProvenanceEventsForTrainCodes(trainCodes, {
            serviceDate: unixSecondsToServiceDay(group.startAt),
            startAt: group.startAt,
            emuId: emuCodes[0]!,
            eventType: 'coupling_group_resolved_single',
            result: 'finalized_single',
            payload: {
                emuIds: emuCodes,
                startStation,
                endStation,
                endAt
            }
        });
    }

    const trainKey = buildTrainKey(
        group.trainCode,
        group.trainInternalCode,
        group.startAt
    );
    markEmuCodesAssignedToday(
        emuCodes,
        trainKey,
        groupKey,
        group.startAt,
        nowSeconds
    );
    await notifyLookupStatusChanges(notificationCandidates);
}

async function executeDetectCoupledEmuGroupTaskInternal(
    args: DetectCoupledEmuGroupTaskArgs
): Promise<void> {
    ensureProbeStateForToday();
    const readiness = rescheduleTaskUntilScheduleReady(
        DETECT_COUPLED_EMU_GROUP_TASK_EXECUTOR,
        args
    );
    if (!readiness.ready) {
        markCurrentTrainProvenanceTaskSkipped('schedule_refresh_pending');
        recordCurrentTrainProvenanceEvent({
            serviceDate: unixSecondsToServiceDay(getNowSeconds()),
            eventType: 'coupling_scan_skipped',
            result: 'schedule_refresh_pending',
            linkedSchedulerTaskId: readiness.rescheduledTaskId,
            payload: {
                bureau: args.bureau,
                model: args.model,
                readiness: readiness.state,
                rescheduleAction: readiness.action,
                nextExecutionTime: readiness.nextExecutionTime,
                removedTaskIds: readiness.removedTaskIds,
                reusedExecutionTime: readiness.reusedExecutionTime
            }
        });
        logger.info(
            `schedule_refresh_pending_reschedule executor=${DETECT_COUPLED_EMU_GROUP_TASK_EXECUTOR} bureau=${args.bureau} model=${args.model} reason=${readiness.state.reason} nextExecutionTime=${readiness.nextExecutionTime ?? 'null'} taskId=${readiness.rescheduledTaskId ?? 'null'} action=${readiness.action ?? 'null'}`
        );
        return;
    }
    const assets = await loadProbeAssets();
    const bureau = args.bureau;
    const config = useConfig();
    const nowSeconds = getNowSeconds();
    const cooldownSeconds =
        config.spider.scheduleProbe.coupling.detectCooldownSeconds;

    if (
        hasRecentCoupledGroupDetection(
            bureau,
            args.model,
            nowSeconds,
            cooldownSeconds
        )
    ) {
        markCurrentTrainProvenanceTaskSkipped('recent_detection_cooldown');
        logger.info(
            `skip_recent_detection bureau=${bureau} model=${args.model} cooldownSeconds=${cooldownSeconds}`
        );
        return;
    }

    const candidates =
        assets.emuListByBureauAndModel.get(
            buildBureauAndModelKey(bureau, args.model)
        ) ?? [];
    if (candidates.length === 0) {
        markCurrentTrainProvenanceTaskSkipped('candidate_group_not_found');
        logger.warn(
            `candidate_group_not_found bureau=${bureau} model=${args.model}`
        );
        markCoupledGroupDetected(bureau, args.model, nowSeconds);
        return;
    }

    const { dayStart, nextDayStart } = getCurrentDayWindow();
    const trackedGroupCache = new Map<string, TrackedTrainGroup | null>();
    const pendingGroups = collectPendingTrackedGroups(
        candidates,
        dayStart,
        nextDayStart,
        trackedGroupCache
    );
    recordCurrentTrainProvenanceEvent({
        serviceDate: unixSecondsToServiceDay(getNowSeconds()),
        eventType: 'coupling_scan_started',
        result: 'running',
        payload: {
            bureau,
            model: args.model,
            candidateCount: candidates.length,
            pendingGroupCount: pendingGroups.size
        }
    });
    const {
        matchedGroups,
        matchedEmuScanRecordsByTrainKey,
        untrackedGroups,
        skippedAssignedCount,
        scannedCount,
        warningCount
    } = await scanUnassignedCandidates(
        bureau,
        args.model,
        candidates,
        trackedGroupCache,
        dayStart,
        nextDayStart,
        nowSeconds
    );

    const scheduleRoutesByTrainCode = getTodayScheduleCache();
    for (const [trainKey, trackedGroup] of matchedGroups.entries()) {
        await persistResolvedTrackedGroup(
            trackedGroup,
            collectMatchedEmuScanRecords(
                matchedEmuScanRecordsByTrainKey.get(trainKey)
            ),
            scheduleRoutesByTrainCode,
            nowSeconds
        );
    }

    const persistedUntrackedGroups = await persistResolvedUntrackedGroups(
        untrackedGroups,
        nowSeconds
    );

    let finalizedSingleGroups = 0;
    for (const [trainKey, trackedGroup] of pendingGroups.entries()) {
        if (matchedGroups.has(trainKey)) {
            continue;
        }

        await persistResolvedTrackedGroup(
            trackedGroup,
            [],
            scheduleRoutesByTrainCode,
            nowSeconds
        );
        finalizedSingleGroups += 1;
    }

    markCoupledGroupDetected(bureau, args.model, nowSeconds);
    recordCurrentTrainProvenanceEvent({
        serviceDate: unixSecondsToServiceDay(getNowSeconds()),
        eventType: 'coupling_scan_completed',
        result: 'done',
        payload: {
            bureau,
            model: args.model,
            candidateCount: candidates.length,
            pendingGroupCount: pendingGroups.size,
            matchedGroupCount: matchedGroups.size,
            persistedUntrackedGroupCount: persistedUntrackedGroups.groupCount,
            persistedUntrackedSingleCount: persistedUntrackedGroups.singleCount,
            persistedUntrackedCoupledCount:
                persistedUntrackedGroups.coupledCount,
            finalizedSingleGroups,
            skippedAssignedCount,
            scannedCount,
            warningCount
        }
    });
    logger.info(
        `done bureau=${bureau} model=${args.model} candidates=${candidates.length} pendingGroups=${pendingGroups.size} matchedGroups=${matchedGroups.size} persistedUntrackedGroups=${persistedUntrackedGroups.groupCount} finalizedSingleGroups=${finalizedSingleGroups} skippedAssigned=${skippedAssignedCount} scanned=${scannedCount} warnings=${warningCount}`
    );
}

export function registerDetectCoupledEmuGroupTaskExecutor(): void {
    if (registered) {
        return;
    }

    registerTaskExecutor(DETECT_COUPLED_EMU_GROUP_TASK_EXECUTOR, {
        parse: parseTaskArgs,
        execute: executeDetectCoupledEmuGroupTaskInternal
    });
    registered = true;
    logger.info(
        `registered executor=${DETECT_COUPLED_EMU_GROUP_TASK_EXECUTOR}`
    );
}
