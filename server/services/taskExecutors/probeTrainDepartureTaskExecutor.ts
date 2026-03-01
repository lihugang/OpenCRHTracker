import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import {
    loadProbeAssets,
    buildProbeAssetKey
} from '~/server/services/probeAssetStore';
import {
    buildTrainKey,
    cleanupRunningEmuState,
    ensureProbeStateForToday,
    getLastObservationByMainEmu,
    hasQueriedTrainKey,
    isEmuRunning,
    markQueriedTrainKey,
    markRunningEmuCodes,
    setLastObservationByMainEmu
} from '~/server/services/probeRuntimeState';
import { insertDailyEmuRoute } from '~/server/services/emuRoutesStore';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import { enqueueTask } from '~/server/services/taskQueue';
import fetchEMUInfoByRoute from '~/server/utils/12306/fetchEMUInfoByRoute';
import fetchEMUInfoBySeatCode from '~/server/utils/12306/fetchEMUInfoBySeatCode';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import uniqueNormalizedCodes from '~/server/utils/12306/uniqueNormalizedCodes';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

export const PROBE_TRAIN_DEPARTURE_TASK_EXECUTOR = 'probe_train_departure';

const logger = getLogger('task-executor:probe-train-departure');

interface ProbeTrainDepartureTaskArgs {
    trainCode: string;
    trainInternalCode: string;
    allCodes: string[];
    startAt: number;
    endAt: number;
    retry: number;
}

interface ParsedEmuCode {
    model: string;
    trainSetNo: string;
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
        startAt: body.startAt,
        endAt: body.endAt,
        retry
    };
}

function parseEmuCode(emuCode: string): ParsedEmuCode | null {
    const normalized = normalizeCode(emuCode);
    const separatorIndex = normalized.lastIndexOf('-');
    if (separatorIndex <= 0 || separatorIndex >= normalized.length - 1) {
        return null;
    }

    return {
        model: normalized.slice(0, separatorIndex),
        trainSetNo: normalized.slice(separatorIndex + 1)
    };
}

