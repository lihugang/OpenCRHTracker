import getLogger from '~/server/libs/log4js';
import {
    buildProbeAssetKey,
    getProbeEmuMultipleStateFromRecord,
    loadProbeAssets,
    type EmuListRecord
} from '~/server/services/probeAssetStore';
import {
    buildTrainKey,
    ensureProbeStateForToday
} from '~/server/services/probeRuntimeState';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import {
    applyPendingCouplingProbeResult,
    applyResolvedProbeResult,
    queueCoupledDetectionTask
} from '~/server/services/taskExecutors/probeResolutionShared';
import {
    markCurrentTrainProvenanceTaskFailed,
    markCurrentTrainProvenanceTaskSkipped,
    recordCurrentTrainProvenanceEvent,
    recordCurrentTrainProvenanceEventsForTrainCodes
} from '~/server/services/trainProvenanceRecorder';
import { loadQrcodeDetectionConfig } from '~/server/services/qrcodeDetectionConfigStore';
import {
    getTodayScheduleProbeGroupByTrainCode,
    getTodayScheduleProbeGroupByTrainInternalCode
} from '~/server/services/todayScheduleCache';
import fetchEMUInfoBySeatCode from '~/server/utils/12306/network/fetchEMUInfoBySeatCode';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import parseEmuCode from '~/server/utils/12306/parseEmuCode';
import {
    formatTrainCode,
    trainCodeKey,
    type TrainCodeParts
} from '~/server/utils/12306/trainCode';
import {
    unixSecondsToServiceDay,
    type ServiceDay
} from '~/server/utils/date/serviceDay';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import { ProbeStatusValue } from '~/server/services/probeStatusStore';
import type { EmuId } from '~/server/libs/database/emu';
import {
    ensureExternalEmuId,
    formatExternalEmuCode,
    parseExternalTrainCodeOrThrow
} from '~/server/utils/internal/boundaries';

export const PROBE_QRCODE_DETECTION_EMU_TASK_EXECUTOR =
    'probe_qrcode_detection_emu';

const logger = getLogger('task-executor:probe-qrcode-detection-emu');

interface ProbeQrcodeDetectionEmuTaskArgs {
    detectedAt: string;
    emuId: EmuId;
    manualNow: boolean;
    temporary: boolean;
}

let registered = false;

function parseTaskArgs(raw: unknown): ProbeQrcodeDetectionEmuTaskArgs {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new Error('task arguments must be an object');
    }

    const body = raw as {
        detectedAt?: unknown;
        emuId?: unknown;
        manualNow?: unknown;
        temporary?: unknown;
    };
    const detectedAt =
        typeof body.detectedAt === 'string' ? body.detectedAt.trim() : '';
    const emuId =
        typeof body.emuId === 'number' &&
        Number.isInteger(body.emuId) &&
        body.emuId > 0
            ? (body.emuId as EmuId)
            : null;

    if (!/^\d{4}$/.test(detectedAt)) {
        throw new Error('task arguments detectedAt must be a valid HHmm');
    }
    if (emuId === null) {
        throw new Error('task arguments emuId must be a positive integer id');
    }

    return {
        detectedAt,
        emuId,
        manualNow: body.manualNow === true,
        temporary: body.temporary === true
    };
}

function resolveEmuRecord(
    assets: Awaited<ReturnType<typeof loadProbeAssets>>,
    emuCode: string
): EmuListRecord | null {
    const parsedEmuCode = parseEmuCode(emuCode);
    if (!parsedEmuCode?.trainSetNo) {
        return null;
    }

    return (
        assets.emuByModelAndTrainSetNo.get(
            buildProbeAssetKey(parsedEmuCode.model, parsedEmuCode.trainSetNo)
        ) ?? null
    );
}

