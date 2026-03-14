import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import {
    hasRecentCoupledGroupDetection,
    markCoupledGroupDetected
} from '~/server/services/probeDetectionState';
import {
    buildTrainKey,
    isEmuRunning,
    markRunningEmuCodes,
    setLastObservationByMainEmu
} from '~/server/services/probeRuntimeState';
import {
    buildProbeAssetKey,
    loadProbeAssets,
    type EmuListRecord
} from '~/server/services/probeAssetStore';
import {
    ensureProbeStatus,
    listProbeStatusByEmuCodeInRange,
    listProbeStatusByTrainCode,
    ProbeStatusValue
} from '~/server/services/probeStatusStore';
import { insertDailyEmuRoute } from '~/server/services/emuRoutesStore';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import {
    getTodayScheduleCache,
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
    depot: string;
    model: string;
}

interface RouteObservation {
    trainCode: string;
    trainInternalCode: string;
    startAt: number;
    endAt: number;
    emuCode: string;
}

interface RouteObservationGroup {
    trainCodes: Set<string>;
    trainInternalCode: string;
    startAt: number;
    endAt: number;
    emuCodes: Set<string>;
}

let registered = false;

function parseTaskArgs(raw: unknown): DetectCoupledEmuGroupTaskArgs {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new Error('task arguments must be an object');
    }

    const body = raw as {
        depot?: unknown;
        model?: unknown;
    };
    const depot = typeof body.depot === 'string' ? body.depot.trim() : '';
    const model =
        typeof body.model === 'string' ? normalizeCode(body.model) : '';
    if (depot.length === 0 || model.length === 0) {
        throw new Error('task arguments depot and model must be non-empty');
    }

    return {
        depot,
        model
    };
}

function buildDepotAndModelKey(depot: string, model: string): string {
    return `${depot.trim()}#${normalizeCode(model)}`;
}

function buildObservationGroupKey(observation: RouteObservation): string {
    const normalizedInternalCode = normalizeCode(observation.trainInternalCode);
    if (normalizedInternalCode.length > 0) {
        return `internal:${normalizedInternalCode}@${observation.startAt}`;
    }

    return `fallback:${normalizeCode(observation.trainCode)}@${observation.startAt}`;
}

