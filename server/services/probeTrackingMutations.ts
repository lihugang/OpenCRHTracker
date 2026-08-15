import { useEmuDatabase } from '~/server/libs/database/emu';
import {
    listDailyRoutesByTrainCodeAndStartAt,
    upsertDailyEmuRouteWithFormationStatus
} from '~/server/services/emuRoutesStore';
import type { TrainCodeParts } from '~/server/utils/12306/trainCode';
import {
    unixSecondsToServiceDay,
    type ServiceDay
} from '~/server/utils/date/serviceDay';
import type { EmuId } from '~/server/libs/database/emu';

export type ProbeTrackingMutationTable = 'daily_emu_routes';

export type ProbeTrackingMutationAction =
    | 'created'
    | 'updated'
    | 'deleted'
    | 'unchanged'
    | 'cleared'
    | 'downgraded';

export interface ProbeTrackingMutation {
    table: ProbeTrackingMutationTable;
    action: ProbeTrackingMutationAction;
    id: number | null;
    trainCode: TrainCodeParts;
    emuId: EmuId;
    serviceDate: ServiceDay;
    timetableId: number | null;
    startAt: number | null;
    previousStatus: number | null;
    nextStatus: number | null;
    rowCount: number;
}

export interface PersistTrackingRowsInput {
    trainCodes: TrainCodeParts[];
    emuIds: EmuId[];
    startStation: string;
    endStation: string;
    startAt: number;
    endAt: number;
    status: number;
    beforePersist?: () => void;
    afterPersist?: () => void;
}

function getServiceDate(startAt: number): ServiceDay {
    return unixSecondsToServiceDay(startAt);
}

export function persistProbeTrackingRows(
    input: PersistTrackingRowsInput
): ProbeTrackingMutation[] {
    const mutations: ProbeTrackingMutation[] = [];
    const serviceDate = getServiceDate(input.startAt);

    const transaction = useEmuDatabase().transaction(() => {
        const previousRowsById = new Map(
            input.trainCodes.flatMap((trainCode) =>
                listDailyRoutesByTrainCodeAndStartAt(
                    trainCode,
                    input.startAt
                ).map((row) => [row.id, row] as const)
            )
        );

        input.beforePersist?.();

        for (const trainCode of input.trainCodes) {
            for (const emuId of input.emuIds) {
                const upsertResult = upsertDailyEmuRouteWithFormationStatus(
                    trainCode,
                    emuId,
                    input.startAt,
                    input.status
                );
                const previousRouteRow =
                    previousRowsById.get(upsertResult.id) ?? null;
                const previousStatus =
                    previousRouteRow?.status ?? upsertResult.previousStatus;
                const action =
                    previousStatus === null
                        ? 'created'
                        : previousStatus === upsertResult.nextStatus
                          ? 'unchanged'
                          : 'updated';
                mutations.push({
                    table: 'daily_emu_routes',
                    action,
                    id: upsertResult.id,
                    trainCode,
                    emuId,
                    serviceDate,
                    timetableId: upsertResult.timetableId,
                    startAt: input.startAt,
                    previousStatus,
                    nextStatus: upsertResult.nextStatus,
                    rowCount: 1
                });
            }
        }

        input.afterPersist?.();
    });

    transaction();
    return mutations;
}
