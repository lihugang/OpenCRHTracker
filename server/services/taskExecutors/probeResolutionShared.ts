import useConfig from '~/server/config';
import {
    buildRunningEmuGroupKey,
    markEmuCodesAssignedToday,
    markQueriedTrainKey
} from '~/server/services/probeRuntimeState';
import {
    ensureProbeStatus,
    getProbeStatusByEmuCodeValue,
    getProbeStatusByTrainCodeValue,
    ProbeStatusValue,
    updateProbeStatusByTrainCode
} from '~/server/services/probeStatusStore';
import { insertDailyEmuRoute } from '~/server/services/emuRoutesStore';
import { notifyLookupStatusChanges } from '~/server/services/eventNotificationService';
import { enqueueTask } from '~/server/services/taskQueue';
import { DETECT_COUPLED_EMU_GROUP_TASK_EXECUTOR } from '~/server/services/taskExecutors/detectCoupledEmuGroupTaskExecutor';
import type { EmuListRecord } from '~/server/services/probeAssetStore';
import uniqueNormalizedCodes from '~/server/utils/12306/uniqueNormalizedCodes';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

interface ApplyResolvedProbeResultInput {
    trainCode: string;
    trainInternalCode: string;
    allTrainCodes: string[];
    allEmuCodes: string[];
    startStation: string;
    endStation: string;
    startAt: number;
    endAt: number;
    trainKey: string;
    status: ProbeStatusValue;
    nowSeconds: number;
}

interface ApplyPendingCouplingProbeResultInput extends Omit<
    ApplyResolvedProbeResultInput,
    'status'
> {}

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

function collectLookupStatusNotificationCandidates(
    allTrainCodes: string[],
    allEmuCodes: string[],
    startAt: number,
    status: ProbeStatusValue
) {
    return [
        ...uniqueNormalizedCodes(allTrainCodes).map((targetId) => ({
            targetType: 'train' as const,
            targetId,
            startAt,
            previousStatus: getProbeStatusByTrainCodeValue(targetId, startAt),
            nextStatus: status
        })),
        ...uniqueNormalizedCodes(allEmuCodes).map((targetId) => ({
            targetType: 'emu' as const,
            targetId,
            startAt,
            previousStatus: getProbeStatusByEmuCodeValue(targetId, startAt),
            nextStatus: status
        }))
    ];
}

export async function applyResolvedProbeResult(
    input: ApplyResolvedProbeResultInput
): Promise<void> {
    const notificationCandidates = collectLookupStatusNotificationCandidates(
        input.allTrainCodes,
        input.allEmuCodes,
        input.startAt,
        input.status
    );
    const groupKey = buildRunningEmuGroupKey(
        input.trainCode,
        input.trainInternalCode,
        input.startAt
    );

    for (const trainCode of input.allTrainCodes) {
        for (const emuCode of input.allEmuCodes) {
            ensureProbeStatus(trainCode, emuCode, input.startAt, input.status);
        }
    }

    persistDailyRoutes(
        input.allTrainCodes,
        input.allEmuCodes,
        input.startStation,
        input.endStation,
        input.startAt,
        input.endAt
    );
    markEmuCodesAssignedToday(
        input.allEmuCodes,
        input.trainKey,
        groupKey,
        input.startAt,
        input.nowSeconds
    );
    markQueriedTrainKey(input.trainKey);
    await notifyLookupStatusChanges(notificationCandidates);
}

export async function applyPendingCouplingProbeResult(
    input: ApplyPendingCouplingProbeResultInput
): Promise<void> {
    const notificationCandidates = collectLookupStatusNotificationCandidates(
        input.allTrainCodes,
        input.allEmuCodes,
        input.startAt,
        ProbeStatusValue.PendingCouplingDetection
    );
    const groupKey = buildRunningEmuGroupKey(
        input.trainCode,
        input.trainInternalCode,
        input.startAt
    );

    for (const trainCode of input.allTrainCodes) {
        updateProbeStatusByTrainCode(
            trainCode,
            input.startAt,
            ProbeStatusValue.PendingCouplingDetection
        );
        for (const emuCode of input.allEmuCodes) {
            ensureProbeStatus(
                trainCode,
                emuCode,
                input.startAt,
                ProbeStatusValue.PendingCouplingDetection
            );
        }
    }

    persistDailyRoutes(
        input.allTrainCodes,
        input.allEmuCodes,
        input.startStation,
        input.endStation,
        input.startAt,
        input.endAt
    );
    markEmuCodesAssignedToday(
        input.allEmuCodes,
        input.trainKey,
        groupKey,
        input.startAt,
        input.nowSeconds
    );
    markQueriedTrainKey(input.trainKey);
    await notifyLookupStatusChanges(notificationCandidates);
}

export function queueCoupledDetectionTask(mainRecord: EmuListRecord): number {
    const delaySeconds =
        useConfig().spider.scheduleProbe.coupling.detectDelaySeconds;
    return enqueueTask(
        DETECT_COUPLED_EMU_GROUP_TASK_EXECUTOR,
        {
            bureau: mainRecord.bureau,
            model: mainRecord.model
        },
        getNowSeconds() + delaySeconds
    );
}
