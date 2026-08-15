import useConfig from '~/server/config';
import {
    buildRunningEmuGroupKey,
    markEmuCodesAssignedToday,
    markQueriedTrainKey
} from '~/server/services/probeRuntimeState';
import { updateDailyRouteFormationStatusByTrainCode } from '~/server/services/emuRoutesStore';
import { EMU_ROUTE_STATUS_UNCONFIRMED_SINGLE } from '~/server/utils/emuRouteStatus';
import {
    persistProbeTrackingRows,
    type ProbeTrackingMutation
} from '~/server/services/probeTrackingMutations';
import {
    captureLookupStatusNotificationSnapshot,
    notifyLookupStatusChanges,
    resolveLookupStatusNotificationCandidates
} from '~/server/services/eventNotificationService';
import { enqueueTask } from '~/server/services/taskQueue';
import { DETECT_COUPLED_EMU_GROUP_TASK_EXECUTOR } from '~/server/services/taskExecutors/detectCoupledEmuGroupTaskExecutor';
import type { EmuListRecord } from '~/server/services/probeAssetStore';
import type { TrainCodeParts } from '~/server/utils/12306/trainCode';
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
    status: number;
    nowSeconds: number;
    beforePersist?: () => void;
    afterPersist?: () => void;
}

interface ApplyPendingCouplingProbeResultInput extends Omit<
    ApplyResolvedProbeResultInput,
    'status'
> {}

export async function applyResolvedProbeResult(
    input: ApplyResolvedProbeResultInput
): Promise<ProbeTrackingMutation[]> {
    const notificationSnapshot = captureLookupStatusNotificationSnapshot(
        input.allTrainCodes,
        input.allEmuCodes,
        input.startAt
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
        status: input.status,
        beforePersist: input.beforePersist,
        afterPersist: input.afterPersist
    });
    markEmuCodesAssignedToday(
        input.allEmuCodes,
        input.trainKey,
        groupKey,
        input.startAt,
        input.nowSeconds
    );
    markQueriedTrainKey(input.trainKey);
    await notifyLookupStatusChanges(
        resolveLookupStatusNotificationCandidates(notificationSnapshot)
    );
    return trackingMutations;
}

export async function applyPendingCouplingProbeResult(
    input: ApplyPendingCouplingProbeResultInput
): Promise<ProbeTrackingMutation[]> {
    const notificationSnapshot = captureLookupStatusNotificationSnapshot(
        input.allTrainCodes,
        input.allEmuCodes,
        input.startAt
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
        status: EMU_ROUTE_STATUS_UNCONFIRMED_SINGLE,
        beforePersist: () => {
            for (const trainCode of input.allTrainCodes) {
                updateDailyRouteFormationStatusByTrainCode(
                    trainCode,
                    input.startAt,
                    EMU_ROUTE_STATUS_UNCONFIRMED_SINGLE
                );
            }
        }
    });
    markEmuCodesAssignedToday(
        input.allEmuCodes,
        input.trainKey,
        groupKey,
        input.startAt,
        input.nowSeconds
    );
    markQueriedTrainKey(input.trainKey);
    await notifyLookupStatusChanges(
        resolveLookupStatusNotificationCandidates(notificationSnapshot)
    );
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
