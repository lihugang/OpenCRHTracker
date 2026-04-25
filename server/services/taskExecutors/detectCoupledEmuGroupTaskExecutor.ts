import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import {
    record12306TraceConflict,
    record12306TraceDecision,
    record12306TraceSummary,
    runWith12306TraceScope,
    with12306TraceFunction
} from '~/server/services/requestMetrics12306Trace';
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
import { getCurrentTaskExecutionContext } from '~/server/services/taskExecutionContext';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import {
    getTodayScheduleCache,
    getTodayScheduleProbeGroupByTrainCode,
    type TodayScheduleProbeGroup,
    type TodayScheduleRoute
} from '~/server/services/todayScheduleCache';
import fetchEMUInfoBySeatCode from '~/server/utils/12306/network/fetchEMUInfoBySeatCode';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import uniqueNormalizedCodes from '~/server/utils/12306/uniqueNormalizedCodes';
import { getShanghaiDayStartUnixSeconds } from '~/server/utils/date/shanghaiDateTime';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
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

let registered = false;

function getCurrentDetectionTaskId(): number | null {
    const currentTask = getCurrentTaskExecutionContext();
    if (currentTask?.executor !== DETECT_COUPLED_EMU_GROUP_TASK_EXECUTOR) {
        return null;
    }

    return currentTask.taskId;
}

