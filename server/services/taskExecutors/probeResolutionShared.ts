import useConfig from '~/server/config';
import {
    buildRunningEmuGroupKey,
    markEmuCodesAssignedToday,
    markQueriedTrainKey
} from '~/server/services/probeRuntimeState';
import {
    decodeEmuRouteStatus,
    EMU_ROUTE_STATUS_UNCONFIRMED_SINGLE,
    withFormationStatus
} from '~/server/utils/emuRouteStatus';
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
import { recordCurrentTrainProvenanceTrackingMutations } from '~/server/services/trainProvenanceRecorder';
import { unixSecondsToServiceDay } from '~/server/utils/date/serviceDay';
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
    statusByEmu: Map<EmuId, number>;
    nowSeconds: number;
    auditSource?: string;
    auditOperation?: string;
    auditDetail?: unknown;
    beforePersist?: () => void;
    afterPersist?: () => void;
}

function recordTrackingMutations(
    input: ApplyResolvedProbeResultInput,
    mutations: ProbeTrackingMutation[]
): number | null {
    const changedMutations = mutations.filter(
        (mutation) => mutation.action !== 'unchanged'
    );
    return recordCurrentTrainProvenanceTrackingMutations({
        source: input.auditSource ?? 'departure_probe',
        operation: input.auditOperation ?? 'persist_probe_tracking_rows',
        serviceDate: unixSecondsToServiceDay(input.startAt),
        startAt: input.startAt,
        detail: input.auditDetail,
        mutations: changedMutations.map((mutation) => ({
            ...mutation,
            detail: input.auditDetail
        }))
    });
}

interface ApplyPendingCouplingProbeResultInput extends Omit<
    ApplyResolvedProbeResultInput,
    'statusByEmu'
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
        statusByEmu: input.statusByEmu,
        beforePersist: input.beforePersist,
        afterPersist: input.afterPersist
    });
    const mutationBatchId = recordTrackingMutations(input, trackingMutations);
    markEmuCodesAssignedToday(
        input.allEmuCodes,
        input.trainKey,
        groupKey,
        input.startAt,
        input.nowSeconds
    );
    markQueriedTrainKey(input.trainKey);
    await notifyLookupStatusChanges(
        resolveLookupStatusNotificationCandidates(
            notificationSnapshot,
            trackingMutations
        )
    );
    return trackingMutations.map((mutation) => ({
        ...mutation,
        mutationBatchId
    }));
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

    const statusByEmu = new Map(
        input.allEmuCodes.map((emuId) => {
            const existingStatus =
                notificationSnapshot.candidates.find(
                    (candidate) =>
                        candidate.targetType === 'emu' &&
                        Number(candidate.targetId) === Number(emuId)
                )?.previousStatus ?? EMU_ROUTE_STATUS_UNCONFIRMED_SINGLE;
            const existingDecoded = decodeEmuRouteStatus(existingStatus);
            if (
                existingDecoded &&
                (existingDecoded.confirmed ||
                    existingDecoded.formationPosition !== 'single')
            ) {
                return [emuId, existingStatus];
            }
            return [
                emuId,
                withFormationStatus(existingStatus, {
                    confirmed: false,
                    formationPosition: 'single'
                }) ?? EMU_ROUTE_STATUS_UNCONFIRMED_SINGLE
            ];
        })
    );

    const trackingMutations = persistProbeTrackingRows({
        trainCodes: input.allTrainCodes,
        emuIds: input.allEmuCodes,
        startStation: input.startStation,
        endStation: input.endStation,
        startAt: input.startAt,
        endAt: input.endAt,
        statusByEmu
    });
    const mutationBatchId = recordTrackingMutations(
        {
            ...input,
            statusByEmu,
            auditOperation:
                input.auditOperation ?? 'persist_pending_coupling_rows'
        },
        trackingMutations
    );
    markEmuCodesAssignedToday(
        input.allEmuCodes,
        input.trainKey,
        groupKey,
        input.startAt,
        input.nowSeconds
    );
    markQueriedTrainKey(input.trainKey);
    await notifyLookupStatusChanges(
        resolveLookupStatusNotificationCandidates(
            notificationSnapshot,
            trackingMutations
        )
    );
    return trackingMutations.map((mutation) => ({
        ...mutation,
        mutationBatchId
    }));
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