async function collectCoupledEmuCodes(
    args: ProbeTrainDepartureTaskArgs,
    mainEmuCode: string,
    nowSeconds: number
): Promise<string[]> {
    const config = useConfig();
    const parsedMainEmuCode = parseEmuCode(mainEmuCode);
    if (!parsedMainEmuCode) {
        return [];
    }

    const assets = await loadProbeAssets();
    const mainRecord = assets.emuList.find(
        (item) =>
            item.model === parsedMainEmuCode.model &&
            item.trainSetNo === parsedMainEmuCode.trainSetNo
    );
    if (!mainRecord || !mainRecord.multiple) {
        return [];
    }

    const candidateCap = config.spider.scheduleProbe.coupling.candidateCap;
    const runningGraceSeconds =
        config.spider.scheduleProbe.coupling.runningGraceSeconds;

    const normalizedTrainInternalCode = normalizeCode(args.trainInternalCode);
    const normalizedAllCodes = new Set(
        uniqueNormalizedCodes([args.trainCode, ...args.allCodes])
    );
    const coupledEmuCodes: string[] = [];

    let checkedCandidates = 0;
    for (const candidate of assets.emuList) {
        if (checkedCandidates >= candidateCap) {
            break;
        }
        if (!candidate.multiple) {
            continue;
        }
        if (
            candidate.model !== mainRecord.model ||
            candidate.depot !== mainRecord.depot
        ) {
            continue;
        }
        if (candidate.trainSetNo === mainRecord.trainSetNo) {
            continue;
        }

        checkedCandidates += 1;

        const candidateEmuCode = `${candidate.model}-${candidate.trainSetNo}`;
        if (isEmuRunning(candidateEmuCode, nowSeconds, runningGraceSeconds)) {
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

        const routeCode = normalizeCode(seatCodeResult.route.code);
        const routeInternalCode = normalizeCode(
            seatCodeResult.route.internalCode
        );
        const matchedByInternalCode =
            normalizedTrainInternalCode.length > 0 &&
            routeInternalCode === normalizedTrainInternalCode;
        const matchedByTrainCode = normalizedAllCodes.has(routeCode);

        if (matchedByInternalCode || matchedByTrainCode) {
            coupledEmuCodes.push(candidateEmuCode);
        }
    }

    return uniqueNormalizedCodes(coupledEmuCodes);
}

function persistDailyRoutes(
    trainCodes: string[],
    emuCodes: string[],
    startAt: number,
    endAt: number
): void {
    for (const trainCode of trainCodes) {
        for (const emuCode of emuCodes) {
            insertDailyEmuRoute(trainCode, emuCode, startAt, endAt);
        }
    }
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
            `[task-executor:probe-train-departure] skip already_queried trainCode=${args.trainCode} trainInternalCode=${args.trainInternalCode} startAt=${args.startAt}`
        );
        return;
    }

    const routeProbeResult = await fetchEMUInfoByRoute(args.trainCode);
    if (!routeProbeResult) {
        if (args.retry > 0) {
            const nextRetry = args.retry - 1;
            const nextTaskId = enqueueTask(
                PROBE_TRAIN_DEPARTURE_TASK_EXECUTOR,
                { ...args, retry: nextRetry },
                nowSeconds
            );
            logger.warn(
                `[task-executor:probe-train-departure] route_probe_failed_requeue trainCode=${args.trainCode} retry=${args.retry} nextRetry=${nextRetry} nextTaskId=${nextTaskId}`
            );
            return;
        }

        logger.warn(
            `[task-executor:probe-train-departure] route_probe_failed_exhausted trainCode=${args.trainCode} retry=${args.retry}`
        );
        return;
    }

    const mainEmuCode = normalizeCode(routeProbeResult.emu.code);
    if (mainEmuCode.length === 0) {
        logger.warn(
            `[task-executor:probe-train-departure] route_probe_empty_emu_code trainCode=${args.trainCode}`
        );
        return;
    }

    markRunningEmuCodes([mainEmuCode], trainKey, args.endAt, nowSeconds);

    const reuseWithinSeconds =
        config.spider.scheduleProbe.coupling.reuseWithinSeconds;
    const lastObservation = getLastObservationByMainEmu(mainEmuCode);
    let coupledEmuCodes: string[] = [];
    if (
        lastObservation &&
        args.startAt >= lastObservation.endAt &&
        args.startAt - lastObservation.endAt < reuseWithinSeconds
    ) {
        coupledEmuCodes = uniqueNormalizedCodes(
            lastObservation.coupledEmuCodes
        );
    } else {
        coupledEmuCodes = await collectCoupledEmuCodes(
            args,
            mainEmuCode,
            nowSeconds
        );
    }

    const allEmuCodes = uniqueNormalizedCodes([
        mainEmuCode,
        ...coupledEmuCodes
    ]);
    const allTrainCodes = uniqueNormalizedCodes([
        args.trainCode,
        ...args.allCodes
    ]);
    persistDailyRoutes(allTrainCodes, allEmuCodes, args.startAt, args.endAt);

    markRunningEmuCodes(allEmuCodes, trainKey, args.endAt, nowSeconds);
    setLastObservationByMainEmu(mainEmuCode, {
        endAt: args.endAt,
        coupledEmuCodes
    });
    markQueriedTrainKey(trainKey);

    logger.info(
        `[task-executor:probe-train-departure] success trainCode=${args.trainCode} trainInternalCode=${args.trainInternalCode} startAt=${args.startAt} endAt=${args.endAt} mainEmuCode=${mainEmuCode} coupled=${coupledEmuCodes.length} trainCodesPersisted=${allTrainCodes.length}`
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
    logger.info(
        `[task-executor:probe-train-departure] registered executor=${PROBE_TRAIN_DEPARTURE_TASK_EXECUTOR}`
    );
}
