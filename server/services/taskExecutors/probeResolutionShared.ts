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
import {
    trainCodeKey,
    type TrainCodeParts
} from '~/server/utils/12306/trainCode';
import type { EmuId } from '~/server/libs/database/emu';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

interface ApplyResolvedProbeResultInput {
    trainCode: TrainCodeParts;
    trainInternalCode: string | null;
    allTrainCodes: TrainCodeParts[];
    allEmuCodes: EmuId[];
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
    allTrainCodes: TrainCodeParts[],
    allEmuCodes: EmuId[],
    startAt: number,
    status: ProbeStatusValue
) {
    const seenTrainKeys = new Set<string>();
    const uniqueTrainCodes = allTrainCodes.filter((trainCode) => {
        const key = trainCodeKey(trainCode);
        if (seenTrainKeys.has(key)) {
            return false;
        }
        seenTrainKeys.add(key);
        return true;
    });
    const seenEmuIds = new Set<number>();
    const uniqueEmuIds = allEmuCodes.filter((emuId) => {
        const key = Number(emuId);
        if (seenEmuIds.has(key)) {
            return false;
        }
        seenEmuIds.add(key);
        return true;
    });

    return [
        ...uniqueTrainCodes.map((targetId) => ({
            targetType: 'train' as const,
            targetId,
            startAt,
            previousStatus: getProbeStatusByTrainCodeValue(targetId, startAt),
            nextStatus: status
        })),
        ...uniqueEmuIds.map((targetId) => ({
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
        emuIds: input.allEmuCodes,
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
        emuIds: input.allEmuCodes,
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
