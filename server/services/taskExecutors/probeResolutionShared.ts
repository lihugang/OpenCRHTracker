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
import {
    persistProbeTrackingRows,
    type ProbeTrackingMutation
} from '~/server/services/probeTrackingMutations';
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
): Promise<ProbeTrackingMutation[]> {
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

    const trackingMutations = persistProbeTrackingRows({
        trainCodes: input.allTrainCodes,
        emuCodes: input.allEmuCodes,
        startStation: input.startStation,
        endStation: input.endStation,
        startAt: input.startAt,
        endAt: input.endAt,
        status: input.status
    });
    markEmuCodesAssignedToday(
        input.allEmuCodes,
        input.trainKey,
        groupKey,
        input.startAt,
        input.nowSeconds
    );
    markQueriedTrainKey(input.trainKey);
    await notifyLookupStatusChanges(notificationCandidates);
    return trackingMutations;
}

export async function applyPendingCouplingProbeResult(
    input: ApplyPendingCouplingProbeResultInput
): Promise<ProbeTrackingMutation[]> {
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
    }

    const trackingMutations = persistProbeTrackingRows({
        trainCodes: input.allTrainCodes,
        emuCodes: input.allEmuCodes,
        startStation: input.startStation,
        endStation: input.endStation,
        startAt: input.startAt,
        endAt: input.endAt,
        status: ProbeStatusValue.PendingCouplingDetection
    });
    markEmuCodesAssignedToday(
        input.allEmuCodes,
        input.trainKey,
        groupKey,
        input.startAt,
        input.nowSeconds
    );
    markQueriedTrainKey(input.trainKey);
    await notifyLookupStatusChanges(notificationCandidates);
    return trackingMutations;
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
