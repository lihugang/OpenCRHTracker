import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import {
    buildProbeAssetKey,
    loadProbeAssets,
    type EmuListRecord
} from '~/server/services/probeAssetStore';
import {
    buildTrainKey,
    cleanupRunningEmuState,
    ensureProbeStateForToday,
    getLastObservationByMainEmu,
    hasQueriedTrainKey,
    markQueriedTrainKey,
    markRunningEmuCodes,
    setLastObservationByMainEmu
} from '~/server/services/probeRuntimeState';
import {
    ensureProbeStatus,
    getTrainSetNoFromEmuCode,
    listProbeStatusByEmuTrainSetNo,
    listProbeStatusByTrainCode,
    updateProbeStatusByEmuTrainSetNo,
    ProbeStatusValue,
    type ProbeStatusRow
} from '~/server/services/probeStatusStore';
import { insertDailyEmuRoute } from '~/server/services/emuRoutesStore';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import { enqueueTask } from '~/server/services/taskQueue';
import {
    DETECT_COUPLED_EMU_GROUP_TASK_EXECUTOR
} from '~/server/services/taskExecutors/detectCoupledEmuGroupTaskExecutor';
import fetchEMUInfoByRoute from '~/server/utils/12306/network/fetchEMUInfoByRoute';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import parseEmuCode from '~/server/utils/12306/parseEmuCode';
import uniqueNormalizedCodes from '~/server/utils/12306/uniqueNormalizedCodes';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import { getShanghaiDayStartUnixSeconds } from '~/server/utils/date/shanghaiDateTime';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

export const PROBE_TRAIN_DEPARTURE_TASK_EXECUTOR = 'probe_train_departure';

const logger = getLogger('task-executor:probe-train-departure');

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
    trainCodes: string[];
    trainSetNos: string[];
    finalStatus: ProbeStatusValue;
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

function queueCoupledDetectionTask(mainRecord: EmuListRecord): number {
    const delaySeconds = useConfig().spider.scheduleProbe.coupling.detectDelaySeconds;
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
    currentTrainSetNo: string
): KnownStatusGroup {
    const trainCodes = new Set<string>();
    const trainSetNos = new Set<string>([currentTrainSetNo]);
    let finalStatus: ProbeStatusValue = rows.some(
        (row) => row.status === ProbeStatusValue.CoupledFormationResolved
    )
        ? ProbeStatusValue.CoupledFormationResolved
        : ProbeStatusValue.SingleFormationResolved;

    for (const row of rows) {
        trainCodes.add(row.train_code);
        trainSetNos.add(row.emu_train_set_no);
    }

    if (finalStatus === ProbeStatusValue.CoupledFormationResolved) {
        for (const row of rows) {
            const relatedRows = listProbeStatusByTrainCode(row.train_code);
            for (const relatedRow of relatedRows) {
                trainCodes.add(relatedRow.train_code);
                trainSetNos.add(relatedRow.emu_train_set_no);
            }
        }
    }

    return {
        trainCodes: Array.from(trainCodes),
        trainSetNos: Array.from(trainSetNos),
        finalStatus
    };
}

function buildResolvedEmuCodes(model: string, trainSetNos: string[]): string[] {
    return uniqueNormalizedCodes(
        trainSetNos
            .map((trainSetNo) => normalizeCode(trainSetNo))
            .filter((trainSetNo) => trainSetNo.length > 0)
            .map((trainSetNo) => `${normalizeCode(model)}-${trainSetNo}`)
    );
}

