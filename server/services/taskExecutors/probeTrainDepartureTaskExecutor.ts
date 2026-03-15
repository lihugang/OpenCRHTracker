import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import { clearRecentCoupledGroupDetection } from '~/server/services/probeDetectionState';
import {
    buildProbeAssetKey,
    loadProbeAssets,
    type EmuListRecord
} from '~/server/services/probeAssetStore';
import {
    buildTrainKey,
    clearQueriedTrainKey,
    clearRunningEmuStateByTrainKey,
    cleanupRunningEmuState,
    ensureProbeStateForToday,
    hasQueriedTrainKey,
    markQueriedTrainKey,
    markRunningEmuCodes
} from '~/server/services/probeRuntimeState';
import {
    deleteProbeStatusByTrainCodeInRange,
    ensureProbeStatus,
    getLatestResolvedProbeStatusByEmuCodeBefore,
    listProbeStatusByEmuCode,
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
import { enqueueQrcodeProbeAvailabilityTask } from '~/server/services/qrcodeProbeTask';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import { enqueueTask } from '~/server/services/taskQueue';
import { DETECT_COUPLED_EMU_GROUP_TASK_EXECUTOR } from '~/server/services/taskExecutors/detectCoupledEmuGroupTaskExecutor';
import {
    getTodayScheduleProbeGroupByTrainCode,
    type TodayScheduleProbeGroup
} from '~/server/services/todayScheduleCache';
import fetchEMUInfoByRoute from '~/server/utils/12306/network/fetchEMUInfoByRoute';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import parseEmuCode from '~/server/utils/12306/parseEmuCode';
import uniqueNormalizedCodes from '~/server/utils/12306/uniqueNormalizedCodes';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
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
    depot: string;
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
        startStation: args.startStation,
        endStation: args.endStation,
        startAt: args.startAt,
        endAt: args.endAt
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
        startStation: row.start_station_name,
        endStation: row.end_station_name,
        startAt: row.start_at,
        endAt: row.end_at
    };
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

