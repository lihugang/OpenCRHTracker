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
import normalizeCode from '~/server/utils/12306/normalizeCode';
import { formatShanghaiDateString } from '~/server/utils/date/getCurrentDateString';

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
    trainCode: string;
    emuCode: string;
    serviceDate: string;
    timetableId: number | null;
    startAt: number | null;
    previousStatus: number | null;
    nextStatus: number | null;
    rowCount: number;
}

export interface PersistTrackingRowsInput {
    trainCodes: string[];
    emuCodes: string[];
    startStation: string;
    endStation: string;
    startAt: number;
    endAt: number;
    status: ProbeStatusValue;
}

function getServiceDate(startAt: number) {
    return startAt > 0 ? formatShanghaiDateString(startAt * 1000) : '';
}

function findProbeRow(
    rows: ProbeStatusRow[],
    trainCode: string,
    emuCode: string
) {
    const normalizedTrainCode = normalizeCode(trainCode);
    const normalizedEmuCode = normalizeCode(emuCode);
    return (
        rows.find(
            (row) =>
                row.train_code === normalizedTrainCode &&
                row.emu_code === normalizedEmuCode
        ) ?? null
    );
}

export function persistProbeTrackingRows(
    input: PersistTrackingRowsInput
): ProbeTrackingMutation[] {
    const mutations: ProbeTrackingMutation[] = [];
    const serviceDate = getServiceDate(input.startAt);

    for (const trainCode of input.trainCodes) {
        const normalizedTrainCode = normalizeCode(trainCode);
        if (normalizedTrainCode.length === 0) {
            continue;
        }

        const previousProbeRows = listProbeStatusByTrainCode(
            normalizedTrainCode,
            input.startAt
        );

        for (const emuCode of input.emuCodes) {
            const normalizedEmuCode = normalizeCode(emuCode);
            if (normalizedEmuCode.length === 0) {
                continue;
            }

            const previousProbeRow = findProbeRow(
                previousProbeRows,
                normalizedTrainCode,
                normalizedEmuCode
            );
            const probeAction = ensureProbeStatus(
                normalizedTrainCode,
                normalizedEmuCode,
                input.startAt,
                input.status
            );
            const nextProbeRow = findProbeRow(
                listProbeStatusByTrainCode(normalizedTrainCode, input.startAt),
                normalizedTrainCode,
                normalizedEmuCode
            );

            mutations.push({
                table: 'probe_status',
                action: probeAction,
                id: nextProbeRow?.id ?? previousProbeRow?.id ?? null,
                trainCode: normalizedTrainCode,
                emuCode: normalizedEmuCode,
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
                    normalizedTrainCode,
                    input.startAt,
                    input.startAt + 1
                ).find((row) => row.emu_code === normalizedEmuCode) ?? null;

            insertDailyEmuRoute(
                normalizedTrainCode,
                normalizedEmuCode,
                input.startStation,
                input.endStation,
                input.startAt,
                input.endAt
            );

            const nextRouteRow =
                listDailyRoutesByTrainCodeInRange(
                    normalizedTrainCode,
                    input.startAt,
                    input.startAt + 1
                ).find((row) => row.emu_code === normalizedEmuCode) ?? null;

            mutations.push({
                table: 'daily_emu_routes',
                action: previousRouteRow ? 'updated' : 'created',
                id: nextRouteRow?.id ?? previousRouteRow?.id ?? null,
                trainCode: normalizedTrainCode,
                emuCode: normalizedEmuCode,
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