async function executeProbeQrcodeDetectionEmuTask(
    args: ProbeQrcodeDetectionEmuTaskArgs
) {
    ensureProbeStateForToday();
    const config = await loadQrcodeDetectionConfig();
    const bypassFixedConfig = args.manualNow || args.temporary;
    const configuredEmuCode = formatExternalEmuCode(args.emuId);
    if (
        (!bypassFixedConfig && !config.detectedAt.includes(args.detectedAt)) ||
        (!bypassFixedConfig && !config.emu.includes(configuredEmuCode))
    ) {
        markCurrentTrainProvenanceTaskSkipped(
            'qrcode_detection_target_removed'
        );
        logger.info(
            `skip_target_removed detectedAt=${args.detectedAt} emuCode=${configuredEmuCode}`
        );
        return;
    }

    const assets = await loadProbeAssets();
    const configuredRecord = resolveEmuRecord(assets, configuredEmuCode);
    if (!configuredRecord) {
        markCurrentTrainProvenanceTaskSkipped('qrcode_detection_emu_missing');
        logger.warn(`emu_not_found emuCode=${configuredEmuCode}`);
        return;
    }

    const parsedConfiguredEmuCode = parseEmuCode(configuredEmuCode)!;
    const seatCode = assets.qrcodeByModelAndTrainSetNo.get(
        buildProbeAssetKey(
            parsedConfiguredEmuCode.model,
            parsedConfiguredEmuCode.trainSetNo
        )
    );
    if (!seatCode) {
        markCurrentTrainProvenanceTaskSkipped(
            'qrcode_detection_seat_code_missing'
        );
        recordCurrentTrainProvenanceEvent({
            serviceDate: unixSecondsToServiceDay(Math.floor(Date.now() / 1000)),
            emuId: args.emuId,
            eventType: 'qrcode_detection_skipped',
            result: 'seat_code_missing',
            payload: {
                detectedAt: args.detectedAt,
                configuredEmuId: args.emuId,
                temporary: args.temporary
            }
        });
        logger.warn(`seat_code_missing emuCode=${configuredEmuCode}`);
        return;
    }

    const seatCodeResult = await fetchEMUInfoBySeatCode(seatCode);
    if (seatCodeResult.status !== 'success') {
        markCurrentTrainProvenanceTaskFailed(
            'qrcode_detection_seat_code_request_failed'
        );
        recordCurrentTrainProvenanceEvent({
            serviceDate: unixSecondsToServiceDay(Math.floor(Date.now() / 1000)),
            emuId: args.emuId,
            eventType: 'qrcode_detection_request_failed',
            result: seatCodeResult.reason,
            payload: {
                detectedAt: args.detectedAt,
                configuredEmuId: args.emuId,
                temporary: args.temporary,
                seatCodeFailure: seatCodeResult
            }
        });
        logger.warn(
            `seat_code_request_failed detectedAt=${args.detectedAt} emuCode=${configuredEmuCode} reason=${seatCodeResult.reason}`
        );
        return;
    }

    const scannedEmuId = seatCodeResult.emu.code;
    const scannedEmuCode = formatExternalEmuCode(scannedEmuId);
    const resolvedRecord =
        resolveEmuRecord(assets, scannedEmuCode) ?? configuredRecord;
    const routeInternalCode = seatCodeResult.route.internalCode;
    const routeCode = seatCodeResult.route.code;
    const matchedScheduleGroup =
        getTodayScheduleProbeGroupByTrainInternalCode(routeInternalCode) ??
        getTodayScheduleProbeGroupByTrainCode(routeCode);
    const seenTrainCodes = new Set<string>();
    const allTrainCodes: TrainCodeParts[] = [];
    for (const trainCode of matchedScheduleGroup
        ? [matchedScheduleGroup.trainCode, ...matchedScheduleGroup.allCodes]
        : [routeCode]) {
        const key = trainCodeKey(trainCode);
        if (seenTrainCodes.has(key)) {
            continue;
        }
        seenTrainCodes.add(key);
        allTrainCodes.push(trainCode);
    }
    const routeTrainCode = matchedScheduleGroup?.trainCode ?? routeCode;
    const routeTrainInternalCode =
        matchedScheduleGroup?.trainInternalCode ?? routeInternalCode;
    const routeStartAt =
        matchedScheduleGroup?.startAt ?? seatCodeResult.route.startAt;
    const routeEndAt =
        matchedScheduleGroup?.endAt ?? seatCodeResult.route.endAt;
    const trainKey =
        matchedScheduleGroup?.trainKey ??
        buildTrainKey(routeTrainCode, routeTrainInternalCode, routeStartAt);
    const startStation = matchedScheduleGroup?.startStation ?? '';
    const endStation = matchedScheduleGroup?.endStation ?? '';
    const serviceDate: ServiceDay = unixSecondsToServiceDay(routeStartAt);
    const nowSeconds = getNowSeconds();

    recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
        serviceDate,
        startAt: routeStartAt,
        emuId: scannedEmuId,
        relatedTrainCode: routeCode,
        eventType: 'qrcode_detection_succeeded',
        result: matchedScheduleGroup ? 'tracked_route' : 'untracked_route',
        payload: {
            detectedAt: args.detectedAt,
            configuredEmuId: args.emuId,
            scannedEmuId,
            temporary: args.temporary,
            trainInternalCode: seatCodeResult.route.internalCode,
            trainRepeat: seatCodeResult.route.trainRepeat
        }
    });

    if (getProbeEmuMultipleStateFromRecord(resolvedRecord) === 'non_multiple') {
        const trackingMutations = await applyResolvedProbeResult({
            trainCode: routeTrainCode,
            trainInternalCode: routeTrainInternalCode,
            allTrainCodes,
            allEmuCodes: [scannedEmuId],
            startStation,
            endStation,
            startAt: routeStartAt,
            endAt: routeEndAt,
            trainKey,
            status: ProbeStatusValue.SingleFormationResolved,
            nowSeconds
        });
        recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
            serviceDate,
            startAt: routeStartAt,
            emuId: scannedEmuId,
            eventType: 'resolved_single',
            result: 'qrcode_detection',
            payload: {
                detectedAt: args.detectedAt,
                source: 'qrcode_detection',
                temporary: args.temporary,
                trackingMutations
            }
        });
        return;
    }

    const trackingMutations = await applyPendingCouplingProbeResult({
        trainCode: routeTrainCode,
        trainInternalCode: routeTrainInternalCode,
        allTrainCodes,
        allEmuCodes: [scannedEmuId],
        startStation,
        endStation,
        startAt: routeStartAt,
        endAt: routeEndAt,
        trainKey,
        nowSeconds
    });
    const detectionTaskId = queueCoupledDetectionTask(resolvedRecord);
    recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
        serviceDate,
        startAt: routeStartAt,
        emuId: scannedEmuId,
        eventType: 'pending_coupling_detection',
        result: 'queued',
        linkedSchedulerTaskId: detectionTaskId,
        payload: {
            detectedAt: args.detectedAt,
            bureau: resolvedRecord.bureau,
            model: resolvedRecord.model,
            source: 'qrcode_detection',
            temporary: args.temporary,
            trackingMutations
        }
    });
}

export function registerProbeQrcodeDetectionEmuTaskExecutor(): void {
    if (registered) {
        return;
    }

    registerTaskExecutor(PROBE_QRCODE_DETECTION_EMU_TASK_EXECUTOR, {
        parse: parseTaskArgs,
        execute: executeProbeQrcodeDetectionEmuTask
    });
    registered = true;
    logger.info(
        `registered executor=${PROBE_QRCODE_DETECTION_EMU_TASK_EXECUTOR}`
    );
}