function applyResolvedResult(
    args: ProbeTrainDepartureTaskArgs,
    trainKey: string,
    mainEmuCode: string,
    allTrainCodes: string[],
    allEmuCodes: string[],
    status: ProbeStatusValue,
    nowSeconds: number
): void {
    for (const trainCode of allTrainCodes) {
        for (const emuCode of allEmuCodes) {
            const trainSetNo = getTrainSetNoFromEmuCode(emuCode);
            if (trainSetNo.length === 0) {
                continue;
            }
            ensureProbeStatus(trainCode, trainSetNo, status);
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
    setLastObservationByMainEmu(mainEmuCode, {
        endAt: args.endAt,
        coupledEmuCodes: allEmuCodes.filter((item) => item !== mainEmuCode)
    });
    markQueriedTrainKey(trainKey);
}

function tryReuseLastObservation(
    args: ProbeTrainDepartureTaskArgs,
    trainKey: string,
    mainEmuCode: string,
    allTrainCodes: string[],
    nowSeconds: number
): boolean {
    const reuseWithinSeconds =
        useConfig().spider.scheduleProbe.coupling.reuseWithinSeconds;
    const lastObservation = getLastObservationByMainEmu(mainEmuCode);
    if (
        !lastObservation ||
        args.startAt < lastObservation.endAt ||
        args.startAt - lastObservation.endAt >= reuseWithinSeconds
    ) {
        return false;
    }

    const allEmuCodes = uniqueNormalizedCodes([
        mainEmuCode,
        ...lastObservation.coupledEmuCodes
    ]);
    const status: ProbeStatusValue =
        allEmuCodes.length > 1
            ? ProbeStatusValue.CoupledFormationResolved
            : ProbeStatusValue.SingleFormationResolved;
    applyResolvedResult(
        args,
        trainKey,
        mainEmuCode,
        allTrainCodes,
        allEmuCodes,
        status,
        nowSeconds
    );
    logger.info(
        `reuse_last_observation trainCode=${args.trainCode} mainEmuCode=${mainEmuCode} coupled=${allEmuCodes.length - 1}`
    );
    return true;
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
                `route_probe_failed_requeue trainCode=${args.trainCode} retry=${args.retry} nextRetry=${nextRetry} nextTaskId=${nextTaskId}`
            );
            return;
        }

        logger.warn(
            `route_probe_failed_exhausted trainCode=${args.trainCode} retry=${args.retry}`
        );
        return;
    }

    const mainEmuCode = normalizeCode(routeProbeResult.emu.code);
    if (mainEmuCode.length === 0) {
        logger.warn(`route_probe_empty_emu_code trainCode=${args.trainCode}`);
        return;
    }

    const parsedMainEmuCode = parseEmuCode(mainEmuCode);
    const currentTrainSetNo = parsedMainEmuCode?.trainSetNo ?? '';
    if (currentTrainSetNo.length === 0) {
        logger.warn(
            `route_probe_invalid_emu_code trainCode=${args.trainCode} mainEmuCode=${mainEmuCode}`
        );
        return;
    }

    const allTrainCodes = uniqueNormalizedCodes([args.trainCode, ...args.allCodes]);
    const assets = await loadProbeAssets();
    const mainRecord = assets.emuByModelAndTrainSetNo.get(
        buildProbeAssetKey(parsedMainEmuCode!.model, currentTrainSetNo)
    );

    markRunningEmuCodes([mainEmuCode], trainKey, args.endAt, nowSeconds);

    if (!mainRecord) {
        logger.warn(
            `main_emu_asset_not_found trainCode=${args.trainCode} mainEmuCode=${mainEmuCode}`
        );
        applyResolvedResult(
            args,
            trainKey,
            mainEmuCode,
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
            mainEmuCode,
            allTrainCodes,
            [mainEmuCode],
            ProbeStatusValue.SingleFormationResolved,
            nowSeconds
        );
        logger.info(
            `resolved_single_non_multiple trainCode=${args.trainCode} mainEmuCode=${mainEmuCode}`
        );
        return;
    }

    const existingRows = listProbeStatusByEmuTrainSetNo(currentTrainSetNo);
    if (
        existingRows.some(
            (row) =>
                row.status === ProbeStatusValue.SingleFormationResolved ||
                row.status === ProbeStatusValue.CoupledFormationResolved
        )
    ) {
        const knownGroup = collectKnownStatusGroup(existingRows, currentTrainSetNo);
        for (const trainSetNo of knownGroup.trainSetNos) {
            updateProbeStatusByEmuTrainSetNo(trainSetNo, knownGroup.finalStatus);
        }

        const resolvedTrainCodes = uniqueNormalizedCodes([
            ...knownGroup.trainCodes,
            ...allTrainCodes
        ]);
        const resolvedEmuCodes = buildResolvedEmuCodes(
            mainRecord.model,
            knownGroup.trainSetNos
        );
        applyResolvedResult(
            args,
            trainKey,
            mainEmuCode,
            resolvedTrainCodes,
            resolvedEmuCodes.length > 0 ? resolvedEmuCodes : [mainEmuCode],
            knownGroup.finalStatus,
            nowSeconds
        );
        logger.info(
            `resolved_from_status trainCode=${args.trainCode} mainEmuCode=${mainEmuCode} status=${knownGroup.finalStatus} trainSets=${knownGroup.trainSetNos.length}`
        );
        return;
    }

    if (
        existingRows.length > 0 &&
        existingRows.every(
            (row) => row.status === ProbeStatusValue.PendingCouplingDetection
        ) &&
        tryReuseLastObservation(
            args,
            trainKey,
            mainEmuCode,
            allTrainCodes,
            nowSeconds
        )
    ) {
        return;
    }

    if (
        existingRows.length === 0 &&
        tryReuseLastObservation(
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
            currentTrainSetNo,
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
    markQueriedTrainKey(trainKey);

    const detectionTaskId = queueCoupledDetectionTask(mainRecord);
    logger.info(
        `pending_coupling_detection trainCode=${args.trainCode} mainEmuCode=${mainEmuCode} currentTrainSetNo=${currentTrainSetNo} detectionTaskId=${detectionTaskId}`
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
