import getLogger from '~/server/libs/log4js';
import {
    buildProbeAssetKey,
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
import uniqueNormalizedCodes from '~/server/utils/12306/uniqueNormalizedCodes';
import { formatShanghaiDateString } from '~/server/utils/date/getCurrentDateString';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import { ProbeStatusValue } from '~/server/services/probeStatusStore';

export const PROBE_QRCODE_DETECTION_EMU_TASK_EXECUTOR =
    'probe_qrcode_detection_emu';

const logger = getLogger('task-executor:probe-qrcode-detection-emu');

interface ProbeQrcodeDetectionEmuTaskArgs {
    detectedAt: string;
    emuCode: string;
    manualNow: boolean;
}

let registered = false;

function parseTaskArgs(raw: unknown): ProbeQrcodeDetectionEmuTaskArgs {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new Error('task arguments must be an object');
    }

    const body = raw as {
        detectedAt?: unknown;
        emuCode?: unknown;
        manualNow?: unknown;
    };
    const detectedAt =
        typeof body.detectedAt === 'string' ? body.detectedAt.trim() : '';
    const emuCode =
        typeof body.emuCode === 'string' ? normalizeCode(body.emuCode) : '';

    if (!/^\d{4}$/.test(detectedAt)) {
        throw new Error('task arguments detectedAt must be a valid HHmm');
    }
    if (emuCode.length === 0) {
        throw new Error('task arguments emuCode must be a non-empty string');
    }

    return {
        detectedAt,
        emuCode,
        manualNow: body.manualNow === true
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

async function executeProbeQrcodeDetectionEmuTask(rawArgs: unknown) {
    ensureProbeStateForToday();
    const args = parseTaskArgs(rawArgs);
    const config = await loadQrcodeDetectionConfig();
    if (
        (!args.manualNow && !config.detectedAt.includes(args.detectedAt)) ||
        !config.emu.includes(args.emuCode)
    ) {
        markCurrentTrainProvenanceTaskSkipped(
            'qrcode_detection_target_removed'
        );
        logger.info(
            `skip_target_removed detectedAt=${args.detectedAt} emuCode=${args.emuCode}`
        );
        return;
    }

    const assets = await loadProbeAssets();
    const configuredRecord = resolveEmuRecord(assets, args.emuCode);
    if (!configuredRecord) {
        markCurrentTrainProvenanceTaskSkipped('qrcode_detection_emu_missing');
        logger.warn(`emu_not_found emuCode=${args.emuCode}`);
        return;
    }

    const parsedConfiguredEmuCode = parseEmuCode(args.emuCode)!;
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
            serviceDate: formatShanghaiDateString(Date.now()),
            emuCode: args.emuCode,
            eventType: 'qrcode_detection_skipped',
            result: 'seat_code_missing',
            payload: {
                detectedAt: args.detectedAt,
                emuCode: args.emuCode
            }
        });
        logger.warn(`seat_code_missing emuCode=${args.emuCode}`);
        return;
    }

    const seatCodeResult = await fetchEMUInfoBySeatCode(seatCode);
    if (seatCodeResult.status !== 'success') {
        markCurrentTrainProvenanceTaskFailed(
            'qrcode_detection_seat_code_request_failed'
        );
        recordCurrentTrainProvenanceEvent({
            serviceDate: formatShanghaiDateString(Date.now()),
            emuCode: args.emuCode,
            eventType: 'qrcode_detection_request_failed',
            result: seatCodeResult.reason,
            payload: {
                detectedAt: args.detectedAt,
                emuCode: args.emuCode,
                seatCodeFailure: seatCodeResult
            }
        });
        logger.warn(
            `seat_code_request_failed detectedAt=${args.detectedAt} emuCode=${args.emuCode} reason=${seatCodeResult.reason}`
        );
        return;
    }

    const scannedEmuCode = normalizeCode(seatCodeResult.emu.code);
    const resolvedRecord =
        resolveEmuRecord(assets, scannedEmuCode) ?? configuredRecord;
    const matchedScheduleGroup =
        getTodayScheduleProbeGroupByTrainInternalCode(
            seatCodeResult.route.internalCode
        ) ?? getTodayScheduleProbeGroupByTrainCode(seatCodeResult.route.code);
    const allTrainCodes = matchedScheduleGroup
        ? uniqueNormalizedCodes([
              matchedScheduleGroup.trainCode,
              ...matchedScheduleGroup.allCodes
          ])
        : [normalizeCode(seatCodeResult.route.code)];
    const routeTrainCode =
        matchedScheduleGroup?.trainCode ??
        normalizeCode(seatCodeResult.route.code);
    const routeTrainInternalCode =
        matchedScheduleGroup?.trainInternalCode ??
        normalizeCode(seatCodeResult.route.internalCode);
    const routeStartAt =
        matchedScheduleGroup?.startAt ?? seatCodeResult.route.startAt;
    const routeEndAt =
        matchedScheduleGroup?.endAt ?? seatCodeResult.route.endAt;
    const trainKey =
        matchedScheduleGroup?.trainKey ??
        buildTrainKey(routeTrainCode, routeTrainInternalCode, routeStartAt);
    const startStation = matchedScheduleGroup?.startStation ?? '';
    const endStation = matchedScheduleGroup?.endStation ?? '';
    const serviceDate = formatShanghaiDateString(routeStartAt * 1000);
    const nowSeconds = getNowSeconds();

    recordCurrentTrainProvenanceEventsForTrainCodes(allTrainCodes, {
        serviceDate,
        startAt: routeStartAt,
        emuCode: scannedEmuCode,
        relatedTrainCode: normalizeCode(seatCodeResult.route.code),
        eventType: 'qrcode_detection_succeeded',
        result: matchedScheduleGroup ? 'tracked_route' : 'untracked_route',
        payload: {
            detectedAt: args.detectedAt,
            configuredEmuCode: args.emuCode,
            scannedEmuCode,
            trainInternalCode: seatCodeResult.route.internalCode,
            trainRepeat: seatCodeResult.route.trainRepeat
        }
    });

    if (!resolvedRecord.multiple) {
        await applyResolvedProbeResult({
            trainCode: routeTrainCode,
            trainInternalCode: routeTrainInternalCode,
            allTrainCodes,
            allEmuCodes: [scannedEmuCode],
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
            emuCode: scannedEmuCode,
            eventType: 'resolved_single',
            result: 'qrcode_detection',
            payload: {
                detectedAt: args.detectedAt,
                source: 'qrcode_detection'
            }
        });
        return;
    }

    await applyPendingCouplingProbeResult({
        trainCode: routeTrainCode,
        trainInternalCode: routeTrainInternalCode,
        allTrainCodes,
        allEmuCodes: [scannedEmuCode],
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
        emuCode: scannedEmuCode,
        eventType: 'pending_coupling_detection',
        result: 'queued',
        linkedSchedulerTaskId: detectionTaskId,
        payload: {
            detectedAt: args.detectedAt,
            bureau: resolvedRecord.bureau,
            model: resolvedRecord.model,
            source: 'qrcode_detection'
        }
    });
}

export function registerProbeQrcodeDetectionEmuTaskExecutor(): void {
    if (registered) {
        return;
    }

    registerTaskExecutor(
        PROBE_QRCODE_DETECTION_EMU_TASK_EXECUTOR,
        async (args) => {
            await executeProbeQrcodeDetectionEmuTask(args);
        }
    );
    registered = true;
    logger.info(
        `registered executor=${PROBE_QRCODE_DETECTION_EMU_TASK_EXECUTOR}`
    );
}
