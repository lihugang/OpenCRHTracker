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
import {
    markCurrentTrainProvenanceTaskSkipped,
    recordCurrentCouplingScanCandidate,
    recordCurrentTrainProvenanceEvent,
    recordCurrentTrainProvenanceEventsForTrainCodes
} from '~/server/services/trainProvenanceRecorder';
import {
    getTodayScheduleCache,
    getTodayScheduleProbeGroupByTrainCode,
    getTodayScheduleProbeGroupByTrainInternalCode,
    type TodayScheduleProbeGroup,
    type TodayScheduleRoute
} from '~/server/services/todayScheduleCache';
import fetchEMUInfoBySeatCode, {
    type FetchSeatCodeFailureResult
} from '~/server/utils/12306/network/fetchEMUInfoBySeatCode';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import uniqueNormalizedCodes from '~/server/utils/12306/uniqueNormalizedCodes';
import { getShanghaiDayStartUnixSeconds } from '~/server/utils/date/shanghaiDateTime';
import getCurrentDateString, {
    formatShanghaiDateString
} from '~/server/utils/date/getCurrentDateString';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

export const DETECT_COUPLED_EMU_GROUP_TASK_EXECUTOR =
    'detect_coupled_emu_group';

const logger = getLogger('task-executor:detect-coupled-emu-group');

interface DetectCoupledEmuGroupTaskArgs {
    bureau: string;
    model: string;
}

interface TrackedTrainGroup {
    group: TodayScheduleProbeGroup;
    trainCodes: string[];
    rows: ProbeStatusRow[];
    knownEmuCodes: Set<string>;
    finalStatus: ProbeStatusValue;
}

interface MatchedEmuScanRecord {
    emuCode: string;
    trainRepeat: string;
}

interface DirectHitTrainTarget {
    trainCodes: string[];
    startAt: number;
    serviceDate: string;
    scheduleGroup: TodayScheduleProbeGroup | null;
}

interface UntrackedResolvedGroup {
    trainCode: string;
    trainInternalCode: string;
    startAt: number;
    endAt: number;
    emuTrainRepeatByCode: Map<string, string>;
    candidates: Array<{
        candidateOrder: number;
        candidateEmuCode: string;
        trainRepeat: string;
    }>;
}

interface PersistedUntrackedGroupSummary {
    groupCount: number;
    singleCount: number;
    coupledCount: number;
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
    const currentDate = getCurrentDateString();
    const dayStart = getShanghaiDayStartUnixSeconds(currentDate);
    return {
        dayStart,
        nextDayStart: dayStart + 24 * 60 * 60
    };
}