function withDetectionTaskContext(
    context: Record<string, unknown>
): Record<string, unknown> {
    const detectionTaskId = getCurrentDetectionTaskId();
    if (detectionTaskId === null) {
        return context;
    }

    return {
        ...context,
        detectionTaskId
    };
}

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
    const rows = listProbeStatusByEmuCodeInRange(emuCode, dayStart, nextDayStart);
    const trainCodes = new Set<string>();
    const groupKeys = new Set<string>();
    const startAts = new Set<number>();

    for (const row of rows) {
        startAts.add(row.start_at);
        const trackedGroup = resolveTrackedGroupByTrainCode(row.train_code, cache);
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
    let skippedAssignedCount = 0;
    let scannedCount = 0;
    let warningCount = 0;

    for (const candidate of candidates) {
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
            record12306TraceDecision({
                title: '重联扫描跳过已分配编组',
                operation: 'coupling_scan_skipped_assigned',
                context: withDetectionTaskContext({
                    bureau,
                    model,
                    candidateEmuCode,
                    trainCodes: hint.trainCodes.join('/'),
                    groupKeys: hint.groupKeys.join('/'),
                    startAts: hint.startAts.join('/')
                })
            });
            continue;
        }

        const seatCode = assets.qrcodeByModelAndTrainSetNo.get(
            buildProbeAssetKey(candidate.model, candidate.trainSetNo)
        );
        if (!seatCode) {
            record12306TraceConflict({
                title: '重联扫描候选缺少座位码',
                operation: 'coupling_scan_candidate_missing_seat_code',
                level: 'WARN',
                context: withDetectionTaskContext({
                    bureau,
                    model,
                    candidateEmuCode
                })
            });
            continue;
        }

        const seatCodeResult = await fetchEMUInfoBySeatCode(seatCode);
        if (!seatCodeResult) {
            record12306TraceConflict({
                title: '重联扫描候选座位码请求失败',
                operation: 'coupling_scan_candidate_request_failed',
                level: 'WARN',
                context: withDetectionTaskContext({
                    bureau,
                    model,
                    candidateEmuCode,
                    seatCode
                })
            });
            continue;
        }

        scannedCount += 1;
        const scannedEmuCode =
            normalizeCode(seatCodeResult.emu.code) || candidateEmuCode;
        const scannedTrainCode = normalizeCode(seatCodeResult.route.code);
        const trackedGroup = resolveTrackedGroupByTrainCode(
            scannedTrainCode,
            cache
        );
        if (!trackedGroup) {
            warningCount += 1;
            record12306TraceConflict({
                title: '重联扫描结果未匹配待检测车次',
                operation: 'coupling_scan_unmatched_current_group',
                level: 'WARN',
                context: withDetectionTaskContext({
                    bureau,
                    model,
                    candidateEmuCode,
                    scannedEmuCode,
                    trainCodes: scannedTrainCode,
                    scannedTrainCode,
                    scannedTrainInternalCode: normalizeCode(
                        seatCodeResult.route.internalCode
                    ),
                    startAt: seatCodeResult.route.startAt,
                    endAt: seatCodeResult.route.endAt
                })
            });
            logger.debug(
                `scan_unmatched_current_group bureau=${bureau} model=${model} emuCode=${scannedEmuCode} trainCode=${scannedTrainCode} trainInternalCode=${normalizeCode(seatCodeResult.route.internalCode)} startAt=${seatCodeResult.route.startAt} endAt=${seatCodeResult.route.endAt}`
            );
            continue;
        }

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
            record12306TraceConflict({
                title: '超限编组裁剪',
                operation: 'over_limit_prune_train_repeat_zero',
                level: 'WARN',
                context: withDetectionTaskContext({
                    trainCodes: trainCodes.join('/'),
                    originalEmuCodes: originalEmuCodes.join('/'),
                    removedEmuCodes: removedEmuCodes.join('/'),
                    remainingEmuCodes: emuCodes.join('/'),
                    startAt: group.startAt,
                    groupKey,
                    deletedProbeStatusRows:
                        cleanupState.deletedProbeStatusRows,
                    deletedDailyRouteRows:
                        cleanupState.deletedDailyRouteRows,
                    clearedAssignedEmuCodes:
                        cleanupState.clearedAssignedEmuCodes
                })
            });
            logger.warn(
                `over_limit_prune_train_repeat_zero trainCodes=${trainCodes.join('/')} originalEmuCodes=${originalEmuCodes.join('/')} removedEmuCodes=${removedEmuCodes.join('/')} remainingEmuCodes=${emuCodes.join('/')} startAt=${group.startAt} groupKey=${groupKey} deletedProbeStatusRows=${cleanupState.deletedProbeStatusRows} deletedDailyRouteRows=${cleanupState.deletedDailyRouteRows} clearedAssignedEmuCodes=${cleanupState.clearedAssignedEmuCodes}`
            );
        }

        if (emuCodes.length > 2) {
            record12306TraceConflict({
                title: '超限编组仍继续保留',
                operation: 'over_limit_after_prune_continue',
                level: 'WARN',
                context: withDetectionTaskContext({
                    trainCodes: trainCodes.join('/'),
                    originalEmuCodes: originalEmuCodes.join('/'),
                    remainingEmuCodes: emuCodes.join('/'),
                    startAt: group.startAt,
                    groupKey
                })
            });
            logger.warn(
                `over_limit_after_prune_continue trainCodes=${trainCodes.join('/')} originalEmuCodes=${originalEmuCodes.join('/')} remainingEmuCodes=${emuCodes.join('/')} startAt=${group.startAt} groupKey=${groupKey}`
            );
        }
    }

    if (emuCodes.length === 0) {
        record12306TraceConflict({
            title: '编组全部被裁剪',
            operation: 'all_emu_codes_pruned',
            level: 'WARN',
            context: withDetectionTaskContext({
                trainCodes: trainCodes.join('/'),
                originalEmuCodes: originalEmuCodes.join('/'),
                startAt: group.startAt,
                groupKey
            })
        });
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
            record12306TraceConflict({
                title: '单编组升级为重联',
                operation: 'single_group_upgraded_to_coupled',
                level: 'WARN',
                context: withDetectionTaskContext({
                    trainCodes: trainCodes.join('/'),
                    emuCodes: emuCodes.join('/'),
                    startAt: group.startAt,
                    groupKey
                })
            });
            logger.warn(
                `single_group_upgraded_to_coupled trainCodes=${trainCodes.join('/')} emuCodes=${emuCodes.join('/')} startAt=${group.startAt} groupKey=${groupKey}`
            );
        } else {
            record12306TraceDecision({
                title: '检测到重联编组',
                operation: 'coupled_group_detected',
                context: withDetectionTaskContext({
                    trainCodes: trainCodes.join('/'),
                    emuCodes: emuCodes.join('/'),
                    startAt: group.startAt,
                    groupKey
                })
            });
            logger.info(
                `coupled_group_detected trainCodes=${trainCodes.join('/')} emuCodes=${emuCodes.join('/')} startAt=${group.startAt} groupKey=${groupKey}`
            );
        }
        persistBackfilledCoupledRoutes(emuCodes, scheduleRoutesByTrainCode);
    } else if (previousStatus === ProbeStatusValue.PendingCouplingDetection) {
        record12306TraceDecision({
            title: '待检测编组确认为单编组',
            operation: 'pending_group_resolved_single',
            context: withDetectionTaskContext({
                trainCodes: trainCodes.join('/'),
                emuCodes: emuCodes.join('/'),
                startAt: group.startAt,
                groupKey
            })
        });
        logger.info(
            `pending_group_resolved_single trainCodes=${trainCodes.join('/')} emuCodes=${emuCodes.join('/')} startAt=${group.startAt} groupKey=${groupKey}`
        );
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
        record12306TraceDecision({
            title: '重联扫描任务因冷却跳过',
            operation: 'coupling_scan_skip_recent_detection',
            context: withDetectionTaskContext({
                bureau,
                model: args.model,
                cooldownSeconds
            })
        });
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
        record12306TraceConflict({
            title: '重联扫描候选为空',
            operation: 'coupling_scan_candidate_group_not_found',
            level: 'WARN',
            context: withDetectionTaskContext({
                bureau,
                model: args.model
            })
        });
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
    const {
        matchedGroups,
        matchedEmuScanRecordsByTrainKey,
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
        await runWith12306TraceScope(
            {
                primaryTrainCode: trackedGroup.group.trainCode,
                allTrainCodes: trackedGroup.trainCodes,
                trainInternalCode: trackedGroup.group.trainInternalCode,
                startAt: trackedGroup.group.startAt,
                traceSubtitle: 'detect coupled emu group'
            },
            () =>
                persistResolvedTrackedGroup(
                    trackedGroup,
                    collectMatchedEmuScanRecords(
                        matchedEmuScanRecordsByTrainKey.get(trainKey)
                    ),
                    scheduleRoutesByTrainCode,
                    nowSeconds
                )
        );
    }

    let finalizedSingleGroups = 0;
    for (const [trainKey, trackedGroup] of pendingGroups.entries()) {
        if (matchedGroups.has(trainKey)) {
            continue;
        }

        await runWith12306TraceScope(
            {
                primaryTrainCode: trackedGroup.group.trainCode,
                allTrainCodes: trackedGroup.trainCodes,
                trainInternalCode: trackedGroup.group.trainInternalCode,
                startAt: trackedGroup.group.startAt,
                traceSubtitle: 'detect coupled emu group'
            },
            () =>
                persistResolvedTrackedGroup(
                    trackedGroup,
                    [],
                    scheduleRoutesByTrainCode,
                    nowSeconds
                )
        );
        finalizedSingleGroups += 1;
    }

    markCoupledGroupDetected(bureau, args.model, nowSeconds);
    record12306TraceDecision({
        title: '重联扫描任务汇总',
        operation: 'coupling_scan_task_summary',
        context: withDetectionTaskContext({
            bureau,
            model: args.model,
            candidates: candidates.length,
            pendingGroups: pendingGroups.size,
            matchedGroups: matchedGroups.size,
            finalizedSingleGroups,
            skippedAssigned: skippedAssignedCount,
            scannedCount,
            warningCount
        })
    });
    logger.info(
        `done bureau=${bureau} model=${args.model} candidates=${candidates.length} pendingGroups=${pendingGroups.size} matchedGroups=${matchedGroups.size} finalizedSingleGroups=${finalizedSingleGroups} skippedAssigned=${skippedAssignedCount} scanned=${scannedCount} warnings=${warningCount}`
    );
}

async function executeDetectCoupledEmuGroupTask(
    rawArgs: unknown
): Promise<void> {
    const traceStartedAtMs = Date.now();
    return with12306TraceFunction<void>(
        {
            title: '检测重联编组任务',
            functionName: 'executeDetectCoupledEmuGroupTask',
            subject: {
                traceKey: `detect-coupled:${Date.now()}`
            },
            context: {
                rawArgs: JSON.stringify(rawArgs ?? null)
            }
        },
        async () => {
            await executeDetectCoupledEmuGroupTaskInternal(rawArgs);
            record12306TraceSummary({
                title: '检测重联编组任务完成',
                status: 'success',
                level: 'INFO',
                durationMs: Date.now() - traceStartedAtMs,
                message: '完成 detect_coupled_emu_group 执行'
            });
        }
    );
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