function collectAffectedDetectionGroups(
    emuCodes: string[],
    assets: Awaited<ReturnType<typeof loadProbeAssets>>
): Array<{ depot: string; model: string }> {
    const detectionGroups = new Map<string, { depot: string; model: string }>();

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

        const detectionKey = `${record.depot}#${record.model}`;
        if (!detectionGroups.has(detectionKey)) {
            detectionGroups.set(detectionKey, {
                depot: record.depot,
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
            detectionGroup.depot,
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

function queueCoupledDetectionTask(mainRecord: EmuListRecord): number {
    const delaySeconds =
        useConfig().spider.scheduleProbe.coupling.detectDelaySeconds;
    const taskArgs: CoupledDetectionTaskArgs = {
        depot: mainRecord.depot,
        model: mainRecord.model
    };
    return enqueueTask(
        DETECT_COUPLED_EMU_GROUP_TASK_EXECUTOR,
        taskArgs,
        getNowSeconds() + delaySeconds
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
    const overlappingGroups = collectOverlappingGroups(
        mainEmuCode,
        currentGroup,
        dayStart,
        nextDayStart
    );
    if (overlappingGroups.length === 0) {
        return false;
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

    logger.error(
        `overlap_requeue conflictEmuCode=${mainEmuCode} conflictGroups=${formatTrainCodeGroups(overlappingGroups)} conflictTimeRanges=${formatOverlapTimeRanges(currentGroup, overlappingGroups)} requeuedGroups=${formatTrainCodeGroups(Array.from(impactedGroups.values()))} requeuedEmuCodes=${clearedState.affectedEmuCodes.join(',')} deletedDailyRouteRows=${clearedState.deletedDailyRouteRows} deletedProbeStatusRows=${clearedState.deletedProbeStatusRows} requeueTaskIds=${taskIds.join(',')}`
    );
    return true;
}

function applyResolvedResult(
    args: ProbeTrainDepartureTaskArgs,
    trainKey: string,
    allTrainCodes: string[],
    allEmuCodes: string[],
    status: ProbeStatusValue,
    nowSeconds: number
): void {
    for (const trainCode of allTrainCodes) {
        for (const emuCode of allEmuCodes) {
            ensureProbeStatus(trainCode, emuCode, args.startAt, status);
        }
    }

    persistDailyRoutes(
        allTrainCodes,
        allEmuCodes,
        args.startStation,
        args.endStation,
        args.startAt,
        args.endAt
    );
    markRunningEmuCodes(allEmuCodes, trainKey, args.endAt, nowSeconds);
    markQueriedTrainKey(trainKey);
}

function tryReuseHistoricalProbeStatus(
    args: ProbeTrainDepartureTaskArgs,
    trainKey: string,
    mainEmuCode: string,
    allTrainCodes: string[],
    nowSeconds: number
): boolean {
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
    const allEmuCodes =
        knownGroup.emuCodes.length > 0 ? knownGroup.emuCodes : [mainEmuCode];
    if (
        latestResolvedRow.status ===
            ProbeStatusValue.CoupledFormationResolved &&
        (knownGroup.finalStatus !== ProbeStatusValue.CoupledFormationResolved ||
            allEmuCodes.length <= 1)
    ) {
        logger.warn(
            `reuse_historical_status_incomplete trainCode=${args.trainCode} mainEmuCode=${mainEmuCode} historicalStartAt=${latestResolvedRow.start_at}`
        );
        return false;
    }

    applyResolvedResult(
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

async function executeProbeTrainDepartureTask(rawArgs: unknown): Promise<void> {
    ensureProbeStateForToday();
    const config = useConfig();
    const args = parseTaskArgs(rawArgs);
    const nowSeconds = getNowSeconds();

    cleanupRunningEmuState(
        nowSeconds,
        config.spider.scheduleProbe.coupling.runningGraceSeconds
    );

    const trainKey = buildTrainKey(
        args.trainCode,
        args.trainInternalCode,
        args.startAt
    );
    if (hasQueriedTrainKey(trainKey)) {
        logger.info(
            `skip already_queried trainCode=${args.trainCode} trainInternalCode=${args.trainInternalCode} startAt=${args.startAt}`
        );
        return;
    }

    if (!isCurrentScheduleTask(args.startAt)) {
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
            logger.warn(
                `route_probe_failed_requeue trainCode=${args.trainCode} retry=${args.retry} nextRetry=${nextRetry} nextTaskId=${nextTaskId} attemptedTrainCodes=${allTrainCodes.join(',')}`
            );
            return;
        }

        logger.warn(
            `route_probe_failed_exhausted trainCode=${args.trainCode} retry=${args.retry} attemptedTrainCodes=${allTrainCodes.join(',')}`
        );
        return;
    }

    const { probedTrainCode, routeProbeResult } = successfulRouteProbe;
    const mainEmuCode = normalizeCode(routeProbeResult.emu.code);
    const parsedMainEmuCode = parseEmuCode(mainEmuCode);
    const currentTrainSetNo = parsedMainEmuCode!.trainSetNo;

    const assets = await loadProbeAssets();
    const mainRecord = assets.emuByModelAndTrainSetNo.get(
        buildProbeAssetKey(parsedMainEmuCode!.model, currentTrainSetNo)
    );

    if (
        await tryResolveOverlappingRoutes(
            args,
            mainEmuCode,
            assets,
            nowSeconds
        )
    ) {
        return;
    }

    enqueueQrcodeProbeAvailabilityTask(probedTrainCode, mainEmuCode);

    if (!mainRecord) {
        logger.warn(
            `main_emu_asset_not_found trainCode=${args.trainCode} mainEmuCode=${mainEmuCode}`
        );
        applyResolvedResult(
            args,
            trainKey,
            allTrainCodes,
            [mainEmuCode],
            ProbeStatusValue.SingleFormationResolved,
            nowSeconds
        );
        return;
    }

    if (!mainRecord.multiple) {
        applyResolvedResult(
            args,
            trainKey,
            allTrainCodes,
            [mainEmuCode],
            ProbeStatusValue.SingleFormationResolved,
            nowSeconds
        );
        logger.info(
            `resolved_single_non_multiple trainCode=${args.trainCode} probedTrainCode=${probedTrainCode} mainEmuCode=${mainEmuCode} attemptedTrainCodes=${allTrainCodes.length}`
        );
        return;
    }

    const existingRows = listProbeStatusByEmuCode(mainEmuCode, args.startAt);
    if (
        existingRows.some(
            (row) =>
                row.status === ProbeStatusValue.SingleFormationResolved ||
                row.status === ProbeStatusValue.CoupledFormationResolved
        )
    ) {
        const knownGroup = collectKnownStatusGroup(
            existingRows,
            mainEmuCode,
            args.startAt
        );
        for (const emuCode of knownGroup.emuCodes) {
            updateProbeStatusByEmuCode(
                emuCode,
                args.startAt,
                knownGroup.finalStatus
            );
        }
        applyResolvedResult(
            args,
            trainKey,
            allTrainCodes,
            knownGroup.emuCodes.length > 0
                ? knownGroup.emuCodes
                : [mainEmuCode],
            knownGroup.finalStatus,
            nowSeconds
        );
        logger.info(
            `resolved_from_status trainCode=${args.trainCode} probedTrainCode=${probedTrainCode} mainEmuCode=${mainEmuCode} status=${knownGroup.finalStatus} emuCodes=${knownGroup.emuCodes.length} attemptedTrainCodes=${allTrainCodes.length}`
        );
        return;
    }

    if (
        tryReuseHistoricalProbeStatus(
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
    markRunningEmuCodes([mainEmuCode], trainKey, args.endAt, nowSeconds);
    markQueriedTrainKey(trainKey);

    if (args.endAt < nowSeconds) {
        logger.info(
            `skip_coupling_detection_past_end trainCode=${args.trainCode} probedTrainCode=${probedTrainCode} mainEmuCode=${mainEmuCode} endAt=${args.endAt} now=${nowSeconds}`
        );
        return;
    }

    const detectionTaskId = queueCoupledDetectionTask(mainRecord);
    logger.info(
        `pending_coupling_detection trainCode=${args.trainCode} probedTrainCode=${probedTrainCode} mainEmuCode=${mainEmuCode} detectionTaskId=${detectionTaskId} attemptedTrainCodes=${allTrainCodes.length}`
    );
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
