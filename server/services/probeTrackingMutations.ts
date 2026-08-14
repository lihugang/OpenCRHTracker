import {
    insertDailyEmuRoute,
    listDailyRoutesByTrainCodeInRange
} from '~/server/services/emuRoutesStore';
import {
    ensureProbeStatus,
    ProbeStatusValue,
    type ProbeStatusRow,
    listProbeStatusByTrainCode
} from '~/server/services/probeStatusStore';
import {
    trainCodeKey,
    type TrainCodeParts
} from '~/server/utils/12306/trainCode';
import {
    unixSecondsToServiceDay,
    type ServiceDay
} from '~/server/utils/date/serviceDay';
import type { EmuId } from '~/server/libs/database/emu';

export type ProbeTrackingMutationTable = 'daily_emu_routes' | 'probe_status';

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
    status: ProbeStatusValue;
}

function getServiceDate(startAt: number): ServiceDay {
    return unixSecondsToServiceDay(startAt);
}

function findProbeRow(
    rows: ProbeStatusRow[],
    trainCode: TrainCodeParts,
    emuId: EmuId
) {
    const trainKey = trainCodeKey(trainCode);
    return (
        rows.find(
            (row) =>
                trainCodeKey(row.train_code) === trainKey &&
                Number(row.emu_id) === Number(emuId)
        ) ?? null
    );
}

export function persistProbeTrackingRows(
    input: PersistTrackingRowsInput
): ProbeTrackingMutation[] {
    const mutations: ProbeTrackingMutation[] = [];
    const serviceDate = getServiceDate(input.startAt);

    for (const trainCode of input.trainCodes) {
        const previousProbeRows = listProbeStatusByTrainCode(
            trainCode,
            input.startAt
        );

        for (const emuId of input.emuIds) {
            const previousProbeRow = findProbeRow(
                previousProbeRows,
                trainCode,
                emuId
            );
            const probeAction = ensureProbeStatus(
                trainCode,
                emuId,
                input.startAt,
                input.status
            );
            const nextProbeRow = findProbeRow(
                listProbeStatusByTrainCode(trainCode, input.startAt),
                trainCode,
                emuId
            );

            mutations.push({
                table: 'probe_status',
                action: probeAction,
                id: nextProbeRow?.id ?? previousProbeRow?.id ?? null,
                trainCode,
                emuId,
                serviceDate:
                    nextProbeRow?.service_date ??
                    previousProbeRow?.service_date ??
                    serviceDate,
                timetableId:
                    nextProbeRow?.timetable_id ??
                    previousProbeRow?.timetable_id ??
                    null,
                startAt:
                    nextProbeRow?.start_at ??
                    previousProbeRow?.start_at ??
                    input.startAt,
                previousStatus: previousProbeRow?.status ?? null,
                nextStatus: nextProbeRow?.status ?? input.status,
                rowCount: 1
            });

            const previousRouteRow =
                listDailyRoutesByTrainCodeInRange(
                    trainCode,
                    input.startAt,
                    input.startAt + 1
                ).find((row) => Number(row.emu_id) === Number(emuId)) ?? null;

            insertDailyEmuRoute(
                trainCode,
                emuId,
                input.startStation,
                input.endStation,
                input.startAt,
                input.endAt
            );

            const nextRouteRow =
                listDailyRoutesByTrainCodeInRange(
                    trainCode,
                    input.startAt,
                    input.startAt + 1
                ).find((row) => Number(row.emu_id) === Number(emuId)) ?? null;

            mutations.push({
                table: 'daily_emu_routes',
                action: previousRouteRow ? 'updated' : 'created',
                id: nextRouteRow?.id ?? previousRouteRow?.id ?? null,
                trainCode,
                emuId,
                serviceDate:
                    nextRouteRow?.service_date ??
                    previousRouteRow?.service_date ??
                    serviceDate,
                timetableId:
                    nextRouteRow?.timetable_id ??
                    previousRouteRow?.timetable_id ??
                    null,
                startAt:
                    nextRouteRow?.start_at ??
                    previousRouteRow?.start_at ??
                    input.startAt,
                previousStatus: null,
                nextStatus: null,
                rowCount: 1
            });
        }
    }

    return mutations;
}