function isActiveRouteObservation(
    observation: RouteObservation,
    nowSeconds: number,
    runningGraceSeconds: number
): boolean {
    return (
        observation.startAt <= nowSeconds &&
        observation.endAt + runningGraceSeconds >= nowSeconds
    );
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
    const candidateRows = new Map<string, { trainCode: string; startAt: number }>();

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
        const scheduleRoute = scheduleRoutesByTrainCode.get(normalizedTrainCode);

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
                existingRows.some((row) => row.emu_code === normalizedEmuCode) &&
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

async function collectObservations(
    candidates: EmuListRecord[],
    nowSeconds: number,
    runningGraceSeconds: number
): Promise<RouteObservation[]> {
    const assets = await loadProbeAssets();
    const observations: RouteObservation[] = [];

    for (const candidate of candidates) {
        const emuCode = `${candidate.model}-${candidate.trainSetNo}`;
        if (isEmuRunning(emuCode, nowSeconds, runningGraceSeconds)) {
            continue;
        }

        const seatCode = assets.qrcodeByModelAndTrainSetNo.get(
            buildProbeAssetKey(candidate.model, candidate.trainSetNo)
        );
        if (!seatCode) {
            continue;
        }

        const seatCodeResult = await fetchEMUInfoBySeatCode(seatCode);
        if (!seatCodeResult) {
            continue;
        }

        observations.push({
            trainCode: normalizeCode(seatCodeResult.route.code),
            trainInternalCode: normalizeCode(seatCodeResult.route.internalCode),
            startAt: seatCodeResult.route.startAt,
            endAt: seatCodeResult.route.endAt,
            emuCode: normalizeCode(seatCodeResult.emu.code)
        });
    }

    return observations.filter((observation) =>
        isActiveRouteObservation(observation, nowSeconds, runningGraceSeconds)
    );
}

function groupObservations(
    observations: RouteObservation[]
): RouteObservationGroup[] {
    const groups = new Map<string, RouteObservationGroup>();

    for (const observation of observations) {
        const groupKey = buildObservationGroupKey(observation);
        const existing = groups.get(groupKey);
        if (existing) {
            existing.trainCodes.add(observation.trainCode);
            existing.emuCodes.add(observation.emuCode);
            existing.startAt = Math.min(existing.startAt, observation.startAt);
            existing.endAt = Math.max(existing.endAt, observation.endAt);
            continue;
        }

        groups.set(groupKey, {
            trainCodes: new Set([observation.trainCode]),
            trainInternalCode: observation.trainInternalCode,
            startAt: observation.startAt,
            endAt: observation.endAt,
            emuCodes: new Set([observation.emuCode])
        });
    }

    return Array.from(groups.values());
}

async function persistResolvedGroup(
    group: RouteObservationGroup,
    scheduleRoutesByTrainCode: Map<string, TodayScheduleRoute>
): Promise<void> {
    const trainCodes = uniqueNormalizedCodes(Array.from(group.trainCodes));
    const emuCodes = uniqueNormalizedCodes(Array.from(group.emuCodes));
    if (trainCodes.length === 0 || emuCodes.length === 0) {
        return;
    }
    const scheduleRoute = resolveScheduleRoute(trainCodes, scheduleRoutesByTrainCode);

    const finalStatus: ProbeStatusValue =
        emuCodes.length > 1
            ? ProbeStatusValue.CoupledFormationResolved
            : ProbeStatusValue.SingleFormationResolved;
    for (const trainCode of trainCodes) {
        const existingRows = listProbeStatusByTrainCode(
            trainCode,
            group.startAt
        );
        if (
            existingRows.some(
                (row) =>
                    row.status === ProbeStatusValue.CoupledFormationResolved
            ) &&
            finalStatus === ProbeStatusValue.SingleFormationResolved
        ) {
            continue;
        }

        for (const emuCode of emuCodes) {
            ensureProbeStatus(trainCode, emuCode, group.startAt, finalStatus);
        }
    }

    persistDailyRoutes(
        trainCodes,
        emuCodes,
        scheduleRoute?.startStation ?? '',
        scheduleRoute?.endStation ?? '',
        group.startAt,
        group.endAt
    );
    if (finalStatus === ProbeStatusValue.CoupledFormationResolved) {
        persistBackfilledCoupledRoutes(emuCodes, scheduleRoutesByTrainCode);
    }
    const trainKey = buildTrainKey(
        trainCodes[0]!,
        group.trainInternalCode,
        group.startAt
    );
    const nowSeconds = getNowSeconds();
    markRunningEmuCodes(emuCodes, trainKey, group.endAt, nowSeconds);
    for (const emuCode of emuCodes) {
        setLastObservationByMainEmu(emuCode, {
            endAt: group.endAt,
            coupledEmuCodes: emuCodes.filter((item) => item !== emuCode)
        });
    }
}

async function executeDetectCoupledEmuGroupTask(
    rawArgs: unknown
): Promise<void> {
    const args = parseTaskArgs(rawArgs);
    const config = useConfig();
    const nowSeconds = getNowSeconds();
    const cooldownSeconds =
        config.spider.scheduleProbe.coupling.detectCooldownSeconds;

    if (
        hasRecentCoupledGroupDetection(
            args.depot,
            args.model,
            nowSeconds,
            cooldownSeconds
        )
    ) {
        logger.info(
            `skip_recent_detection depot=${args.depot} model=${args.model} cooldownSeconds=${cooldownSeconds}`
        );
        return;
    }

    const assets = await loadProbeAssets();
    const candidates =
        assets.emuListByDepotAndModel.get(
            buildDepotAndModelKey(args.depot, args.model)
        ) ?? [];
    if (candidates.length === 0) {
        logger.warn(
            `candidate_group_not_found depot=${args.depot} model=${args.model}`
        );
        markCoupledGroupDetected(args.depot, args.model, nowSeconds);
        return;
    }

    const observations = await collectObservations(
        candidates,
        nowSeconds,
        config.spider.scheduleProbe.coupling.runningGraceSeconds
    );
    const groups = groupObservations(observations);
    const scheduleRoutesByTrainCode = getTodayScheduleCache();
    for (const group of groups) {
        await persistResolvedGroup(group, scheduleRoutesByTrainCode);
    }

    markCoupledGroupDetected(args.depot, args.model, nowSeconds);
    logger.info(
        `done depot=${args.depot} model=${args.model} candidates=${candidates.length} observations=${observations.length} groups=${groups.length}`
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