function buildCandidateEmuCode(candidate: EmuListRecord): string {
    return normalizeCode(`${candidate.model}-${candidate.trainSetNo}`);
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

function resolveScheduleRoute(
    trainCodes: string[],
    scheduleRoutesByTrainCode: Map<string, TodayScheduleRoute>
): TodayScheduleRoute | null {
    for (const trainCode of trainCodes) {
        const route = scheduleRoutesByTrainCode.get(normalizeCode(trainCode));
        if (route) {
            return route;
        }
    }

    return null;
}

function buildTrainStartKey(trainCode: string, startAt: number): string {
    return `${normalizeCode(trainCode)}@${startAt}`;
}

function persistBackfilledCoupledRoutes(
    emuCodes: string[],
    scheduleRoutesByTrainCode: Map<string, TodayScheduleRoute>
): void {
    if (emuCodes.length <= 1) {
        return;
    }

    const currentDate = getCurrentDateString();
    const dayStart = getShanghaiDayStartUnixSeconds(currentDate);
    const nextDayStart = dayStart + 24 * 60 * 60;
    const candidateRows = new Map<
        string,
        { trainCode: string; startAt: number }
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
        const normalizedTrainCode = normalizeCode(candidate.trainCode);
        if (normalizedTrainCode.length === 0) {
            continue;
        }

        const existingRows = listProbeStatusByTrainCode(
            normalizedTrainCode,
            candidate.startAt
        );
        const scheduleRoute =
            scheduleRoutesByTrainCode.get(normalizedTrainCode);

        if (!scheduleRoute) {
            logger.warn(
                `backfill_schedule_cache_missing trainCode=${normalizedTrainCode} startAt=${candidate.startAt}`
            );
        } else if (scheduleRoute.startAt !== candidate.startAt) {
            logger.warn(
                `backfill_schedule_cache_start_mismatch trainCode=${normalizedTrainCode} scheduleStartAt=${scheduleRoute.startAt} probeStartAt=${candidate.startAt}`
            );
        }

        const startStation = scheduleRoute?.startStation ?? '';
        const endStation = scheduleRoute?.endStation ?? '';
        const endAt = scheduleRoute?.endAt ?? candidate.startAt;
        for (const emuCode of emuCodes) {
            const normalizedEmuCode = normalizeCode(emuCode);
            if (
                existingRows.some(
                    (row) => row.emu_code === normalizedEmuCode
                ) &&
                existingRows.some(
                    (row) =>
                        row.emu_code === normalizedEmuCode &&
                        row.status === ProbeStatusValue.CoupledFormationResolved
                )
            ) {
                continue;
            }

            ensureProbeStatus(
                normalizedTrainCode,
                normalizedEmuCode,
                candidate.startAt,
                ProbeStatusValue.CoupledFormationResolved
            );
            insertDailyEmuRoute(
                normalizedTrainCode,
                normalizedEmuCode,
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
    trainCode: string,
    cache: Map<string, TrackedTrainGroup | null>
): TrackedTrainGroup | null {
    const normalizedTrainCode = normalizeCode(trainCode);
    if (normalizedTrainCode.length === 0) {
        return null;
    }

    const cached = cache.get(normalizedTrainCode);
    if (cached !== undefined) {
        return cached;
    }

    const group = getTodayScheduleProbeGroupByTrainCode(normalizedTrainCode);
    if (!group) {
        cache.set(normalizedTrainCode, null);
        return null;
    }

    const trainCodes = uniqueNormalizedCodes([
        group.trainCode,
        ...group.allCodes
    ]);
    const rowsByKey = new Map<string, ProbeStatusRow>();
    for (const code of trainCodes) {
        const rows = listProbeStatusByTrainCode(code, group.startAt);
        for (const row of rows) {
            rowsByKey.set(
                `${row.train_code}#${row.emu_code}#${row.start_at}`,
                row
            );
        }
    }

    if (rowsByKey.size === 0) {
        for (const code of trainCodes) {
            cache.set(code, null);
        }
        return null;
    }

    const rows = Array.from(rowsByKey.values());
    const trackedGroup: TrackedTrainGroup = {
        group,
        trainCodes,
        rows,
        knownEmuCodes: new Set(rows.map((row) => row.emu_code)),
        finalStatus: getTrackedGroupStatus(rows)
    };

    for (const code of trainCodes) {
        cache.set(code, trackedGroup);
    }

    return trackedGroup;
}

function collectTrackedGroupHintsByEmuCode(
    emuCode: string,
    dayStart: number,
    nextDayStart: number,
    cache: Map<string, TrackedTrainGroup | null>
): {
    trainCodes: string[];
    groupKeys: string[];
    startAts: number[];
} {
    const rows = listProbeStatusByEmuCodeInRange(
        emuCode,
        dayStart,
        nextDayStart
    );
    const trainCodes = new Set<string>();
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

        trainCodes.add(normalizeCode(row.train_code));
    }

    return {
        trainCodes: Array.from(trainCodes),
        groupKeys: Array.from(groupKeys),
        startAts: Array.from(startAts).sort((left, right) => left - right)
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
        const emuCode = buildCandidateEmuCode(candidate);
        if (emuCode.length === 0) {
            continue;
        }

        const rows = listProbeStatusByEmuCodeInRange(
            emuCode,
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
    scannedTrainCode: string,
    fallbackStartAt: number
): DirectHitTrainTarget | null {
    const normalizedTrainInternalCode = normalizeCode(scannedTrainInternalCode);
    if (normalizedTrainInternalCode.length > 0) {
        const internalCodeGroup = getTodayScheduleProbeGroupByTrainInternalCode(
            normalizedTrainInternalCode
        );
        if (internalCodeGroup) {
            return {
                trainCodes: uniqueNormalizedCodes([
                    internalCodeGroup.trainCode,
                    ...internalCodeGroup.allCodes
                ]),
                startAt: internalCodeGroup.startAt,
                serviceDate: formatShanghaiDateString(
                    internalCodeGroup.startAt * 1000
                ),
                scheduleGroup: internalCodeGroup
            };
        }
    }

    const normalizedTrainCode = normalizeCode(scannedTrainCode);
    if (normalizedTrainCode.length === 0) {
        return null;
    }

    const scheduleGroup =
        getTodayScheduleProbeGroupByTrainCode(normalizedTrainCode);
    if (scheduleGroup) {
        return {
            trainCodes: uniqueNormalizedCodes([
                scheduleGroup.trainCode,
                ...scheduleGroup.allCodes
            ]),
            startAt: scheduleGroup.startAt,
            serviceDate: formatShanghaiDateString(scheduleGroup.startAt * 1000),
            scheduleGroup
        };
    }

    return {
        trainCodes: [normalizedTrainCode],
        startAt: fallbackStartAt,
        serviceDate: formatShanghaiDateString(fallbackStartAt * 1000),
        scheduleGroup: null
    };
}

function recordDirectHitTrainProvenanceEvent(input: {
    bureau: string;
    model: string;
    candidateOrder: number;
    candidateEmuCode: string;
    scannedEmuCode: string;
    scannedTrainCode: string;
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
        emuCode: input.scannedEmuCode,
        relatedTrainCode: input.scannedTrainCode,
        relatedEmuCode: input.candidateEmuCode,
        eventType: 'coupling_scan_candidate_direct_hit',
        result: input.trackedGroup ? 'matched' : 'unmatched',
        payload: {
            bureau: input.bureau,
            model: input.model,
            candidateOrder: input.candidateOrder,
            candidateEmuCode: input.candidateEmuCode,
            directHitTrainCodes: target.trainCodes,
            scannedRoute: {
                code: input.scannedTrainCode,
                internalCode: input.scannedTrainInternalCode,
                startDay: formatShanghaiDateString(input.scannedStartAt * 1000),
                endDay: formatShanghaiDateString(input.scannedEndAt * 1000),
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
    nextDayStart: number
): Promise<{
    matchedGroups: Map<string, TrackedTrainGroup>;
    matchedEmuScanRecordsByTrainKey: Map<string, Map<string, string>>;
    untrackedGroups: Map<string, UntrackedResolvedGroup>;
    skippedAssignedCount: number;
    scannedCount: number;
    warningCount: number;
}> {
    const assets = await loadProbeAssets();
    const matchedGroups = new Map<string, TrackedTrainGroup>();
    const matchedEmuScanRecordsByTrainKey = new Map<
        string,
        Map<string, string>
    >();
    const untrackedGroups = new Map<string, UntrackedResolvedGroup>();
    let skippedAssignedCount = 0;
    let scannedCount = 0;
    let warningCount = 0;

    for (const [index, candidate] of candidates.entries()) {
        const candidateOrder = index + 1;
        const candidateEmuCode = buildCandidateEmuCode(candidate);
        if (candidateEmuCode.length === 0) {
            continue;
        }

        if (isEmuAssignedToday(candidateEmuCode)) {
            skippedAssignedCount += 1;
            const hint = collectTrackedGroupHintsByEmuCode(
                candidateEmuCode,
                dayStart,
                nextDayStart,
                cache
            );
            recordCurrentCouplingScanCandidate({
                candidateOrder,
                serviceDate: getCurrentDateString(),
                bureau,
                model,
                candidateEmuCode,
                status: 'skipped',
                reason: 'already_assigned',
                detail: hint
            });
            continue;
        }

        const seatCode = assets.qrcodeByModelAndTrainSetNo.get(
            buildProbeAssetKey(candidate.model, candidate.trainSetNo)
        );
        if (!seatCode) {
            recordCurrentCouplingScanCandidate({
                candidateOrder,
                serviceDate: getCurrentDateString(),
                bureau,
                model,
                candidateEmuCode,
                status: 'skipped',
                reason: 'seat_code_missing'
            });
            continue;
        }

        const seatCodeResult = await fetchEMUInfoBySeatCode(seatCode);
        if (seatCodeResult.status !== 'success') {
            recordCurrentCouplingScanCandidate({
                candidateOrder,
                serviceDate: getCurrentDateString(),
                bureau,
                model,
                candidateEmuCode,
                status: 'request_failed',
                reason: toSeatCodeRequestFailedReason(seatCodeResult),
                detail: seatCodeResult
            });
            continue;
        }

        scannedCount += 1;
        const scannedEmuCode =
            normalizeCode(seatCodeResult.emu.code) || candidateEmuCode;
        const scannedTrainCode = normalizeCode(seatCodeResult.route.code);
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
            candidateEmuCode,
            scannedEmuCode,
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
                emuTrainRepeatByCode: new Map<string, string>(),
                candidates: []
            };
            untrackedGroup.emuTrainRepeatByCode.set(
                scannedEmuCode,
                seatCodeResult.route.trainRepeat
            );
            untrackedGroup.candidates.push({
                candidateOrder,
                candidateEmuCode,
                trainRepeat: seatCodeResult.route.trainRepeat
            });
            untrackedGroups.set(untrackedGroupKey, untrackedGroup);
            warningCount += 1;
            recordCurrentCouplingScanCandidate({
                candidateOrder,
                serviceDate: getCurrentDateString(),
                bureau,
                model,
                candidateEmuCode,
                status: 'unmatched',
                reason: 'route_not_tracked',
                scannedTrainCode,
                scannedInternalCode: scannedTrainInternalCode,
                scannedStartAt: seatCodeResult.route.startAt,
                detail: {
                    route: {
                        code: scannedTrainCode,
                        internalCode: scannedTrainInternalCode,
                        startDay: seatCodeResult.route.startDay,
                        endDay: seatCodeResult.route.endDay,
                        startAt: seatCodeResult.route.startAt,
                        endAt: seatCodeResult.route.endAt,
                        trainRepeat: seatCodeResult.route.trainRepeat
                    }
                }
            });
            logger.debug(
                `scan_unmatched_current_group bureau=${bureau} model=${model} emuCode=${scannedEmuCode} trainCode=${scannedTrainCode} trainInternalCode=${scannedTrainInternalCode} startAt=${seatCodeResult.route.startAt} endAt=${seatCodeResult.route.endAt}`
            );
            continue;
        }

        recordCurrentCouplingScanCandidate({
            candidateOrder,
            serviceDate: formatShanghaiDateString(
                trackedGroup.group.startAt * 1000
            ),
            bureau,
            model,
            candidateEmuCode,
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
            new Map<string, string>();
        matchedEmuScanRecords.set(
            scannedEmuCode,
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
    matchedEmuScans: Map<string, string> | undefined
): MatchedEmuScanRecord[] {
    if (!matchedEmuScans) {
        return [];
    }

    return Array.from(matchedEmuScans.entries(), ([emuCode, trainRepeat]) => ({
        emuCode,
        trainRepeat
    }));
}

function collectResolvedEmuCodes(
    emuTrainRepeatByCode: Map<string, string>
): string[] {
    const originalEmuCodes = Array.from(emuTrainRepeatByCode.keys());
    if (originalEmuCodes.length <= 2) {
        return originalEmuCodes;
    }

    const trainRepeatZeroEmuCodes = new Set(
        Array.from(emuTrainRepeatByCode.entries())
            .filter(([, trainRepeat]) => trainRepeat === '0')
            .map(([emuCode]) => emuCode)
    );
    if (trainRepeatZeroEmuCodes.size === 0) {
        return originalEmuCodes;
    }

    const filteredEmuCodes = originalEmuCodes.filter(
        (emuCode) => !trainRepeatZeroEmuCodes.has(emuCode)
    );
    return filteredEmuCodes.length > 0 ? filteredEmuCodes : originalEmuCodes;
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
        const emuCodes = uniqueNormalizedCodes(
            collectResolvedEmuCodes(group.emuTrainRepeatByCode)
        );
        if (group.trainCode.length === 0 || emuCodes.length === 0) {
            continue;
        }

        const multipleState =
            emuCodes.length === 1
                ? getProbeEmuMultipleStateFromCode(
                      probeAssets,
                      emuCodes[0] ?? ''
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
                serviceDate: formatShanghaiDateString(group.startAt * 1000),
                candidateEmuCode: candidate.candidateEmuCode,
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
                    persistedEmuCodes: emuCodes,
                    persistedStartAt: group.startAt,
                    persistedEndAt: group.endAt
                }
            });
        }

        recordCurrentTrainProvenanceEventsForTrainCodes([group.trainCode], {
            serviceDate: formatShanghaiDateString(group.startAt * 1000),
            startAt: group.startAt,
            emuCode: emuCodes[0] ?? '',
            eventType:
                finalStatus === ProbeStatusValue.PendingCouplingDetection
                    ? 'pending_coupling_detection'
                    : 'resolved_from_status',
            result:
                finalStatus === ProbeStatusValue.CoupledFormationResolved
                    ? 'coupled'
                    : finalStatus ===
                        ProbeStatusValue.SingleFormationResolved
                      ? 'single'
                      : 'untracked_single',
            payload: {
                source: 'coupling_scan_untracked',
                emuCodes,
                nonMultiple: multipleState === 'non_multiple'
            }
        });
        logger.info(
            `persist_untracked_group trainCode=${group.trainCode} trainInternalCode=${group.trainInternalCode} startAt=${group.startAt} endAt=${group.endAt} status=${finalStatus} emuCodes=${emuCodes.join('/')}`
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
    removedEmuCodes: string[]
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
    const originalEmuCodes = uniqueNormalizedCodes([
        ...Array.from(trackedGroup.knownEmuCodes),
        ...listAssignedEmuCodesByGroupKey(groupKey),
        ...matchedEmuScanRecords.map((record) => record.emuCode)
    ]);
    if (trainCodes.length === 0 || originalEmuCodes.length === 0) {
        return;
    }

    let emuCodes = originalEmuCodes;
    if (originalEmuCodes.length > 2) {
        const trainRepeatZeroEmuCodes = new Set(
            matchedEmuScanRecords
                .filter((record) => record.trainRepeat === '0')
                .map((record) => record.emuCode)
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
                `over_limit_prune_train_repeat_zero trainCodes=${trainCodes.join('/')} originalEmuCodes=${originalEmuCodes.join('/')} removedEmuCodes=${removedEmuCodes.join('/')} remainingEmuCodes=${emuCodes.join('/')} startAt=${group.startAt} groupKey=${groupKey} deletedProbeStatusRows=${cleanupState.deletedProbeStatusRows} deletedDailyRouteRows=${cleanupState.deletedDailyRouteRows} clearedAssignedEmuCodes=${cleanupState.clearedAssignedEmuCodes}`
            );
        }

        if (emuCodes.length > 2) {
            logger.warn(
                `over_limit_after_prune_continue trainCodes=${trainCodes.join('/')} originalEmuCodes=${originalEmuCodes.join('/')} remainingEmuCodes=${emuCodes.join('/')} startAt=${group.startAt} groupKey=${groupKey}`
            );
        }
    }

    if (emuCodes.length === 0) {
        logger.warn(
            `all_emu_codes_pruned trainCodes=${trainCodes.join('/')} originalEmuCodes=${originalEmuCodes.join('/')} startAt=${group.startAt} groupKey=${groupKey}`
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
        ...uniqueNormalizedCodes(trainCodes).map((targetId) => ({
            targetType: 'train' as const,
            targetId,
            startAt: group.startAt,
            previousStatus: getProbeStatusByTrainCodeValue(
                targetId,
                group.startAt
            ),
            nextStatus: finalStatus
        })),
        ...uniqueNormalizedCodes(emuCodes).map((targetId) => ({
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
                `single_group_upgraded_to_coupled trainCodes=${trainCodes.join('/')} emuCodes=${emuCodes.join('/')} startAt=${group.startAt} groupKey=${groupKey}`
            );
        } else {
            logger.info(
                `coupled_group_detected trainCodes=${trainCodes.join('/')} emuCodes=${emuCodes.join('/')} startAt=${group.startAt} groupKey=${groupKey}`
            );
        }
        persistBackfilledCoupledRoutes(emuCodes, scheduleRoutesByTrainCode);
        recordCurrentTrainProvenanceEventsForTrainCodes(trainCodes, {
            serviceDate: formatShanghaiDateString(group.startAt * 1000),
            startAt: group.startAt,
            emuCode: emuCodes[0] ?? '',
            eventType: 'coupling_group_resolved_coupled',
            result:
                previousStatus === ProbeStatusValue.SingleFormationResolved
                    ? 'upgraded_from_single'
                    : 'matched',
            payload: {
                emuCodes,
                startStation,
                endStation,
                endAt,
                matchedEmuScanRecords
            }
        });
    } else if (previousStatus === ProbeStatusValue.PendingCouplingDetection) {
        logger.info(
            `pending_group_resolved_single trainCodes=${trainCodes.join('/')} emuCodes=${emuCodes.join('/')} startAt=${group.startAt} groupKey=${groupKey}`
        );
        recordCurrentTrainProvenanceEventsForTrainCodes(trainCodes, {
            serviceDate: formatShanghaiDateString(group.startAt * 1000),
            startAt: group.startAt,
            emuCode: emuCodes[0] ?? '',
            eventType: 'coupling_group_resolved_single',
            result: 'finalized_single',
            payload: {
                emuCodes,
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
    rawArgs: unknown
): Promise<void> {
    ensureProbeStateForToday();
    const args = parseTaskArgs(rawArgs);
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
        serviceDate: getCurrentDateString(),
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
        nextDayStart
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
        serviceDate: getCurrentDateString(),
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

async function executeDetectCoupledEmuGroupTask(
    rawArgs: unknown
): Promise<void> {
    await executeDetectCoupledEmuGroupTaskInternal(rawArgs);
}

export function registerDetectCoupledEmuGroupTaskExecutor(): void {
    if (registered) {
        return;
    }

    registerTaskExecutor(
        DETECT_COUPLED_EMU_GROUP_TASK_EXECUTOR,
        async (args) => {
            await executeDetectCoupledEmuGroupTask(args);
        }
    );
    registered = true;
    logger.info(
        `registered executor=${DETECT_COUPLED_EMU_GROUP_TASK_EXECUTOR}`
    );
}
