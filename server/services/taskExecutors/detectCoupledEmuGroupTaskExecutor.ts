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
    getTrainSetNoFromEmuCode,
    listProbeStatusByTrainCode,
    ProbeStatusValue
} from '~/server/services/probeStatusStore';
import { insertDailyEmuRoute } from '~/server/services/emuRoutesStore';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import fetchRouteInfo from '~/server/utils/12306/network/fetchRouteInfo';
import fetchEMUInfoBySeatCode from '~/server/utils/12306/network/fetchEMUInfoBySeatCode';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import uniqueNormalizedCodes from '~/server/utils/12306/uniqueNormalizedCodes';
import { loadPublishedScheduleState } from '~/server/utils/12306/scheduleProbe/stateStore';
import type { ScheduleState } from '~/server/utils/12306/scheduleProbe/types';
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

interface RouteStations {
    startStation: string;
    endStation: string;
}

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
        return `internal:${normalizedInternalCode}`;
    }

    return `fallback:${normalizeCode(observation.trainCode)}@${observation.startAt}`;
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

function buildScheduleRouteStationsMap(
    scheduleState: ScheduleState | null
): Map<string, RouteStations> {
    const stationsByTrainCode = new Map<string, RouteStations>();
    if (!scheduleState) {
        return stationsByTrainCode;
    }

    for (const item of scheduleState.items) {
        const trainCode = normalizeCode(item.code);
        if (trainCode.length === 0) {
            continue;
        }

        const nextStations = {
            startStation: item.startStation.trim(),
            endStation: item.endStation.trim()
        };
        const currentStations = stationsByTrainCode.get(trainCode);
        if (
            currentStations &&
            currentStations.startStation.length > 0 &&
            currentStations.endStation.length > 0
        ) {
            continue;
        }

        stationsByTrainCode.set(trainCode, {
            startStation:
                currentStations?.startStation.length
                    ? currentStations.startStation
                    : nextStations.startStation,
            endStation:
                currentStations?.endStation.length
                    ? currentStations.endStation
                    : nextStations.endStation
        });
    }

    return stationsByTrainCode;
}

async function resolveRouteStations(
    trainCodes: string[],
    scheduleStationsByTrainCode: Map<string, RouteStations>
): Promise<RouteStations> {
    for (const trainCode of trainCodes) {
        const stations = scheduleStationsByTrainCode.get(normalizeCode(trainCode));
        if (
            stations &&
            (stations.startStation.length > 0 || stations.endStation.length > 0)
        ) {
            return stations;
        }
    }

    const primaryTrainCode = trainCodes[0] ?? '';
    if (primaryTrainCode.length === 0) {
        return {
            startStation: '',
            endStation: ''
        };
    }

    const routeInfo = await fetchRouteInfo(primaryTrainCode);
    if (!routeInfo) {
        return {
            startStation: '',
            endStation: ''
        };
    }

    return {
        startStation: routeInfo.route.startStation.trim(),
        endStation: routeInfo.route.endStation.trim()
    };
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

    return observations;
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
    scheduleStationsByTrainCode: Map<string, RouteStations>
): Promise<void> {
    const trainCodes = uniqueNormalizedCodes(Array.from(group.trainCodes));
    const emuCodes = uniqueNormalizedCodes(Array.from(group.emuCodes));
    if (trainCodes.length === 0 || emuCodes.length === 0) {
        return;
    }
    const stations = await resolveRouteStations(
        trainCodes,
        scheduleStationsByTrainCode
    );

    const finalStatus: ProbeStatusValue =
        emuCodes.length > 1
            ? ProbeStatusValue.CoupledFormationResolved
            : ProbeStatusValue.SingleFormationResolved;
    for (const trainCode of trainCodes) {
        const existingRows = listProbeStatusByTrainCode(trainCode);
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
            const trainSetNo = getTrainSetNoFromEmuCode(emuCode);
            if (trainSetNo.length === 0) {
                continue;
            }
            ensureProbeStatus(trainCode, trainSetNo, finalStatus);
        }
    }

    persistDailyRoutes(
        trainCodes,
        emuCodes,
        stations.startStation,
        stations.endStation,
        group.startAt,
        group.endAt
    );
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

async function executeDetectCoupledEmuGroupTask(rawArgs: unknown): Promise<void> {
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
    const scheduleStationsByTrainCode = buildScheduleRouteStationsMap(
        loadPublishedScheduleState(config.data.assets.schedule.file)
    );
    for (const group of groups) {
        await persistResolvedGroup(group, scheduleStationsByTrainCode);
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

    registerTaskExecutor(DETECT_COUPLED_EMU_GROUP_TASK_EXECUTOR, async (args) => {
        await executeDetectCoupledEmuGroupTask(args);
    });
    registered = true;
    logger.info(
        `registered executor=${DETECT_COUPLED_EMU_GROUP_TASK_EXECUTOR}`
    );
}
